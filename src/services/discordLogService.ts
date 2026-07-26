import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import type { GuildConfig } from "./configService.js";
import { logger } from "./logger.js";

export async function sendGuildLog(
  client: Client,
  config: GuildConfig,
  message: {
    title: string;
    description: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }
) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.warn({ channelId: config.logChannelId }, "Configured log channel is unavailable");
    return;
  }

  await channel
    .send({
      embeds: [
        {
          title: message.title,
          description: message.description,
          fields: message.fields,
          timestamp: new Date().toISOString()
        }
      ]
    })
    .catch((error) => {
      logger.warn({ error, channelId: config.logChannelId }, "Failed to send Discord log message");
    });
}
