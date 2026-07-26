import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import type { GuildConfig } from "./configService.js";

type ChannelInteraction = ChatInputCommandInteraction | ButtonInteraction;

function getParentId(channel: unknown): string | null {
  if (channel && typeof channel === "object" && "parentId" in channel) {
    const parentId = (channel as { parentId?: unknown }).parentId;
    return typeof parentId === "string" ? parentId : null;
  }

  return null;
}

export async function getUploadChannelMatch(interaction: ChannelInteraction, config: GuildConfig) {
  if (config.allowedUploadChannelIds.length === 0) {
    return {
      allowed: false,
      checkedChannelIds: [interaction.channelId],
      matchedChannelId: null
    };
  }

  const channel = interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));
  const checkedChannelIds = [interaction.channelId];
  const parentId = getParentId(channel);

  if (parentId) {
    checkedChannelIds.push(parentId);
  }

  const matchedChannelId =
    checkedChannelIds.find((channelId) => config.allowedUploadChannelIds.includes(channelId)) ?? null;

  return {
    allowed: Boolean(matchedChannelId),
    checkedChannelIds,
    matchedChannelId
  };
}
