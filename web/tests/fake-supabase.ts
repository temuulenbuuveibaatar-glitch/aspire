// In-memory stand-in for the parts of the Supabase query builder the app uses (tests only).
// Supports from().select/insert/upsert/update/delete with eq/neq/lt/lte/gt/gte/is/in filters,
// order, limit, maybeSingle/single, and unique keys per table (insert conflicts -> 23505).
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const UNIQUE: Record<string, string[][]> = {
  link_codes: [["code"]],
  bot_links: [["id"], ["platform", "chat_id", "user_id"]],
  user_state: [["user_id"]],
  secrets: [["user_id"]],
  bot_reminders: [["id"]],
  slack_installations: [["team_id"]],
  profiles: [["user_id"]],
};
const SERIAL: Record<string, string> = { bot_links: "id" };
const DEFAULTS: Record<string, () => Row> = {
  bot_links: () => ({ is_primary: false, linked_at: new Date().toISOString(), chat_title: null, team_id: null }),
  bot_reminders: () => ({ repeat_daily: false, sent_at: null }),
  user_state: () => ({ updated_at: new Date().toISOString() }),
  slack_installations: () => ({ installed_at: new Date().toISOString(), installed_by: null }),
};

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const cmp = (a: unknown, b: unknown) => {
  const ta = typeof a === "string" && !Number.isNaN(Date.parse(a)) && typeof b === "string" ? Date.parse(a) : a;
  const tb = typeof b === "string" && !Number.isNaN(Date.parse(b)) && typeof a === "string" ? Date.parse(b) : b;
  return (ta as number) < (tb as number) ? -1 : (ta as number) > (tb as number) ? 1 : 0;
};

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  const serial: Record<string, number> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = clone(rows);
  const table = (name: string) => (tables[name] ??= []);
  const sameKey = (name: string, a: Row, b: Row) =>
    (UNIQUE[name] ?? []).find((cols) => cols.every((c) => a[c] !== undefined && a[c] === b[c]));

  function builder(name: string) {
    let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: Row[] = [];
    let patch: Row = {};
    let onConflict: string[] | null = null;
    let returning = false;
    let single: "maybe" | "one" | null = null;
    const orderBy: { col: string; asc: boolean }[] = [];
    let limitN: number | null = null;
    const filters: Filter[] = [];

    const run = (): { data: unknown; error: { code: string; message: string } | null } => {
      const rows = table(name);
      let affected: Row[] = [];
      if (op === "insert" || op === "upsert") {
        for (const raw of payload) {
          const row: Row = { ...(DEFAULTS[name]?.() ?? {}), ...clone(raw) };
          const serialCol = SERIAL[name];
          if (serialCol && row[serialCol] === undefined) row[serialCol] = (serial[name] = (serial[name] ?? 0) + 1);
          const clash = rows.find((r) =>
            onConflict ? onConflict.every((c) => r[c] === row[c]) : !!sameKey(name, r, row),
          );
          if (clash && op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
          if (clash) {
            Object.assign(clash, row, serialCol ? { [serialCol]: clash[serialCol] } : {});
            affected.push(clash);
          } else {
            rows.push(row);
            affected.push(row);
          }
        }
      } else {
        affected = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") for (const r of affected) Object.assign(r, clone(patch));
        if (op === "delete") tables[name] = rows.filter((r) => !affected.includes(r));
      }
      if (op !== "select" && !returning) return { data: null, error: null };
      let out = [...affected];
      for (const o of [...orderBy].reverse()) out.sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]));
      if (limitN !== null) out = out.slice(0, limitN);
      out = clone(out);
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      if (single === "one") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } };
      return { data: out, error: null };
    };

    const b = {
      select() {
        if (op === "select") op = "select";
        else returning = true;
        return b;
      },
      insert(rows: Row | Row[]) {
        op = "insert";
        payload = Array.isArray(rows) ? rows : [rows];
        return b;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        op = "upsert";
        payload = Array.isArray(rows) ? rows : [rows];
        onConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
        return b;
      },
      update(p: Row) {
        op = "update";
        patch = p;
        return b;
      },
      delete() {
        op = "delete";
        return b;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
      lt: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) < 0), b),
      lte: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) <= 0), b),
      gt: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) > 0), b),
      gte: (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) >= 0), b),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
      order: (col: string, o?: { ascending?: boolean }) => (orderBy.push({ col, asc: o?.ascending !== false }), b),
      limit: (n: number) => ((limitN = n), b),
      maybeSingle: () => ((single = "maybe"), b),
      single: () => ((single = "one"), b),
      then<A, B>(ok: (v: ReturnType<typeof run>) => A, bad?: (e: unknown) => B) {
        return Promise.resolve().then(run).then(ok, bad);
      },
    };
    return b;
  }

  return { client: { from: (name: string) => builder(name) }, tables, table };
}
