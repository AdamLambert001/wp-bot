import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import type { GuildConfig } from "../../services/configService.js";
import type {
  CommandExecutionResult,
  CommandLaunchResult
} from "../../services/commandExecutionService.js";
import { getUploadPermissionContext } from "../../services/permissionService.js";
import { autocompleteServerCommands } from "../../services/serverCommandService.js";

function getParentId(channel: unknown): string | null {
  if (channel && typeof channel === "object" && "parentId" in channel) {
    const parentId = (channel as { parentId?: unknown }).parentId;
    return typeof parentId === "string" ? parentId : null;
  }

  return null;
}

export async function getServerControlAccess(interaction: ChatInputCommandInteraction, config: GuildConfig) {
  const permissionContext = getUploadPermissionContext(interaction);

  if (permissionContext.isAdministrator) {
    return { allowed: true, reason: null };
  }

  const hasAllowedUser = config.allowedUserIds.includes(permissionContext.userId);
  const hasAllowedRole = config.allowedServerCommandRoleIds.some((roleId) =>
    permissionContext.roleIds.includes(roleId)
  );
  const roleAllowed = hasAllowedUser || hasAllowedRole;

  const channel = interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));
  const checkedChannelIds = [interaction.channelId];
  const parentId = getParentId(channel);

  if (parentId) {
    checkedChannelIds.push(parentId);
  }

  const matchedChannelId =
    checkedChannelIds.find((channelId) => config.allowedServerCommandChannelIds.includes(channelId)) ?? null;
  const channelAllowed = Boolean(matchedChannelId);

  if (roleAllowed && channelAllowed) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: [
      !roleAllowed ? "your role is not allowed" : null,
      !channelAllowed ? "this channel is not allowed" : null
    ]
      .filter(Boolean)
      .join(" and ")
  };
}

export async function autocompleteConfiguredServer(interaction: AutocompleteInteraction, config: GuildConfig) {
  const focusedValue = interaction.options.getFocused();
  await interaction.respond(autocompleteServerCommands(config, focusedValue));
}

function truncate(value: string, maxLength = 900) {
  if (!value) {
    return "none";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n... truncated ...`;
}

export function executionFields(result: CommandExecutionResult) {
  return [
    { name: "Exit Code", value: String(result.exitCode), inline: true },
    { name: "Timed Out", value: result.timedOut ? "Yes" : "No", inline: true },
    { name: "Duration", value: `${result.durationMs}ms`, inline: true },
    { name: "stdout", value: `\`\`\`\n${truncate(result.stdout)}\n\`\`\`` },
    { name: "stderr", value: `\`\`\`\n${truncate(result.stderr)}\n\`\`\`` }
  ];
}

export function launchFields(result: CommandLaunchResult) {
  return [
    { name: "Launched", value: result.launched ? "Yes" : "No", inline: true },
    { name: "PID", value: result.pid ? String(result.pid) : "none", inline: true },
    { name: "Exit Code", value: result.exitCode === null ? "still running" : String(result.exitCode), inline: true },
    { name: "Duration", value: `${result.durationMs}ms`, inline: true },
    { name: "stdout", value: `\`\`\`\n${truncate(result.stdout)}\n\`\`\`` },
    { name: "stderr", value: `\`\`\`\n${truncate(result.stderr)}\n\`\`\`` }
  ];
}
