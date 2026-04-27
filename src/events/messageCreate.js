module.exports = {
  name: "messageCreate",
  once: false,
  execute(message, context) {
    const { ticketService } = context;

    if (message.author.bot) {
      return;
    }

    if (!ticketService.isTicketChannel(message.channel)) {
      return;
    }

    ticketService.touchTicketActivity(message.channel);
  }
};
