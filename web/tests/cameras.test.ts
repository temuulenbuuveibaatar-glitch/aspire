// Cameras: every source with a mocked fetch, the URL allow-list, the route, the tool and the empty state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { GET } from "@/app/api/cameras/route";
import { CAMERA_TEXT, CameraPanel, toCameraState } from "@/components/aspire/CameraSheet";
import { clearCameraCache, findCameras } from "@/lib/cameras";
import { LANGS } from "@/lib/lang";
import { safeCameraUrl } from "@/lib/tools/camera-types";
import { cameraTools, findCamerasTool } from "@/lib/tools/cameras";
import type { ToolContext } from "@/lib/tools/types";

const user = vi.hoisted(() => ({ current: { id: "user_cam", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user.current,
}));

const KEY = "test_google_key_123";
const ERDENET = { lat: 49.03, lng: 104.08 };
const UB = { lat: 47.918, lng: 106.917 };
const LONDON = { lat: 51.51, lng: -0.12 };
const SINGAPORE = { lat: 1.3, lng: 103.85 };
const HONG_KONG = { lat: 22.28, lng: 114.16 };
const OCEAN = { lat: -40, lng: -130 };

const tflBody = [
  {
    id: "JamCams_00001.01251", commonName: "Strand / Savoy St", lat: 51.5106, lon: -0.1206,
    additionalProperties: [
      { key: "available", value: "true", modified: "2026-11-21T03:58:00Z" },
      { key: "imageUrl", value: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01251.jpg", modified: "2026-11-21T03:58:00Z" },
      { key: "videoUrl", value: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01251.mp4", modified: "2026-11-21T03:58:00Z" },
    ],
  },
  { id: "JamCams_bad", commonName: "Elsewhere bucket", lat: 51.5, lon: -0.1, additionalProperties: [{ key: "imageUrl", value: "https://s3-eu-west-1.amazonaws.com/someone-else/x.jpg" }] },
  { id: "JamCams_off", commonName: "Switched off", lat: 51.5, lon: -0.1, additionalProperties: [{ key: "available", value: "false" }, { key: "imageUrl", value: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/off.jpg" }] },
];
const sgBody = {
  items: [{ timestamp: "2026-11-21T12:09:31+08:00", cameras: [
    { camera_id: "1701", timestamp: "2026-11-21T12:06:31+08:00", image: "https://images.data.gov.sg/api/traffic-images/2026/11/a.jpg", location: { latitude: 1.2996, longitude: 103.8517 } },
    { camera_id: "1702", timestamp: "2026-11-21T12:06:31+08:00", image: "http://images.data.gov.sg/api/traffic-images/2026/11/b.jpg", location: { latitude: 1.3, longitude: 103.85 } },
  ] }],
};
const hkXml = `<?xml version="1.0" encoding="UTF-8"?><image-list>
  <image><key>H429F</key><region>Hong Kong Island</region><description>Aberdeen Praya Road near Fish Market [H429F]</description>
  <latitude>22.24845</latitude><longitude>114.1505</longitude><url>https://tdcctv.data.one.gov.hk/H429F.JPG</url></image>
  <image><key>EVIL</key><description>Not TD</description><latitude>22.28</latitude><longitude>114.16</longitude><url>https://evil.example/x.jpg</url></image>
</image-list>`;
// Trimmed from the real lists (2026-11-21): Caltrans D4 (two in service near San Francisco, one
// switched off), D8 (a row whose stream is http), NZTA (two Auckland cameras, one offline, one in
// maintenance; nested journey/region/way blocks kept, they carry their own id and name).
const ct = (index: string, district: string, locationName: string, nearbyPlace: string, latitude: string, longitude: string, inService: string, stream: string, image: string) => ({
  cctv: {
    index, recordTimestamp: { recordDate: "2026-05-04", recordTime: "16:04:03", recordEpoch: "1777935843" },
    location: { district, locationName, nearbyPlace, longitude, latitude, county: "", route: "" },
    inService, imageData: { imageDescription: "", streamingVideoURL: stream, static: { currentImageUpdateFrequency: "5", currentImageURL: image } },
  },
});
const ctD04 = { data: [
  ct("492", "4", "TV301 -- US-101 : At Octavia St", "San Francisco", "37.77146", "-122.42323", "true",
    "https://wzmedia.dot.ca.gov/D4/S101_at_Octavia_St.stream/playlist.m3u8", "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv301us101atoctaviast/tv301us101atoctaviast.jpg"),
  ct("778", "4", "TV309 -- I-280 : AT CESAR CHAVEZ", "San Francisco", "37.75025", "-122.3924", "true", "",
    "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv309i280atcesarchavez/tv309i280atcesarchavez.jpg"),
  ct("647", "4", "TV073 -- SR-1 : AT CORONADO ST", "Half Moon Bay", "37.49988", "-122.46727", "false", "",
    "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv073sr1atcoronadost/tv073sr1atcoronadost.jpg"),
] };
const ctD08 = { data: [
  ct("1417", "8", "I-10: (389) W/O EAGLE MOUNTAIN RD", "DESERT CENTER", "33.699537", "-115.466289", "true",
    "http://wzmedia.dot.ca.gov/D8/LB-8_10_389.stream/playlist.m3u8", "https://cwwp2.dot.ca.gov/data/d8/cctv/image/i10389woeaglemountainrd/i10389woeaglemountainrd.jpg"),
] };
const nz = (id: string, name: string, description: string, lat: string, lng: string, offline: string, maint: string, image = `/camera/${id}.jpg`) =>
  `<camera><description>${description}</description><direction>Northbound</direction><group>NA</group><highway>SH1</highway><id>${id}</id><imageUrl>${image}</imageUrl>` +
  `<journey><id>86</id><name>SH1</name><startLatitude>-41.95</startLatitude><startLongitude>174.06</startLongitude><endLatitude>-44.83</endLatitude><endLongitude>171.07</endLongitude><time>00:00:00</time></journey>` +
  `<latitude>${lat}</latitude><longitude>${lng}</longitude><name>${name}</name><offline>${offline}</offline><region><id>2</id><name>Auckland</name></region>` +
  `<sortOrder>9</sortOrder><thumbUrl>/camera/thumb/${id}.jpg</thumbUrl><underMaintenance>${maint}</underMaintenance><viewUrl>/camera/view/${id}</viewUrl><way><id>12</id><name>016</name></way></camera>`;
const nzXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response>${[
  nz("60", "SH1/SH16 Central Mwy Junction", "South along Sthn Mwy at Nth Wstn Mwy link", "-36.86", "174.757", "false", "false"),
  nz("306", "SH20/20A Interchange ", "North along Sth Wstn Mwy &amp; SH20A airport link", "-36.964", "174.8", "false", "false"),
  nz("249", "Te Rapa Rd/Wairere Dr Intersection", "North along Te Rapa Rd", "-37.749758", "175.236791", "true", "false"),
  nz("704", "SH1 Wilkinsons Rd", "North along Johns Rd from Wilkinsons Rd", "-43.464903", "172.582345", "true", "true"),
].join("")}</response>`;
const SAN_FRANCISCO = { lat: 37.7793, lng: -122.4193 };
const AUCKLAND = { lat: -36.8485, lng: 174.7633 };

const ytSearch = { items: [
  { id: { videoId: "AAAAAAAAAAA" }, snippet: { title: "City &amp; harbour live", channelTitle: "Harbour Cam", thumbnails: { medium: { url: "https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg" } } } },
  { id: { videoId: "BBBBBBBBBBB" }, snippet: { title: "No position given", channelTitle: "Somebody" } },
] };
const ytVideos = (at: { lat: number; lng: number }) => ({ items: [{ id: "AAAAAAAAAAA", recordingDetails: { location: { latitude: at.lat + 0.01, longitude: at.lng } } }, { id: "BBBBBBBBBBB" }] });
const osmBody = (at: { lat: number; lng: number }) => ({ elements: [
  { type: "node", id: 101, lat: at.lat + 0.02, lon: at.lng, tags: { name: "Town square webcam", "contact:webcam": "https://webcam.example.org/square" } },
  { type: "node", id: 102, lat: at.lat, lon: at.lng, tags: { name: "Plain http", webcam: "http://cam.example.org/" } },
  { type: "node", id: 103, lat: at.lat, lon: at.lng, tags: { name: "Unsecured list", "url:webcam": "https://www.insecam.org/en/view/1/" } },
  { type: "node", id: 104, lat: at.lat, lon: at.lng, tags: { name: "IP camera", webcam: "https://192.168.1.20/live" } },
  { type: "node", id: 105, lat: at.lat + 1, lon: at.lng, tags: { name: "Too far", webcam: "https://far.example.org/" } },
] });

let at = ERDENET;
let fail = new Set<string>();
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
const hits = (host: string) => fetchMock.mock.calls.filter(([u]) => new URL(u).host === host);

beforeEach(() => {
  clearCameraCache();
  user.current = { id: "user_cam", email: null };
  at = ERDENET;
  fail = new Set();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", KEY);
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (fail.has(u.host)) return new Response("down", { status: 503 });
    if (u.host === "api.tfl.gov.uk") return Response.json(tflBody);
    if (u.host === "api.data.gov.sg") return Response.json(sgBody);
    if (u.host === "static.data.gov.hk") return new Response(hkXml);
    if (u.host === "cwwp2.dot.ca.gov") return Response.json(u.pathname.startsWith("/data/d4/") ? ctD04 : u.pathname.startsWith("/data/d8/") ? ctD08 : { data: [] });
    if (u.host === "www.trafficnz.info") return new Response(nzXml, { headers: { "Content-Type": "application/xml" } });
    if (u.pathname === "/youtube/v3/search") return Response.json(ytSearch);
    if (u.pathname === "/youtube/v3/videos") return Response.json(ytVideos(at));
    if (u.host === "overpass-api.de") return Response.json(osmBody(at));
    return new Response("unexpected", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("safeCameraUrl (allow-list)", () => {
  it("embeds, videos and images only from their own hosts, https only", () => {
    expect(safeCameraUrl("embed", "https://dedtuv.erdenet.mn/live")).toBe("https://dedtuv.erdenet.mn/live");
    expect(safeCameraUrl("embed", "http://dedtuv.erdenet.mn/live")).toBeNull();
    expect(safeCameraUrl("embed", "https://evil.example/live")).toBeNull();
    expect(safeCameraUrl("video", "https://www.youtube-nocookie.com/embed/AAAAAAAAAAA")).not.toBeNull();
    expect(safeCameraUrl("video", "https://www.youtube.com/embed/AAAAAAAAAAA")).toBeNull();
    expect(safeCameraUrl("image", "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/1.jpg")).not.toBeNull();
    expect(safeCameraUrl("image", "https://s3-eu-west-1.amazonaws.com/other-bucket/1.jpg")).toBeNull();
    expect(safeCameraUrl("image", "https://user:pw@images.data.gov.sg/x.jpg")).toBeNull();
    expect(safeCameraUrl("image", "https://images.data.gov.sg:8443/x.jpg")).toBeNull();
    expect(safeCameraUrl("image", "javascript:alert(1)")).toBeNull();
  });

  it("Caltrans and NZTA: exact hosts, camera paths only", () => {
    expect(safeCameraUrl("image", "https://cwwp2.dot.ca.gov/data/d4/cctv/image/a/a.jpg")).not.toBeNull();
    expect(safeCameraUrl("image", "https://cwwp2.dot.ca.gov/other/a.jpg")).toBeNull();
    expect(safeCameraUrl("image", "https://wzmedia.dot.ca.gov/D4/x.stream/playlist.m3u8")).not.toBeNull();
    expect(safeCameraUrl("image", "http://wzmedia.dot.ca.gov/D4/x.stream/playlist.m3u8")).toBeNull();
    expect(safeCameraUrl("image", "https://evil.dot.ca.gov/data/a.jpg")).toBeNull();
    expect(safeCameraUrl("image", "https://www.trafficnz.info/camera/60.jpg")).not.toBeNull();
    expect(safeCameraUrl("image", "https://www.trafficnz.info/service/traffic/rest/4/cameras/all")).toBeNull();
    expect(safeCameraUrl("image", "https://trafficnz.info/camera/60.jpg")).toBeNull();
    expect(safeCameraUrl("embed", "https://cwwp2.dot.ca.gov/data/d4/cctv/image/a/a.jpg")).toBeNull();
  });

  it("links: public https names only, never IPs, local names or private-camera sites", () => {
    expect(safeCameraUrl("link", "https://webcam.example.org/a")).toBe("https://webcam.example.org/a");
    expect(safeCameraUrl("link", "http://webcam.example.org/a")).toBeNull();
    expect(safeCameraUrl("link", "https://192.168.1.20/live")).toBeNull();
    // Dynamic-DNS and IP-camera cloud names are refused by the shared check (browser too).
    for (const u of ["https://x.ddns.net/", "https://abc.myfoscam.org/", "https://home.duckdns.org/cam", "https://a.hik-connect.com/"]) expect(safeCameraUrl("link", u)).toBeNull();
    expect(safeCameraUrl("link", "https://localhost/live")).toBeNull();
    expect(safeCameraUrl("link", "https://cam.local/live")).toBeNull();
    expect(safeCameraUrl("link", "https://www.insecam.org/en/")).toBeNull();
    expect(safeCameraUrl("link", "https://insecam.com/")).toBeNull();
    expect(safeCameraUrl("link", 42)).toBeNull();
  });
});

describe("findCameras sources", () => {
  it("(a) Erdenet: the city page as an embed first, credited to Orkhon TKHDT", async () => {
    const r = await findCameras(ERDENET);
    expect(r.cameras[0]).toMatchObject({ kind: "embed", url: "https://dedtuv.erdenet.mn/live", credit: "Орхон ТКХДТ", source: "erdenet" });
    expect(r.credit[0]).toBe("Орхон ТКХДТ");
    expect(hits("api.tfl.gov.uk")).toHaveLength(0); // far from London: no call
  });

  it("(b) Ulaanbaatar: the traffic centre page as a link", async () => {
    at = UB;
    const r = await findCameras(UB);
    expect(r.cameras[0]).toMatchObject({ kind: "link", url: "https://ubtraffic.mn/", credit: "ЗХУТ" });
    expect(r.cameras.some((c) => c.source === "erdenet")).toBe(false);
  });

  it("(c) London TfL JamCams: snapshot + clip from TfL's own bucket only", async () => {
    at = LONDON;
    const r = await findCameras(LONDON);
    const tfl = r.cameras.filter((c) => c.source === "tfl");
    expect(tfl).toHaveLength(1);
    expect(tfl[0]).toMatchObject({
      name: "Strand / Savoy St", kind: "image", url: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01251.jpg",
      clip: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01251.mp4",
    });
    expect(tfl[0].updatedAt).toBeUndefined(); // the image is rewritten in place: the list time would be false
    expect(tfl[0].distanceKm).toBeLessThan(1);
    expect(r.credit).toContain("Transport for London (Powered by TfL Open Data)");
  });

  it("(c) Singapore LTA: https snapshots with their time", async () => {
    at = SINGAPORE;
    const r = await findCameras(SINGAPORE);
    const sg = r.cameras.filter((c) => c.source === "lta-sg");
    expect(sg.map((c) => c.id)).toEqual(["sg-1701"]); // the http one is dropped
    expect(sg[0].updatedAt).toBe("2026-11-21T04:06:31.000Z");
    expect(sg[0].credit).toContain("Singapore Open Data Licence v1.0");
  });

  it("(c) Hong Kong TD: the public XML list, TD's image host only", async () => {
    at = HONG_KONG;
    const r = await findCameras(HONG_KONG);
    const hk = r.cameras.filter((c) => c.source === "td-hk");
    expect(hk).toEqual([expect.objectContaining({ id: "hk-H429F", url: "https://tdcctv.data.one.gov.hk/H429F.JPG", kind: "image" })]);
  });

  const ctPaths = () => hits("cwwp2.dot.ca.gov").map(([u]) => new URL(u).pathname).sort();

  it("(c) Caltrans: in-service cameras of the nearby districts only, https stream as the clip, cached a day", async () => {
    at = SAN_FRANCISCO;
    const r = await findCameras(SAN_FRANCISCO);
    expect(ctPaths()).toEqual(["/data/d3/cctv/cctvStatusD03.json", "/data/d4/cctv/cctvStatusD04.json"]); // not all twelve
    const cams = r.cameras.filter((c) => c.source === "caltrans");
    expect(cams.map((c) => c.id)).toEqual(["ct-4-492", "ct-4-778"]); // the switched-off one is left out
    expect(cams[0]).toMatchObject({
      name: "TV301 -- US-101 : At Octavia St, San Francisco", kind: "image", credit: "Caltrans",
      url: "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv301us101atoctaviast/tv301us101atoctaviast.jpg",
      clip: "https://wzmedia.dot.ca.gov/D4/S101_at_Octavia_St.stream/playlist.m3u8",
    });
    expect(cams[1].clip).toBeUndefined();
    expect(cams[0].updatedAt).toBeUndefined(); // rewritten in place: the record time is not the picture's
    expect(r.credit).toContain("Caltrans");
    await findCameras({ lat: 37.75, lng: -122.4 });
    expect(hits("cwwp2.dot.ca.gov")).toHaveLength(2);
  });

  it("(c) Caltrans: an http stream is dropped, the picture stays", async () => {
    at = { lat: 33.7, lng: -115.47 };
    const r = await findCameras(at);
    expect(ctPaths()).toEqual(["/data/d11/cctv/cctvStatusD11.json", "/data/d8/cctv/cctvStatusD08.json"]); // Imperial County is within 60 km
    const cam = r.cameras.find((c) => c.id === "ct-8-1417");
    expect(cam?.url).toBe("https://cwwp2.dot.ca.gov/data/d8/cctv/image/i10389woeaglemountainrd/i10389woeaglemountainrd.jpg");
    expect(cam?.clip).toBeUndefined();
  });

  it("(c) Caltrans: a district that fails is named", async () => {
    at = SAN_FRANCISCO;
    fail = new Set(["cwwp2.dot.ca.gov"]);
    const r = await findCameras(SAN_FRANCISCO);
    expect(r.unavailable).toEqual(["caltrans"]);
    expect(r.cameras.some((c) => c.source === "caltrans")).toBe(false);
  });

  it("(c) NZTA: online cameras only, relative image path on NZTA's host, nested names ignored, cached a day", async () => {
    at = AUCKLAND;
    const r = await findCameras(AUCKLAND);
    const cams = r.cameras.filter((c) => c.source === "nzta");
    expect(cams.map((c) => c.id)).toEqual(["nz-60", "nz-306"]); // offline and in-maintenance ones are left out
    expect(cams[0]).toMatchObject({
      name: "SH1/SH16 Central Mwy Junction: South along Sthn Mwy at Nth Wstn Mwy link", kind: "image",
      url: "https://www.trafficnz.info/camera/60.jpg", thumb: "https://www.trafficnz.info/camera/60.jpg", credit: "NZ Transport Agency Waka Kotahi",
    });
    expect(cams[1].name).toBe("SH20/20A Interchange: North along Sth Wstn Mwy & SH20A airport link");
    expect(cams[0].updatedAt).toBeUndefined();
    await findCameras({ lat: -36.9, lng: 174.78 });
    expect(hits("www.trafficnz.info")).toHaveLength(1);
    expect(hits("cwwp2.dot.ca.gov")).toHaveLength(0);
  });

  it("(c) NZTA: an image path that is not relative to NZTA's host is dropped", async () => {
    const xml = `<response>${nz("1", "A", "abs", "-36.85", "174.76", "false", "false", "https://evil.example/x.jpg")}${nz("2", "B", "proto", "-36.85", "174.76", "false", "false", "//evil.example/x.jpg")}</response>`;
    fetchMock.mockImplementation(async (url: string) => (new URL(url).host === "www.trafficnz.info" ? new Response(xml) : Response.json({ items: [] })));
    const r = await findCameras(AUCKLAND);
    expect(r.cameras.filter((c) => c.source === "nzta")).toEqual([]);
  });

  it("(c) far from California and New Zealand: neither list is fetched", async () => {
    at = LONDON;
    await findCameras(LONDON);
    await findCameras(ERDENET);
    expect(hits("cwwp2.dot.ca.gov")).toHaveLength(0);
    expect(hits("www.trafficnz.info")).toHaveLength(0);
  });

  it("(d) YouTube live: key in the header only, located streams only, cached per cell", async () => {
    const r = await findCameras(ERDENET);
    const yt = r.cameras.filter((c) => c.source === "youtube");
    expect(yt).toEqual([expect.objectContaining({
      id: "yt-AAAAAAAAAAA", kind: "video", url: "https://www.youtube-nocookie.com/embed/AAAAAAAAAAA", name: "City & harbour live", credit: "Harbour Cam (YouTube)",
      thumb: "https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg",
    })]);
    // A stream found live can end: it carries the time it was checked.
    expect(Number.isFinite(Date.parse(yt[0].updatedAt!))).toBe(true);
    const [url, init] = hits("www.googleapis.com")[0];
    const u = new URL(url);
    expect(url).not.toContain(KEY);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ eventType: "live", type: "video", locationRadius: "50km", maxResults: "8", safeSearch: "moderate", location: "49,104.1" });
    const [videosUrl] = hits("www.googleapis.com")[1];
    expect(new URL(videosUrl).searchParams.has("maxResults")).toBe(false); // not allowed with id
    expect(init?.redirect).toBe("error"); // the key header never follows a redirect
    await findCameras({ lat: 49.031, lng: 104.081 }); // same ~10 km cell
    expect(hits("www.googleapis.com")).toHaveLength(2); // one search + one videos call, not repeated
  });

  const searches = () => fetchMock.mock.calls.filter(([u]) => new URL(u).pathname === "/youtube/v3/search").length;

  it("(d) YouTube: a daily cap per server instance, then said to be unavailable", async () => {
    let last;
    for (let i = 0; i < 21; i++) {
      at = { lat: 10 + i * 0.2, lng: 10 };
      last = await findCameras(at);
    }
    expect(searches()).toBe(20);
    expect(last!.unavailable).toEqual(["youtube"]);
  });

  it("(d) YouTube: each person gets a few new cells a day; others and cached cells are unaffected", async () => {
    for (let i = 0; i < 6; i++) {
      at = { lat: 10 + i * 0.2, lng: 10 };
      const r = await findCameras(at, { userId: "u1" });
      expect(r.unavailable).toEqual([]); // a used-up budget is not an outage
    }
    expect(searches()).toBe(5);
    await findCameras({ lat: 10, lng: 10 }, { userId: "u1" }); // cached cell: still served
    expect(searches()).toBe(5);
    const other = await findCameras(at, { userId: "u2" }); // the 6th cell was not cached empty
    expect(searches()).toBe(6);
    expect(other.cameras.some((c) => c.source === "youtube")).toBe(true);
  });

  it("(d) no Google key: YouTube is skipped without an error", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const r = await findCameras(ERDENET);
    expect(hits("www.googleapis.com")).toHaveLength(0);
    expect(r.unavailable).toEqual([]);
  });

  it("(e) OpenStreetMap: https webcam links within 25 km, nothing private, cached a day", async () => {
    const r = await findCameras(ERDENET);
    const osm = r.cameras.filter((c) => c.source === "osm");
    expect(osm).toEqual([expect.objectContaining({ id: "osm-101", kind: "link", url: "https://webcam.example.org/square", credit: "© OpenStreetMap contributors" })]);
    const [, init] = hits("overpass-api.de")[0];
    expect(init?.method).toBe("POST");
    const query = decodeURIComponent(String(init?.body));
    expect(query).toContain('["contact:webcam"]');
    expect(query).toContain("[timeout:9]"); // gives up before the client's 10 s
    expect(query).toContain("out 400;");
    await findCameras(ERDENET);
    expect(hits("overpass-api.de")).toHaveLength(1);
  });

  it("(e) OpenStreetMap: dynamic-DNS and IP-camera cloud names are never shown", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).host === "overpass-api.de"
        ? Response.json({ elements: ["https://x.ddns.net/", "https://abc.myfoscam.org/", "https://home.duckdns.org/cam"].map((u, i) => ({ type: "node", id: 200 + i, lat: at.lat, lon: at.lng, tags: { webcam: u } })) })
        : Response.json({ items: [] }),
    );
    const r = await findCameras(ERDENET);
    expect(r.cameras.filter((c) => c.source === "osm")).toEqual([]);
  });

  it("caps each source at its nearest 12 and the whole list at 40", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).host === "overpass-api.de"
        ? Response.json({ elements: Array.from({ length: 60 }, (_, i) => ({ type: "node", id: 300 + i, lat: at.lat + (60 - i) * 0.001, lon: at.lng, tags: { webcam: `https://cam${i}.example.org/` } })) })
        : Response.json({ items: [] }),
    );
    const r = await findCameras(ERDENET);
    const osm = r.cameras.filter((c) => c.source === "osm");
    expect(osm).toHaveLength(12);
    expect(osm[0].id).toBe("osm-359"); // nearest first
    expect(r.cameras.length).toBeLessThanOrEqual(40);
  });

  it("a source that fails is named, the rest still show", async () => {
    fail = new Set(["overpass-api.de"]);
    const r = await findCameras(ERDENET);
    expect(r.unavailable).toEqual(["osm"]);
    expect(r.cameras[0].source).toBe("erdenet");
  });

  it("(e) OpenStreetMap: the Overpass mirrors in turn, and a failed cell rests 10 minutes", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    fail = new Set(["overpass-api.de"]);
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (fail.has(u.host)) return new Response("down", { status: 503 });
      if (u.host === "overpass.kumi.systems") return Response.json(osmBody(at));
      return u.host === "overpass.private.coffee" ? new Response("down", { status: 503 }) : Response.json({ items: [] });
    });
    expect((await findCameras(ERDENET)).cameras.some((c) => c.source === "osm")).toBe(true);
    // Every mirror down: said as unavailable, and not asked again for 10 minutes.
    fail = new Set(["overpass-api.de", "overpass.kumi.systems"]);
    const far = { lat: 49.5, lng: 104.5 };
    expect((await findCameras(far)).unavailable).toContain("osm");
    const overpassCalls = () => fetchMock.mock.calls.filter(([u]) => /overpass/.test(u)).length;
    const before = overpassCalls();
    clock.mockReturnValue(t0 + 5 * 60_000);
    expect((await findCameras(far)).unavailable).toContain("osm");
    expect(overpassCalls()).toBe(before);
  });

  it("merges without duplicates and in source order", async () => {
    const r = await findCameras(ERDENET);
    expect(r.cameras.map((c) => c.source)).toEqual(["erdenet", "youtube", "osm"]);
    expect(new Set(r.cameras.map((c) => c.url)).size).toBe(r.cameras.length);
  });

  it("empty: nothing near the middle of the ocean", async () => {
    at = OCEAN;
    fetchMock.mockImplementation(async (url: string) => Response.json(new URL(url).host === "overpass-api.de" ? { elements: [] } : { items: [] }));
    const r = await findCameras(OCEAN);
    expect(r.cameras).toEqual([]);
    expect(r.credit).toEqual([]);
  });
});

