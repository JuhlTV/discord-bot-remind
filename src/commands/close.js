const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Schliesst das aktuelle Ticket"),

  async execute(interaction, context) {
    const { ticketService } = context;

    if (!ticketService.isTicketChannel(interaction.channel)) {
      await interaction.reply({
        content: "Dieser Command funktioniert nur in einem Ticket-Channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({ content: "Ticket wird geschlossen...", flags: MessageFlags.Ephemeral });
    await ticketService.closeTicket(interaction.channel, interaction.user.tag);
  }
};

