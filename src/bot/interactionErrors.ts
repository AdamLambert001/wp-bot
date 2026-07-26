import {
  DiscordAPIError,
  MessageFlags,
  type ChatInputCommandInteraction
} from "discord.js";

export const ephemeralFlag = MessageFlags.Ephemeral;

export function isUnknownInteractionError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10062;
}

export async function safeReply(
  interaction: ChatInputCommandInteraction,
  content: string
) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
      return;
    }

    await interaction.reply({
      content,
      flags: ephemeralFlag
    });
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      return;
    }

    throw error;
  }
}
