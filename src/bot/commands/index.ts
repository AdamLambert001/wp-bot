import { listPboFilesCommand } from "./listPboFiles.js";
import { lockServerCommand } from "./lockServer.js";
import { serverCheckCommand } from "./serverCheck.js";
import { startServerCommand } from "./startServer.js";
import { stopServerCommand } from "./stopServer.js";
import { uploadPboCommand } from "./uploadPbo.js";

export const commands = [
  uploadPboCommand,
  listPboFilesCommand,
  startServerCommand,
  stopServerCommand,
  lockServerCommand,
  serverCheckCommand
];
