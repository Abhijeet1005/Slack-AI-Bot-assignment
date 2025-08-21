import 'dotenv/config';
import slackI from '@slack/bolt';
const {App} = slackI;
import axios from 'axios';

// Initialize Slack App
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

console.log(process.env.SLACK_BOT_TOKEN)
console.log(process.env.SLACK_SIGNING_SECRET)

// Listen for messages in channels
app.message(async ({ message, say }) => {
  console.log(message.text)
  if (message.subtype) return; // ignore bot/system messages

  try {
    // Send message to n8n webhook
    const response = await axios.post(process.env.WORKFLOW_URL, {
      text: message.text,
      user: message.user,
      channel: message.channel,
      employees: {
        "Frontend developer": "<@U09BEUF110W>",
        "Backend developer": "<@U09BD0FFL3C>"
      }
    });

    const { answer, tags } = response.data;

    // Post response in Slack
    await say(`${answer}\n\n${tags?.join(" ") || ""}`);
  } catch (err) {
    console.error("Error:", err.message);
    await say("⚠️ Sorry, something went wrong talking to the AI.");
  }
});

// Start app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Slack AI Bot is running!");
})();
