import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));

beforeEach(() => {
  fake = createFakeSupabase();
  vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const withDb = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
};

describe("Slack install store (slack_installations)", () => {
  it("stores the bot token encrypted and reads it back", async () => {
    const { supabaseInstallStore } = await import("@/lib/bots/slack-store");
    await supabaseInstallStore.put({ teamId: "T1", botUserId: "UB", botToken: "xoxb-secret-1", installedBy: "user_A" });
    const row = fake.table("slack_installations")[0];
    expect(row).toMatchObject({ team_id: "T1", bot_user_id: "UB", installed_by: "user_A" });
    expect(JSON.stringify(row)).not.toContain("xoxb-secret-1");
    expect(String(row.bot_token_enc)).toMatch(/^v1\./);
    expect(await supabaseInstallStore.get("T1")).toBe("xoxb-secret-1");
    expect(await supabaseInstallStore.get("T9")).toBeNull();

    // Reinstall replaces the token; uninstall deletes the row.
    await supabaseInstallStore.put({ teamId: "T1", botUserId: "UB", botToken: "xoxb-secret-2", installedBy: null });
    expect(fake.table("slack_installations")).toHaveLength(1);
    expect(await supabaseInstallStore.get("T1")).toBe("xoxb-secret-2");
    await supabaseInstallStore.delete("T1");
    expect(fake.table("slack_installations")).toEqual([]);
  });

  it("a token encrypted with another key reads as not installed", async () => {
    const { supabaseInstallStore } = await import("@/lib/bots/slack-store");
    await supabaseInstallStore.put({ teamId: "T1", botUserId: "", botToken: "xoxb-x", installedBy: null });
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await supabaseInstallStore.get("T1")).toBeNull();
  });

  it("is the default store when the database is configured, with SLACK_BOT_TOKEN as fallback", async () => {
    withDb();
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-env");
    const { getSlackToken, slackInstallStore, databaseInstallStore } = await import("@/lib/bots/slack");
    expect(slackInstallStore()).toBe(databaseInstallStore);
    await slackInstallStore().put({ teamId: "T1", botUserId: "UB", botToken: "xoxb-db", installedBy: null });
    expect(await getSlackToken("T1")).toBe("xoxb-db");
    expect(await getSlackToken("T-handmade")).toBe("xoxb-env");
  });

  it("without the database the env store is used", async () => {
    const { slackInstallStore, envInstallStore } = await import("@/lib/bots/slack");
    expect(slackInstallStore()).toBe(envInstallStore);
  });
});
