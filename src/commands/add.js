const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Fuegt einen User zum Ticket hinzu")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User, der hinzugefuegt werden soll")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const { ticketService } = context;
    const user = interaction.options.getUser("user", true);

    if (!ticketService.isTicketChannel(interaction.channel)) {
      await interaction.reply({
        content: "Dieser Command funktioniert nur in einem Ticket-Channel.",
        ephemeral: true
      });
      return;
    }

    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    await interaction.reply({ content: `${user} wurde zum Ticket hinzugefuegt.` });
  }
};
