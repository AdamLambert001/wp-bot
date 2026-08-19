import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type MessageCreateOptions
} from "discord.js";
import { logger } from "./logger.js";
import { checkMonitorTarget } from "./monitorCheckService.js";
import {
  formatMonitorType,
  listServiceTracks,
  recordTrackCheck,
  trackMention,
  type ServiceTrack
} from "./serviceTrackService.js";

export const monitorPollIntervalMs = 120_000;
export const alertDownColor = 0xed4245;
export const alertRestoredColor = 0x57f287;

let interval: NodeJS.Timeout | null = null;
let polling = false;

export function buildMonitorAlertPayload(track: ServiceTrack, online: boolean): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setTitle(online ? `${track.friendly} restored` : `${track.friendly} is down`)
    .setDescription(
      online
        ? `The tracked ${formatMonitorType(track.type).toLowerCase()} \`${track.value}\` is back online.`
        : `The tracked ${formatMonitorType(track.type).toLowerCase()} \`${track.value}\` is no longer running.`
    )
    .setColor(online ? alertRestoredColor : alertDownColor)
    .addFields(
      { name: "Type", value: formatMonitorType(track.type), inline: true },
      { name: "Value", value: `\`${track.value}\``, inline: true }
    )
    .setTimestamp(new Date());

  if (online) {
    return { embeds: [embed] };
  }

  return {
    content: trackMention(track),
    allowedMentions: {
      parse: [],
      users: track.mentionType === "user" ? [track.mentionId] : [],
      roles: track.mentionType === "role" ? [track.mentionId] : []
    },
    embeds: [embed]
  };
}

async function sendTrackAlert(client: Client, track: ServiceTrack, online: boolean) {
  const channel = await client.channels.fetch(track.channelId).catch(() => null);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    logger.warn(
      { channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Monitor alert channel is unavailable"
    );
    return;
  }

  await channel.send(buildMonitorAlertPayload(track, online)).catch((error) => {
    logger.warn(
      { error, channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Failed to send monitor alert"
    );
  });
}

async function pollTrack(client: Client, track: ServiceTrack) {
  const result = await checkMonitorTarget(track.type, track.value);
  const previous = track.lastOnline;

  const updated = recordTrackCheck(track.id, result.online);

  if (!updated || previous === null) {
    return;
  }

  if (previous === true && result.online === false) {
    await sendTrackAlert(client, track, false);
    return;
  }

  if (previous === false && result.online === true) {
    await sendTrackAlert(client, track, true);
  }
}

async function pollOnce(client: Client) {
  if (polling) {
    logger.warn("Skipped overlapping service monitor poll");
    return;
  }

  polling = true;

  try {
    const tracks = listServiceTracks();

    for (const track of tracks) {
      try {
        await pollTrack(client, track);
      } catch (error) {
        logger.warn(
          { error, trackId: track.id, friendly: track.friendly },
          "Failed to check monitored service"
        );
      }
    }
  } finally {
    polling = false;
  }
}

export function startServiceMonitor(client: Client) {
  if (interval) {
    return;
  }

  void pollOnce(client);
  interval = setInterval(() => {
    void pollOnce(client);
  }, monitorPollIntervalMs);

  logger.info({ intervalMs: monitorPollIntervalMs }, "Started service monitor");
}
