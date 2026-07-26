import { z } from "zod";
import { store } from "../db/database.js";

const timeValueSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, "Time must be HH:MM")
  .transform((value) => value.slice(0, 5));

export const serverCommandSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9]+(?:[ _-]?[a-z0-9]+)*$/i, "Name may use letters, numbers, spaces, _ and -"),
  startCommand: z.string().trim().min(1),
  stopCommand: z.string().trim().min(1),
  enabled: z.boolean().default(true)
});

// Matches JavaScript Date#getDay(): 0 = Sunday ... 6 = Saturday
export const weekdaySchema = z.coerce.number().int().min(0).max(6);

export const stopLockWindowSchema = z.object({
  id: z.string().min(1),
  start: timeValueSchema,
  end: timeValueSchema,
  daysOfWeek: z.array(weekdaySchema).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  enabled: z.boolean().default(true)
});

export const commandLockSchema = z.object({
  commandId: z.string().min(1),
  lockedUntil: z.string().datetime(),
  lockedBy: z.string().min(1),
  reason: z.string().max(200).nullable().default(null)
});

export const serverCheckSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9]+(?:[ _-]?[a-z0-9]+)*$/i, "Name may use letters, numbers, spaces, _ and -"),
  ports: z.array(z.coerce.number().int().min(1).max(65535)).min(1),
  enabled: z.boolean().default(true)
});

export const guildConfigSchema = z.object({
  guildId: z.string().min(1),
  logChannelId: z.string().min(1).nullable(),
  missionUploadPath: z.string().min(1).nullable(),
  allowedRoleIds: z.array(z.string().min(1)).default([]),
  allowedUploadChannelIds: z.array(z.string().min(1)).default([]),
  allowedServerCommandRoleIds: z.array(z.string().min(1)).default([]),
  allowedServerCommandChannelIds: z.array(z.string().min(1)).default([]),
  allowedUserIds: z.array(z.string().min(1)).default([]),
  maxUploadMb: z.number().int().positive().max(500).default(100),
  overwriteExisting: z.boolean().default(true),
  backupBeforeOverwrite: z.boolean().default(false),
  serverCommands: z.array(serverCommandSchema).default([]),
  serverChecks: z.array(serverCheckSchema).default([]),
  globalStopLockWindows: z.array(stopLockWindowSchema).default([]),
  commandLocks: z.record(z.string(), commandLockSchema).default({})
});

export type GuildConfig = z.infer<typeof guildConfigSchema>;

const defaultConfig = (guildId: string): GuildConfig => ({
  guildId,
  logChannelId: null,
  missionUploadPath: null,
  allowedRoleIds: [],
  allowedUploadChannelIds: [],
  allowedServerCommandRoleIds: [],
  allowedServerCommandChannelIds: [],
  allowedUserIds: [],
  maxUploadMb: 100,
  overwriteExisting: true,
  backupBeforeOverwrite: false,
  serverCommands: [],
  serverChecks: [],
  globalStopLockWindows: [],
  commandLocks: {}
});

export function getGuildConfig(guildId: string): GuildConfig {
  const config = store.getGuildConfig(guildId);

  if (config) {
    return guildConfigSchema.parse(config);
  }

  return defaultConfig(guildId);
}

export function upsertGuildConfig(config: GuildConfig): GuildConfig {
  const parsed = guildConfigSchema.parse(config);
  store.setGuildConfig(parsed);
  return getGuildConfig(parsed.guildId);
}
