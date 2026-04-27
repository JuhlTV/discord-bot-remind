# Remind Support Bot

Ein Support-Discord-Bot im Stil von Galaxy Bot mit Ticket-System.

## Features

- Vollstaendiger Setup per `/setup-system`
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

2. `.env.example` nach `.env` kopieren und mindestens Token/Client/Guild setzen.

Wichtige Variablen:

- `BRAND_NAME` - Name im Panel/Embeds
- `BRAND_COLOR` - Embed-Farbe als Dezimalwert
- `BILLING_CATEGORY_ID` - Optionaler Fallback ohne `/setup-system`
- `TECH_CATEGORY_ID` - Optionaler Fallback ohne `/setup-system`
- `REPORT_CATEGORY_ID` - Optionaler Fallback ohne `/setup-system`
- `SUPPORT_LOG_CHANNEL_ID` - Optionaler Fallback ohne `/setup-system`
- `STAFF_ROLE_ID` - Optionaler Fallback ohne `/setup-system`
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

- `/setup-system` - Kompletter Setup (Rolle, Kategorien, Logs, Panel)
- `/setup-check` - Vollstaendiger Diagnose-Check fuer Setup + Bot-Rechte
- `/setup-support` - Postet Support-Panel
- `/close` - Schliesst aktuelles Ticket
- `/add user:<user>` - Fuegt User zum Ticket hinzu
- `/remove user:<user>` - Entfernt User aus Ticket
- `/rename name:<name>` - Benennt Ticket um

## Hinweise

- Die Commands werden beim Start automatisch fuer die in `GUILD_ID` gesetzte Test-Guild registriert.
- Fuer den kompletten Setup in Discord: einmal `/setup-system` ausfuehren.
- Claim/Unclaim ist fuer Mitglieder mit `STAFF_ROLE_ID` vorgesehen.
