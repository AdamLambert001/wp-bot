import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getGuildConfig } from "../../services/configService.js";
import {
  formatMonitorType,
  formatTrackStatus,
  listServiceTracks,
  trackMention
} from "../../services/serviceTrackService.js";
import { getServerControlAccess } from "./serverCommandUtils.js";
import { ephemeralFlag } from "../interactionErrors.js";

export const serviceTracksCommand = {
  data: new SlashCommandBuilder()
    .setName("service-tracks")
    .setDescription("List every service, port, and app the bot is tracking."),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command can only be used inside a server.", flags: ephemeralFlag });
      return;
    }

    const config = getGuildConfig(interaction.guildId);
    const access = await getServerControlAccess(interaction, config);
    if (!access.allowed) {
      await interaction.reply({
        content: `You do not have permission to list monitors: ${access.reason}.`,
        flags: ephemeralFlag
      });
      return;
    }

    const tracks = listServiceTracks(interaction.guildId);

    if (tracks.length === 0) {
      await interaction.reply({ content: "No services are currently being tracked." });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Service tracks")
      .setDescription("Services, ports, and apps the bot is watching:")
      .addFields(
        tracks.slice(0, 25).map((track) => ({
          name: `${track.friendly} — ${formatTrackStatus(track)}`,
          value: [
            `• Type: ${formatMonitorType(track.type)}`,
            `• Value: \`${track.value}\``,
            `• Alerts: <#${track.channelId}>`,
            `• Ping: ${trackMention(track)}`
          ].join("\n"),
          inline: false
        }))
      )
      .setFooter({
        text:
          tracks.length > 25
            ? `Showing 25 of ${tracks.length} track(s)`
            : `${tracks.length} track(s)`
      })
      .setTimestamp(new Date());

    await interaction.reply({ embeds: [embed] });
  }
};
