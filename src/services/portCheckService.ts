import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GuildConfig } from "./configService.js";

const execFileAsync = promisify(execFile);

export type PortStatus = {
  port: number;
  online: boolean;
  pids: number[];
};

export type ServerCheckStatus = {
  id: string;
  name: string;
  online: boolean;
  ports: PortStatus[];
};

function parsePortsCsv(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535);
}

export function parseServerCheckPortsInput(value: string): number[] {
  return [...new Set(parsePortsCsv(value))];
}

async function getListeningPidsForPort(port: number): Promise<number[]> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$port = ${port}
$pids = @()
$pids += @(Get-NetUDPEndpoint -LocalPort $port | Select-Object -ExpandProperty OwningProcess)
$pids += @(Get-NetTCPConnection -LocalPort $port | Select-Object -ExpandProperty OwningProcess)
$pids = $pids | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique
if ($pids) { $pids -join ',' } else { '' }
`.trim();

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      }
    );

    return stdout
      .trim()
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

export async function checkPortStatus(port: number): Promise<PortStatus> {
  const pids = await getListeningPidsForPort(port);
  return {
    port,
    online: pids.length > 0,
    pids
  };
}

export function enabledServerChecks(config: GuildConfig) {
  return config.serverChecks.filter((check) => check.enabled);
}

export function findServerCheck(config: GuildConfig, nameOrId: string) {
  const normalized = nameOrId.trim().toLowerCase();
  return config.serverChecks.find(
    (check) => check.id === nameOrId || check.name.toLowerCase() === normalized
  );
}

export function autocompleteServerChecks(config: GuildConfig, focusedValue: string) {
  const normalized = focusedValue.trim().toLowerCase();

  return enabledServerChecks(config)
    .filter((check) => !normalized || check.name.toLowerCase().includes(normalized))
    .slice(0, 25)
    .map((check) => ({
      name: check.name,
      value: check.name
    }));
}

export async function getServerCheckStatuses(
  config: GuildConfig,
  name?: string
): Promise<ServerCheckStatus[]> {
  const checks = name
    ? enabledServerChecks(config).filter((check) => check.name.toLowerCase() === name.trim().toLowerCase())
    : enabledServerChecks(config);

  const statuses: ServerCheckStatus[] = [];

  for (const check of checks) {
    const ports: PortStatus[] = [];

    for (const port of check.ports) {
      ports.push(await checkPortStatus(port));
    }

    statuses.push({
      id: check.id,
      name: check.name,
      online: ports.some((port) => port.online),
      ports
    });
  }

  return statuses;
}
