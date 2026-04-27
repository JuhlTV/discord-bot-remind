const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { createTranscript } = require("discord-html-transcripts");

const TICKET_TYPES = {
  billing: { label: "Billing", emoji: "💳", id: "ticket_open_billing", color: 0x0f766e, description: "Zahlungen, Rechnungen & Abonnements" },
  tech:    { label: "Tech",    emoji: "🔧", id: "ticket_open_tech",    color: 0x1d4ed8, description: "Technische Probleme & Bugs" },
  report:  { label: "Report",  emoji: "🚨", id: "ticket_open_report",  color: 0xb91c1c, description: "Spieler, Bugs & Verstösse melden" }
};

const PRIORITY = {
  low:    { label: "Niedrig", emoji: "🟢", value: "low" },
  medium: { label: "Mittel",  emoji: "🟡", value: "medium" },
  high:   { label: "Hoch",    emoji: "🔴", value: "high" }
};

function formatTopic(meta) {
  const typeLabel = meta.type ? meta.type.charAt(0).toUpperCase() + meta.type.slice(1) : "Support";
  const claimedDisplay = meta.claimedBy && meta.claimedBy !== "none" ? "Claimed" : "Unclaimed";
  const ticketNum = meta.ticketNum || 0;
  const priority = meta.priority || "medium";
  return `${typeLabel} Support Ticket | ${claimedDisplay} | ticket:${meta.ownerId}:${meta.type}:${meta.claimedBy || "none"}:${meta.createdAt || Date.now()}:${ticketNum}:${priority}`;
}

function parseTopic(topic) {
  if (!topic) return null;

  // Extended format: ticket:ownerID:type:claimedBy:created:ticketNum:priority
  const extMatch = topic.match(/ticket:([0-9]+):([a-z]+):([0-9none]+):([0-9]+):([0-9]+):([a-z]+)/);
  if (extMatch) {
    const [, ownerId, type, claimedRaw, createdAt, ticketNum, priority] = extMatch;
    return {
      ownerId,
      type,
      claimedBy: claimedRaw !== "none" ? claimedRaw : null,
      createdAt: Number(createdAt),
      ticketNum: Number(ticketNum),
      priority: priority || "medium"
    };
  }

  // Legacy compact format (no ticketNum/priority)
  const compactMatch = topic.match(/ticket:([0-9]+):([a-z]+):([0-9none]+):([0-9]+)/);
  if (compactMatch) {
    const [, ownerId, type, claimedRaw, createdAt] = compactMatch;
    return {
      ownerId,
      type,
      claimedBy: claimedRaw !== "none" ? claimedRaw : null,
      createdAt: Number(createdAt),
      ticketNum: 0,
      priority: "medium"
    };
  }

  // Legacy pipe format fallback
  if (topic.startsWith("ticket|")) {
    const map = new Map();
    const parts = topic.split("|").slice(1);
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value !== undefined) map.set(key, value);
    }
    const ownerId = map.get("owner");
    const type = map.get("type");
    const claimedRaw = map.get("claimed");
    if (!ownerId || !type) return null;
    return {
      ownerId,
      type,
      claimedBy: claimedRaw && claimedRaw !== "none" ? claimedRaw : null,
      createdAt: Number(map.get("created") || Date.now()),
      ticketNum: 0,
      priority: "medium"
    };
  }

  return null;
}

function msToHumanDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

class TicketService {
  constructor(config, guildConfigStore) {
    this.config = config;
    this.guildConfigStore = guildConfigStore;
    this.inactivityTimers = new Map();
    this.stats = {
      opened: 0,
      closed: 0,
      claimed: 0,
      autoClosed: 0,
      ratingSum: 0,
      ratingCount: 0,
      bootedAt: Date.now()
    };
  }

  resolveGuildConfig(guildId) {
    const stored = this.guildConfigStore.getGuildConfig(guildId) || {};

    return {
      categoryByType: {
        billing: stored.categoryByType?.billing || this.config.defaultCategoryByType.billing || null,
        tech: stored.categoryByType?.tech || this.config.defaultCategoryByType.tech || null,
        report: stored.categoryByType?.report || this.config.defaultCategoryByType.report || null
      },
      supportLogChannelId: stored.supportLogChannelId || this.config.defaultSupportLogChannelId || null,
      staffRoleId: stored.staffRoleId || this.config.defaultStaffRoleId || null,
      ticketCounter: stored.ticketCounter || 0
    };
  }

