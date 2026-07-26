import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getGuildConfig, upsertGuildConfig } from "../../services/configService.js";
import { launchConfiguredCommand } from "../../services/commandExecutionService.js";
import { sendGuildLog } from "../../services/discordLogService.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import {
  findServerCommand,
  formatStopLockWindow,
  getActiveCommandLock,
  getActiveStopLockWindow,
  removeExpiredCommandLocks
} from "../../services/serverCommandService.js";
import {
  autocompleteConfiguredServer,
  getServerControlAccess,
  launchFields
} from "./serverCommandUtils.js";

export const stopServerCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Run a configured server stop command.")
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
        content: `You do not have permission to stop configured servers: ${access.reason}.`,
        ephemeral: true
      });
      return;
    }

    const activeStopWindow = getActiveStopLockWindow(config);
    if (activeStopWindow) {
      const windowLabel = formatStopLockWindow(activeStopWindow);
      const message = `Stop commands are locked during ${windowLabel} local time.`;

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "stop_server",
        status: "denied",
        message,
        metadata: { activeStopWindow }
      });

      await sendGuildLog(interaction.client, config, {
        title: "Server Stop Command Blocked",
        description: `${interaction.user.tag} attempted to stop a server during a stop lock window.`,
        fields: [{ name: "Active Window", value: windowLabel }]
      });

      await interaction.reply({ content: message, ephemeral: true });
      return;
    }

    const name = interaction.options.getString("name", true);
    const serverCommand = findServerCommand(config, name);
    if (!serverCommand || !serverCommand.enabled) {
      await interaction.reply({ content: `No enabled server command named \`${name}\` was found.`, ephemeral: true });
      return;
    }

    const commandLock = getActiveCommandLock(config, serverCommand.id);
    if (commandLock) {
      const message = `\`${serverCommand.name}\` is locked until ${new Date(commandLock.lockedUntil).toLocaleString()}.`;

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "stop_server",
        status: "denied",
        message,
        metadata: { commandLock }
      });

      await sendGuildLog(interaction.client, config, {
        title: "Server Stop Command Blocked",
        description: `${interaction.user.tag} attempted to stop \`${serverCommand.name}\` while it was locked.`,
        fields: [
          { name: "Locked Until", value: new Date(commandLock.lockedUntil).toLocaleString(), inline: true },
          { name: "Reason", value: commandLock.reason || "none", inline: true }
        ]
      });

      await interaction.reply({ content: message, ephemeral: true });
      return;
    }

    try {
      const result = await launchConfiguredCommand(serverCommand.stopCommand);
      const status = result.launched ? "success" : "failed";
      const message = `${interaction.user.tag} sent stop command \`${serverCommand.name}\`.`;

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "stop_server",
        status,
        message,
        metadata: {
          commandId: serverCommand.id,
          commandName: serverCommand.name,
          result
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: status === "success" ? "Server Stop Command Sent" : "Server Stop Command Failed",
        description: message,
        fields: launchFields(result)
      });

      await interaction.reply({
        content:
          status === "success"
            ? `<@${interaction.user.id}> stopped \`${serverCommand.name}\`.`
            : `Stop command for \`${serverCommand.name}\` failed. Check the log channel for details.`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown stop failure.";

      writeAuditLog({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: "stop_server",
        status: "failed",
        message: errorMessage,
        metadata: {
          commandId: serverCommand.id,
          commandName: serverCommand.name
        }
      });

      await sendGuildLog(interaction.client, config, {
        title: "Server Stop Command Failed",
        description: `${interaction.user.tag} failed to stop \`${serverCommand.name}\`: ${errorMessage}`
      });

      await interaction.reply({
        content: `Stop command for \`${serverCommand.name}\` failed: ${errorMessage}`,
        ephemeral: true
      });
    }
  }
};
