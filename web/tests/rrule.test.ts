import { describe, expect, it } from "vitest";
import { buildRRule, describeRepeat, isRRule, parseRepeat, withRecur } from "@/lib/rrule";

const rule = (input: Record<string, unknown>, startDay = 15) => {
  const r = parseRepeat(input, startDay);
  if (!r || "error" in r) throw new Error(JSON.stringify(r));
  return buildRRule(r);
};

describe("parseRepeat + buildRRule", () => {
  it("none / missing = a single event", () => {
    expect(parseRepeat({}, 1)).toBeNull();
    expect(parseRepeat({ repeat: "none", repeat_on: "MO" }, 1)).toBeNull();
  });

  it("weekly: weekdays in calendar order, no duplicates; empty = the start's weekday", () => {
    expect(rule({ repeat: "weekly", repeat_on: "fr, mo,WE,mo", repeat_count: 0 })).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(rule({ repeat: "weekly", repeat_on: "", repeat_count: 10 })).toBe("RRULE:FREQ=WEEKLY;COUNT=10");
  });

  it("monthly: a day, 'last', and the month-end rule for 29-31", () => {
    expect(rule({ repeat: "monthly", repeat_on: "5" })).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=5");
    expect(rule({ repeat: "monthly", repeat_on: "last", repeat_count: 12 })).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12");
    expect(rule({ repeat: "monthly", repeat_on: "31" })).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(rule({ repeat: "monthly", repeat_on: "" }, 30)).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(rule({ repeat: "monthly", repeat_on: "" }, 10)).toBe("RRULE:FREQ=MONTHLY");
  });

  it("rejects bad values (and never copies model text into the rule)", () => {
    const bad = [
      { repeat: "daily" },
      { repeat: "yearly" },
      { repeat: "weekly", repeat_on: "MO;COUNT=999" },
      { repeat: "weekly", repeat_on: "XX" },
      { repeat: "monthly", repeat_on: "0" },
      { repeat: "monthly", repeat_on: "32" },
      { repeat: "monthly", repeat_on: "-1" },
      { repeat: "monthly", repeat_on: "5\r\nRRULE:FREQ=SECONDLY" },
      { repeat: "weekly", repeat_count: 53 },
      { repeat: "weekly", repeat_count: -1 },
      { repeat: "weekly", repeat_count: 2.5 },
      { repeat: "weekly", repeat_count: "ten" },
    ];
    for (const b of bad) expect(parseRepeat(b, 1)).toHaveProperty("error");
  });

  it("describeRepeat for the spoken answer", () => {
    expect(describeRepeat({ freq: "monthly", monthDay: -1 })).toBe("monthly on the last day, until deleted");
    expect(describeRepeat({ freq: "weekly", weekdays: ["TU", "TH"], count: 8 })).toBe("weekly on TU,TH, 8 times");
  });
});

describe("isRRule (the browser's copy sent back to /api/calendar)", () => {
  it("accepts exactly what buildRRule makes", () => {
    for (const r of ["RRULE:FREQ=WEEKLY", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;COUNT=52", "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1", "RRULE:FREQ=MONTHLY;BYMONTHDAY=28;COUNT=1"])
      expect(isRRule(r)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const r of [
      "RRULE:FREQ=SECONDLY",
      "RRULE:FREQ=DAILY",
      "RRULE:FREQ=WEEKLY;COUNT=53",
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=29",
      "RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20260101",
      "rrule:freq=weekly",
      "RRULE:FREQ=WEEKLY;UNTIL=20991231",
      ["RRULE:FREQ=WEEKLY"],
      null,
    ])
      expect(isRRule(r)).toBe(false);
  });

  it("withRecur appends the encoded rule to the template link", () => {
    expect(withRecur("https://calendar.google.com/calendar/render?action=TEMPLATE&text=x", "RRULE:FREQ=WEEKLY;BYDAY=MO")).toBe(
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=x&recur=RRULE%3AFREQ%3DWEEKLY%3BBYDAY%3DMO",
    );
  });
});
