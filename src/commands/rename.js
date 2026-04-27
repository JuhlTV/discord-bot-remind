const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Benennt das Ticket um")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Neuer Ticketname")
        .setRequired(true)
        .setMaxLength(90)
    ),

  async execute(interaction, context) {
    const { ticketService } = context;
    const name = interaction.options.getString("name", true)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90);

    if (!ticketService.isTicketChannel(interaction.channel)) {
      await interaction.reply({
        content: "Dieser Command funktioniert nur in einem Ticket-Channel.",
        ephemeral: true
      });
      return;
    }

    if (!name) {
      await interaction.reply({
        content: "Der Name ist ungueltig. Verwende Buchstaben/Zahlen.",
        ephemeral: true
      });
      return;
    }

    await interaction.channel.setName(name);
    await interaction.reply({ content: `Ticket wurde umbenannt in: **${name}**` });
  }
};
