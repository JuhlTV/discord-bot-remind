const requiredKeys = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "GUILD_ID"
];

function getConfig() {
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  }

  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.GUILD_ID,
    defaultCategoryByType: {
      billing: process.env.BILLING_CATEGORY_ID,
      tech: process.env.TECH_CATEGORY_ID,
      report: process.env.REPORT_CATEGORY_ID
    },
    defaultSupportLogChannelId: process.env.SUPPORT_LOG_CHANNEL_ID,
    defaultStaffRoleId: process.env.STAFF_ROLE_ID,
    inactivityMinutes: Number(process.env.INACTIVITY_MINUTES || 120),
    brandName: process.env.BRAND_NAME || "NICO Support",
    brandColor: Number(process.env.BRAND_COLOR || 0x00a884)
  };
}

module.exports = { getConfig };
