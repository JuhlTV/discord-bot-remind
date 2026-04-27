const { MessageFlags } = require("discord.js");
const { error } = require("../utils/logger");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, context) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({
            content: "Unbekannter Command.",
            ephemeral: true
          });
          return;
        }

        await command.execute(interaction, context);
        return;
      }

      if (interaction.isButton()) {
        const { ticketService } = context;

        if (
          interaction.customId === "ticket_open_billing" ||
          interaction.customId === "ticket_open_tech" ||
          interaction.customId === "ticket_open_report"
        ) {
          const type = interaction.customId.replace("ticket_open_", "");
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.createTicket(interaction, type);

          if (!result.ok) {
            await interaction.editReply({ content: result.message });
            return;
          }

          await interaction.editReply({
            content: `Ticket (${type}) erstellt: ${result.channel}`
          });
          return;
        }

        if (interaction.customId === "ticket_claim") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({
              content: "Dieser Button funktioniert nur in Ticket-Channels.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          if (!ticketService.isStaffMember(interaction.member)) {
            await interaction.reply({
              content: "Nur das Support-Team darf Tickets claimen.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.claimTicket(interaction.channel, interaction.member);
          await interaction.editReply({ content: result.message });
          return;
        }

        if (interaction.customId === "ticket_unclaim") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({
              content: "Dieser Button funktioniert nur in Ticket-Channels.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          if (!ticketService.isStaffMember(interaction.member)) {
            await interaction.reply({
              content: "Nur das Support-Team darf Tickets unclaimen.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await ticketService.unclaimTicket(interaction.channel, interaction.member);
          await interaction.editReply({ content: result.message });
          return;
        }

        if (interaction.customId === "support_refresh_stats") {
          const panelEmbed = ticketService.buildSupportPanelEmbed(interaction.guild);
          const panelComponents = ticketService.buildSupportPanelComponents();

          await interaction.update({
            embeds: [panelEmbed],
            components: panelComponents
          });
          return;
        }

        if (interaction.customId === "ticket_close") {
          if (!ticketService.isTicketChannel(interaction.channel)) {
            await interaction.reply({
              content: "Dieser Button funktioniert nur in Ticket-Channels.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await ticketService.closeTicket(interaction.channel, interaction.user.tag);
          // Channel is deleted by closeTicket — no editReply needed (interaction token remains valid)
          return;
        }
      }
    } catch (err) {
      // Silently ignore double-acknowledgement (can happen with multiple Railway instances)
      if (err.code === 40060) return;

      error("Fehler bei interactionCreate", err);

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "Es ist ein Fehler aufgetreten.",
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: "Es ist ein Fehler aufgetreten.",
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      }
    }
  }
};
