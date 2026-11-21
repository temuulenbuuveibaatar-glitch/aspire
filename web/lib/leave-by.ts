// Leave-by for get_directions: a future departure ("if I leave at 7 tomorrow") or an arrival
// ("be there by 06:00"). Pure: validates the model's times and says what to send to the Routes API.
// The Routes API takes arrivalTime for TRANSIT only and never both times; driving and walking
// "arrive by" are worked out here as arrival minus the travel time.
import { clockIn, dayIn, validTimeZone, zonedTime, zoneOr } from "@/lib/tools/time";

export const MAX_AHEAD_DAYS = 7;
const DAY_MS = 86_400_000;
/** A time a minute old still counts as "now" (the model reads the clock before it calls). */
const SLACK_MS = 60_000;

export type TripMode = "transit" | "walk" | "drive";

/** Tool parameters, spread into get_directions' properties (and required). */
export const TRIP_TIME_PARAMS = {
  depart_at: {
    type: "string",
    description: "Leave later instead of now: 'YYYY-MM-DD HH:MM' in the person's local time, up to 7 days ahead. Empty string = now.",
  },
  arrive_by: {
    type: "string",
    description: "Must arrive by: 'YYYY-MM-DD HH:MM' local time, up to 7 days ahead; the answer says when to leave. Empty string = not asked. Never set both.",
  },
};

export type TripTime =
  | { error: string }
  | {
      /** What to put in the Routes request (one of them, never both). */
      departureTime?: string;
      arrivalTime?: string;
      /** Drive/walk "arrive by": the target; the leave time is worked out from the route's minutes. */
      arriveBy?: Date;
      zone: string;
      zoneUnknown: boolean;
    };

const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/;

/** Validate depart_at / arrive_by (local wall clock in the person's zone) for a route request. */
export function tripTime(departAt: unknown, arriveBy: unknown, mode: TripMode, now: Date, timeZone?: string): TripTime {
  const zone = zoneOr(timeZone);
  const zoneUnknown = !validTimeZone(timeZone);
  const dep = typeof departAt === "string" ? departAt.trim() : "";
  const arr = typeof arriveBy === "string" ? arriveBy.trim() : "";
  if (dep && arr) return { error: "Give depart_at or arrive_by, not both" };
  if (!dep && !arr) return { departureTime: now.toISOString(), zone, zoneUnknown };
  const m = LOCAL.exec(dep || arr);
  const at = m ? zonedTime(m[1], m[2], zone) : null;
  if (!at) return { error: "Times must be 'YYYY-MM-DD HH:MM' in the person's local time" };
  if (at.getTime() < now.getTime() - SLACK_MS) return { error: "That time has already passed; check the date with the person" };
  if (at.getTime() > now.getTime() + MAX_AHEAD_DAYS * DAY_MS) return { error: `Only up to ${MAX_AHEAD_DAYS} days ahead` };
  const iso = at.toISOString();
  if (dep) return { departureTime: iso, zone, zoneUnknown };
  return mode === "transit" ? { arrivalTime: iso, zone, zoneUnknown } : { departureTime: iso, arriveBy: at, zone, zoneUnknown };
}

/** For a drive/walk "arrive by": when to leave, or how late they will be if they leave now. */
export function leaveBy(arriveBy: Date, durationMin: number, now: Date, zone: string) {
  const leave = new Date(arriveBy.getTime() - durationMin * 60_000);
  const lateMin = Math.ceil((now.getTime() - leave.getTime()) / 60_000);
  return {
    leaveAt: clockIn(leave, zone),
    leaveDate: dayIn(leave, zone),
    ...(lateMin > 0 ? { leaveNow: true, lateByMinutes: lateMin } : {}),
    note: "Travel time without traffic: tell the person to allow extra time.",
  };
}
