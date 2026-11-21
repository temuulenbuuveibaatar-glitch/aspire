"use client";

// The contents of the HUD's sheets: Menu, Settings, Connections, Memory and the first-open
// "Where are you?" prompt. The shell (Assistant.tsx) owns the state; these only render it.

import { SignOutButton } from "@clerk/nextjs";
import { Brain, Cable, Check, ChevronRight, Download, LocateFixed, LogOut, MapPin, Plus, Repeat, Settings, Sunrise, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { BotLinks } from "@/components/aspire/BotLinks";
import { DesktopLink } from "@/components/aspire/DesktopLink";
import { GmailConnect } from "@/components/aspire/GmailConnect";
import { dropPush, PushToggle } from "@/components/aspire/PushToggle";
import type { DisplayPrefs, TextSize, UnitsPref } from "@/lib/display-prefs";
import { applyActions } from "@/lib/device-store";
import { HTML_LANG, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import { cleanCity } from "@/lib/state";
import type { DeviceContext, Title, VoiceStyle } from "@/lib/tools/types";
import { UI } from "@/lib/ui-text";
import { cn } from "@/lib/utils";
import { isAllowedWebhook } from "@/lib/webhooks";

type T = (typeof UI)["en"];
type Update = (fn: (d: DeviceContext) => DeviceContext) => void;

/** Aspire Desktop releases (the helper the Desktop section pairs). */
export const DESKTOP_DOWNLOAD_URL = "https://github.com/temuulenbuuveibaatar-glitch/aspire/releases";

const setSetting = (update: Update, patch: NonNullable<DeviceContext["settings"]>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

/* ---- first open: where are you? ---- */

/** onAllow resolves false when the browser refused or found no fix: say so here (the shell behind the
 * sheet is inert) and offer the city field straight away. */
export function WherePrompt({ t, onAllow, onCity, onLater }: { t: T; onAllow: () => Promise<boolean>; onCity: (city: string) => void; onLater: () => void }) {
  const [typing, setTyping] = useState(false);
  const [denied, setDenied] = useState(false);
  const allow = () =>
    void onAllow().then((ok) => {
      if (ok) return;
      setDenied(true);
      setTyping(true);
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink">{t.hud.whereWhy}</p>
      {denied && (
        <p role="alert" className="text-body text-signal">
          {t.hud.denied}
        </p>
      )}
      <button type="button" onClick={allow} className="press inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-6 text-body font-semibold text-on-accent">
        <LocateFixed className="size-5" aria-hidden />
        {t.hud.allow}
      </button>
      {typing ? (
        <CityField t={t} value="" onSave={onCity} autoFocus />
      ) : (
        <button type="button" onClick={() => setTyping(true)} className={rowBtn}>
          <MapPin className="size-5 text-accent" aria-hidden />
          {t.hud.setCity}
        </button>
      )}
      <button type="button" onClick={onLater} className="press min-h-12 rounded-full px-5 text-body text-ink-muted underline hover:text-ink">
        {t.hud.notNow}
      </button>
    </div>
  );
}

export function CityField({ t, value, onSave, autoFocus }: { t: T; value: string; onSave: (city: string) => void; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(cleanCity(v));
        setSaved(true);
      }}
    >
      <label htmlFor="aspire-city" className="sr-only">
        {t.hud.myCity}
      </label>
      <input
        id="aspire-city"
        value={v}
        maxLength={80}
        autoComplete="address-level2"
        autoFocus={autoFocus}
        placeholder={t.hud.cityPlaceholder}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        className="min-h-12 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-3 text-body text-ink placeholder:text-ink-faint focus-visible:border-accent"
      />
      <button type="submit" className="press inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md border border-line px-4 text-body font-medium text-ink hover:bg-panel-3">
        {saved && <Check className="size-5 text-success" aria-hidden />}
        {saved ? t.saved : t.save}
      </button>
      <span role="status" className="sr-only">
        {saved ? t.saved : ""}
      </span>
    </form>
  );
}

/* ---- menu ---- */

export function MenuBody({ t, onNewChat, onBriefing, open }: { t: T; onNewChat?: () => void; onBriefing: () => void; open: (s: "memory" | "connections" | "settings") => void }) {
  return (
    <nav aria-label={t.menu} className="flex flex-col gap-2">
      {onNewChat && <MenuRow icon={Plus} label={t.newChat} onClick={onNewChat} />}
      <MenuRow icon={Sunrise} label={t.briefing} onClick={onBriefing} />
      <MenuRow icon={Brain} label={t.memory} onClick={() => open("memory")} />
      <MenuRow icon={Cable} label={t.connections} onClick={() => open("connections")} />
      <MenuRow icon={Settings} label={t.settings} onClick={() => open("settings")} />
    </nav>
  );
}

/* ---- settings ---- */

export function SettingsBody(p: {
  t: T;
  lang: Lang;
  settings: NonNullable<DeviceContext["settings"]>;
  busy: boolean;
  prefs: DisplayPrefs;
  setPrefs: (patch: Partial<DisplayPrefs>) => void;
  update: Update;
  sample: (v: VoiceStyle) => void;
  chooseLang: (l: Lang) => void;
  setShareLocation: (on: boolean) => void;
}) {
  const { t, settings, prefs, setPrefs, update } = p;
  const title: Title = settings.title ?? "mr";
  // Each choice group is named by the heading just above it (aria-labelledby), not a second copy of it.
  const id = useId();
  return (
    <>
      <Section title={t.voice} id={`${id}voice`}>
        <Choices labelledBy={`${id}voice`}>
          {(["jarvis", "friday"] as const).map((v) => (
            <Choice
              key={v}
              pressed={(settings.voice ?? "jarvis") === v}
              disabled={p.busy}
              onClick={() => {
                setSetting(update, { voice: v });
                p.sample(v);
              }}
            >
              {v === "jarvis" ? t.voiceJarvis : t.voiceFriday}
            </Choice>
          ))}
        </Choices>
        <div className="mt-4">
          <Toggle label={t.screenReaderMode} help={t.screenReaderHelp} checked={prefs.screenReader} t={t} onChange={(on) => setPrefs({ screenReader: on })} />
        </div>
      </Section>
      <Section title={t.address} id={`${id}address`}>
        <Choices labelledBy={`${id}address`}>
          {(["mr", "mrs", ""] as Title[]).map((v) => (
            <Choice key={v || "none"} pressed={title === v} onClick={() => setSetting(update, { title: v })}>
              {v === "mr" ? t.addressMr : v === "mrs" ? t.addressMrs : t.addressNone}
            </Choice>
          ))}
        </Choices>
      </Section>
      <Section title={t.location}>
        <Toggle label={t.useLocation} icon={LocateFixed} checked={settings.shareLocation === true} t={t} onChange={p.setShareLocation} />
        <h4 className="mt-4 mb-2 text-body font-medium text-ink">{t.hud.myCity}</h4>
        <CityField t={t} value={settings.city ?? ""} onSave={(city) => setSetting(update, { city: city || undefined })} />
        <p className="mt-1 text-small text-ink-muted">{t.hud.cityHelp}</p>
      </Section>
      <Section title={t.reminders}>
        <PushToggle lang={p.lang} />
      </Section>
      <Section title={t.display}>
        <h4 id={`${id}size`} className="mb-2 text-body font-medium text-ink">
          {t.textSize}
        </h4>
        <Choices labelledBy={`${id}size`}>
          {(
            [
              ["md", t.textNormal],
              ["lg", t.textLarge],
              ["xl", t.textLargest],
            ] as [TextSize, string][]
          ).map(([v, label]) => (
            <Choice key={v} pressed={prefs.textSize === v} onClick={() => setPrefs({ textSize: v })}>
              {label}
            </Choice>
          ))}
        </Choices>
        <div className="mt-4 flex flex-col gap-3">
          <Toggle label={t.skyEffects} help={t.skyEffectsHelp} checked={prefs.skyEffects} t={t} onChange={(on) => setPrefs({ skyEffects: on })} />
          <Toggle label={t.calmMode} help={t.calmHelp} checked={prefs.calm} t={t} onChange={(on) => setPrefs({ calm: on })} />
        </div>
        <h4 id={`${id}units`} className="mt-4 mb-2 text-body font-medium text-ink">
          {t.units}
        </h4>
        <Choices labelledBy={`${id}units`}>
          {(
            [
              ["auto", t.unitsAuto],
              ["metric", t.unitsMetric],
              ["imperial", t.unitsImperial],
            ] as [UnitsPref, string][]
          ).map(([v, label]) => (
            <Choice key={v} pressed={prefs.units === v} onClick={() => setPrefs({ units: v })}>
              {label}
            </Choice>
          ))}
        </Choices>
      </Section>
      <Section title={t.language} id={`${id}language`}>
        <Choices labelledBy={`${id}language`}>
          {LANGS.map((l) => (
            <Choice key={l} pressed={p.lang === l} onClick={() => p.chooseLang(l)}>
              <span lang={HTML_LANG[l]}>{LANG_NAMES[l].native}</span>
            </Choice>
          ))}
        </Choices>
      </Section>
      <DesktopLink lang={p.lang} />
      <p className="mt-3 text-small text-ink-muted">
        <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className={cn(rowBtn, "w-auto px-5")}>
          <Download className="size-5" aria-hidden />
          {t.desktopDownload}
        </a>
        <span className="mt-1 block">{t.desktopDownloadHelp}</span>
      </p>
      <div className="mt-6">
        {/* Clerk awaits the button's onClick (dropPush) before signing out. */}
        <SignOutButton redirectUrl="/login">
          <button type="button" onClick={dropPush} className={cn(rowBtn, "w-auto px-5")}>
            <LogOut className="size-5" aria-hidden />
            {t.signOut}
          </button>
        </SignOutButton>
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-x-2 text-small text-ink-muted">
        <Link href="/privacy" className="inline-flex min-h-12 items-center underline">
          {t.privacy}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="inline-flex min-h-12 items-center underline">
          {t.terms}
        </Link>
      </p>
    </>
  );
}

/* ---- connections ---- */

export function ConnectionsBody({ t, webhooks, update }: { t: T; webhooks: { discord?: string; slack?: string }; update: Update }) {
  const save = (kind: "discord" | "slack") => (v: string) =>
    update((d) => ({ ...d, settings: { ...d.settings, webhooks: { ...d.settings?.webhooks, [kind]: v || undefined } } }));
  return (
    <>
      <p className="text-body text-ink-muted">{t.alwaysOn}</p>
      <WebhookField label={t.discordWebhook} kind="discord" value={webhooks.discord ?? ""} t={t} onSave={save("discord")} />
      <WebhookField label={t.slackWebhook} kind="slack" value={webhooks.slack ?? ""} t={t} onSave={save("slack")} />
      <p className="mt-2 text-small text-ink-muted">{t.webhookHelp}</p>
      <Section title="Google">
        <GmailConnect t={t} />
      </Section>
      <Section title="Telegram · Discord · Slack">
        <BotLinks t={t} />
      </Section>
    </>
  );
}

/* ---- memory ---- */

export function MemoryBody({ t, lang, device, update }: { t: T; lang: Lang; device: DeviceContext; update: Update }) {
  const drop = (a: Parameters<typeof applyActions>[1][number]) => () => update((d) => applyActions(d, [a]));
  return (
    <>
      <Section title={t.memory}>
        <List
          t={t}
          items={Object.entries(device.memory).map(([k, v]) => ({
            key: k,
            name: k,
            body: (
              <>
                <b className="font-semibold">{k}:</b> {v}
              </>
            ),
            remove: drop({ type: "forget", key: k }),
          }))}
        />
      </Section>
      <Section title={t.reminders}>
        <List
          t={t}
          items={device.reminders.map((r) => ({
            key: r.id,
            name: r.text,
            body: (
              <>
                <b className="inline-flex items-center gap-1.5 font-semibold">
                  {new Date(r.at).toLocaleString(HTML_LANG[lang], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  {r.repeatDaily && (
                    <>
                      <Repeat className="size-4 text-ink-muted" aria-hidden />
                      <span className="sr-only">{t.daily}</span>
                    </>
                  )}
                </b>{" "}
                {r.text}
              </>
            ),
            remove: drop({ type: "cancel_reminder", id: r.id }),
          }))}
        />
      </Section>
      <Section title={t.routines}>
        <List
          t={t}
          items={(device.routines ?? []).map((r) => ({
            key: r.id,
            name: r.trigger,
            body: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <b className="font-semibold">“{r.trigger}”</b>
                <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                <span>{r.steps}</span>
              </span>
            ),
            remove: drop({ type: "delete_routine", id: r.id }),
          }))}
        />
      </Section>
      <Section title={t.learning}>
        <List
          t={t}
          items={(device.lessons ?? []).map((l) => ({
            key: l.id,
            body: (
              <>
                <b className="font-semibold">{l.topic}</b>
                {", "}
                {t.lessonLine
                  .replace("{level}", t.lessonLevel[l.level as keyof typeof t.lessonLevel] ?? String(l.level))
                  .replace("{step}", String(l.step))
                  .replace("{score}", String(l.score))}
              </>
            ),
          }))}
        />
      </Section>
    </>
  );
}

/* ---- small building blocks ---- */

const rowBtn = "press panel-2 flex min-h-14 w-full items-center gap-3 rounded-md border border-line px-4 text-left text-body font-medium text-ink hover:bg-panel-3";

function MenuRow({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={rowBtn}>
      <Icon className="size-6 shrink-0 text-accent" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </button>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      {/* tabIndex -1: where focus lands when the last row of a list is removed (shown to keyboard users). */}
      <h3 tabIndex={-1} id={id} className="mb-2 text-label tracking-[0.08em] text-accent uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A group named by its heading, so a screen reader says what the choices are for ("Text size, group"). */
function Choices({ labelledBy, children }: { labelledBy: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
}

function Choice({ pressed, disabled, onClick, children }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  // aria-disabled, not disabled: a natively disabled button would blur to <body>, outside the modal.
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick()}
      className={cn(
        "press inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-body font-medium",
        disabled && "cursor-default opacity-60",
        pressed ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-muted hover:bg-panel-3 hover:text-ink",
      )}
    >
      {pressed && <Check className="size-5 shrink-0 text-accent" aria-hidden />}
      {children}
    </button>
  );
}

/** An on/off switch with the visible word, so colour is never the only cue. */
function Toggle({ label, help, icon: Icon, checked, t, onChange }: { label: string; help?: string; icon?: LucideIcon; checked: boolean; t: T; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn(rowBtn, "py-2")}>
      {Icon && <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{label}</span>
        {help && <span className="text-small font-normal text-ink-muted">{help}</span>}
      </span>
      <span aria-hidden className={cn("shrink-0 text-small", checked ? "text-accent" : "text-ink-muted")}>
        {checked ? t.on : t.off}
      </span>
      <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full border", checked ? "border-accent bg-accent/30" : "border-line-strong bg-panel-3")}>
        <span
          className={cn(
            "absolute top-1/2 left-1 size-5 -translate-y-1/2 rounded-full transition-transform duration-150 still:transition-none",
            checked ? "translate-x-5 bg-accent" : "translate-x-0 bg-ink-muted",
          )}
        />
      </span>
    </button>
  );
}

/** A removed row takes its focused button with it: focus moves to the next row's (else the previous
 * row's) Remove first, or to the section heading when the list empties. */
function focusAfterRemove(button: HTMLElement) {
  const li = button.closest("li");
  const row = li?.nextElementSibling ?? li?.previousElementSibling;
  const target = row?.querySelector<HTMLElement>("button") ?? button.closest("section")?.querySelector<HTMLElement>("h3");
  target?.focus();
}

function List({ items, t }: { items: { key: string; name?: string; body: React.ReactNode; remove?: () => void }[]; t: T }) {
  if (!items.length) return <p className="text-body text-ink-muted">{t.nothingSaved}</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel-2">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 px-4 py-2 text-body">
          <span className="min-w-0 flex-1">{it.body}</span>
          {it.remove && (
            <button
              type="button"
              onClick={(e) => {
                focusAfterRemove(e.currentTarget);
                it.remove?.();
              }}
              aria-label={it.name ? `${t.remove}: ${it.name}` : t.remove}
              title={t.remove}
              className="press grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-3 hover:text-danger"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WebhookField({ label, kind, value, t, onSave }: { label: string; kind: "discord" | "slack"; value: string; t: T; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  const bad = v.trim() !== "" && !isAllowedWebhook(kind, v.trim());
  return (
    <div className="mt-4">
      <label className="mb-1 block text-body font-medium text-ink" htmlFor={`hook-${kind}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`hook-${kind}`}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            setSaved(false);
          }}
          placeholder={kind === "discord" ? "https://discord.com/api/webhooks/..." : "https://hooks.slack.com/services/..."}
          aria-invalid={bad}
          aria-describedby={bad ? `hook-${kind}-error` : undefined}
          className={cn(
            "min-h-12 min-w-0 flex-1 rounded-md border bg-panel-2 px-3 text-body text-ink placeholder:text-ink-faint focus-visible:border-accent",
            bad ? "border-danger" : "border-line",
          )}
        />
        <button
          type="button"
          disabled={bad}
          onClick={() => {
            onSave(v.trim());
            setSaved(true);
          }}
          className="press inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md border border-line px-4 text-body font-medium text-ink hover:bg-panel-3 disabled:opacity-60"
        >
          {saved && <Check className="size-5 text-success" aria-hidden />}
          {saved ? t.saved : t.save}
        </button>
        <span role="status" className="sr-only">
          {saved ? t.saved : ""}
        </span>
      </div>
      {bad && (
        <p id={`hook-${kind}-error`} className="mt-1 text-small text-danger">
          {t.invalidLink}
        </p>
      )}
    </div>
  );
}