describe("GET /api/cameras", () => {
  const req = (q: string) => new Request(`https://aspire.test/api/cameras?${q}`, { headers: { "x-real-ip": `10.0.0.${Math.floor(Math.random() * 250)}` } });

  it("needs a session", async () => {
    user.current = null;
    expect((await GET(req("lat=49&lng=104"))).status).toBe(401);
  });

  it("rejects a bad position", async () => {
    for (const q of ["lat=91&lng=0", "lat=abc&lng=1", "lat=&lng=", "lng=104", "lat=1e3&lng=1"]) expect((await GET(req(q))).status).toBe(400);
  });

  it("answers with cameras, credit and a time", async () => {
    const res = await GET(req("lat=49.0333&lng=104.0833"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cameras[0].url).toBe("https://dedtuv.erdenet.mn/live");
    expect(body.credit).toContain("Орхон ТКХДТ");
    expect(Number.isFinite(Date.parse(body.updatedAt))).toBe(true);
  });
});

describe("find_cameras tool", () => {
  const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({ now: new Date(), device: { memory: {}, reminders: [] }, actions: [], lang: "en", ...extra });

  it("is exported as cameraTools", () => {
    expect(cameraTools.map((t) => t.name)).toEqual(["find_cameras"]);
  });

  it("uses the device location and opens the sheet", async () => {
    const c = ctx({ device: { memory: {}, reminders: [], location: { lat: 49.03349, lng: 104.08321 } } });
    const out = (await findCamerasTool.run({}, c)) as { total: number; cameras: { credit: string }[] };
    expect(c.actions).toEqual([{ type: "cameras", lat: 49.033, lng: 104.083 }]);
    expect(out.total).toBe(3);
    expect(out.cameras[0].credit).toBe("Орхон ТКХДТ");
  });

  it("names a GPS fix by no saved city, and keeps anyone-can-write names from the model", async () => {
    const c = ctx({ city: "Ulaanbaatar", device: { memory: {}, reminders: [], location: ERDENET } });
    const out = (await findCamerasTool.run({}, c)) as { place?: string; cameras: { name: string; credit: string }[] };
    expect(out.place).toBeUndefined();
    // The city page by its name in the person's language.
    expect(out.cameras.map((x) => x.name)).toEqual(["Erdenet city cameras", "YouTube live stream", "Mapped webcam"]);
    expect(out.cameras[1].credit).toBe("YouTube");
    expect(JSON.stringify(out)).not.toContain("harbour");
  });

  it("falls back to the network position", async () => {
    const c = ctx({ approxLocation: ERDENET });
    await findCamerasTool.run({}, c);
    expect(c.actions[0]).toMatchObject({ type: "cameras", lat: 49.03 });
  });

  it("claims the on-screen panel only for the web app", async () => {
    const where = { device: { memory: {}, reminders: [], location: ERDENET } };
    const web = (await findCamerasTool.run({}, ctx({ ...where, source: "web" }))) as { note: string };
    expect(web.note).toContain("open on screen");
    for (const source of ["bot", "cron", undefined] as const) {
      const out = (await findCamerasTool.run({}, ctx({ ...where, source }))) as { note: string };
      expect(out.note).toContain("only in the Aspire app");
    }
  });

  it("never says 'no cameras' when a source did not answer", async () => {
    at = OCEAN;
    fetchMock.mockImplementation(async (url: string) => (/overpass/.test(url) ? new Response("down", { status: 503 }) : Response.json({ items: [] })));
    const out = (await findCamerasTool.run({}, ctx({ device: { memory: {}, reminders: [], location: OCEAN } }))) as { total: number; note: string };
    expect(out.total).toBe(0);
    expect(out.note).toContain("could not all be checked");
    expect(out.note).not.toContain("No public cameras are known");
  });

  it("says so when the place is unknown", async () => {
    const c = ctx();
    expect(await findCamerasTool.run({}, c)).toMatchObject({ error: expect.stringContaining("not known") });
    expect(c.actions).toEqual([]);
  });
});

describe("CameraSheet content", () => {
  const html = (state: Parameters<typeof CameraPanel>[0]["state"], lang: (typeof LANGS)[number] = "en") => renderToString(createElement(CameraPanel, { state, lang }));

  it("has every string in all five languages, no emojis", () => {
    const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;
    for (const l of LANGS) {
      const t = CAMERA_TEXT[l];
      expect(Object.keys(t).sort()).toEqual(Object.keys(CAMERA_TEXT.en).sort());
      expect(JSON.stringify(t)).not.toMatch(SYMBOLS);
    }
  });

  it("honest empty state", () => {
    expect(html({ status: "ok", cameras: [], credit: [], partly: false })).toContain("No public cameras near here");
    expect(html({ status: "ok", cameras: [], credit: [], partly: false }, "mn")).toContain(CAMERA_TEXT.mn.empty);
    // A source that did not answer: not every camera could be checked, never "none here".
    const partly = html({ status: "ok", cameras: [], credit: [], partly: true });
    expect(partly).toContain(CAMERA_TEXT.en.notAll);
    expect(partly).not.toContain(CAMERA_TEXT.en.empty);
  });

  it("names the city pages in the person's language", async () => {
    const r = await findCameras(ERDENET);
    const state = toCameraState(r);
    if (state.status !== "ok") throw new Error("not ok");
    expect(html(state, "en")).toContain("Erdenet city cameras");
    expect(html(state, "de")).toContain("Stadtkameras Erdenet");
    expect(html(state, "de")).not.toContain("Эрдэнэт хотын камерууд");
  });

  it("re-checks every URL from the server and lists the rest with credit", async () => {
    const r = await findCameras(ERDENET);
    const state = toCameraState({
      ...r,
      cameras: [...r.cameras, { ...r.cameras[0], id: "evil", kind: "embed", url: "https://evil.example/live" }, { id: "x", kind: "nope" }],
    });
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    expect(state.cameras.map((c) => c.id)).toEqual(r.cameras.map((c) => c.id));
    const out = html(state);
    expect(out).toContain("Town square webcam");
    expect(out).toContain('target="_blank"');
    expect(out).toContain("Орхон ТКХДТ");
    expect(out).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(out).not.toContain("evil.example");
  });

  it("a broken answer is an error, not an empty list", () => {
    expect(toCameraState(null)).toEqual({ status: "error" });
    expect(html({ status: "error" })).toContain(CAMERA_TEXT.en.error);
  });
});
