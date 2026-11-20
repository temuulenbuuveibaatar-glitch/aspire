// Points the Telegram bot at this app and sets its command menu.
// Usage (from web/): node scripts/telegram-setup.mjs
// Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_SITE_URL from
// .env.local (or the environment). Prints only "ok" — never the token or secret.
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // No .env.local: use the environment as is.
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const missing = Object.entries({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, NEXT_PUBLIC_SITE_URL: site })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(`${method} failed (${res.status}): ${String(data?.description ?? "").slice(0, 200)}`);
  return data.result;
}

const COMMANDS = {
  en: { start: "Start Aspire", link: "Link your Aspire account: /link <code>", aspire: "Ask Aspire in a group: /aspire <question>" },
  mn: { start: "Аспайрыг эхлүүлэх", link: "Аспайр бүртгэлээ холбох: /link <код>", aspire: "Бүлэгт асуух: /aspire <асуулт>" },
  ru: { start: "Запустить Аспайр", link: "Привязать аккаунт Аспайр: /link <код>", aspire: "Спросить в группе: /aspire <вопрос>" },
  zh: { start: "开始使用 Aspire", link: "关联 Aspire 账户：/link <代码>", aspire: "在群组中提问：/aspire <问题>" },
  de: { start: "Aspire starten", link: "Aspire-Konto verknüpfen: /link <Code>", aspire: "In Gruppen fragen: /aspire <Frage>" },
};
const commandList = (c) => Object.entries(c).map(([command, description]) => ({ command, description }));

try {
  await tg("setWebhook", {
    url: `${site}/api/bots/telegram`,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  await tg("setMyCommands", { commands: commandList(COMMANDS.en) });
  for (const lang of ["mn", "ru", "zh", "de"]) {
    await tg("setMyCommands", { commands: commandList(COMMANDS[lang]), language_code: lang });
  }
  console.log("ok");
} catch (e) {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
}
