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
  billing: { label: "Billing", id: "ticket_open_billing", color: 0x0f766e },
  tech: { label: "Tech", id: "ticket_open_tech", color: 0x1d4ed8 },
  report: { label: "Report", id: "ticket_open_report", color: 0xb91c1c }
};

function formatTopic(meta) {
  return `ticket|owner=${meta.ownerId}|type=${meta.type}|claimed=${meta.claimedBy || "none"}|created=${meta.createdAt || Date.now()}`;
}

function parseTopic(topic) {
  if (!topic || !topic.startsWith("ticket|")) {
    return null;
  }

  const map = new Map();
  const parts = topic.split("|").slice(1);
  for (const part of parts) {
    const [key, value] = part.split("=");
    map.set(key, value);
  }

  const ownerId = map.get("owner");
  const type = map.get("type");
  const claimedRaw = map.get("claimed");

  if (!ownerId || !type) {
    return null;
  }

  return {
    ownerId,
    type,
    claimedBy: claimedRaw && claimedRaw !== "none" ? claimedRaw : null,
    createdAt: Number(map.get("created") || Date.now())
  };
}

class TicketService {
  constructor(config) {
    this.config = config;
    this.inactivityTimers = new Map();
    this.stats = {
      opened: 0,
      closed: 0,
      claimed: 0,
      autoClosed: 0,
      bootedAt: Date.now()
    };
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

  getCategoryIdByType(type) {
    return this.config.categoryByType[type] || null;
  }

  getTypeInfo(type) {
    return TICKET_TYPES[type] || null;
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

    return {
      openByType,
      openTotal: openByType.billing + openByType.tech + openByType.report,
      openedSinceBoot: this.stats.opened,
      closedSinceBoot: this.stats.closed,
      claimedSinceBoot: this.stats.claimed,
      autoClosedSinceBoot: this.stats.autoClosed
    };
  }

  isStaffMember(member) {
    return Boolean(member && member.roles && member.roles.cache.has(this.config.staffRoleId));
  }

  buildOpenButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.billing.id)
        .setLabel("Billing")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.tech.id)
        .setLabel("Tech")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(TICKET_TYPES.report.id)
        .setLabel("Report")
        .setStyle(ButtonStyle.Danger)
    );
  }

  buildSupportPanelEmbed(guild) {
    const stats = this.getStats(guild);

    return new EmbedBuilder()
      .setColor(this.config.brandColor)
      .setTitle(`${this.config.brandName} | Support Desk`)
      .setDescription(
        "Waehle den passenden Ticket-Typ.\n" +
        "Bitte beschreibe dein Anliegen im Ticket konkret, damit wir schneller helfen koennen."
      )
      .addFields(
        { name: "Open Tickets", value: String(stats.openTotal), inline: true },
        { name: "Billing", value: String(stats.openByType.billing), inline: true },
        { name: "Tech", value: String(stats.openByType.tech), inline: true },
        { name: "Report", value: String(stats.openByType.report), inline: true },
        { name: "Claimed seit Start", value: String(stats.claimedSinceBoot), inline: true },
        { name: "Auto-Close seit Start", value: String(stats.autoClosedSinceBoot), inline: true }
      )
      .setFooter({ text: `${this.config.brandName} | Ticket Automation` })
      .setTimestamp();
  }

  buildSupportPanelComponents() {
    const typeButtons = this.buildOpenButtons();
    const utilityButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support_refresh_stats")
        .setLabel("Stats aktualisieren")
        .setStyle(ButtonStyle.Success)
    );

    return [typeButtons, utilityButtons];
  }

  buildTicketActionButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ticket_unclaim")
        .setLabel("Unclaim")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );
  }

  async createTicket(interaction, type) {
    const guild = interaction.guild;
    const user = interaction.user;
    const typeInfo = this.getTypeInfo(type);
    const categoryId = this.getCategoryIdByType(type);

    if (!typeInfo || !categoryId) {
      return {
        ok: false,
        message: "Dieser Ticket-Typ ist nicht konfiguriert."
      };
    }

    const existing = this.getTicketChannelByUser(guild, user.id);
    if (existing) {
      return {
        ok: false,
        message: `Du hast bereits ein offenes Ticket: ${existing}`
      };
    }

    const safeUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user";
    const channelName = `${type}-${safeUsername}-${user.id.slice(-4)}`;
    const topic = formatTopic({
      ownerId: user.id,
      type,
      claimedBy: null,
      createdAt: Date.now()
    });

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: this.config.staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ]
    });

    const embed = new EmbedBuilder()
      .setColor(typeInfo.color)
      .setTitle(`${this.config.brandName} | ${typeInfo.label} Ticket`)
      .setDescription(
        `Hallo ${user}, danke fuer deine Anfrage.\n\n` +
        "Ein Teammitglied kann dieses Ticket claimen und wird sich schnellstmoeglich kuemmern."
      )
      .addFields(
        { name: "Typ", value: typeInfo.label, inline: true },
        { name: "Status", value: "Open", inline: true },
        { name: "Claim", value: "Noch nicht geclaimt", inline: true }
      )
      .setTimestamp();

    await channel.send({
      content: `${user} <@&${this.config.staffRoleId}>`,
      embeds: [embed],
      components: [this.buildTicketActionButtons()]
    });

    this.stats.opened += 1;
    this.touchTicketActivity(channel);

    return { ok: true, channel };
  }

  async updateChannelTopic(channel, meta) {
    await channel.setTopic(formatTopic(meta), "Ticket Metadaten aktualisiert");
  }

  async claimTicket(channel, member) {
    const meta = parseTopic(channel.topic);
    if (!meta) {
      return { ok: false, message: "Ticket-Metadaten konnten nicht gelesen werden." };
    }

    if (meta.claimedBy && meta.claimedBy !== member.id) {
      return { ok: false, message: `Bereits geclaimt von <@${meta.claimedBy}>.` };
    }

    if (meta.claimedBy === member.id) {
      return { ok: false, message: "Du hast dieses Ticket bereits geclaimt." };
    }

    meta.claimedBy = member.id;
    await this.updateChannelTopic(channel, meta);
    this.stats.claimed += 1;
    this.touchTicketActivity(channel);

    return { ok: true, message: `Ticket wurde von ${member} geclaimt.` };
  }

  async unclaimTicket(channel, member) {
    const meta = parseTopic(channel.topic);
    if (!meta) {
      return { ok: false, message: "Ticket-Metadaten konnten nicht gelesen werden." };
    }

    if (!meta.claimedBy) {
      return { ok: false, message: "Dieses Ticket ist aktuell nicht geclaimt." };
    }

    if (meta.claimedBy !== member.id && !this.isStaffMember(member)) {
      return { ok: false, message: "Nur der Claimer oder Staff darf unclaimen." };
    }

    meta.claimedBy = null;
    await this.updateChannelTopic(channel, meta);
    this.touchTicketActivity(channel);

    return { ok: true, message: "Ticket wurde wieder freigegeben." };
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

      await channel.send("Keine Aktivitaet erkannt. Ticket wird automatisch geschlossen.").catch(() => null);
      this.stats.autoClosed += 1;
      await this.closeTicket(channel, "AutoClose (Inaktivitaet)");
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

    const logChannel = channel.guild.channels.cache.get(this.config.supportLogChannelId);
    const meta = parseTopic(channel.topic);
    const type = meta ? meta.type : "unknown";
    const ownerId = meta ? meta.ownerId : "unknown";
    const claimedBy = meta && meta.claimedBy ? `<@${meta.claimedBy}>` : "none";

    const transcript = await createTranscript(channel, {
      filename: `${channel.name}.html`,
      saveImages: true,
      poweredBy: false
    });

    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({
        content: `Ticket geschlossen: ${channel.name} | Typ: ${type} | Owner: <@${ownerId}> | Claim: ${claimedBy} | Von: ${closedByUserTag}`,
        files: [transcript]
      });
    }

    this.stats.closed += 1;
    await channel.delete(`Ticket geschlossen von ${closedByUserTag}`);
  }

  isTicketChannel(channel) {
    if (!channel || !channel.topic) {
      return false;
    }

    const categoryIds = new Set(Object.values(this.config.categoryByType));
    const meta = parseTopic(channel.topic);

    return (
      categoryIds.has(channel.parentId) &&
      Boolean(meta && meta.ownerId && meta.type)
    );
  }
}

module.exports = { TicketService };
