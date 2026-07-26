import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { Client } from "discord.js";
import { resolve } from "node:path";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { getGuildConfig, guildConfigSchema, upsertGuildConfig } from "../services/configService.js";
import { listAuditLogs } from "../services/auditLogService.js";
import {
  listBotGuilds,
  listGuildRoles,
  listGuildTextChannels
} from "../services/discordDirectoryService.js";
import { logger } from "../services/logger.js";

function requireAdminSecret(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const providedSecret = request.headers["x-admin-secret"];

  if (providedSecret !== env.WEB_SESSION_SECRET) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  done();
}

export async function startWebServer(client: Client) {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(fastifyStatic, {
    root: resolve("public")
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url === "/" || request.url.startsWith("/index.html")) {
      reply.header("Cache-Control", "no-store");
    }

    return payload;
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "Validation failed",
        details: error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      });
      return;
    }

    logger.error({ error }, "Unhandled web server error");
    reply.code(500).send({ error: "Internal Server Error" });
  });

  app.addHook("preHandler", (request, reply, done) => {
    if (!request.url.startsWith("/api/")) {
      done();
      return;
    }

    requireAdminSecret(request, reply, done);
  });

  app.get("/health", async () => ({
    ok: true,
    discordReady: client.isReady()
  }));

  app.get("/api/guilds", async () => ({
    guilds: await listBotGuilds(client)
  }));

  app.get<{ Params: { guildId: string } }>("/api/guilds/:guildId/config", async (request) => ({
    config: getGuildConfig(request.params.guildId)
  }));

  app.put<{ Params: { guildId: string }; Body: unknown }>(
    "/api/guilds/:guildId/config",
    async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const config = guildConfigSchema.parse({
        ...body,
        guildId: request.params.guildId
      });

      const saved = upsertGuildConfig(config);
      logger.info(
        {
          guildId: saved.guildId,
          serverCommandCount: saved.serverCommands.length,
          stopLockWindowCount: saved.globalStopLockWindows.length,
          serverCommandNames: saved.serverCommands.map((command) => command.name)
        },
        "Saved guild config"
      );

      return {
        config: saved
      };
    }
  );

  app.get<{ Params: { guildId: string } }>("/api/guilds/:guildId/channels", async (request) => ({
    channels: await listGuildTextChannels(client, request.params.guildId)
  }));

  app.get<{ Params: { guildId: string } }>("/api/guilds/:guildId/roles", async (request) => ({
    roles: await listGuildRoles(client, request.params.guildId)
  }));

  app.get<{ Params: { guildId: string }; Querystring: { limit?: string } }>(
    "/api/guilds/:guildId/audit-logs",
    async (request) => ({
      logs: listAuditLogs(request.params.guildId, Number(request.query.limit ?? 50))
    })
  );

  await app.listen({ host: env.WEB_HOST, port: env.WEB_PORT });
  logger.info({ host: env.WEB_HOST, port: env.WEB_PORT }, "Web server is listening");

  return app;
}
