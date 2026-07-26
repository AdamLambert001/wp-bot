import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getGuildConfig, upsertGuildConfig } from "../../services/configService.js";
import { launchConfiguredCommand } from "../../services/commandExecutionService.js";
import { sendGuildLog } from "../../services/discordLogService.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import {
  findServerCommand,
  getActiveCommandLock,
  removeExpiredCommandLocks
} from "../../services/serverCommandService.js";
import {
  autocompleteConfiguredServer,
  getServerControlAccess,
  launchFields
} from "./serverCommandUtils.js";

export const startServerCommand = {
  data: new SlashCommandBuilder()
    .setName("start")
    .setDescription("Run a configured server start command.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Configured server command name")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    await autocompleteConfiguredServer(interaction, getGuildConfig(interaction.guildId));
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used inside a server.", ephemeral: true });
      return;
    }

    let config = removeExpiredCommandLocks(getGuildConfig(interaction.guildId));
    upsertGuildConfig(config);

    const access = await getServerControlAccess(interaction, config);
    if (!access.allowed) {
      await interaction.reply({
        content: `You do not have permission to start configured servers: ${access.reason}.`,
        ephemeral: true
      });
      return;
    }

    const name = interaction.options.getString("name", true);
    const serverCommand = findServerCommand(config, name);
    if (!serverCommand || !serverCommand.enabled) {
      await interaction.reply({ content: `No enabled server command named \`${name}\` was found.`, ephemeral: true });
      return;
    }

    const lock = getActiveCommandLock(config, serverCommand.id);
    if (lock) {
      await interaction.reply({
        content: `\`${serverCommand.name}\` is locked until ${new Date(lock.lockedUntil).toLocaleString()}.`,
        ephemeral: true
      });
      return;
    }

    try {
      const result = await launchConfiguredCommand(serverCommand.startCommand);
      const status = result.launched ? "success" : "failed";
      const message = `${interaction.user.tag} sent start command \`${serverCommand.name}\`.`;

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "start_server",
        status,
        message,
        metadata: {
          commandId: serverCommand.id,
          commandName: serverCommand.name,
          result
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: status === "success" ? "Server Start Command Sent" : "Server Start Command Failed",
        description: message,
        fields: launchFields(result)
      });

      await interaction.reply({
        content:
          status === "success"
            ? `<@${interaction.user.id}> started \`${serverCommand.name}\`.`
            : `Start command for \`${serverCommand.name}\` failed. Check the log channel for details.`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown launch failure.";

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "start_server",
        status: "failed",
        message: errorMessage,
        metadata: {
          commandId: serverCommand.id,
          commandName: serverCommand.name
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: "Server Start Command Failed",
        description: `${interaction.user.tag} failed to start \`${serverCommand.name}\`: ${errorMessage}`
      });

      await interaction.reply({
        content: `Start command for \`${serverCommand.name}\` failed: ${errorMessage}`,
        ephemeral: true
      });
    }
  }
};
