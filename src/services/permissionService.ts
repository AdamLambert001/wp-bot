import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import type { GuildConfig } from "./configService.js";

type PermissionInteraction = ChatInputCommandInteraction | ButtonInteraction;

export type UploadPermissionContext = {
  userId: string;
  roleIds: string[];
  isAdministrator: boolean;
};

function roleToId(role: unknown): string | null {
  if (typeof role === "string") {
    return role;
  }

  if (role && typeof role === "object" && "id" in role) {
    const id = (role as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  return null;
}

function getRoleIdsFromInteraction(interaction: PermissionInteraction): string[] {
  const roles = (interaction.member as { roles?: unknown } | null)?.roles;

  if (Array.isArray(roles)) {
    return roles.map(roleToId).filter((roleId): roleId is string => Boolean(roleId));
  }

  if (roles && typeof roles === "object" && "cache" in roles) {
    const cache = (roles as { cache?: { keys?: () => IterableIterator<string>; values?: () => IterableIterator<unknown> } }).cache;

    if (cache?.keys) {
      return Array.from(cache.keys());
    }

    if (cache?.values) {
      return Array.from(cache.values())
        .map(roleToId)
        .filter((roleId): roleId is string => Boolean(roleId));
    }
  }

  return [];
}

export function getUploadPermissionContext(interaction: PermissionInteraction): UploadPermissionContext {
  return {
    userId: interaction.user.id,
    roleIds: getRoleIdsFromInteraction(interaction),
    isAdministrator: interaction.memberPermissions?.has("Administrator") ?? false
  };
}

export function canUploadPbo(context: UploadPermissionContext, config: GuildConfig): boolean {
  if (context.isAdministrator) {
    return true;
  }

  if (config.allowedUserIds.includes(context.userId)) {
    return true;
  }

  if (config.allowedRoleIds.length === 0 && config.allowedUserIds.length === 0) {
    return false;
  }

  return config.allowedRoleIds.some((roleId) => context.roleIds.includes(roleId));
}

export function getUploadPermissionDiagnostics(context: UploadPermissionContext, config: GuildConfig) {
  const matchedRoleIds = config.allowedRoleIds.filter((roleId) => context.roleIds.includes(roleId));

  return {
    userId: context.userId,
    isAdministrator: context.isAdministrator,
    configuredAllowedRoleIds: config.allowedRoleIds,
    userRoleIdsSeenByBot: context.roleIds,
    matchedRoleIds,
    allowedUserIds: config.allowedUserIds
  };
}
