// Slack bot tokens per workspace in `slack_installations`, encrypted with DATA_ENCRYPTION_KEY
// (AES-256-GCM). Server only; tokens are never logged or returned to a browser.
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SlackInstallStore } from "./slack";

const fail = (what: string, error: { code?: string } | null): never => {
  throw new Error(`slack store ${what} failed (${error?.code ?? "unknown"})`);
};

export const supabaseInstallStore: SlackInstallStore = {
  async get(teamId) {
    if (!teamId) return null;
    const { data, error } = await supabaseAdmin().from("slack_installations").select("bot_token_enc").eq("team_id", teamId).maybeSingle();
    if (error) fail("get", error);
    const enc = (data as { bot_token_enc?: string } | null)?.bot_token_enc;
    if (!enc) return null;
    try {
      return decryptSecret(enc);
    } catch {
      // Wrong or rotated key: treat as not installed (reinstalling fixes it).
      console.error("[bot:slack] stored token could not be decrypted");
      return null;
    }
  },
  async put(install) {
    const { error } = await supabaseAdmin()
      .from("slack_installations")
      .upsert(
        {
          team_id: install.teamId,
          bot_user_id: install.botUserId || null,
          bot_token_enc: encryptSecret(install.botToken),
          installed_by: install.installedBy,
          installed_at: new Date().toISOString(),
        },
        { onConflict: "team_id" },
      );
    if (error) fail("put", error);
  },
  async delete(teamId) {
    const { error } = await supabaseAdmin().from("slack_installations").delete().eq("team_id", teamId);
    if (error) fail("delete", error);
  },
};
