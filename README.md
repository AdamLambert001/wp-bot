# WP Bot

TypeScript Discord bot for uploading `.pbo` mission files to a configured server folder, with a small Web UI for guild-specific settings.

## Features

- `/uploadpbo file:<attachment>` slash command.
- `/listpbo` slash command with embed pagination buttons.
- `/start`, `/stop`, and `/lock` slash commands for configured server command rows.
- `/servercheck` slash command for configured port online/offline checks.
- `/monitor` slash command to track a Windows service, port, or app and post red/green alerts.
- `/service-tracks` slash command to list everything the bot is watching.
- `/remove-service` slash command to stop tracking an item.
- `.pbo` filename and size validation.
- Configurable mission upload directory per Discord server.
- Configurable Discord logging channel.
- Configurable upload roles.
- Configurable allowed upload channels with forum-channel parent support.
- Optional overwrite and backup-before-overwrite behavior.
- Local JSON-backed config and audit logs.
- Web UI with searchable guild channel and role controls.
- Web UI table for configured start/stop command lines and stop lock windows.
- Automatic guild slash command refresh on bot startup.

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the Discord app values:

   ```env
   DISCORD_TOKEN=
   DISCORD_CLIENT_ID=
   DISCORD_CLIENT_SECRET=
   WEB_SESSION_SECRET=use-a-long-random-secret
   WEB_BASE_URL=http://localhost:3000
   WEB_HOST=0.0.0.0
   WEB_PORT=3000
   DATABASE_PATH=./data/app.json
   LOG_LEVEL=info
   ```

3. Build the project:

   ```powershell
   npm run build
   ```

4. Start the bot and Web UI:

   ```powershell
   npm run dev
   ```

   The bot refreshes guild slash commands on startup so they appear quickly in servers. It also clears old global commands to avoid duplicate slash commands.

5. Open `http://localhost:3000`, enter `WEB_SESSION_SECRET`, choose a guild, then configure:

   - logging channel
   - allowed upload roles
   - allowed upload channels
   - active upload-role summary
   - mission upload folder
   - upload size/overwrite/backup behavior
   - server command start/stop rows
   - server check name/port rows for `/servercheck`
   - start/stop/lock allowed roles and channels
   - local-time stop lock windows with selectable weekdays

   Upload channels are an allow-list. If no upload channels are selected, uploads are blocked everywhere.

Configured server commands run on the host machine with `cmd.exe /c`. Only save commands you trust.

`/monitor` watches this machine every 2 minutes. Use `service` for a Windows service, `port` for a local listener, or `app` for a Task Manager process. Each outage posts one numbered down alert (`#1`, `#2`, …) and pings the chosen role or user. When the target comes back, that same embed is edited to restored instead of posting a new message. Role pings only work if that role is mentionable, or the bot is allowed to mention it.

## Run as a Windows Service

Install the bot so it starts in the background with Windows.

1. Make sure `.env` is filled in.
2. Open **PowerShell or Terminal as Administrator**.
3. From the project folder:

   ```powershell
   npm run service:install
   ```

That builds the project and installs a Windows service named `WPBot`.

Other commands:

```powershell
npm run service:start
npm run service:stop
npm run service:uninstall
```

Optional: set a custom service name before install:

```powershell
$env:WP_BOT_SERVICE_NAME = "MyArmaBot"
npm run service:install
```

Manage it later in `services.msc`, or with:

```powershell
Get-Service WPBot
Restart-Service WPBot
```

## Discord App Permissions

When inviting the bot, include these scopes:

- `bot`
- `applications.commands`

Recommended bot permissions:

- `Send Messages`
- `Embed Links`
- `Use Slash Commands`

The configured mission upload folder must be accessible from the machine running the bot.
