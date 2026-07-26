import { createBotClient, startBot } from "./bot/client.js";
import { startWebServer } from "./web/server.js";
import { logger } from "./services/logger.js";

const client = createBotClient();

try {
  await startBot(client);
  await startWebServer(client);
} catch (error) {
  logger.fatal({ error }, "Application failed to start");
  process.exit(1);
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down");
  client.destroy();
  process.exit(0);
});
