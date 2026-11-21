// "Do it on my computer" tools: each one queues a job for the person's paired Aspire Desktop
// helper. Nothing happens until the person types "y" in the helper, so the answer is always
// "sent, waiting for you to allow it", never "done".
// Only for a direct, signed-in web request (/api/ask): text that reaches bots (a linked group
// chat) or cron runs (fetched pages, news) is far easier to inject into, so never spread
// desktopTools into the shared TOOLS used by lib/bots or cron. Use desktopToolsFor(ctx) and put
// `userId` and `source: "web"` into the tool context; any other source is refused.
import { type DesktopKind, enqueueDesktopJob, validateDesktopJob } from "@/lib/desktop";
import type { Tool, ToolContext } from "./types";

export type DesktopToolContext = ToolContext & { userId?: string; source?: "web" | "bot" | "cron" };

const WAITING =
  "Sent to the person's computer. It runs only after they allow it there (type y in the Aspire Desktop window) within 5 minutes. Say it is waiting for them to allow it; never say it is done.";
const NO_DEVICE =
  "No computer is paired. Tell the person to open Settings, Desktop, and pair Aspire Desktop with the code shown there.";

async function queue(kind: DesktopKind, input: Record<string, unknown>, ctx: DesktopToolContext): Promise<unknown> {
  if (!ctx.userId || ctx.source !== "web") return { error: "Only a signed-in person in the Aspire app can use their computer from Aspire." };
  const job = validateDesktopJob(kind, input);
  if ("error" in job) return { error: job.error };
  const out = await enqueueDesktopJob(ctx.userId, job.kind, job.payload, ctx.now);
  if ("error" in out) {
    return { error: out.error === "no_device" ? NO_DEVICE : "Too many jobs are waiting on the computer. Ask the person to answer them first." };
  }
  return { status: "waiting_for_permission", computer: out.deviceName, note: WAITING };
}

const tool = (
  kind: DesktopKind,
  label: Tool["label"],
  description: string,
  properties: Tool["parameters"]["properties"],
): Tool => ({
  name: `desktop_${kind}`,
  label,
  description: `${description} Works only when the person paired Aspire Desktop; they must allow every job on the computer.`,
  parameters: { type: "object", properties, required: Object.keys(properties) },
  run: (input, ctx) => queue(kind, input, ctx as DesktopToolContext),
});

export const desktopTools: Tool[] = [
  tool("open_app", { mn: "Компьютер: програм", en: "Computer: app" }, "Open an installed app on the person's computer by its name.", {
    app: { type: "string", description: "App name as people say it, e.g. 'Notepad', 'Calculator', 'Word', 'Spotify'" },
  }),
  tool("open_url", { mn: "Компьютер: холбоос", en: "Computer: link" }, "Open a web page in the browser on the person's computer.", {
    url: { type: "string", description: "Full https:// address" },
  }),
  tool(
    "type_text",
    { mn: "Компьютер: бичих", en: "Computer: typing" },
    "Type text into whatever window is focused on the person's computer (they get a few seconds to click it first).",
    { text: { type: "string", description: "Text to type, up to 2000 characters" } },
  ),
  tool(
    "save_file",
    { mn: "Компьютер: файл", en: "Computer: file" },
    "Save a plain text file (.txt .md .csv .tsv .json .log .ics .vcf) into the Aspire folder in the person's home folder on their computer.",
    {
      name: { type: "string", description: "Plain file name with extension, e.g. 'shopping-list.txt' (no folders)" },
      content: { type: "string", description: "File content as text, up to 200 KB" },
    },
  ),
  tool(
    "fill_form",
    { mn: "Компьютер: маягт", en: "Computer: form" },
    "Fill a form on the person's computer: types each value and presses Tab between them, starting in the focused field.",
    {
      fields: {
        type: "array",
        description: "Fields in on-screen order (1 to 20)",
        items: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" } },
          required: ["label", "value"],
        },
      },
    },
  ),
];

/** desktopTools for a direct, signed-in web request; nothing for bots, cron or signed-out use. */
export const desktopToolsFor = (ctx: { userId?: string; source?: DesktopToolContext["source"] }): Tool[] =>
  ctx.source === "web" && ctx.userId ? desktopTools : [];
