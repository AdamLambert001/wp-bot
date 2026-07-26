import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import { getGuildConfig } from "../../services/configService.js";
import {
  autocompleteServerChecks,
  getServerCheckStatuses,
  type ServerCheckStatus
} from "../../services/portCheckService.js";
import { getServerControlAccess } from "./serverCommandUtils.js";
import { ephemeralFlag } from "../interactionErrors.js";

function formatCheckField(status: ServerCheckStatus) {
  const state = status.online ? "Online" : "Offline";
  const portLines =
    status.ports.length > 0
      ? status.ports
          .map((port) => `• \`${port.port}\` — ${port.online ? "online" : "offline"}`)
          .join("\n")
      : "• No ports configured";

  return {
    name: `${status.name} — ${state}`,
    value: portLines,
    inline: false
  };
}

export const serverCheckCommand = {
  data: new SlashCommandBuilder()
    .setName("servercheck")
    .setDescription("Check whether configured servers are online by port.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Optional server check name. Leave empty to check all.")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const focusedValue = interaction.options.getFocused();
    await interaction.respond(autocompleteServerChecks(config, focusedValue));
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: ephemeralFlag });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const access = await getServerControlAccess(interaction, config);
    if (!access.allowed) {
      await interaction.reply({
        content: `You do not have permission to run server checks: ${access.reason}.`,
        flags: ephemeralFlag
      });
      return;
    }

    const name = interaction.options.getString("name") ?? undefined;
    await interaction.reply({ content: "Checking server status..." });

    try {
      const statuses = await getServerCheckStatuses(config, name);

      if (statuses.length === 0) {
        await interaction.editReply({
          content: name
            ? `No enabled server check named \`${name}\` was found.`
            : "No enabled server checks are configured."
        });
        return;
      }

      const onlineCount = statuses.filter((status) => status.online).length;
      const embed = new EmbedBuilder()
        .setTitle("Server Check")
        .setDescription("Status for each configured server check:")
        .addFields(statuses.slice(0, 25).map(formatCheckField))
        .setFooter({ text: `${onlineCount}/${statuses.length} online` })
        .setTimestamp(new Date());

      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to check server status.";
      await interaction.editReply({ content: `Server check failed: ${message}`, embeds: [] });
    }
  }
};
