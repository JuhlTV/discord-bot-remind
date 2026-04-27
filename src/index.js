require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");

const { getConfig } = require("./config/env");
const { GuildConfigStore } = require("./config/guildConfigStore");
const { registerCommands } = require("./utils/registerCommands");
const { TicketService } = require("./tickets/ticketService");
const logger = require("./utils/logger");

async function bootstrap() {
  const config = getConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.commands = new Collection();

  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  }

  await registerCommands(config, [...client.commands.values()]);

  const guildConfigStore = new GuildConfigStore(path.join(__dirname, "..", "data", "guild-settings.json"));
  const ticketService = new TicketService(config, guildConfigStore);
  const context = { config, ticketService };

  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, context));
    } else {
      client.on(event.name, (...args) => event.execute(...args, context));
    }
  }

  await client.login(config.token);
}

bootstrap().catch((err) => {
  logger.error("Bot konnte nicht gestartet werden", err);
  process.exit(1);
});
