const fs = require("node:fs");
const path = require("node:path");

class GuildConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.ensureFile();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ guilds: {} }, null, 2), "utf8");
    }
  }

  readData() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.guilds) {
        return { guilds: {} };
      }
      return parsed;
    } catch {
      return { guilds: {} };
    }
  }

  writeData(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  getGuildConfig(guildId) {
    const data = this.readData();
    return data.guilds[guildId] || null;
  }

  setGuildConfig(guildId, config) {
    const data = this.readData();
    data.guilds[guildId] = config;
    this.writeData(data);
    return data.guilds[guildId];
  }
}

module.exports = { GuildConfigStore };
