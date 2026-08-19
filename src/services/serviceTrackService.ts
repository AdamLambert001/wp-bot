import { randomUUID } from "node:crypto";
import { store } from "../db/database.js";

export const monitorTypes = ["service", "port", "app"] as const;

export type MonitorType = (typeof monitorTypes)[number];
export type MentionType = "user" | "role";

export type ServiceTrack = {
  id: string;
  guildId: string;
  type: MonitorType;
  value: string;
  friendly: string;
  channelId: string;
  mentionType: MentionType;
  mentionId: string;
  createdBy: string;
  createdAt: string;
  lastOnline: boolean | null;
  lastCheckedAt: string | null;
};

export type AddServiceTrackInput = {
  guildId: string;
  type: MonitorType;
  value: string;
  friendly: string;
  channelId: string;
  mentionType: MentionType;
  mentionId: string;
  createdBy: string;
};

const maxFriendlyLength = 64;

export function isMonitorType(value: string): value is MonitorType {
  return monitorTypes.includes(value as MonitorType);
}

export function normalizeFriendlyName(value: string): string {
  const friendly = value.trim();

  if (!friendly) {
    throw new Error("Friendly name is required.");
  }

  if (friendly.length > maxFriendlyLength) {
    throw new Error(`Friendly name must be ${maxFriendlyLength} characters or fewer.`);
  }

  return friendly;
}

export function listServiceTracks(guildId?: string) {
  return store.listServiceTracks(guildId);
}

export function findServiceTrack(guildId: string, nameOrId: string) {
  const tracks = listServiceTracks(guildId);
  const exact = tracks.find((track) => track.id === nameOrId);

  if (exact) {
    return exact;
  }

  const normalized = nameOrId.trim().toLowerCase();
  return tracks.find((track) => track.friendly.toLowerCase() === normalized);
}

export function findDuplicateTrack(guildId: string, type: MonitorType, value: string) {
  const normalizedValue = value.trim().toLowerCase();
  return listServiceTracks(guildId).find(
    (track) => track.type === type && track.value.toLowerCase() === normalizedValue
  );
}

export function findDuplicateFriendlyName(guildId: string, friendly: string) {
  const normalized = friendly.trim().toLowerCase();
  return listServiceTracks(guildId).find((track) => track.friendly.toLowerCase() === normalized);
}

export function addServiceTrack(input: AddServiceTrackInput): ServiceTrack {
  const friendly = normalizeFriendlyName(input.friendly);
  const duplicateTarget = findDuplicateTrack(input.guildId, input.type, input.value);

  if (duplicateTarget) {
    throw new Error(
      `\`${duplicateTarget.friendly}\` is already tracking this ${input.type} (\`${duplicateTarget.value}\`).`
    );
  }

  const duplicateName = findDuplicateFriendlyName(input.guildId, friendly);

  if (duplicateName) {
    throw new Error(`A track named \`${duplicateName.friendly}\` already exists.`);
  }

  const track: ServiceTrack = {
    id: randomUUID(),
    guildId: input.guildId,
    type: input.type,
    value: input.value,
    friendly,
    channelId: input.channelId,
    mentionType: input.mentionType,
    mentionId: input.mentionId,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    lastOnline: null,
    lastCheckedAt: null
  };

  return store.setServiceTrack(track);
}

export function recordTrackCheck(id: string, online: boolean) {
  const existing = store.getServiceTrack(id);

  if (!existing) {
    return null;
  }

  return store.setServiceTrack({
    ...existing,
    lastOnline: online,
    lastCheckedAt: new Date().toISOString()
  });
}

export function removeServiceTrack(guildId: string, nameOrId: string) {
  const track = findServiceTrack(guildId, nameOrId);

  if (!track) {
    return null;
  }

  store.removeServiceTrack(track.id);
  return track;
}

export function autocompleteServiceTracks(guildId: string, focusedValue: string) {
  const normalized = focusedValue.trim().toLowerCase();

  return listServiceTracks(guildId)
    .filter((track) => !normalized || track.friendly.toLowerCase().includes(normalized))
    .slice(0, 25)
    .map((track) => {
      const name = `${track.friendly} (${track.type}: ${track.value})`;
      return {
        name: name.slice(0, 100),
        value: track.friendly.slice(0, 100)
      };
    });
}

export function trackMention(track: ServiceTrack) {
  return track.mentionType === "role" ? `<@&${track.mentionId}>` : `<@${track.mentionId}>`;
}

export function formatTrackStatus(track: ServiceTrack) {
  if (track.lastOnline === true) {
    return "Online";
  }

  if (track.lastOnline === false) {
    return "Offline";
  }

  return "Pending";
}

export function formatMonitorType(type: MonitorType) {
  if (type === "port") {
    return "Port";
  }

  if (type === "app") {
    return "App";
  }

  return "Windows service";
}
