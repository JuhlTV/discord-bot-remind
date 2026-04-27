const { info } = require("../utils/logger");

module.exports = {
  name: "ready",
  once: true,
  execute(client, context) {
    info(`Bot online als ${client.user.tag}`);

    if (client.guilds.cache.size === 0) {
      return;
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      return;
    }

    context.ticketService.initializeGuildInactivity(guild);
  }
};
