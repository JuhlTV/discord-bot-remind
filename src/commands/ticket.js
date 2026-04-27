const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const { parseTopic, msToHumanDuration } = require("../tickets/ticketService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket-Verwaltung fuer Staff")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Zeigt alle offenen Tickets auf diesem Server")
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Zeigt Informationen ueber das aktuelle Ticket")
    ),

  async execute(interaction, context) {
    const { ticketService } = context;
    const subcommand = interaction.options.getSubcommand();

    if (!ticketService.isStaffMember(interaction.member)) {
      await interaction.reply({
        content: "🚫  Dieser Command ist nur fuer das Support-Team.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // ── /ticket list ──────────────────────────────────────────────────────────
    if (subcommand === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const allTickets = ticketService.getAllTicketChannels(interaction.guild);

      if (allTickets.size === 0) {
        await interaction.editReply({ content: "🎉  Keine offenen Tickets." });
        return;
      }

      const lines = [];
      for (const [, channel] of allTickets) {
        const meta = parseTopic(channel.topic);
        if (!meta) continue;
        const typeInfo = ticketService.getTypeInfo(meta.type);
        const prioInfo = ticketService.getPriorityInfo(meta.priority || "medium");
        const claimStatus = meta.claimedBy ? `🤝 <@${meta.claimedBy}>` : "⏳ Unclaimed";
        const openFor = msToHumanDuration(Date.now() - meta.createdAt);
        lines.push(
          `${typeInfo?.emoji || "🎫"}  **#${String(meta.ticketNum || 0).padStart(4, "0")}** ${channel} — <@${meta.ownerId}> | ${prioInfo.emoji} ${prioInfo.label} | ${claimStatus} | ⏱️ ${openFor}`
        );
      }

      const guildIcon = interaction.guild.iconURL({ dynamic: true }) ?? undefined;
      const embed = new EmbedBuilder()
        .setColor(ticketService.config.brandColor)
        .setAuthor({ name: ticketService.config.brandName, iconURL: guildIcon })
        .setTitle(`🎫  Offene Tickets (${allTickets.size})`)
        .setDescription(lines.join("\n") || "—")
        .setFooter({ text: `${ticketService.config.brandName} • Ticket System` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /ticket info ──────────────────────────────────────────────────────────
    if (subcommand === "info") {
      if (!ticketService.isTicketChannel(interaction.channel)) {
        await interaction.reply({
          content: "Dieser Command funktioniert nur in Ticket-Channels.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const meta = parseTopic(interaction.channel.topic);
      if (!meta) {
        await interaction.reply({
          content: "⚠️  Konnte Ticket-Daten nicht lesen.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const typeInfo = ticketService.getTypeInfo(meta.type);
      const prioInfo = ticketService.getPriorityInfo(meta.priority || "medium");
      const openDuration = msToHumanDuration(Date.now() - meta.createdAt);
      const openSince = new Date(meta.createdAt);
      const guildIcon = interaction.guild.iconURL({ dynamic: true }) ?? undefined;

      const embed = new EmbedBuilder()
        .setColor(typeInfo?.color || ticketService.config.brandColor)
        .setAuthor({ name: `${ticketService.config.brandName} • Ticket Info`, iconURL: guildIcon })
        .setTitle(`${typeInfo?.emoji || "🎫"}  Ticket #${String(meta.ticketNum || 0).padStart(4, "0")}`)
        .addFields(
          { name: "📁  Typ",          value: `${typeInfo?.emoji || "🎫"} ${typeInfo?.label || meta.type}`, inline: true },
          { name: "⚡  Priorität",    value: `${prioInfo.emoji} ${prioInfo.label}`,                        inline: true },
          { name: "📌  Status",       value: meta.claimedBy ? "🟡 In Bearbeitung" : "🟢 Wartet auf Staff", inline: true },
          { name: "👤  Owner",        value: `<@${meta.ownerId}>`,                                        inline: true },
          { name: "🤝  Geclaimt von", value: meta.claimedBy ? `<@${meta.claimedBy}>` : "—",              inline: true },
          { name: "⏱️  Offen seit",   value: `${openDuration} (<t:${Math.floor(meta.createdAt / 1000)}:R>)`, inline: true }
        )
        .setFooter({ text: `${ticketService.config.brandName} • Ticket System` })
        .setTimestamp(openSince);

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
  }
};
