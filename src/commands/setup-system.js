const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags
} = require("discord.js");

async function resolveOrCreateCategory(guild, providedCategory, fallbackName, createMissing) {
  if (providedCategory) {
    return providedCategory;
  }

  if (!createMissing) {
    return null;
  }

  return guild.channels.create({
    name: fallbackName,
    type: ChannelType.GuildCategory,
    reason: "Setup per Slash-Command"
  });
}

async function resolveOrCreateLogChannel(guild, providedChannel, createMissing) {
  if (providedChannel) {
    return providedChannel;
  }

  if (!createMissing) {
    return null;
  }

  return guild.channels.create({
    name: "support-logs",
    type: ChannelType.GuildText,
    reason: "Setup per Slash-Command"
  });
}

async function resolveOrCreateStaffRole(guild, providedRole, createMissing) {
  if (providedRole) {
    return providedRole;
  }

  if (!createMissing) {
    return null;
  }

  return guild.roles.create({
    name: "Support Team",
    mentionable: true,
    reason: "Setup per Slash-Command"
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-system")
    .setDescription("Kompletter Support-Setup: Rollen, Kategorien, Logs, Panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((option) =>
      option
        .setName("staff_role")
        .setDescription("Support-Team Rolle")
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("billing_category")
        .setDescription("Kategorie fuer Billing-Tickets")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("tech_category")
        .setDescription("Kategorie fuer Tech-Tickets")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("report_category")
        .setDescription("Kategorie fuer Report-Tickets")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("Channel fuer Ticket-Transcripts")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("panel_channel")
        .setDescription("Channel, in dem das Support-Panel gepostet wird")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("create_missing")
        .setDescription("Fehlende Ressourcen automatisch erstellen")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("post_panel")
        .setDescription("Support-Panel direkt posten")
        .setRequired(false)
    ),

  async execute(interaction, context) {
    const { ticketService } = context;
    const guild = interaction.guild;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const createMissing = interaction.options.getBoolean("create_missing") ?? true;
    const postPanel = interaction.options.getBoolean("post_panel") ?? true;

    const staffRole = await resolveOrCreateStaffRole(
      guild,
      interaction.options.getRole("staff_role"),
      createMissing
    );

    const billingCategory = await resolveOrCreateCategory(
      guild,
      interaction.options.getChannel("billing_category"),
      "tickets-billing",
      createMissing
    );

    const techCategory = await resolveOrCreateCategory(
      guild,
      interaction.options.getChannel("tech_category"),
      "tickets-tech",
      createMissing
    );

    const reportCategory = await resolveOrCreateCategory(
      guild,
      interaction.options.getChannel("report_category"),
      "tickets-report",
      createMissing
    );

    const logChannel = await resolveOrCreateLogChannel(
      guild,
      interaction.options.getChannel("log_channel"),
      createMissing
    );

    const missing = [];
    if (!staffRole) missing.push("staff_role");
    if (!billingCategory) missing.push("billing_category");
    if (!techCategory) missing.push("tech_category");
    if (!reportCategory) missing.push("report_category");
    if (!logChannel) missing.push("log_channel");

    if (missing.length > 0) {
      await interaction.editReply({
        content: `Setup unvollstaendig. Fehlend: ${missing.join(", ")}. Nutze die Optionen oder setze create_missing=true.`
      });
      return;
    }

    ticketService.setGuildConfig(guild.id, {
      staffRoleId: staffRole.id,
      supportLogChannelId: logChannel.id,
      categoryByType: {
        billing: billingCategory.id,
        tech: techCategory.id,
        report: reportCategory.id
      }
    });

    if (postPanel) {
      const panelChannel = interaction.options.getChannel("panel_channel") || interaction.channel;
      const panelEmbed = ticketService.buildSupportPanelEmbed(guild);
      const panelComponents = ticketService.buildSupportPanelComponents();
      await panelChannel.send({ embeds: [panelEmbed], components: panelComponents });
    }

    await interaction.editReply({
      content:
        "Setup abgeschlossen.\n" +
        `Staff Rolle: <@&${staffRole.id}>\n` +
        `Billing Kategorie: <#${billingCategory.id}>\n` +
        `Tech Kategorie: <#${techCategory.id}>\n` +
        `Report Kategorie: <#${reportCategory.id}>\n` +
        `Log Channel: <#${logChannel.id}>`
    });
  }
};

