import type { Client } from "discord.js";
import { ChannelType, PermissionsBitField } from "discord.js";

export async function listBotGuilds(client: Client) {
  return client.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL()
  }));
}

export async function listGuildTextChannels(client: Client, guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const availableChannels = [];

  for (const channel of channels.values()) {
    if (!channel) {
      continue;
    }

    const permissions = channel.permissionsFor(me);
    const canSendMessages = permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false;
    const canViewChannel = permissions?.has(PermissionsBitField.Flags.ViewChannel) ?? false;
    const canUseForLogs =
      canSendMessages &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement);
    const canUseForUploads =
      canViewChannel &&
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildForum);

    if (!canUseForLogs && !canUseForUploads) {
      continue;
    }

    availableChannels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.position,
      canUseForLogs,
      canUseForUploads
    });
  }

  return availableChannels.sort((a, b) => a.position - b.position);
}

export async function listGuildRoles(client: Client, guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();

  return roles
    .filter((role) => role.name !== "@everyone")
    .map((role) => ({
      id: role.id,
      name: role.name,
      position: role.position
    }))
    .sort((a, b) => b.position - a.position);
}
