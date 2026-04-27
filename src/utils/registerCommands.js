const { REST, Routes } = require("discord.js");
const { info, error } = require("./logger");

async function registerCommands(config, commands) {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = commands.map((cmd) => cmd.data.toJSON());

  try {
    await rest.put(Routes.applicationCommands(config.clientId), { body });

    info(`Globale Slash-Commands registriert: ${commands.length}`);
  } catch (err) {
    error("Fehler beim Registrieren der Slash-Commands", err);
    throw err;
  }
}

module.exports = { registerCommands };
