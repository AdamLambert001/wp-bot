import { REST, Routes, type Client } from "discord.js";
import { env } from "../config/env.js";
import { logger } from "../services/logger.js";
import { commands } from "./commands/index.js";

const commandPayloads = () => commands.map((command) => command.data.toJSON());

export async function registerGlobalCommands() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: commandPayloads()
  });

  logger.info({ count: commands.length }, "Registered global Discord application commands");
}

export async function clearGlobalCommands() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: []
  });

  logger.info("Cleared global Discord application commands");
}

export async function registerGuildCommands(client: Client) {
  if (!client.isReady()) {
    throw new Error("Discord client must be ready before guild command registration.");
  }

  const payloads = commandPayloads();
  const guilds = await client.guilds.fetch();

  await Promise.all(
    guilds.map(async (guildPreview) => {
      const guild = await client.guilds.fetch(guildPreview.id);
      await guild.commands.set(payloads);
      logger.info({ guildId: guild.id, guildName: guild.name }, "Registered guild slash commands");
    })
  );
}
