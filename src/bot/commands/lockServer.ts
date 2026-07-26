import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getGuildConfig, upsertGuildConfig } from "../../services/configService.js";
import { sendGuildLog } from "../../services/discordLogService.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import {
  findServerCommand,
  removeExpiredCommandLocks
} from "../../services/serverCommandService.js";
import {
  autocompleteConfiguredServer,
  getServerControlAccess
} from "./serverCommandUtils.js";
import { ephemeralFlag } from "../interactionErrors.js";

const maxLockMinutes = 240;

export const lockServerCommand = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Temporarily lock a configured server start and stop command.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Configured server command name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("duration_minutes")
        .setDescription("Lock duration in minutes, max 240")
        .setMinValue(1)
        .setMaxValue(maxLockMinutes)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Optional lock reason")
        .setMaxLength(200)
        .setRequired(false)
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
      await interaction.reply({ content: "This command can only be used inside a server.", flags: ephemeralFlag });
      return;
    }

    const config = removeExpiredCommandLocks(getGuildConfig(interaction.guildId));
    const access = await getServerControlAccess(interaction, config);
    if (!access.allowed) {
      await interaction.reply({
        content: `You do not have permission to lock configured servers: ${access.reason}.`,
        flags: ephemeralFlag
      });
      return;
    }

    const name = interaction.options.getString("name", true);
    const durationMinutes = interaction.options.getInteger("duration_minutes", true);
    const reason = interaction.options.getString("reason") ?? null;
    const serverCommand = findServerCommand(config, name);

    if (!serverCommand || !serverCommand.enabled) {
      await interaction.reply({ content: `No enabled server command named \`${name}\` was found.`, flags: ephemeralFlag });
      return;
    }

    const lockedUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    const updatedConfig = {
      ...config,
      commandLocks: {
        ...config.commandLocks,
        [serverCommand.id]: {
          commandId: serverCommand.id,
          lockedUntil,
          lockedBy: interaction.user.id,
          reason
        }
      }
    };

    upsertGuildConfig(updatedConfig);

    const message = `${interaction.user.tag} locked start/stop for \`${serverCommand.name}\` until ${new Date(
      lockedUntil
    ).toLocaleString()}.`;

    writeAuditLog({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      action: "lock_server_command",
      status: "success",
      message,
      metadata: {
        commandId: serverCommand.id,
        commandName: serverCommand.name,
        lockedUntil,
        reason
      }
    });

    await sendGuildLog(interaction.client, updatedConfig, {
      title: "Server Command Locked",
      description: message,
      fields: [
        { name: "Blocks", value: "/start and /stop", inline: true },
        { name: "Duration", value: `${durationMinutes} minute(s)`, inline: true },
        { name: "Reason", value: reason || "none", inline: true }
      ]
    });

    await interaction.reply({
      content: `<@${interaction.user.id}> locked \`${serverCommand.name}\` (/start and /stop) until ${new Date(
        lockedUntil
      ).toLocaleString()}.`
    });
  }
};
