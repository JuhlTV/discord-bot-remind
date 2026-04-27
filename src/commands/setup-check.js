const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require("discord.js");

const REQUIRED_GUILD_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.AttachFiles
];

const REQUIRED_CHANNEL_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles
];

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.ViewChannel, "ViewChannel"],
  [PermissionFlagsBits.SendMessages, "SendMessages"],
  [PermissionFlagsBits.ReadMessageHistory, "ReadMessageHistory"],
  [PermissionFlagsBits.ManageChannels, "ManageChannels"],
  [PermissionFlagsBits.ManageRoles, "ManageRoles"],
  [PermissionFlagsBits.AttachFiles, "AttachFiles"]
]);

function formatPermNames(perms) {
  return perms.map((perm) => PERMISSION_LABELS.get(perm) || String(perm)).join(", ");
}

function checkMissingPermissions(member, perms) {
  return perms.filter((perm) => !member.permissions.has(perm));
}

function channelTypeName(type) {
  if (type === ChannelType.GuildCategory) {
    return "Category";
  }

  if (type === ChannelType.GuildText) {
    return "Text";
  }

  return String(type);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-check")
    .setDescription("Prueft Setup, Ressourcen und Bot-Berechtigungen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const { ticketService, config } = context;
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: true });

    const me = guild.members.me || await guild.members.fetchMe();
    const settings = ticketService.resolveGuildConfig(guild.id);

    const findings = [];
    const checks = [];

    const staffRole = settings.staffRoleId ? guild.roles.cache.get(settings.staffRoleId) : null;
    if (!settings.staffRoleId) {
      findings.push("Staff-Rolle ist nicht gesetzt.");
    } else if (!staffRole) {
      findings.push(`Staff-Rolle (${settings.staffRoleId}) existiert nicht mehr.`);
    } else {
      checks.push(`Staff-Rolle gefunden: <@&${staffRole.id}>`);
    }

    const categoryChecks = [
      ["billing", settings.categoryByType.billing],
      ["tech", settings.categoryByType.tech],
      ["report", settings.categoryByType.report]
    ];

    for (const [type, categoryId] of categoryChecks) {
      if (!categoryId) {
        findings.push(`Kategorie fuer ${type} fehlt.`);
        continue;
      }

      const category = guild.channels.cache.get(categoryId);
      if (!category) {
        findings.push(`Kategorie fuer ${type} nicht gefunden (${categoryId}).`);
        continue;
      }

      if (category.type !== ChannelType.GuildCategory) {
        findings.push(`Kategorie fuer ${type} hat falschen Typ: ${channelTypeName(category.type)}.`);
        continue;
      }

      checks.push(`Kategorie ${type}: <#${category.id}>`);
    }

    let logChannel = null;
    if (!settings.supportLogChannelId) {
      findings.push("Log-Channel ist nicht gesetzt.");
    } else {
      logChannel = guild.channels.cache.get(settings.supportLogChannelId);
      if (!logChannel) {
        findings.push(`Log-Channel nicht gefunden (${settings.supportLogChannelId}).`);
      } else if (logChannel.type !== ChannelType.GuildText) {
        findings.push(`Log-Channel ist kein Text-Channel: ${channelTypeName(logChannel.type)}.`);
      } else {
        checks.push(`Log-Channel: <#${logChannel.id}>`);
      }
    }

    const missingGuildPerms = checkMissingPermissions(me, REQUIRED_GUILD_PERMS);
    if (missingGuildPerms.length > 0) {
      findings.push(`Bot fehlen Server-Rechte: ${formatPermNames(missingGuildPerms)}.`);
    } else {
      checks.push("Server-Rechte des Bots sind vollstaendig.");
    }

    if (logChannel && logChannel.isTextBased()) {
      const channelPerms = logChannel.permissionsFor(me);
      const missingLogPerms = REQUIRED_CHANNEL_PERMS.filter((perm) => !channelPerms || !channelPerms.has(perm));

      if (missingLogPerms.length > 0) {
        findings.push(`Im Log-Channel fehlen Bot-Rechte: ${formatPermNames(missingLogPerms)}.`);
      } else {
        checks.push("Log-Channel Rechte des Bots sind vollstaendig.");
      }
    }

    const systemConfigured = ticketService.isGuildConfigured(guild.id);

    const embed = new EmbedBuilder()
      .setColor(findings.length === 0 ? 0x16a34a : 0xdc2626)
      .setTitle(`${config.brandName} | Setup Check`)
      .setDescription(
        findings.length === 0
          ? "Alles korrekt eingerichtet. Das Support-System ist produktionsbereit."
          : "Es wurden Probleme gefunden. Unten siehst du konkrete Fix-Hinweise."
      )
      .addFields(
        {
          name: "Systemstatus",
          value: systemConfigured && findings.length === 0 ? "OK" : "Fehler gefunden",
          inline: true
        },
        {
          name: "Checks bestanden",
          value: String(checks.length),
          inline: true
        },
        {
          name: "Findings",
          value: String(findings.length),
          inline: true
        },
        {
          name: "Details",
          value: checks.length > 0 ? checks.map((item) => `- ${item}`).join("\n") : "- Keine",
          inline: false
        },
        {
          name: "Probleme",
          value: findings.length > 0 ? findings.map((item) => `- ${item}`).join("\n") : "- Keine",
          inline: false
        },
        {
          name: "Fix",
          value: findings.length > 0
            ? "Fuehre `/setup-system create_missing:true post_panel:true` aus oder setze alle Optionen manuell."
            : "Kein Fix notwendig.",
          inline: false
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
