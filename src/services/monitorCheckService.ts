import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkPortStatus } from "./portCheckService.js";
import type { MonitorType } from "./serviceTrackService.js";

const execFileAsync = promisify(execFile);

export type MonitorCheckResult = {
  online: boolean;
  found: boolean;
  detail: string;
};

const unsafeValuePattern = /[\r\n;`|&$<>*?]/;

function toPowerShellSingleQuoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
}

export function parseMonitorValue(type: MonitorType, rawValue: string): string {
  const value = rawValue.trim();

  if (!value) {
    throw new Error("Value is required.");
  }

  if (value.length > 128) {
    throw new Error("Value must be 128 characters or fewer.");
  }

  if (type === "port") {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Port must be an integer between 1 and 65535.");
    }

    return String(port);
  }

  if (unsafeValuePattern.test(value)) {
    throw new Error("Value contains characters that are not allowed.");
  }

  return value;
}

async function checkAppStatus(name: string): Promise<MonitorCheckResult> {
  const lookup = name.toLowerCase().endsWith(".exe") ? name.slice(0, -4) : name;
  const quoted = toPowerShellSingleQuoted(lookup);
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$lookup = ${quoted}
$proc = @(Get-Process -Name $lookup -ErrorAction SilentlyContinue)
if ($proc.Count -gt 0) { 'online' } else { 'offline' }
`.trim();

  try {
    const output = await runPowerShell(script);
    const online = output.toLowerCase() === "online";
    return {
      online,
      found: online,
      detail: online ? "Process is running" : "Process is not running"
    };
  } catch {
    return {
      online: false,
      found: false,
      detail: "Failed to query Task Manager"
    };
  }
}

async function checkServiceStatus(name: string): Promise<MonitorCheckResult> {
  const quoted = toPowerShellSingleQuoted(name);
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$name = ${quoted}
$svc = Get-Service -Name $name -ErrorAction SilentlyContinue
if (-not $svc) {
  $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $name } | Select-Object -First 1
}
if (-not $svc) { 'missing' }
elseif ($svc.Status -eq 'Running') { 'running' }
else { 'stopped' }
`.trim();

  try {
    const output = (await runPowerShell(script)).toLowerCase();

    if (output === "running") {
      return { online: true, found: true, detail: "Windows service is running" };
    }

    if (output === "stopped") {
      return { online: false, found: true, detail: "Windows service is not running" };
    }

    return { online: false, found: false, detail: "Windows service was not found" };
  } catch {
    return { online: false, found: false, detail: "Failed to query Windows services" };
  }
}

export async function checkMonitorTarget(type: MonitorType, value: string): Promise<MonitorCheckResult> {
  if (type === "port") {
    const status = await checkPortStatus(Number(value));
    return {
      online: status.online,
      found: true,
      detail: status.online
        ? `Listening on port ${status.port}`
        : `Nothing is listening on port ${status.port}`
    };
  }

  if (type === "app") {
    return checkAppStatus(value);
  }

  return checkServiceStatus(value);
}
