import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Attachment } from "discord.js";
import type { GuildConfig } from "./configService.js";

const safeFileNamePattern = /^[a-zA-Z0-9._-]+\.pbo$/i;

export async function savePboAttachment(attachment: Attachment, config: GuildConfig) {
  if (!config.missionUploadPath) {
    throw new Error("Mission upload path is not configured for this server.");
  }

  const fileName = basename(attachment.name);
  if (!safeFileNamePattern.test(fileName) || extname(fileName).toLowerCase() !== ".pbo") {
    throw new Error("Only .pbo files with safe filenames are allowed.");
  }

  const maxBytes = config.maxUploadMb * 1024 * 1024;
  if (attachment.size > maxBytes) {
    throw new Error(`File is too large. Max allowed size is ${config.maxUploadMb} MB.`);
  }

  const uploadDir = resolve(config.missionUploadPath);
  await mkdir(uploadDir, { recursive: true });

  const destinationPath = resolve(join(uploadDir, fileName));
  if (!destinationPath.toLowerCase().startsWith(uploadDir.toLowerCase())) {
    throw new Error("Resolved destination escaped the configured upload directory.");
  }

  const backupPath = `${destinationPath}.${Date.now()}.bak`;
  const tempPath = `${destinationPath}.${Date.now()}.tmp`;
  let backupCreated = false;
  let destinationExists = false;

  try {
    await stat(destinationPath);
    destinationExists = true;

    if (!config.overwriteExisting) {
      throw new Error("A file with that name already exists and overwriting is disabled.");
    }

    if (config.backupBeforeOverwrite) {
      await copyFile(destinationPath, backupPath);
      backupCreated = true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const response = await fetch(attachment.url);
  if (!response.ok || !response.body) {
    throw new Error(`Discord attachment download failed with HTTP ${response.status}.`);
  }

  const body = Readable.fromWeb(response.body);
  await pipeline(body, createWriteStream(tempPath));

  try {
    if (destinationExists) {
      await rm(destinationPath, { force: true });
    }

    await rename(tempPath, destinationPath);
  } catch (error) {
    await rm(tempPath, { force: true });

    if (destinationExists && backupCreated) {
      await copyFile(backupPath, destinationPath).catch(() => undefined);
    }

    throw error;
  }

  return {
    fileName,
    destinationPath,
    backupPath: backupCreated ? backupPath : null,
    size: attachment.size
  };
}

export async function removeTempFile(path: string) {
  await rm(path, { force: true });
}

export type UploadFolderFile = {
  name: string;
  size: number;
  modifiedAt: Date;
};

export async function listUploadFolderFiles(config: GuildConfig): Promise<UploadFolderFile[]> {
  if (!config.missionUploadPath) {
    throw new Error("Mission upload path is not configured for this server.");
  }

  const uploadDir = resolve(config.missionUploadPath);
  const entries = await readdir(uploadDir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".pbo")
      .map(async (entry) => {
        const filePath = join(uploadDir, entry.name);
        const fileStat = await stat(filePath);

        return {
          name: entry.name,
          size: fileStat.size,
          modifiedAt: fileStat.mtime
        };
      })
  );

  return files.sort((a, b) => a.name.localeCompare(b.name));
}
