const { MessageFlags, EmbedBuilder } = require("discord.js");
const { error } = require("../utils/logger");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, context) {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({ content: "Unbekannter Command.", flags: MessageFlags.Ephemeral });
          return;
        }
        await command.execute(interaction, context);
        return;
      }

      // Button interactions
      if (interaction.isButton()) {
        const { ticketService } = context;
        const { customId } = interaction;

        // Open ticket
        if (customId === "ticket_open_billing" || customId === "ticket_open_tech" || customId === "ticket_open_report") {
          const type = customId.replace("ticket_open_", "");
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.createTicket(interaction, type);
          if (!result.ok) { await interaction.editReply({ content: result.message }); return; }
          await interaction.editReply({ content: `🎫  Ticket **#${String(result.ticketNum).padStart(4, "0")}** erstellt: ${result.channel}` });
          return;
        }

        // Claim
        if (customId === "ticket_claim") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({ content: "Dieser Button funktioniert nur in Ticket-Channels.", flags: MessageFlags.Ephemeral });
            return;
          }
          if (!ticketService.isStaffMember(interaction.member)) {
            await interaction.reply({ content: "🚫  Nur das Support-Team darf Tickets claimen.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.claimTicket(interaction.channel, interaction.member);
          await interaction.editReply({ content: result.message });
          return;
        }

        // Unclaim
        if (customId === "ticket_unclaim") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({ content: "Dieser Button funktioniert nur in Ticket-Channels.", flags: MessageFlags.Ephemeral });
            return;
          }
          if (!ticketService.isStaffMember(interaction.member)) {
            await interaction.reply({ content: "🚫  Nur das Support-Team darf Tickets unclaimen.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.unclaimTicket(interaction.channel, interaction.member);
          await interaction.editReply({ content: result.message });
          return;
        }

        // Priority
        if (customId === "ticket_priority_low" || customId === "ticket_priority_medium" || customId === "ticket_priority_high") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({ content: "Dieser Button funktioniert nur in Ticket-Channels.", flags: MessageFlags.Ephemeral });
            return;
          }
          if (!ticketService.isStaffMember(interaction.member)) {
            await interaction.reply({ content: "🚫  Nur das Support-Team darf die Priorität ändern.", flags: MessageFlags.Ephemeral });
            return;
          }
          const priority = customId.replace("ticket_priority_", "");
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.setPriority(interaction.channel, priority, interaction.member);
          await interaction.editReply({ content: result.message });
          return;
        }

        // Close
        if (customId === "ticket_close") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({ content: "Dieser Button funktioniert nur in Ticket-Channels.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await ticketService.closeTicket(interaction.channel, interaction.user.tag);
          return;
        }

        // Refresh stats
        if (customId === "support_refresh_stats") {
          const panelEmbed = ticketService.buildSupportPanelEmbed(interaction.guild);
          const panelComponents = ticketService.buildSupportPanelComponents();
          await interaction.update({ embeds: [panelEmbed], components: panelComponents });
          return;
        }

        // Rating
        if (customId.startsWith("ticket_rate_")) {
          const parts = customId.split("_");
          const stars = Number(parts[2]);
          if (isNaN(stars) || stars < 1 || stars > 5) return;
          ticketService.recordRating(stars);
          const starDisplay = "⭐".repeat(stars) + "✩".repeat(5 - stars);
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle("✅  Danke für dein Feedback!")
                .setDescription(`Du hast **${stars}/5** Sterne gegeben.\n**${starDisplay}**\n\nDein Feedback hilft uns, unseren Support stetig zu verbessern.`)
                .setFooter({ text: ticketService.config.brandName })
                .setTimestamp()
            ],
            components: []
          });
          return;
        }
      }
    } catch (err) {
      if (err.code === 40060) return;
      error("Fehler bei interactionCreate", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "⚠️  Es ist ein Fehler aufgetreten.", flags: MessageFlags.Ephemeral }).catch(() => null);
      } else {
        await interaction.reply({ content: "⚠️  Es ist ein Fehler aufgetreten.", flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  }
};
