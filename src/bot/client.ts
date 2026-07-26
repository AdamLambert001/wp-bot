import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  AutocompleteInteraction
} from "discord.js";
import { env } from "../config/env.js";
import { commands } from "./commands/index.js";
import { clearGlobalCommands, registerGuildCommands } from "./commandRegistration.js";
import { isUnknownInteractionError, safeReply } from "./interactionErrors.js";
import { logger } from "../services/logger.js";

export type BotCommand = {
  data: {
    name: string;
    toJSON(): unknown;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  handleButton?(interaction: ButtonInteraction, parts: string[]): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
};

export type AppClient = Client & {
  commands: Collection<string, BotCommand>;
};

export function createBotClient(): AppClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  }) as AppClient;

  client.commands = new Collection(commands.map((command) => [command.data.name, command]));

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");

    await clearGlobalCommands().catch((error) => {
      logger.warn({ error }, "Failed to clear global slash commands");
    });

    await registerGuildCommands(readyClient).catch((error) => {
      logger.error({ error }, "Failed to auto-register guild slash commands");
    });
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command?.autocomplete) {
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        logger.error({ error, command: interaction.commandName }, "Unhandled autocomplete error");
      }

      return;
    }

    if (interaction.isButton()) {
      const parts = interaction.customId.split(":");
      const command = client.commands.get(parts[0] ?? "");

      if (!command?.handleButton) {
        return;
      }

      try {
        await command.handleButton(interaction, parts);
      } catch (error) {
        if (isUnknownInteractionError(error)) {
          logger.warn({ customId: interaction.customId }, "Ignored expired button interaction");
          return;
        }

        logger.error({ error, customId: interaction.customId }, "Unhandled button error");
      }

      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      if (isUnknownInteractionError(error)) {
        logger.warn(
          { command: interaction.commandName },
          "Ignored unknown interaction (usually a second bot instance, or Discord timed out after 3s)"
        );
        return;
      }

      logger.error({ error, command: interaction.commandName }, "Unhandled command error");

      await safeReply(interaction, "Something went wrong while running that command.").catch(
        (replyError) => {
          if (!isUnknownInteractionError(replyError)) {
            logger.warn({ error: replyError, command: interaction.commandName }, "Failed to send error reply");
          }
        }
      );
    }
  });

  return client;
}

export async function startBot(client: Client) {
  await client.login(env.DISCORD_TOKEN);
}
