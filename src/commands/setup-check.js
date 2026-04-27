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

async function ensureStaffRole(guild, currentRoleId, canManageRoles, actions) {
  const current = currentRoleId ? guild.roles.cache.get(currentRoleId) : null;
  if (current) {
    return current;
  }

  if (!canManageRoles) {
    actions.push("Staff-Rolle konnte nicht erstellt werden (ManageRoles fehlt).");
    return null;
  }

  const created = await guild.roles.create({
    name: "Support Team",
    mentionable: true,
    reason: "Auto-Fix ueber /setup-check"
  });
  actions.push(`Staff-Rolle erstellt: <@&${created.id}>`);
  return created;
}

async function ensureCategory(guild, currentCategoryId, label, canManageChannels, actions) {
  const current = currentCategoryId ? guild.channels.cache.get(currentCategoryId) : null;
  if (current && current.type === ChannelType.GuildCategory) {
    return current;
  }

  if (!canManageChannels) {
    actions.push(`Kategorie ${label} konnte nicht erstellt werden (ManageChannels fehlt).`);
    return null;
  }

  const created = await guild.channels.create({
    name: `tickets-${label}`,
    type: ChannelType.GuildCategory,
    reason: "Auto-Fix ueber /setup-check"
  });
  actions.push(`Kategorie ${label} erstellt: <#${created.id}>`);
  return created;
}

async function ensureLogChannel(guild, currentLogChannelId, canManageChannels, actions) {
  const current = currentLogChannelId ? guild.channels.cache.get(currentLogChannelId) : null;
  if (current && current.type === ChannelType.GuildText) {
    return current;
  }

  if (!canManageChannels) {
    actions.push("Log-Channel konnte nicht erstellt werden (ManageChannels fehlt).");
    return null;
  }

  const created = await guild.channels.create({
    name: "support-logs",
    type: ChannelType.GuildText,
    reason: "Auto-Fix ueber /setup-check"
  });
  actions.push(`Log-Channel erstellt: <#${created.id}>`);
  return created;
}

function runAudit(guild, me, ticketService) {
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

  return { findings, checks, settings };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-check")
    .setDescription("Prueft Setup, Ressourcen und Bot-Berechtigungen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName("autofix")
        .setDescription("Fehlende Ressourcen automatisch erstellen")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("post_panel")
        .setDescription("Nach erfolgreichem Auto-Fix Support-Panel posten")
        .setRequired(false)
    ),

  async execute(interaction, context) {
    const { ticketService, config } = context;
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: true });

    const me = guild.members.me || await guild.members.fetchMe();
    const doAutofix = interaction.options.getBoolean("autofix") ?? false;
    const postPanel = interaction.options.getBoolean("post_panel") ?? false;
    const autofixActions = [];

    if (doAutofix) {
      const currentSettings = ticketService.resolveGuildConfig(guild.id);
      const canManageChannels = me.permissions.has(PermissionFlagsBits.ManageChannels);
      const canManageRoles = me.permissions.has(PermissionFlagsBits.ManageRoles);

      const staffRole = await ensureStaffRole(
        guild,
        currentSettings.staffRoleId,
        canManageRoles,
        autofixActions
      );

      const billingCategory = await ensureCategory(
        guild,
        currentSettings.categoryByType.billing,
        "billing",
        canManageChannels,
        autofixActions
      );

      const techCategory = await ensureCategory(
        guild,
        currentSettings.categoryByType.tech,
        "tech",
        canManageChannels,
        autofixActions
      );

      const reportCategory = await ensureCategory(
        guild,
        currentSettings.categoryByType.report,
        "report",
        canManageChannels,
        autofixActions
      );

      const logChannel = await ensureLogChannel(
        guild,
        currentSettings.supportLogChannelId,
        canManageChannels,
        autofixActions
      );

      ticketService.setGuildConfig(guild.id, {
        staffRoleId: staffRole ? staffRole.id : currentSettings.staffRoleId || null,
        supportLogChannelId: logChannel ? logChannel.id : currentSettings.supportLogChannelId || null,
        categoryByType: {
          billing: billingCategory ? billingCategory.id : currentSettings.categoryByType.billing || null,
          tech: techCategory ? techCategory.id : currentSettings.categoryByType.tech || null,
          report: reportCategory ? reportCategory.id : currentSettings.categoryByType.report || null
        }
      });

      if (postPanel && ticketService.isGuildConfigured(guild.id)) {
        const panelEmbed = ticketService.buildSupportPanelEmbed(guild);
        const panelComponents = ticketService.buildSupportPanelComponents();
        await interaction.channel.send({ embeds: [panelEmbed], components: panelComponents });
        autofixActions.push(`Support-Panel gepostet in <#${interaction.channel.id}>.`);
      }
    }

    const { findings, checks } = runAudit(guild, me, ticketService);

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
            ? "Nutze `/setup-check autofix:true post_panel:true` oder alternativ `/setup-system create_missing:true post_panel:true`."
            : "Kein Fix notwendig.",
          inline: false
        },
        {
          name: "Auto-Fix",
          value: doAutofix
            ? (autofixActions.length > 0 ? autofixActions.map((item) => `- ${item}`).join("\n") : "- Keine Aenderungen noetig.")
            : "- Nicht ausgefuehrt.",
          inline: false
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
