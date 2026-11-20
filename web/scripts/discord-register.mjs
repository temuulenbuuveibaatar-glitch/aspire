// Registers the global /aspire command (ask, link) and prints the bot invite URL.
// Usage (from web/): node scripts/discord-register.mjs
// Reads DISCORD_APP_ID and DISCORD_BOT_TOKEN from .env.local (or the environment).
// Never prints the token.
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // No .env.local: use the environment as is.
}

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const missing = Object.entries({ DISCORD_APP_ID: appId, DISCORD_BOT_TOKEN: token })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const SUB_COMMAND = 1;
const STRING = 3;

// Discord has no Mongolian locale; the others get translated descriptions.
const commands = [
  {
    name: "aspire",
    type: 1,
    description: "Ask Aspire, your AI assistant",
    description_localizations: { ru: "Спросить Аспайр, ИИ-помощника", de: "Aspire fragen, Ihren KI-Assistenten", "zh-CN": "询问 AI 助手 Aspire" },
    integration_types: [0, 1], // guild install, user install
    contexts: [0, 1, 2], // servers, bot DMs, private channels
    options: [
      {
        type: SUB_COMMAND,
        name: "ask",
        description: "Ask a question",
        description_localizations: { ru: "Задать вопрос", de: "Eine Frage stellen", "zh-CN": "提问" },
        options: [
          {
            type: STRING,
            name: "question",
            description: "Your question",
            description_localizations: { ru: "Ваш вопрос", de: "Ihre Frage", "zh-CN": "你的问题" },
            required: true,
            max_length: 2000,
          },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "link",
        description: "Link your Aspire account",
        description_localizations: { ru: "Привязать аккаунт Аспайр", de: "Aspire-Konto verknüpfen", "zh-CN": "关联 Aspire 账户" },
        options: [
          {
            type: STRING,
            name: "code",
            description: "6-digit code from Settings → Connections",
            description_localizations: {
              ru: "6-значный код из Настройки → Подключения",
              de: "6-stelliger Code aus Einstellungen → Verbindungen",
              "zh-CN": "设置 → 连接 中的 6 位代码",
            },
            required: true,
            min_length: 6,
            max_length: 12,
          },
        ],
      },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
  body: JSON.stringify(commands),
});
if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`Register failed (${res.status}): ${body.slice(0, 300)}`);
  process.exit(1);
}

const SEND_MESSAGES = 1 << 11;
console.log("ok");
console.log(`Invite: https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${SEND_MESSAGES}`);