  setGuildConfig(guildId, settings) {
    return this.guildConfigStore.setGuildConfig(guildId, settings);
  }

  getNextTicketNumber(guildId) {
    const stored = this.guildConfigStore.getGuildConfig(guildId) || {};
    const next = (stored.ticketCounter || 0) + 1;
    this.guildConfigStore.setGuildConfig(guildId, { ...stored, ticketCounter: next });
    return next;
  }

  isGuildConfigured(guildId) {
    const settings = this.resolveGuildConfig(guildId);

    return Boolean(
      settings.staffRoleId &&
      settings.supportLogChannelId &&
      settings.categoryByType.billing &&
      settings.categoryByType.tech &&
      settings.categoryByType.report
    );
  }

  getTicketChannelByUser(guild, userId) {
    return guild.channels.cache.find(
      (channel) => {
        if (!this.isTicketChannel(channel)) {
          return false;
        }

        const meta = parseTopic(channel.topic);
        return meta && meta.ownerId === userId;
      }
    );
  }

  getAllTicketChannels(guild) {
    return guild.channels.cache.filter((channel) => this.isTicketChannel(channel));
  }

  getCategoryIdByType(guildId, type) {
    const settings = this.resolveGuildConfig(guildId);
    return settings.categoryByType[type] || null;
  }

  getTypeInfo(type) {
    return TICKET_TYPES[type] || null;
  }

  getPriorityInfo(priority) {
    return PRIORITY[priority] || PRIORITY.medium;
  }

  getStats(guild) {
    const openByType = {
      billing: 0,
      tech: 0,
      report: 0
    };

    guild.channels.cache.forEach((channel) => {
      if (!this.isTicketChannel(channel)) {
        return;
      }

      const meta = parseTopic(channel.topic);
      if (!meta || openByType[meta.type] === undefined) {
        return;
      }

      if (openByType[meta.type] !== undefined) {
        openByType[meta.type] += 1;
      }
    });

    const avgRating = this.stats.ratingCount > 0
      ? (this.stats.ratingSum / this.stats.ratingCount).toFixed(1)
      : "N/A";

    return {
      openByType,
      openTotal: openByType.billing + openByType.tech + openByType.report,
      openedSinceBoot: this.stats.opened,
      closedSinceBoot: this.stats.closed,
      claimedSinceBoot: this.stats.claimed,
      autoClosedSinceBoot: this.stats.autoClosed,
      avgRating
    };
  }

  isStaffMember(member) {
    if (!member || !member.guild || !member.roles) {
      return false;
    }

    // Server admin/owner always counts as staff
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return true;
    }

