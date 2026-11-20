// Links that hand an action to the person's own apps (dialer, SMS, mail, Telegram, Calendar).
// Nothing here sends anything: the person opens the link and confirms in that app.

const enc = encodeURIComponent;

/** Keep only digits and a leading "+". */
export function phoneDigits(n: string): string {
  const trimmed = n.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

export function telUrl(number: string): string {
  return `tel:${phoneDigits(number)}`;
}

export function smsUrl(number: string, body: string): string {
  return `sms:${phoneDigits(number)}?body=${enc(body)}`;
}

/** Gmail's web compose window with the fields filled in. */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`;
}

/** Fallback for any mail app. */
export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${enc(to).replace(/%40/g, "@")}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** Telegram's "share to a chat" picker, so the person can send to any friend. */
export function telegramShareUrl(text: string): string {
  return `https://t.me/share/url?url=&text=${enc(text)}`;
}

/** "2026-11-21T01:30:00.000Z" -> "20261121T013000Z" (Google Calendar's UTC format). */
function calendarStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

export function googleCalendarUrl(title: string, startIso: string, endIso: string, details: string): string {
  const dates = `${calendarStamp(startIso)}/${calendarStamp(endIso)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(title)}&dates=${enc(dates)}&details=${enc(details)}`;
}
