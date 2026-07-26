import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import { getGuildConfig } from "../../services/configService.js";
import { listUploadFolderFiles, type UploadFolderFile } from "../../services/fileUploadService.js";
import {
  canUploadPbo,
  getUploadPermissionContext,
  getUploadPermissionDiagnostics
} from "../../services/permissionService.js";
import { ephemeralFlag } from "../interactionErrors.js";

const pageSize = 10;

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function fileLine(file: UploadFolderFile, index: number) {
  const modifiedTimestamp = Math.floor(file.modifiedAt.getTime() / 1000);
  return `**${index}.** \`${file.name}\` - ${formatBytes(file.size)} - <t:${modifiedTimestamp}:R>`;
}

async function buildFileListResponse(guildId: string, userId: string, page: number) {
  const config = getGuildConfig(guildId);
  const files = await listUploadFolderFiles(config);
  const totalPages = Math.max(Math.ceil(files.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageFiles = files.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const embed = new EmbedBuilder()
    .setTitle("Configured PBO Files")
    .setDescription(
      pageFiles.length > 0
        ? pageFiles.map((file, index) => fileLine(file, safePage * pageSize + index + 1)).join("\n")
        : "No `.pbo` files were found in the configured upload folder."
    )
    .setFooter({ text: `Page ${safePage + 1} of ${totalPages} - ${files.length} file(s)` })
    .setTimestamp(new Date());

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`listpbo:${guildId}:${userId}:${safePage - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`listpbo:${guildId}:${userId}:${safePage + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

async function assertCanListFiles(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    throw new Error("This command can only be used inside a Discord server.");
  }

  const config = getGuildConfig(interaction.guildId);
  const permissionContext = getUploadPermissionContext(interaction);

  if (!canUploadPbo(permissionContext, config)) {
    const diagnostics = getUploadPermissionDiagnostics(permissionContext, config);
    throw new Error(
      [
        "You do not have permission to list PBO files.",
        "",
        "Permission debug:",
        `Configured upload roles: ${diagnostics.configuredAllowedRoleIds.join(", ") || "none"}`,
        `Your roles seen by bot: ${diagnostics.userRoleIdsSeenByBot.join(", ") || "none"}`,
        `Matched roles: ${diagnostics.matchedRoleIds.join(", ") || "none"}`,
        `Administrator seen: ${diagnostics.isAdministrator ? "yes" : "no"}`
      ].join("\n")
    );
  }
}

export const listPboFilesCommand = {
  data: new SlashCommandBuilder()
    .setName("listpbo")
    .setDescription("List .pbo files in the configured mission upload folder."),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: ephemeralFlag });

    try {
      await assertCanListFiles(interaction);
      const response = await buildFileListResponse(interaction.guildId!, interaction.user.id, 0);
      await interaction.editReply(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list PBO files.";
      await interaction.editReply({ content: message, embeds: [], components: [] });
    }
  },

  async handleButton(interaction: ButtonInteraction, parts: string[]) {
    const [, guildId, userId, pageValue] = parts;

    if (!guildId || !userId || !pageValue) {
      await interaction.reply({
        content: "This file list button is no longer valid.",
        flags: ephemeralFlag
      });
      return;
    }

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "Only the user who opened this file list can use these buttons.",
        flags: ephemeralFlag
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      await assertCanListFiles(interaction);
      const response = await buildFileListResponse(guildId, userId, Number(pageValue));
      await interaction.editReply(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list PBO files.";
      await interaction.editReply({ content: message, embeds: [], components: [] });
    }
  }
};
