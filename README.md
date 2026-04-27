# NICO Discord Support Bot

Ein Support-Discord-Bot im Stil von Galaxy Bot mit Ticket-System.

## Features

- Ticket-Panel per `/setup-support`
- Ticket-Erstellung per Typ-Button (Billing, Tech, Report)
- Pro User nur ein offenes Ticket
- Ticket-Claim/Unclaim fuer Support-Team
- Ticket schliessen per Button oder `/close`
- Auto-Close nach Inaktivitaet (konfigurierbar)
- Transcript-Export beim Schliessen in einen Log-Channel
- Ticketverwaltung mit `/add`, `/remove`, `/rename`
- Branding + Live-Statistiken im Support-Panel

## Installation

1. Abhaengigkeiten installieren:

```bash
npm install
```

2. `.env.example` nach `.env` kopieren und Werte eintragen.

Wichtige Variablen:

- `BRAND_NAME` - Name im Panel/Embeds
- `BRAND_COLOR` - Embed-Farbe als Dezimalwert
- `BILLING_CATEGORY_ID` - Kategorie fuer Billing-Tickets
- `TECH_CATEGORY_ID` - Kategorie fuer Tech-Tickets
- `REPORT_CATEGORY_ID` - Kategorie fuer Report-Tickets
- `INACTIVITY_MINUTES` - Minuten bis Auto-Close

3. Bot starten:

```bash
npm start
```

## Benoetigte Rechte des Bots

- Manage Channels
- Manage Roles
- Read Message History
- Send Messages
- View Channels

## Slash Commands

- `/setup-support` - Postet Support-Panel
- `/close` - Schliesst aktuelles Ticket
- `/add user:<user>` - Fuegt User zum Ticket hinzu
- `/remove user:<user>` - Entfernt User aus Ticket
- `/rename name:<name>` - Benennt Ticket um

## Hinweise

- Die Commands werden beim Start automatisch fuer die in `GUILD_ID` gesetzte Test-Guild registriert.
- Aendere IDs in `.env`, damit Kategorien, Rollen und Log-Channel stimmen.
- Claim/Unclaim ist fuer Mitglieder mit `STAFF_ROLE_ID` vorgesehen.
