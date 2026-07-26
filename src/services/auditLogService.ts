import { store } from "../db/database.js";

export type AuditStatus = "success" | "failed" | "denied";

export function writeAuditLog(input: {
  guildId: string;
  userId?: string;
  action: string;
  status: AuditStatus;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  store.addAuditLog({
    guildId: input.guildId,
    userId: input.userId ?? null,
    action: input.action,
    status: input.status,
    message: input.message,
    metadata: input.metadata ?? {}
  });
}

export function listAuditLogs(guildId: string, limit = 50) {
  return store.listAuditLogs(guildId, Math.min(Math.max(limit, 1), 200));
}
