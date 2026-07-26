import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../config/env.js";
import type { GuildConfig } from "../services/configService.js";
import type { AuditStatus } from "../services/auditLogService.js";

export type AuditLogRecord = {
  id: number;
  guildId: string;
  userId: string | null;
  action: string;
  status: AuditStatus;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type StoreData = {
  guildConfigs: Record<string, GuildConfig>;
  auditLogs: AuditLogRecord[];
  nextAuditLogId: number;
};

const databasePath = resolve(env.DATABASE_PATH.replace(/\.db$/i, ".json"));
const defaultData: StoreData = {
  guildConfigs: {},
  auditLogs: [],
  nextAuditLogId: 1
};

mkdirSync(dirname(databasePath), { recursive: true });

function loadStore(): StoreData {
  if (!existsSync(databasePath)) {
    return structuredClone(defaultData);
  }

  return {
    ...structuredClone(defaultData),
    ...JSON.parse(readFileSync(databasePath, "utf8"))
  };
}

let data = loadStore();

function persist() {
  try {
    writeFileSync(databasePath, JSON.stringify(data, null, 2));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      throw new Error(
        `Cannot write ${databasePath} (${code}). Stop the WPBot Windows service if it is running, and make sure only one bot instance is using this folder. Also check that your user account can modify the data folder.`
      );
    }

    throw error;
  }
}

export const store = {
  getGuildConfig(guildId: string) {
    return data.guildConfigs[guildId];
  },

  setGuildConfig(config: GuildConfig) {
    data.guildConfigs[config.guildId] = config;
    persist();
  },

  addAuditLog(input: Omit<AuditLogRecord, "id" | "createdAt">) {
    const record: AuditLogRecord = {
      ...input,
      id: data.nextAuditLogId++,
      createdAt: new Date().toISOString()
    };

    data.auditLogs.push(record);
    data.auditLogs = data.auditLogs.slice(-1000);
    persist();

    return record;
  },

  listAuditLogs(guildId: string, limit: number) {
    return data.auditLogs
      .filter((log) => log.guildId === guildId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
};
