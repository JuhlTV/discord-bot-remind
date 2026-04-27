const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Entfernt einen User aus dem Ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User, der entfernt werden soll")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const { ticketService } = context;
    const user = interaction.options.getUser("user", true);

    if (!ticketService.isTicketChannel(interaction.channel)) {
      await interaction.reply({
        content: "Dieser Command funktioniert nur in einem Ticket-Channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await interaction.channel.permissionOverwrites.delete(user.id);
    await interaction.editReply({ content: `${user} wurde aus dem Ticket entfernt.` });
  }
};

