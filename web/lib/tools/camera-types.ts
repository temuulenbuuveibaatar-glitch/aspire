// Camera types and the URL trust boundary, shared by the server (lib/cameras.ts) and the browser
// (components/aspire/CameraSheet.tsx). Pure: no env, no fetch. `CameraAction` is part of the
// ClientAction union (lib/tools/types.ts); the app opens <CameraSheet> when the assistant returns it.
import type { Lang } from "@/lib/lang";

/** "Show me the cameras near here": the UI opens CameraSheet at this point (3 decimals, about 100 m). */
export type CameraAction = { type: "cameras"; lat: number; lng: number };

/** embed = the operator's own live page in an iframe; video = YouTube live (nocookie); image = still snapshot; link = open in a new tab. */
export type CameraKind = "embed" | "image" | "link" | "video";

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** From the place asked about, rounded to 0.1 km. */
  distanceKm: number;
  kind: CameraKind;
  /** https only; checked with safeCameraUrl. */
  url: string;
  /** Preview picture (same allow-list as images). */
  thumb?: string;
  /** Short mp4 clip (London JamCams) or the live HLS stream (Caltrans), played in a <video>. */
  clip?: string;
  source: "erdenet" | "ulaanbaatar" | "tfl" | "lta-sg" | "td-hk" | "caltrans" | "nzta" | "youtube" | "osm";
  /** Who runs the camera or owns the data; shown next to it. */
  credit: string;
  /** ISO instant of the picture, when the source says. */
  updatedAt?: string;
}

/** Hosts whose content may load inside the page (iframe, img, video), by kind. */
const EMBED_HOSTS: Record<Exclude<CameraKind, "link">, readonly string[]> = {
  embed: ["dedtuv.erdenet.mn"],
  video: ["www.youtube-nocookie.com"],
  image: [
    "s3-eu-west-1.amazonaws.com", "images.data.gov.sg", "tdcctv.data.one.gov.hk",
    "cwwp2.dot.ca.gov", "wzmedia.dot.ca.gov", "www.trafficnz.info", "i.ytimg.com",
  ],
};
/** Hosts that also serve other things: only their camera paths count (TfL's bucket is on a shared AWS host). */
const PATH_PREFIX: Record<string, string> = {
  "s3-eu-west-1.amazonaws.com": "/jamcams.tfl.gov.uk/",
  "cwwp2.dot.ca.gov": "/data/",
  "www.trafficnz.info": "/camera/",
};

/**
 * Never shown, whatever a source says: sites that list private or unsecured cameras, and dynamic-DNS
 * and IP-camera cloud names (they front home cameras and DVR panels).
 */
const BLOCKED =
  /(^|\.)(insecam\.\w+|opentopia\.com|shodan\.io|camhacker\.\w+|ddns\.net|no-ip\.(com|org|biz|info)|noip\.me|hopto\.org|zapto\.org|sytes\.net|dyndns\.\w+|duckdns\.org|myfoscam\.org|hik-connect\.com|ezvizlife\.com|dvrdns\.org|myq-see\.com|camddns\.com|ipcam\.so)$/i;

/**
 * The trust boundary for every camera URL. Returns the normalised https URL, or null.
 * embed/video/image: the host must be on the allow-list above (it loads inside the page).
 * link (opened in a new tab, never embedded): https on a public DNS name, default port, no
 * credentials, not an IP literal or local name, not a private-camera site.
 */
export function safeCameraUrl(kind: CameraKind, raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (BLOCKED.test(host)) return null;
  if (kind === "link") {
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null; // no IPs, no "localhost"
    if (/(^|\.)(local|localhost|internal|lan|home|arpa)$/.test(host)) return null;
    return u.href;
  }
  if (!EMBED_HOSTS[kind]?.includes(host)) return null;
  const prefix = PATH_PREFIX[host];
  if (prefix && !u.pathname.startsWith(prefix)) return null;
  return u.href;
}

/** The two city camera pages by name in each language (lib/cameras.ts keeps the Mongolian ones as the fallback). */
export const CITY_CAMERA_NAMES: Record<Lang, { erdenet: string; ub: string }> = {
  mn: { erdenet: "Эрдэнэт хотын камерууд", ub: "Улаанбаатар: замын хөдөлгөөний камер" },
  zh: { erdenet: "额尔登特市摄像头", ub: "乌兰巴托交通摄像头" },
  en: { erdenet: "Erdenet city cameras", ub: "Ulaanbaatar traffic cameras" },
  ru: { erdenet: "Камеры города Эрдэнэт", ub: "Улан-Батор: камеры дорожного движения" },
  de: { erdenet: "Stadtkameras Erdenet", ub: "Ulaanbaatar: Verkehrskameras" },
};

/** A camera's name in `lang`: the city pages are translated, every other name is the operator's own. */
export const cameraName = (c: Pick<Camera, "id" | "name">, lang: Lang): string => {
  const n = CITY_CAMERA_NAMES[lang] ?? CITY_CAMERA_NAMES.en;
  return c.id === "erdenet-live" ? n.erdenet : c.id === "ub-traffic" ? n.ub : c.name;
};

/** An HLS stream (Caltrans), which only some browsers play natively; else an mp4 clip (TfL). */
export const isHls = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

/** A thumbnail or clip: an allow-listed image host (TfL's mp4, Caltrans' HLS stream). */
export const safeImageUrl = (raw: unknown): string | null => safeCameraUrl("image", raw);
