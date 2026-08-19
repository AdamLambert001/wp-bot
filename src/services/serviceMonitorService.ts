import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
  type MessageEditOptions
} from "discord.js";
import { logger } from "./logger.js";
import { checkMonitorTarget } from "./monitorCheckService.js";
import {
  listServiceTracks,
  recordTrackAlertState,
  recordTrackCheck,
  trackMention,
  type ServiceTrack
} from "./serviceTrackService.js";

export const monitorPollIntervalMs = 60_000;
export const alertDownColor = 0xed4245;
export const alertRestoredColor = 0x57f287;

let interval: NodeJS.Timeout | null = null;
let polling = false;

function unixSeconds(iso: string | null) {
  if (!iso) {
    return Math.floor(Date.now() / 1000);
  }

  return Math.floor(new Date(iso).getTime() / 1000);
}

export function buildMonitorAlertPayload(
  track: ServiceTrack,
  online: boolean,
  alertNumber: number,
  downAt: string | null,
  resolvedAt: string | null = null
): MessageCreateOptions {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (downAt) {
    fields.push({
      name: "Down at",
      value: `<t:${unixSeconds(downAt)}:f>`,
      inline: true
    });
  }

  if (online && resolvedAt) {
    fields.push({
      name: "Resolved at",
      value: `<t:${unixSeconds(resolvedAt)}:f>`,
      inline: true
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(online ? `#${alertNumber} — ${track.friendly} restored` : `#${alertNumber} — ${track.friendly} is down`)
    .setColor(online ? alertRestoredColor : alertDownColor);

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  if (online) {
    return {
      content: `Alert #${alertNumber} resolved`,
      allowedMentions: { parse: [] },
      embeds: [embed]
    };
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

function isAlertChannel(channel: unknown): channel is GuildTextBasedChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "type" in channel &&
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
  );
}

async function sendDownAlert(client: Client, track: ServiceTrack, alertNumber: number, downAt: string) {
  const channel = await client.channels.fetch(track.channelId).catch(() => null);

  if (!isAlertChannel(channel)) {
    logger.warn(
      { channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Monitor alert channel is unavailable"
    );
    return null;
  }

  try {
    return await channel.send(buildMonitorAlertPayload(track, false, alertNumber, downAt));
  } catch (error) {
    logger.warn(
      { error, channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Failed to send monitor alert"
    );
    return null;
  }
}

async function resolveRestoreAlert(
  client: Client,
  track: ServiceTrack,
  alertNumber: number,
  downAt: string | null
) {
  const payload = buildMonitorAlertPayload(track, true, alertNumber, downAt, new Date().toISOString());
  const channel = await client.channels.fetch(track.channelId).catch(() => null);

  if (!isAlertChannel(channel)) {
    logger.warn(
      { channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Monitor alert channel is unavailable"
    );
    return null;
  }

  if (track.lastAlertMessageId) {
    const existing = await channel.messages.fetch(track.lastAlertMessageId).catch(() => null);

    if (existing) {
      try {
        return await existing.edit(payload as MessageEditOptions);
      } catch (error) {
        logger.warn(
          { error, channelId: track.channelId, trackId: track.id, messageId: track.lastAlertMessageId },
          "Failed to edit monitor alert; sending a new restored message"
        );
      }
    }
  }

  try {
    return await channel.send(payload);
  } catch (error) {
    logger.warn(
      { error, channelId: track.channelId, trackId: track.id, friendly: track.friendly },
      "Failed to send restored monitor alert"
    );
    return null;
  }
}

async function pollTrack(client: Client, track: ServiceTrack) {
  const result = await checkMonitorTarget(track.type, track.value);
  const previous = track.lastOnline;

  if (previous === null) {
    recordTrackCheck(track.id, result.online);
    return;
  }

  if (previous === true && result.online === false) {
    const alertNumber = track.alertCount + 1;
    const downAt = new Date().toISOString();
    const message = await sendDownAlert(client, track, alertNumber, downAt);

    recordTrackAlertState(track.id, {
      lastOnline: false,
      alertCount: alertNumber,
      lastAlertMessageId: message?.id ?? null,
      lastDownAt: downAt
    });
    return;
  }

  if (previous === false && result.online === true) {
    const alertNumber = Math.max(track.alertCount, 1);
    const message = await resolveRestoreAlert(client, track, alertNumber, track.lastDownAt);

    recordTrackAlertState(track.id, {
      lastOnline: true,
      lastAlertMessageId: message?.id ?? track.lastAlertMessageId
    });
    return;
  }

  recordTrackCheck(track.id, result.online);
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
