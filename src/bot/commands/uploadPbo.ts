import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { getGuildConfig } from "../../services/configService.js";
import { sendGuildLog } from "../../services/discordLogService.js";
import { savePboAttachment } from "../../services/fileUploadService.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import {
  canUploadPbo,
  getUploadPermissionContext,
  getUploadPermissionDiagnostics
} from "../../services/permissionService.js";
import { getUploadChannelMatch } from "../../services/uploadChannelService.js";
import { logger } from "../../services/logger.js";
import { ephemeralFlag } from "../interactionErrors.js";

export const uploadPboCommand = {
  data: new SlashCommandBuilder()
    .setName("uploadpbo")
    .setDescription("Upload a .pbo mission file to the configured mission directory.")
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("The .pbo file to upload")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "This command can only be used inside a Discord server.",
        flags: ephemeralFlag
      });
      return;
    }

    // Acknowledge quickly — Discord interactions expire after ~3s.
    // Ephemeral so permission denials stay private; success uses a public follow-up.
    await interaction.deferReply({ flags: ephemeralFlag });

    const config = getGuildConfig(interaction.guildId);
    const file = interaction.options.getAttachment("file", true);
    const permissionContext = getUploadPermissionContext(interaction);

    if (!canUploadPbo(permissionContext, config)) {
      const diagnostics = getUploadPermissionDiagnostics(permissionContext, config);

      await interaction.editReply({
        content: [
          "You do not have permission to upload PBO files.",
          "",
          "Permission debug:",
          `Configured upload roles: ${diagnostics.configuredAllowedRoleIds.join(", ") || "none"}`,
          `Your roles seen by bot: ${diagnostics.userRoleIdsSeenByBot.join(", ") || "none"}`,
          `Matched roles: ${diagnostics.matchedRoleIds.join(", ") || "none"}`,
          `Administrator seen: ${diagnostics.isAdministrator ? "yes" : "no"}`
        ].join("\n")
      });

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "upload_pbo",
        status: "denied",
        message: "User attempted to upload a PBO without permission.",
        metadata: { fileName: file.name, diagnostics }
      });

      await sendGuildLog(interaction.client, config, {
        title: "PBO Upload Denied",
        description: `${interaction.user.tag} attempted to upload \`${file.name}\` without permission.`
      });
      return;
    }

    const channelMatch = await getUploadChannelMatch(interaction, config);
    if (!channelMatch.allowed) {
      await interaction.editReply({
        content: "Uploads are not allowed in this channel."
      });

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "upload_pbo",
        status: "denied",
        message: "User attempted to upload a PBO from a disallowed channel.",
        metadata: {
          fileName: file.name,
          allowedUploadChannelIds: config.allowedUploadChannelIds,
          checkedChannelIds: channelMatch.checkedChannelIds
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: "PBO Upload Denied",
        description: `${interaction.user.tag} attempted to upload \`${file.name}\` from a disallowed channel.`,
        fields: [
          { name: "Allowed Channels", value: config.allowedUploadChannelIds.join(", ") || "none" },
          { name: "Checked Channels", value: channelMatch.checkedChannelIds.join(", ") || "none" }
        ]
      });
      return;
    }

    try {
      const result = await savePboAttachment(file, config);

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "upload_pbo",
        status: "success",
        message: "PBO upload completed.",
        metadata: {
          ...result,
          channelId: interaction.channelId,
          matchedChannelId: channelMatch.matchedChannelId
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: "PBO Upload Successful",
        description: `${interaction.user.tag} uploaded \`${result.fileName}\` in <#${interaction.channelId}>.`,
        fields: [
          { name: "Size", value: `${Math.round(result.size / 1024 / 1024)} MB`, inline: true },
          { name: "Backup Created", value: result.backupPath ? "Yes" : "No", inline: true },
          { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
          { name: "Destination", value: `\`${result.destinationPath}\`` }
        ]
      });

      await interaction.editReply({
        content: `Upload complete: \`${result.fileName}\`.`
      });
      await interaction.followUp({
        content: `<@${interaction.user.id}> uploaded \`${result.fileName}\`.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload failure.";
      logger.warn({ error }, "PBO upload failed");

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "upload_pbo",
        status: "failed",
        message,
        metadata: { fileName: file.name }
      });

      await sendGuildLog(interaction.client, config, {
        title: "PBO Upload Failed",
        description: `${interaction.user.tag} failed to upload \`${file.name}\`: ${message}`
      });

      await interaction.editReply({
        content: `Upload failed: ${message}`
      });
    }
  }
};
