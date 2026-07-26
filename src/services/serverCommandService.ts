import type { GuildConfig } from "./configService.js";

export type ServerCommandConfig = GuildConfig["serverCommands"][number];

export function findServerCommand(config: GuildConfig, nameOrId: string) {
  const normalized = nameOrId.trim().toLowerCase();

  return config.serverCommands.find(
    (command) => command.id === nameOrId || command.name.toLowerCase() === normalized
  );
}

export function enabledServerCommands(config: GuildConfig) {
  return config.serverCommands.filter((command) => command.enabled);
}

export function autocompleteServerCommands(config: GuildConfig, focusedValue: string) {
  const normalized = focusedValue.trim().toLowerCase();

  return enabledServerCommands(config)
    .filter((command) => !normalized || command.name.toLowerCase().includes(normalized))
    .slice(0, 25)
    .map((command) => ({
      name: command.name,
      value: command.name
    }));
}

export function getActiveCommandLock(config: GuildConfig, commandId: string, now = new Date()) {
  const lock = config.commandLocks[commandId];
  if (!lock) {
    return null;
  }

  const lockedUntil = new Date(lock.lockedUntil);
  if (Number.isNaN(lockedUntil.getTime()) || lockedUntil <= now) {
    return null;
  }

  return lock;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function minutesSinceMidnight(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function previousWeekday(day: number) {
  return day === 0 ? 6 : day - 1;
}

function isNowInsideWindow(
  window: { start: string; end: string; daysOfWeek: number[] },
  now: Date
) {
  const startMinutes = minutesSinceMidnight(window.start);
  const endMinutes = minutesSinceMidnight(window.end);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = previousWeekday(today);
  const appliesToday = window.daysOfWeek.includes(today);
  const appliesYesterday = window.daysOfWeek.includes(yesterday);

  // Same start/end means the whole selected day(s).
  if (startMinutes === endMinutes) {
    return appliesToday;
  }

  // Same-day window, e.g. 18:00-23:00 on selected days.
  if (startMinutes < endMinutes) {
    return appliesToday && nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Overnight window, e.g. 22:00-02:00:
  // - selected day after start
  // - day after a selected day before end
  return (
    (appliesToday && nowMinutes >= startMinutes) ||
    (appliesYesterday && nowMinutes < endMinutes)
  );
}

export function formatStopLockWindow(window: {
  start: string;
  end: string;
  daysOfWeek: number[];
}) {
  const days =
    window.daysOfWeek.length === 7
      ? "Every day"
      : window.daysOfWeek
          .slice()
          .sort((a, b) => a - b)
          .map((day) => weekdayLabels[day] ?? String(day))
          .join(", ");

  return `${days} ${window.start}-${window.end}`;
}

export function getActiveStopLockWindow(config: GuildConfig, now = new Date()) {
  return (
    config.globalStopLockWindows.find(
      (window) => window.enabled && isNowInsideWindow(window, now)
    ) ?? null
  );
}

export function removeExpiredCommandLocks(config: GuildConfig, now = new Date()): GuildConfig {
  const commandLocks = Object.fromEntries(
    Object.entries(config.commandLocks).filter(([, lock]) => new Date(lock.lockedUntil) > now)
  );

  return {
    ...config,
    commandLocks
  };
}
