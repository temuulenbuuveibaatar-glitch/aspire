import { clerkClient } from "@clerk/nextjs/server";

// Clerk's provider id for Google. The older "oauth_google" form is deprecated in @clerk/backend.
const GOOGLE = "google";

/**
 * A fresh Google OAuth access token for a Clerk user (Clerk refreshes it as needed), or null when
 * the user never connected Google, revoked access, or Clerk is unreachable. Server only.
 */
export async function googleAccessToken(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserOauthAccessToken(userId, GOOGLE);
    return data.find((t) => t.token)?.token ?? null;
  } catch (e) {
    // Never log the token or the raw error body; the name is enough to tell outages apart.
    console.error("googleAccessToken:", e instanceof Error ? e.name : "error");
    return null;
  }
}
