const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-support")
    .setDescription("Postet das Support-Panel mit Ticket-Button")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const { ticketService } = context;
    const panelEmbed = ticketService.buildSupportPanelEmbed(interaction.guild);
    const panelComponents = ticketService.buildSupportPanelComponents();

    await interaction.channel.send({ embeds: [panelEmbed], components: panelComponents });
    await interaction.reply({ content: "Support-Panel wurde erstellt.", ephemeral: true });
  }
};
