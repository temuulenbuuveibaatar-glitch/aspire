"use client";

import {
  CalendarPlus,
  Check,
  ExternalLink,
  Hash,
  LoaderCircle,
  Mail,
  MessageSquareText,
  MessagesSquare,
  Phone,
  RotateCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { gmailComposeUrl, mailtoUrl, smsUrl, telegramShareUrl, telUrl } from "@/lib/links";
import type { Channel, ClientAction } from "@/lib/tools/types";
import type { UI } from "@/lib/ui-text";
import { isAllowedWebhook } from "@/lib/webhooks";

type T = (typeof UI)["en"];
type Card = Extract<ClientAction, { type: "message" | "call" | "calendar" }>;

const CHANNEL: Record<Channel, { icon: typeof Send; name: string }> = {
  telegram: { icon: Send, name: "Telegram" },
  discord: { icon: MessagesSquare, name: "Discord" },
  slack: { icon: Hash, name: "Slack" },
  sms: { icon: MessageSquareText, name: "SMS" },
  email: { icon: Mail, name: "Email" },
};

export const isCard = (a: ClientAction): a is Card => a.type === "message" || a.type === "call" || a.type === "calendar";

const shell = "glass rounded-2xl p-4";
const primary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan px-5 font-semibold text-[#03202a] hover:bg-[#62e4ff] disabled:opacity-50";
const secondary =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line px-4 font-medium text-ink hover:bg-white/10";

export function ActionCard({
  action,
  t,
  webhooks,
  onOpenConnections,
}: {
  action: Card;
  t: T;
  webhooks: { discord?: string; slack?: string };
  onOpenConnections: () => void;
}) {
  if (action.type === "call") {
    return (
      <div className={shell}>
        <a href={telUrl(action.number)} className={`${primary} w-full bg-ok text-[#03241a] hover:bg-[#5ee3b3]`}>
          <Phone className="size-5" aria-hidden /> {t.call}: {action.label || action.number}
        </a>
        {!action.known && (
          <p className="mt-2 flex items-center gap-2 text-sm text-amber">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> {t.newNumber}
          </p>
        )}
      </div>
    );
  }
  if (action.type === "calendar") {
    return (
      <div className={shell}>
        <p className="font-medium">{action.title}</p>
        <p className="text-sm text-ink-soft">{new Date(action.start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
        <a href={action.url} target="_blank" rel="noopener noreferrer" className={`${secondary} mt-3 w-full`}>
          <CalendarPlus className="size-5" aria-hidden /> {t.addCalendar}
        </a>
      </div>
    );
  }
  return <MessageCard action={action} t={t} webhooks={webhooks} onOpenConnections={onOpenConnections} />;
}

function MessageCard({
  action,
  t,
  webhooks,
  onOpenConnections,
}: {
  action: Extract<Card, { type: "message" }>;
  t: T;
  webhooks: { discord?: string; slack?: string };
  onOpenConnections: () => void;
}) {
  const [text, setText] = useState(action.text);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const { icon: Icon, name } = CHANNEL[action.channel];

  const webhook = action.channel === "discord" ? webhooks.discord : action.channel === "slack" ? webhooks.slack : undefined;
  const send = async () => {
    if (action.channel !== "discord" && action.channel !== "slack") return;
    setStatus("sending");
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: action.channel, text, target: { webhookUrl: webhook } }),
    }).catch(() => null);
    setStatus(res?.ok ? "sent" : "failed");
  };

  return (
    <div className={shell}>
      <div className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
        <Icon className="size-4" aria-hidden />
        <span className="font-medium text-ink">{name}</span>
        {action.to && (
          <span className="truncate">
            · {t.to}: {action.to}
          </span>
        )}
      </div>
      {action.subject && <p className="mb-1 font-medium">{action.subject}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={status === "sending" || status === "sent"}
        rows={Math.min(6, Math.max(2, Math.ceil(text.length / 40)))}
        aria-label={name}
        className="w-full resize-none rounded-xl border border-line bg-black/20 p-3 text-[16px] leading-6 outline-none focus:border-cyan"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {(action.channel === "discord" || action.channel === "slack") &&
          (webhook && isAllowedWebhook(action.channel, webhook) ? (
            status === "sent" ? (
              <span className="inline-flex min-h-12 items-center gap-2 px-2 font-semibold text-ok" role="status">
                <Check className="size-5" aria-hidden /> {t.sent}
              </span>
            ) : (
              <button onClick={send} disabled={status === "sending" || !text.trim()} className={primary}>
                {status === "sending" ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                ) : status === "failed" ? (
                  <RotateCw className="size-5" aria-hidden />
                ) : (
                  <Send className="size-5" aria-hidden />
                )}
                {status === "sending" ? t.sending : status === "failed" ? t.retry : t.sendNow}
              </button>
            )
          ) : (
            <button onClick={onOpenConnections} className={secondary}>
              {t.connections} → {name}
            </button>
          ))}
        {action.channel === "telegram" && (
          <a href={telegramShareUrl(text)} target="_blank" rel="noopener noreferrer" className={primary}>
            <Send className="size-5" aria-hidden /> {t.shareTelegram}
          </a>
        )}
        {action.channel === "sms" && (
          <a href={smsUrl(action.to, text)} className={primary}>
            <MessageSquareText className="size-5" aria-hidden /> {t.openSms}
          </a>
        )}
        {action.channel === "email" && (
          <>
            <a href={gmailComposeUrl(action.to, action.subject, text)} target="_blank" rel="noopener noreferrer" className={primary}>
              <Mail className="size-5" aria-hidden /> {t.openGmail}
            </a>
            <a href={mailtoUrl(action.to, action.subject, text)} className={secondary}>
              <ExternalLink className="size-4" aria-hidden /> {t.otherMail}
            </a>
          </>
        )}
      </div>
      {status === "failed" && (
        <p className="mt-2 flex items-center gap-2 text-sm text-bad" role="alert">
          <TriangleAlert className="size-4" aria-hidden /> {t.sendFailed}
        </p>
      )}
    </div>
  );
}
