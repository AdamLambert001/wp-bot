import { spawn } from "node:child_process";

const defaultTimeoutMs = 60_000;
const maxOutputLength = 4_000;

function trimOutput(value: string) {
  if (value.length <= maxOutputLength) {
    return value;
  }

  return `${value.slice(0, maxOutputLength)}\n... output truncated ...`;
}

export type CommandExecutionResult = {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CommandLaunchResult = {
  command: string;
  launched: boolean;
  pid: number | undefined;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export async function executeConfiguredCommand(
  command: string,
  timeoutMs = defaultTimeoutMs
): Promise<CommandExecutionResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        command,
        exitCode,
        timedOut,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - startedAt
      });
    });
  });
}

/**
 * Dispatch a command and return as soon as the OS accepts it.
 * Does not wait for the process to finish, so Discord never sits on "thinking".
 */
export async function launchConfiguredCommand(command: string): Promise<CommandLaunchResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });

    let settled = false;

    const settle = (result: Omit<CommandLaunchResult, "command" | "durationMs">) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        command,
        durationMs: Date.now() - startedAt,
        ...result
      });
    };

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    // PID present means Windows accepted the process launch request.
    if (child.pid) {
      child.unref();
      settle({
        launched: true,
        pid: child.pid,
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      return;
    }

    // Fallback if PID is not immediately available.
    setImmediate(() => {
      if (settled) {
        return;
      }

      if (child.pid) {
        child.unref();
        settle({
          launched: true,
          pid: child.pid,
          exitCode: null,
          stdout: "",
          stderr: ""
        });
        return;
      }

      settle({
        launched: false,
        pid: undefined,
        exitCode: null,
        stdout: "",
        stderr: "Process did not start."
      });
    });
  });
}
