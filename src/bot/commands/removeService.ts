import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { writeAuditLog } from "../../services/auditLogService.js";
import { getGuildConfig } from "../../services/configService.js";
import { autocompleteServiceTracks, removeServiceTrack } from "../../services/serviceTrackService.js";
import { getServerControlAccess } from "./serverCommandUtils.js";
import { ephemeralFlag } from "../interactionErrors.js";

export const removeServiceCommand = {
  data: new SlashCommandBuilder()
    .setName("remove-service")
    .setDescription("Stop tracking a service, port, or app.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Friendly name of the track to remove")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const focusedValue = interaction.options.getFocused();
    await interaction.respond(autocompleteServiceTracks(interaction.guildId, focusedValue));
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
        content: `You do not have permission to remove monitors: ${access.reason}.`,
        flags: ephemeralFlag
      });
      return;
    }

    const name = interaction.options.getString("name", true);
    const track = removeServiceTrack(interaction.guildId, name);

    if (!track) {
      await interaction.reply({
        content: `No tracked item named \`${name}\` was found.`,
        flags: ephemeralFlag
      });
      return;
    }

    writeAuditLog({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      action: "remove_service_track",
      status: "success",
      message: `${interaction.user.tag} stopped monitoring \`${track.friendly}\`.`,
      metadata: {
        trackId: track.id,
        type: track.type,
        value: track.value
      }
    });

    await interaction.reply({
      content: `Stopped tracking \`${track.friendly}\` (${track.type}: \`${track.value}\`).`
    });
  }
};
