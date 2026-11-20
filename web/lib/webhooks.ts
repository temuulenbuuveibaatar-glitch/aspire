// Allow-list for channel webhook URLs people paste into Connections.
// The server only ever posts to URLs that pass this check (no SSRF to other hosts).

export type WebhookKind = "discord" | "slack";

const PATTERNS: Record<WebhookKind, RegExp> = {
  discord: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/,
  slack: /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/,
};

export function isAllowedWebhook(kind: WebhookKind, url: string): boolean {
  if (typeof url !== "string" || url.length > 300) return false;
  const pattern = PATTERNS[kind];
  return Boolean(pattern) && pattern.test(url);
}
