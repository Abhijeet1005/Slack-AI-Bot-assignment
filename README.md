# Slack AI Channel Manager Bot (Node.js + n8n)

An AI-powered Slack bot that reads channel messages, sends them to an LLM via **n8n**, and replies with a concise answer while **mentioning the right teammate** using real Slack user IDs.

> **Stack**: Node.js (ES Modules) + Slack Bolt SDK + n8n (Webhook, Google Sheets, Code, AI Agent) + Axios

---

## ✨ Features

* Listens to public channel messages (and/or app mentions).
* Sends the text to an n8n workflow that orchestrates the LLM.
* Dynamically fetches **role → Slack ID** mapping from **Google Sheets**.
* LLM returns a short response + the correct **<@USERID>** mention.
* Bot posts the final reply in the same channel/thread.

---

## 🧭 Architecture

```
Slack Workspace
   │
   ▼
Node.js Bot (Bolt SDK, ESM)
   - app.message() listener
   - POST to n8n webhook
   - Post reply back to Slack
   │
   ▼
n8n Workflow
   1) Webhook (from bot)
   2) Google Sheets: Read role→SlackID
   3) Code: format mapping → multiline string
   4) (Optional) Merge with Webhook item
   5) AI Agent: system prompt + dynamic mapping
   6) Return JSON { answer, tag }
```

---

## 📦 Prerequisites

* Node.js 18+
* A Slack workspace where you can install custom apps
* n8n (self-hosted or desktop) reachable by the bot
* Google Sheet with columns: `Role`, `SlackID` (use **<@USERID>** format, *not* @username)

Example sheet:

```
Role                 | SlackID
-------------------- | -----------------
Frontend Developer   | <@U09BEUF110W>
Backend Developer    | <@U09BD0FFL3C>
```

---

## 🔧 Slack App Setup

1. Go to **[https://api.slack.com/apps](https://api.slack.com/apps)** → **Create New App (from scratch)**.
2. **App Home → Bot User**: enable bot user, set display name & icon.
3. **OAuth & Permissions → Scopes (Bot Token Scopes)** add at least:

   * `app_mentions:read`
   * `channels:history`
   * `chat:write`
   * (optional) `groups:history`, `im:history` if needed
4. **Event Subscriptions**: Enable → set Request URL to your bot’s public URL (ngrok during dev) + `/slack/events`.

   * Subscribe to events:

     * `message.channels`
     * `app_mention` (optional)
5. **Install App** → copy **Bot User OAuth Token** (`xoxb-…`).
6. **Basic Information** → copy **Signing Secret**.

> **Tip**: Instead of Events API + public URL, you can enable **Socket Mode** (then add `app_token` with scope `connections:write`).

---

## 🗂 Project Structure

```
.
├─ package.json          // { "type": "module" }
├─ .env                  // secrets
├─ index.js              // Bolt app (ESM)
└─ README.md
```

---

## 🔐 Environment Variables (`.env`)

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
PORT=3000
N8N_WEBHOOK_URL=https://your-n8n-host/webhook/slack-ai
```

---

## 🧩 Bot Code (ES Modules)

```js
// index.js
import 'dotenv/config';
import { App } from '@slack/bolt';
import axios from 'axios';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Listen to all channel messages (filter out bots/system)
app.message(async ({ message, say }) => {
  if (message.subtype) return;

  try {
    const { data } = await axios.post(process.env.N8N_WEBHOOK_URL, {
      text: message.text,
      user: message.user,
      channel: message.channel,
      ts: message.ts,
    });

    const answer = data?.answer ?? "Thanks for letting us know!";
    const tag = data?.tag ?? ""; // should be <@USERID>

    await say(`${answer}${tag ? `\n\n${tag}` : ''}`);
  } catch (err) {
    console.error(err);
    await say('⚠️ Sorry, something went wrong talking to the AI.');
  }
});

app.start(process.env.PORT || 3000).then(() => {
  console.log('⚡️ Slack AI Bot is running');
});
```

---

## 🛠 n8n Workflow

Minimal nodes (in order):

1. **Webhook** (POST): receives `{ text, user, channel, ts }`.
2. **Google Sheets → Read**: pull all rows (Role, SlackID).
3. **Code** (Run Once for All Items): format mapping for the prompt

   ```js
   // Combine all rows into a single multiline string: "Role: <@USERID>"
   const rows = items.map(i => i.json);
   const formatted = rows.map(r => `${r.Role}: ${r.SlackID}`).join('\n');
   return [{ json: { employees: formatted } }];
   ```
4. **Merge** (by Position): Input 1 = Webhook, Input 2 = Code → you now have both `text` and `employees` in one item.
5. **AI Agent** (System message uses the dynamic list):

   ```
   You are a Slack channel manager bot. Your job is to:
   1) Read the incoming message, analyze intent, reply concisely.
   2) Mention exactly one relevant teammate using Slack ID format (<@USERID>).

   Employee list (role → Slack ID):
   {{$json.employees}}

   Rules:
   - Frontend (UI/CSS/client-side) → frontend dev.
   - Backend (API/DB/auth/server) → backend dev.
   - Use only IDs in the list; never invent usernames.
   - Output a short helpful message plus the single mention.
   ```
6. **Respond** (Return JSON): `{ "answer": $json.reply, "tag": $json.mention }` (or shape as you prefer).

> If you see *“Paired item data…unavailable”*, either **Merge** before the Agent, or reference sources with `.first()` (e.g., `$('Webhook').first().json`).

---

## ▶️ Run Locally

```bash
npm i
node index.js
# In another terminal
npx ngrok http 3000
```

* Put the ngrok HTTPS URL in **Event Subscriptions → Request URL**.
* Invite the bot to a channel: `/invite @YourBotName`.
* Send a message like: `Login API is failing with 500 error`.

---

## ✅ Mentioning Works Only with <@USERID>

Slack doesn’t tag on plain `@username`. Ensure your Google Sheet stores IDs like `<@U12345678>`. To find a user’s ID: click their profile → **Copy member ID** or use `users.list` API.

---

## 🧪 Test Phrases

* "Website is down" → backend developer
* "Glitches in the sidebar" → frontend developer
* "Login API is slow" → backend developer

---

## 🐞 Troubleshooting

* **Shows literal @username instead of mention** → Use `<@USERID>` in mapping.
* **“Paired item data … unavailable” in n8n** → Merge Webhook & Code outputs or use `.first()`.
* **Event URL fails verification** → Ensure your bot is reachable (ngrok) and Bolt is running.
* **`undefined` posted** → Check n8n response shape; guard against missing fields.

---

## 🚀 Deploy

* Host Node bot (Render/Fly/EC2/etc.).
* Expose public HTTPS URL (or use Socket Mode).
* Host n8n where the bot can reach its webhook.
* Store secrets as env vars; rotate Slack tokens if leaked.

---

## 📄 License

MIT – do your thing.
