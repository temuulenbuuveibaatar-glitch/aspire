// Telegram Bot API client (server only). The bot token is part of every URL,
// so URLs and raw errors are never logged or returned.

import { splitText } from "./split";

export { splitText };
export const TELEGRAM_MAX_TEXT = 4096;
const TIMEOUT_MS = 15_000;

export class TelegramError extends Error {}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new TelegramError("TELEGRAM_BOT_TOKEN is not set");
  return t;
}
const apiUrl = (method: string) => `https://api.telegram.org/bot${token()}/${method}`;

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function call<T>(method: string, init: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(method), { redirect: "error", ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {
    throw new TelegramError(`Telegram ${method}: network error`);
  });
  const data = (await res.json().catch(() => null)) as TgResponse<T> | null;
  if (!res.ok || !data?.ok) {
    throw new TelegramError(`Telegram ${method} failed (${res.status}): ${(data?.description ?? "").slice(0, 200)}`);
  }
  return data.result as T;
}

/** Call a Bot API method with a JSON body. */
export function tg<T>(method: string, body: object): Promise<T> {
  return call<T>(method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Send a text message; anything over 4096 characters goes out as several messages. */
export async function sendTelegram(chatId: string, text: string, replyTo?: number): Promise<void> {
  const chunks = splitText(text, TELEGRAM_MAX_TEXT);
  for (const [i, chunk] of chunks.entries()) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: chunk,
      link_preview_options: { is_disabled: true },
      ...(i === 0 && replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    });
  }
}

/** Send OGG/Opus audio as a voice message. */
export async function sendTelegramVoice(chatId: string, ogg: Uint8Array, replyTo?: number): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("voice", new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }), "aspire.ogg");
  if (replyTo) form.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  await call("sendVoice", { method: "POST", body: form });
}

/** Show "typing…" (or another chat action) while the answer is being prepared. Never throws. */
export async function sendChatAction(chatId: string, action: "typing" | "record_voice" = "typing"): Promise<void> {
  await tg("sendChatAction", { chat_id: chatId, action }).catch(() => undefined);
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // Bot API download limit

/** Download a file (e.g. a voice note) by its file_id. */
export async function downloadTelegramFile(fileId: string): Promise<Blob> {
  const file = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new TelegramError("Telegram getFile: no file path");
  if ((file.file_size ?? 0) > MAX_FILE_BYTES) throw new TelegramError("Telegram file too large");
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    throw new TelegramError("Telegram file download: network error");
  });
  if (!res.ok) throw new TelegramError(`Telegram file download failed (${res.status})`);
  const bytes = await res.arrayBuffer();
  const type = /\.(oga|ogg|opus)$/i.test(file.file_path) ? "audio/ogg" : res.headers.get("Content-Type") || "application/octet-stream";
  return new Blob([bytes], { type });
}
