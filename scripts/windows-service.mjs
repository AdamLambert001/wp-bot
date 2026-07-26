import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Service } = require("node-windows");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(projectRoot, "dist", "index.js");
const action = (process.argv[2] || "").toLowerCase();

const serviceName = process.env.WP_BOT_SERVICE_NAME || "WPBot";

function usage() {
  console.log(`Usage:
  npm run service:install
  npm run service:uninstall
  npm run service:start
  npm run service:stop

Run these from an elevated (Administrator) PowerShell/terminal.
Optional: set WP_BOT_SERVICE_NAME to change the Windows service name (default: WPBot).`);
}

if (!["install", "uninstall", "start", "stop"].includes(action)) {
  usage();
  process.exit(1);
}

if ((action === "install" || action === "start") && !existsSync(scriptPath)) {
  console.error("Missing dist/index.js. Run `npm run build` first.");
  process.exit(1);
}

if ((action === "install" || action === "start") && !existsSync(path.join(projectRoot, ".env"))) {
  console.error("Missing .env in the project root. Copy .env.example to .env and fill it in first.");
  process.exit(1);
}

const svc = new Service({
  name: serviceName,
  description: "WP Discord bot and admin Web UI",
  script: scriptPath,
  workingDirectory: projectRoot,
  wait: 2,
  grow: 0.5,
  maxRetries: 40
});

svc.on("install", () => {
  console.log(`Service "${serviceName}" installed. Starting...`);
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log(`Service "${serviceName}" is already installed.`);
});

svc.on("start", () => {
  console.log(`Service "${serviceName}" started.`);
  console.log("Web UI: http://localhost:3000 (or your WEB_BASE_URL)");
});

svc.on("stop", () => {
  console.log(`Service "${serviceName}" stopped.`);
});

svc.on("uninstall", () => {
  console.log(`Service "${serviceName}" uninstalled.`);
});

svc.on("alreadyuninstalled", () => {
  console.log(`Service "${serviceName}" is not installed.`);
});

svc.on("error", (error) => {
  console.error(`Service error: ${error?.message || error}`);
  console.error("Tip: run your terminal as Administrator.");
});

if (action === "install") {
  console.log(`Installing Windows service "${serviceName}"...`);
  console.log(`Script: ${scriptPath}`);
  console.log(`Working directory: ${projectRoot}`);
  svc.install();
} else if (action === "uninstall") {
  console.log(`Uninstalling Windows service "${serviceName}"...`);
  svc.uninstall();
} else if (action === "start") {
  console.log(`Starting Windows service "${serviceName}"...`);
  svc.start();
} else if (action === "stop") {
  console.log(`Stopping Windows service "${serviceName}"...`);
  svc.stop();
}
