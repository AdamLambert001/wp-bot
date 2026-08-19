import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import { getGuildConfig } from "../../services/configService.js";
import { checkMonitorTarget, parseMonitorValue } from "../../services/monitorCheckService.js";
import {
  addServiceTrack,
  formatMonitorType,
  isMonitorType,
  recordTrackCheck,
  trackMention,
  type MentionType
} from "../../services/serviceTrackService.js";
import { alertDownColor, alertRestoredColor } from "../../services/serviceMonitorService.js";
import { getServerControlAccess } from "./serverCommandUtils.js";
import { ephemeralFlag } from "../interactionErrors.js";

export const monitorCommand = {
  data: new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Track a Windows service, port, or app and post alerts when it goes down or comes back.")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What to track")
        .setRequired(true)
        .addChoices(
          { name: "Windows service", value: "service" },
          { name: "Port", value: "port" },
          { name: "App (Task Manager)", value: "app" }
        )
    )
    .addStringOption((option) =>
      option.setName("value").setDescription("Port number, process name, or Windows service name").setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post down and restored alerts")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("friendly").setDescription("Display name for this track").setRequired(true).setMaxLength(64)
    )
    .addMentionableOption((option) =>
      option.setName("mention").setDescription("Role or user to ping when this goes down").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: ephemeralFlag });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const access = await getServerControlAccess(interaction, config);
    if (!access.allowed) {
      await interaction.reply({
        content: `You do not have permission to add monitors: ${access.reason}.`,
        flags: ephemeralFlag
      });
      return;
    }

    const typeValue = interaction.options.getString("type", true);
    if (!isMonitorType(typeValue)) {
      await interaction.reply({ content: "Invalid monitor type.", flags: ephemeralFlag });
      return;
    }

    const mentionOption = interaction.options.get("mention", true);
    const role = mentionOption.role;
    const user = mentionOption.user;
    const channel = interaction.options.getChannel("channel", true);

    let mentionType: MentionType;
    let mentionId: string;

    if (role) {
      if (role.id === interaction.guildId) {
        await interaction.reply({ content: "Choose a role or user other than @everyone.", flags: ephemeralFlag });
        return;
      }

      mentionType = "role";
      mentionId = role.id;
    } else if (user) {
      mentionType = "user";
      mentionId = user.id;
    } else {
      await interaction.reply({ content: "Choose a role or user to ping when this goes down.", flags: ephemeralFlag });
      return;
    }

    let value: string;
    try {
      value = parseMonitorValue(typeValue, interaction.options.getString("value", true));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid value.";
      await interaction.reply({ content: message, flags: ephemeralFlag });
      return;
    }

    await interaction.deferReply();

    try {
      const initialStatus = await checkMonitorTarget(typeValue, value);

      if (typeValue === "service" && !initialStatus.found) {
        await interaction.editReply({
          content: `No Windows service named \`${value}\` was found. Use the service name or display name.`
        });
        return;
      }

      const track = addServiceTrack({
        guildId: interaction.guildId,
        type: typeValue,
        value,
        friendly: interaction.options.getString("friendly", true),
        channelId: channel.id,
        mentionType,
        mentionId,
        createdBy: interaction.user.id
      });

      recordTrackCheck(track.id, initialStatus.online);

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "add_service_track",
        status: "success",
        message: `${interaction.user.tag} started monitoring \`${track.friendly}\`.`,
        metadata: {
          trackId: track.id,
          type: track.type,
          value: track.value,
          channelId: track.channelId
        }
      });

      const embed = new EmbedBuilder()
        .setTitle(`Now tracking ${track.friendly}`)
        .setDescription(
          initialStatus.online
            ? `${formatMonitorType(track.type)} \`${track.value}\` is currently online. Alerts will post on changes.`
            : `${formatMonitorType(track.type)} \`${track.value}\` is currently offline. The down alert will be updated when it comes back.`
        )
        .setColor(initialStatus.online ? alertRestoredColor : alertDownColor)
        .addFields(
          { name: "Type", value: formatMonitorType(track.type), inline: true },
          { name: "Value", value: `\`${track.value}\``, inline: true },
          { name: "Status", value: initialStatus.online ? "Online" : "Offline", inline: true },
          { name: "Alert channel", value: `<#${track.channelId}>`, inline: true },
          { name: "Down ping", value: trackMention(track), inline: true }
        )
        .setTimestamp(new Date());

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add monitor.";
      await interaction.editReply({ content: message, embeds: [] });
    }
  }
};