    const settings = this.resolveGuildConfig(member.guild.id);
    return Boolean(settings.staffRoleId && member.roles.cache.has(settings.staffRoleId));
  }

  buildOpenButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.billing.id)
        .setLabel("Billing")
        .setEmoji("💳")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.tech.id)
        .setLabel("Tech")
        .setEmoji("🔧")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.report.id)
        .setLabel("Report")
        .setEmoji("🚨")
        .setStyle(ButtonStyle.Danger)
    );
  }

  buildSupportPanelEmbed(guild) {
    const stats = this.getStats(guild);
    const configured = this.isGuildConfigured(guild.id);
    const guildIcon = guild.iconURL({ dynamic: true }) ?? undefined;

    return new EmbedBuilder()
      .setColor(this.config.brandColor)
      .setAuthor({ name: this.config.brandName, iconURL: guildIcon })
      .setTitle("📋  Support Desk")
      .setDescription(
        "Brauchst du Hilfe? Öffne ein Ticket — unser Team meldet sich so schnell wie möglich.\n\n" +
        "💳  **Billing** — Zahlungen, Rechnungen & Abonnements\n" +
        "🔧  **Tech** — Technische Probleme & Bugs\n" +
        "🚨  **Report** — Spieler, Bugs & Regelverstösse melden"
      )
      .addFields(
        {
          name: "📊  Live Statistiken",
          value:
            `> 🎫 Offen gesamt: **${stats.openTotal}**\n` +
            `> 💳 Billing: **${stats.openByType.billing}**  |  🔧 Tech: **${stats.openByType.tech}**  |  🚨 Report: **${stats.openByType.report}**\n` +
            `> ✅ Geschlossen: **${stats.closedSinceBoot}**  |  🤝 Geclaimt: **${stats.claimedSinceBoot}**  |  ⭐ Ø Rating: **${stats.avgRating}**`,
          inline: false
        },
        {
          name: "⚙️  System-Status",
          value: configured
            ? "🟢  Vollständig konfiguriert"
            : "🔴  Nicht konfiguriert — `/setup-system` ausführen",
          inline: false
        }
      )
      .setThumbnail(guildIcon ?? null)
      .setFooter({ text: `${this.config.brandName} • Ticket System`, iconURL: guildIcon })
      .setTimestamp();
  }

  buildSupportPanelComponents() {
    const typeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.billing.id)
        .setLabel("Billing")
        .setEmoji("💳")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.tech.id)
        .setLabel("Tech")
        .setEmoji("🔧")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.report.id)
        .setLabel("Report")
        .setEmoji("🚨")
        .setStyle(ButtonStyle.Danger)
    );

    const utilRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support_refresh_stats")
        .setLabel("Statistiken aktualisieren")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Success)
    );

    return [typeRow, utilRow];
  }

  buildWelcomeEmbed(guild, user, typeInfo, ticketNum, priority) {
    const prioInfo = this.getPriorityInfo(priority);
    const guildIcon = guild.iconURL({ dynamic: true }) ?? undefined;

    return new EmbedBuilder()
      .setColor(typeInfo.color)
      .setAuthor({ name: `${this.config.brandName} • Ticket #${ticketNum}`, iconURL: guildIcon })
      .setTitle(`${typeInfo.emoji}  Willkommen, ${user.username}!`)
      .setDescription(
        `Danke, dass du ein **${typeInfo.label} Ticket** geöffnet hast.\n\n` +
        "Bitte **schildere dein Anliegen** so ausführlich wie möglich:\n" +
        "> • Was genau ist das Problem?\n" +
        "> • Wann ist es aufgetreten?\n" +
        "> • Was hast du bereits versucht?\n\n" +
        "Ein Teammitglied wird sich so schnell wie möglich bei dir melden. 💙"
      )
      .addFields(
        { name: "👤  Erstellt von",  value: `${user}`,                                  inline: true },
        { name: "🎫  Ticket #",      value: `\`#${String(ticketNum).padStart(4, "0")}\``,inline: true },
        { name: "📁  Typ",           value: `${typeInfo.emoji} ${typeInfo.label}`,        inline: true },
        { name: "⚡  Priorität",     value: `${prioInfo.emoji} ${prioInfo.label}`,        inline: true },
        { name: "📌  Status",        value: "🟢 Offen — Wartet auf Staff",               inline: true },
        { name: "🤝  Zugewiesen",    value: "—",                                          inline: true }
      )
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .setFooter({ text: `${this.config.brandName} • Ticket System` })
      .setTimestamp();
  }

  buildTicketActionButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Claim")
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ticket_unclaim")
        .setLabel("Unclaim")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    );
  }

  buildPriorityButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_priority_low")
        .setLabel("Niedrig")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_priority_medium")
        .setLabel("Mittel")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_priority_high")
        .setLabel("Hoch")
        .setEmoji("🔴")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  buildRatingComponents(ticketNum) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_rate_1_${ticketNum}`).setLabel("1 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate_2_${ticketNum}`).setLabel("2 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate_3_${ticketNum}`).setLabel("3 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate_4_${ticketNum}`).setLabel("4 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate_5_${ticketNum}`).setLabel("5 ⭐").setStyle(ButtonStyle.Secondary)
    );
  }

  buildLogEmbed(channel, meta, closedByUserTag, messageCount, openDurationMs) {
    const typeInfo = TICKET_TYPES[meta.type] || { label: meta.type, emoji: "🎫", color: 0x5865f2 };
    const prioInfo = this.getPriorityInfo(meta.priority || "medium");

    return new EmbedBuilder()
      .setColor(typeInfo.color)
      .setTitle(`🔒  Ticket #${String(meta.ticketNum || 0).padStart(4, "0")} geschlossen`)
      .addFields(
        { name: "📁  Typ",           value: `${typeInfo.emoji} ${typeInfo.label}`,                   inline: true },
        { name: "⚡  Priorität",     value: `${prioInfo.emoji} ${prioInfo.label}`,                   inline: true },
        { name: "📌  Channel",       value: `\`${channel.name}\``,                                   inline: true },
        { name: "👤  Owner",         value: `<@${meta.ownerId}>`,                                    inline: true },
        { name: "🤝  Geclaimt von",  value: meta.claimedBy ? `<@${meta.claimedBy}>` : "—",          inline: true },
        { name: "🔒  Geschlossen",   value: closedByUserTag,                                         inline: true },
        { name: "⏱️  Offen für",     value: msToHumanDuration(openDurationMs),                      inline: true },
        { name: "💬  Nachrichten",   value: String(messageCount),                                    inline: true },
        { name: "⭐  Bewertung",      value: "Ausstehend (DM an User gesendet)",                     inline: true }
      )
      .setFooter({ text: `${this.config.brandName} • Ticket Log` })
      .setTimestamp();
  }

  async createTicket(interaction, type) {
    const guild = interaction.guild;
    const user = interaction.user;
    const typeInfo = this.getTypeInfo(type);
    const settings = this.resolveGuildConfig(guild.id);
    const categoryId = this.getCategoryIdByType(guild.id, type);

    if (!this.isGuildConfigured(guild.id)) {
      return {
        ok: false,
        message: "⚠️  Support-System ist noch nicht eingerichtet. Nutze `/setup-system`."
      };
    }

    if (!typeInfo || !categoryId) {
      return { ok: false, message: "Dieser Ticket-Typ ist nicht konfiguriert." };
    }

    const existing = this.getTicketChannelByUser(guild, user.id);
    if (existing) {
      return { ok: false, message: `Du hast bereits ein offenes Ticket: ${existing}` };
    }

    const ticketNum = this.getNextTicketNumber(guild.id);
    const safeUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user";
    const channelName = `${String(ticketNum).padStart(4, "0")}-${type}-${safeUsername}`;
    const priority = "medium";

    const topic = formatTopic({
      ownerId: user.id,
      type,
      claimedBy: null,
      createdAt: Date.now(),
      ticketNum,
      priority
    });

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        },
        ...(settings.staffRoleId ? [{
          id: settings.staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }] : [])
      ]
    });

    const welcomeEmbed = this.buildWelcomeEmbed(guild, user, typeInfo, ticketNum, priority);
    const mentionContent = settings.staffRoleId ? `${user} <@&${settings.staffRoleId}>` : `${user}`;

    await channel.send({
      content: mentionContent,
      embeds: [welcomeEmbed],
      components: [this.buildTicketActionButtons(), this.buildPriorityButtons()]
    });

    this.stats.opened += 1;
    this.touchTicketActivity(channel);

    // DM to ticket owner
    const guildIcon = guild.iconURL({ dynamic: true }) ?? undefined;
    user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(typeInfo.color)
          .setAuthor({ name: this.config.brandName, iconURL: guildIcon })
          .setTitle(`${typeInfo.emoji}  Ticket #${String(ticketNum).padStart(4, "0")} erstellt`)
          .setDescription(
            `Dein **${typeInfo.label}**-Ticket wurde erfolgreich eröffnet.\n\n` +
            `📌 Kanal: ${channel}\n` +
            `🎫 Ticket #: \`#${String(ticketNum).padStart(4, "0")}\`\n\n` +
            "Unser Team wird sich so schnell wie möglich bei dir melden. 💙"
          )
          .setFooter({ text: `${this.config.brandName} • Ticket System` })
          .setTimestamp()
      ]
    }).catch(() => null);

    return { ok: true, channel, ticketNum };
  }

  async updateChannelTopic(channel, meta) {
    await channel.setTopic(formatTopic(meta), "Ticket Metadaten aktualisiert");
  }

  async _updateWelcomeEmbed(channel, meta) {
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      const botMsg = messages.find(
        (m) => m.author.bot && m.embeds.length > 0 && m.components.length > 0
      );
      if (!botMsg) return;

      const typeInfo = this.getTypeInfo(meta.type) || { label: meta.type, emoji: "🎫", color: 0x5865f2 };
      const prioInfo = this.getPriorityInfo(meta.priority || "medium");
      const claimValue = meta.claimedBy ? `<@${meta.claimedBy}>` : "—";
      const statusValue = meta.claimedBy ? "🟡 Offen — In Bearbeitung" : "🟢 Offen — Wartet auf Staff";

      const updatedEmbed = EmbedBuilder.from(botMsg.embeds[0]).setFields(
        { name: "👤  Erstellt von",  value: `<@${meta.ownerId}>`,                                  inline: true },
        { name: "🎫  Ticket #",      value: `\`#${String(meta.ticketNum || 0).padStart(4, "0")}\``,inline: true },
        { name: "📁  Typ",           value: `${typeInfo.emoji} ${typeInfo.label}`,                  inline: true },
        { name: "⚡  Priorität",     value: `${prioInfo.emoji} ${prioInfo.label}`,                  inline: true },
        { name: "📌  Status",        value: statusValue,                                            inline: true },
        { name: "🤝  Zugewiesen",    value: claimValue,                                             inline: true }
      );

      await botMsg.edit({ embeds: [updatedEmbed] });
    } catch {
      // Non-critical — embed update failed silently
    }
  }

  async claimTicket(channel, member) {
    const meta = parseTopic(channel.topic);
    if (!meta) return { ok: false, message: "Ticket-Metadaten konnten nicht gelesen werden." };
    if (meta.claimedBy && meta.claimedBy !== member.id) return { ok: false, message: `Bereits geclaimt von <@${meta.claimedBy}>.` };
    if (meta.claimedBy === member.id) return { ok: false, message: "Du hast dieses Ticket bereits geclaimt." };

    meta.claimedBy = member.id;
    await this.updateChannelTopic(channel, meta);
    await this._updateWelcomeEmbed(channel, meta);
    this.stats.claimed += 1;
    this.touchTicketActivity(channel);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22c55e)
          .setDescription(`🤝  **${member.displayName}** hat dieses Ticket übernommen und bearbeitet es jetzt.`)
          .setTimestamp()
      ]
    });

    return { ok: true, message: `✅  Ticket **#${String(meta.ticketNum || 0).padStart(4, "0")}** übernommen.` };
  }

  async unclaimTicket(channel, member) {
    const meta = parseTopic(channel.topic);
    if (!meta) return { ok: false, message: "Ticket-Metadaten konnten nicht gelesen werden." };
    if (!meta.claimedBy) return { ok: false, message: "Dieses Ticket ist aktuell nicht geclaimt." };
    if (meta.claimedBy !== member.id && !this.isStaffMember(member)) return { ok: false, message: "Nur der Claimer oder Staff darf unclaimen." };

    meta.claimedBy = null;
    await this.updateChannelTopic(channel, meta);
    await this._updateWelcomeEmbed(channel, meta);
    this.touchTicketActivity(channel);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setDescription("↩️  Ticket wurde freigegeben — wartet erneut auf Staff.")
          .setTimestamp()
      ]
    });

    return { ok: true, message: "↩️  Ticket wurde freigegeben." };
  }

  async setPriority(channel, priority, member) {
    const meta = parseTopic(channel.topic);
    if (!meta) return { ok: false, message: "Ticket-Metadaten konnten nicht gelesen werden." };

    meta.priority = priority;
    await this.updateChannelTopic(channel, meta);
    await this._updateWelcomeEmbed(channel, meta);

    const prioInfo = this.getPriorityInfo(priority);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6366f1)
          .setDescription(`${prioInfo.emoji}  **${member.displayName}** hat die Priorität auf **${prioInfo.label}** gesetzt.`)
          .setTimestamp()
      ]
    });

    return { ok: true, message: `${prioInfo.emoji}  Priorität auf **${prioInfo.label}** gesetzt.` };
  }

  recordRating(stars) {
    if (stars < 1 || stars > 5) return;
    this.stats.ratingSum += stars;
    this.stats.ratingCount += 1;
  }

  touchTicketActivity(channel) {
    if (!this.isTicketChannel(channel)) {
      return;
    }

    const existingTimer = this.inactivityTimers.get(channel.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timeoutMs = Math.max(this.config.inactivityMinutes, 1) * 60 * 1000;
    const timer = setTimeout(async () => {
      this.inactivityTimers.delete(channel.id);

      if (!channel.guild.channels.cache.has(channel.id)) {
        return;
      }

      if (!this.isTicketChannel(channel)) {
        return;
      }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setDescription("⏰  **Keine Aktivität erkannt.** Dieses Ticket wird in Kürze automatisch geschlossen.")
            .setTimestamp()
        ]
      }).catch(() => null);
      this.stats.autoClosed += 1;
      await this.closeTicket(channel, "Auto-Close (Inaktivität)");
    }, timeoutMs);

    this.inactivityTimers.set(channel.id, timer);
  }

  initializeGuildInactivity(guild) {
    guild.channels.cache.forEach((channel) => {
      if (this.isTicketChannel(channel)) {
        this.touchTicketActivity(channel);
      }
    });
  }

  async closeTicket(channel, closedByUserTag) {
    const timer = this.inactivityTimers.get(channel.id);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(channel.id);
    }

    const settings = this.resolveGuildConfig(channel.guild.id);
    const logChannel = channel.guild.channels.cache.get(settings.supportLogChannelId);
    const meta = parseTopic(channel.topic);
    const openDurationMs = meta ? (Date.now() - meta.createdAt) : 0;

    let messageCount = 0;
    try {
      const msgs = await channel.messages.fetch({ limit: 100 });
      messageCount = msgs.size;
    } catch { /* ignore */ }

    const transcript = await createTranscript(channel, {
      filename: `ticket-${meta?.ticketNum ? String(meta.ticketNum).padStart(4, "0") : channel.name}.html`,
      saveImages: true,
      poweredBy: false
    });

    if (logChannel && logChannel.isTextBased() && meta) {
      const logEmbed = this.buildLogEmbed(channel, meta, closedByUserTag, messageCount, openDurationMs);
      await logChannel.send({ embeds: [logEmbed], files: [transcript] });
    } else if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({
        content: `🔒  Ticket \`${channel.name}\` geschlossen von ${closedByUserTag}`,
        files: [transcript]
      });
    }

    // Send rating DM to ticket owner
    if (meta?.ownerId) {
      const owner = await channel.guild.members.fetch(meta.ownerId).catch(() => null);
      if (owner) {
        const typeInfo = TICKET_TYPES[meta.type] || { label: meta.type, emoji: "🎫" };
        const guildIcon = channel.guild.iconURL({ dynamic: true }) ?? undefined;
        owner.user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(this.config.brandColor)
              .setAuthor({ name: this.config.brandName, iconURL: guildIcon })
              .setTitle("⭐  Wie war dein Support-Erlebnis?")
              .setDescription(
                `Dein Ticket **#${String(meta.ticketNum || 0).padStart(4, "0")}** (${typeInfo.emoji} ${typeInfo.label}) wurde geschlossen.\n\n` +
                "Wähle eine **Bewertung** von 1–5 Sternen.\n" +
                "Dein Feedback hilft uns, unseren Support stetig zu verbessern! 💙"
              )
              .setFooter({ text: `${this.config.brandName} • Support Rating` })
              .setTimestamp()
          ],
          components: [this.buildRatingComponents(meta.ticketNum || 0)]
        }).catch(() => null);
      }
    }

    this.stats.closed += 1;
    await channel.delete(`Ticket geschlossen von ${closedByUserTag}`);
  }

  isTicketChannel(channel) {
    if (!channel || !channel.topic) {
      return false;
    }

    const meta = parseTopic(channel.topic);
    if (!meta || !meta.ownerId || !meta.type) {
      return false;
    }

    // If guild config is available, verify the channel is in a configured category
    const settings = this.resolveGuildConfig(channel.guild.id);
    const categoryIds = new Set(Object.values(settings.categoryByType).filter(Boolean));

    // If no categories are configured (e.g. after Railway redeploy), trust the topic format alone
    if (categoryIds.size === 0) {
      return true;
    }

    return categoryIds.has(channel.parentId);
  }
}

module.exports = { TicketService, TICKET_TYPES, PRIORITY, parseTopic, msToHumanDuration };
