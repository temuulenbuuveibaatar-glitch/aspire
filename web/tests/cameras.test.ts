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

// Regional open-data lists, trimmed from the real answers (2026-11-21): one good camera each, plus
// rows that must be dropped (switched off, wrong host, http, bad id).
interface Region { source: string; host: string; at: { lat: number; lng: number }; body: unknown; ids: string[]; first: Record<string, unknown> }
const REGIONS: Region[] = [
  {
    source: "digitraffic-fi", host: "tie.digitraffic.fi", at: { lat: 60.05, lng: 24.0 },
    body: { type: "FeatureCollection", features: [
      { type: "Feature", id: "C01503", geometry: { type: "Point", coordinates: [23.99616, 60.05374, 0] }, properties: { id: "C01503", name: "kt51_Inkoo", collectionStatus: "GATHERING", presets: [{ id: "C0150301", inCollection: true }, { id: "C0150302", inCollection: true }] } },
      { type: "Feature", id: "C01504", geometry: { type: "Point", coordinates: [24.0, 60.06, 0] }, properties: { id: "C01504", name: "removed", collectionStatus: "REMOVED_TEMPORARILY", presets: [{ id: "C0150401", inCollection: true }] } },
      { type: "Feature", id: "C01505", geometry: { type: "Point", coordinates: [24.0, 60.06, 0] }, properties: { id: "C01505", name: "bad preset", collectionStatus: "GATHERING", presets: [{ id: "../x", inCollection: true }] } },
    ] },
    ids: ["fi-C0150301"],
    first: { name: "kt51 Inkoo", url: "https://weathercam.digitraffic.fi/C0150301.jpg", credit: "Fintraffic / digitraffic.fi, CC BY 4.0" },
  },
  {
    source: "vegvesen-no", host: "ogckart-sn1.atlas.vegvesen.no", at: { lat: 60.39, lng: 5.32 },
    body: { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [5.237528, 60.2922] }, properties: { CAMERA_ID: "1229019_1", DESCRIPTION: "Flyplassveien", ORIENTATION_DESCRIPTION: "Sentrum", ROAD_NUMBER: "R580", STATUS_STILL_IMAGE_AVAILABILITY: "videoOrImagesAvailable", STILL_IMAGE_URL: "https://kamera.atlas.vegvesen.no/api/images/1229019_1" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [5.3, 60.3] }, properties: { CAMERA_ID: "3001032_1", DESCRIPTION: "Fault", STATUS_STILL_IMAGE_AVAILABILITY: "videoOrImagesUnavailableDueToCameraFault", STILL_IMAGE_URL: "https://kamera.atlas.vegvesen.no/api/images/3001032_1" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [5.3, 60.3] }, properties: { CAMERA_ID: "9", DESCRIPTION: "Other path", STATUS_STILL_IMAGE_AVAILABILITY: "videoOrImagesAvailable", STILL_IMAGE_URL: "https://kamera.atlas.vegvesen.no/admin/9" } },
    ] },
    ids: ["no-1229019_1"],
    first: { name: "Flyplassveien, R580, Sentrum", url: "https://kamera.atlas.vegvesen.no/api/images/1229019_1", credit: "Statens vegvesen (NLOD)" },
  },
  {
    source: "vegagerdin-is", host: "gagnaveita.vegagerdin.is", at: { lat: 64.1466, lng: -21.9426 },
    body: [
      { Maelist_nr: 7001, Myndavel: "Hellisheiði", Vegheiti: "Hringvegur", NrVegur: "1", Skyring: "Hellisheiði séð til vesturs", Slod: "https://www.vegagerdin.is/vgdata/vefmyndavelar/hellisheidi_1.jpg", Breidd: 64.018296, Lengd: -21.342636 },
      { Maelist_nr: 7002, Myndavel: "Plain http", Slod: "http://www.vegagerdin.is/vgdata/vefmyndavelar/x_1.jpg", Breidd: 64.1, Lengd: -21.9 },
    ],
    ids: ["is-hellisheidi_1"],
    first: { name: "Hellisheiði séð til vesturs", url: "https://www.vegagerdin.is/vgdata/vefmyndavelar/hellisheidi_1.jpg", credit: expect.stringContaining("Icelandic Road and Coastal Administration (IRCA)") },
  },
  {
    source: "drivebc", host: "www.drivebc.ca", at: { lat: 49.28, lng: -123.12 },
    body: [
      { id: 723, name: "Pitt River Road - E", caption: "Highway 7B (Mary Hill Bypass), at Pitt River Road, looking east.", links: { imageDisplay: "/images/723.jpg?t=1795249076" }, is_on: true, marked_stale: false, should_appear: true, location: { type: "Point", coordinates: [-122.76914, 49.234922] } },
      { id: 724, name: "Stale", links: { imageDisplay: "/images/724.jpg" }, is_on: true, marked_stale: true, should_appear: true, location: { type: "Point", coordinates: [-122.8, 49.2] } },
      { id: 725, name: "Off", links: { imageDisplay: "/images/725.jpg" }, is_on: false, marked_stale: false, should_appear: true, location: { type: "Point", coordinates: [-122.8, 49.2] } },
      { id: 726, name: "Elsewhere", links: { imageDisplay: "//evil.example/726.jpg" }, is_on: true, location: { type: "Point", coordinates: [-122.8, 49.2] } },
    ],
    ids: ["bc-723"],
    first: { name: "Pitt River Road - E: Highway 7B (Mary Hill Bypass), at Pitt River Road, looking east.", url: "https://www.drivebc.ca/images/723.jpg", credit: "DriveBC.ca" },
  },
  {
    source: "wsdot", host: "data.wsdot.wa.gov", at: { lat: 47.61, lng: -122.33 },
    body: { cameras: { items: [
      { id: 9001, url: "https://images.wsdot.wa.gov/nw/005vc16540.jpg", title: "I-5 at Madison St", roadName: "I-5", direction: "N", lat: 47.6085, lon: -122.3295, video: 0 },
      { id: 9002, url: "https://www.seattle.gov/trafficcams/images/x.jpg", title: "City camera, other host", roadName: "City", lat: 47.61, lon: -122.33, video: 0 },
    ] } },
    ids: ["wa-9001"],
    first: { name: "I-5 at Madison St", url: "https://images.wsdot.wa.gov/nw/005vc16540.jpg", credit: "WSDOT" },
  },
  {
    source: "odot", host: "tripcheck.com", at: { lat: 46.19, lng: -123.83 },
    body: { features: [
      { attributes: { cameraId: 277, publishedImageId: 392, filename: "AstoriaUS101MeglerBrNB_pid392.jpg", latitude: 46.18785, longitude: -123.85347, route: "US101 ", title: "US101 at Astoria - ODOT District Office" } },
      { attributes: { cameraId: 277, publishedImageId: 654, filename: "Snake River_pid654.JPG", latitude: 46.25, longitude: -123.84, title: "Spaces in the name" } },
      { attributes: { cameraId: 1, publishedImageId: 1, filename: "../../etc/x.jpg", latitude: 46.2, longitude: -123.84, title: "Path trick" } },
    ] },
    ids: ["or-392", "or-654"], // one camera, two pictures
    first: { name: "US101 at Astoria - ODOT District Office", url: "https://tripcheck.com/RoadCams/cams/AstoriaUS101MeglerBrNB_pid392.jpg", credit: "ODOT TripCheck" },
  },
  {
    source: "iowadot", host: "services.arcgis.com", at: { lat: 41.59, lng: -93.62 },
    body: { features: [
      { attributes: { device_id: 59660426, Desc_: "DM - I-235 @ MM 14.2 (I-80 East Mix)", ImageURL: "https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/dmtv099hd.jpeg", VideoURL: "https://video4.iowadot.gov:8888/ankeny/dmtv099lb/playlist.m3u8", latitude: 41.650262, longitude: -93.575439 } },
      { attributes: { device_id: 59660556, Desc_: "Unavailable", ImageURL: "https://public.carsprogram.org/cameras/IA/cameraunavailable.png", latitude: 41.6, longitude: -93.6 } },
    ] },
    ids: ["ia-dmtv099hd"],
    first: { name: "DM - I-235 @ MM 14.2 (I-80 East Mix)", url: "https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/dmtv099hd.jpeg", credit: "Iowa DOT" },
  },
  {
    source: "toronto", host: "ckan0.cf.opendata.inter.prod-toronto.ca", at: { lat: 43.65, lng: -79.38 },
    body: { type: "FeatureCollection", features: [
      { type: "Feature", properties: { REC_ID: 8001, IMAGEURL: "https://opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/loc8001.jpg", MAINROAD: "YORK ST", CROSSROAD: "BREMNER BLVD / RAPTORS WAY", REFURL1: "http://opendata.toronto.ca/transportation/tmc/rescucameraimages/ComparisonImages/loc8001n.jpg" }, geometry: { type: "MultiPoint", coordinates: [[-79.3813860009273, 43.6431200069527]] } },
      { type: "Feature", properties: { REC_ID: 8002, IMAGEURL: "http://opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/loc8002.jpg", MAINROAD: "HTTP" }, geometry: { type: "MultiPoint", coordinates: [[-79.38, 43.65]] } },
    ] },
    ids: ["to-8001"],
    first: { name: "YORK ST / BREMNER BLVD / RAPTORS WAY", url: "https://opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/loc8001.jpg", credit: "City of Toronto, Open Government Licence - Toronto" },
  },
  {
    source: "austin", host: "data.austintexas.gov", at: { lat: 30.27, lng: -97.74 },
    body: [
      { camera_id: "1", location_name: "830 BLK W RUNDBERG LN (Little Walnut Creek Library, HEB)", camera_status: "TURNED_ON", screenshot_address: "https://cctv.austinmobility.io/image/1.jpg", location: { type: "Point", coordinates: [-97.698158, 30.363686] } },
      { camera_id: "2", location_name: "Off", camera_status: "TURNED_OFF", screenshot_address: "https://cctv.austinmobility.io/image/2.jpg", location: { type: "Point", coordinates: [-97.7, 30.3] } },
    ],
    ids: ["au-1"],
    first: { name: "830 BLK W RUNDBERG LN (Little Walnut Creek Library, HEB)", url: "https://cctv.austinmobility.io/image/1.jpg", credit: "City of Austin Transportation" },
  },
  {
    source: "quebec511", host: "ws.mapserver.transports.gouv.qc.ca", at: { lat: 46.81, lng: -71.21 },
    body: { type: "FeatureCollection", features: [
      { type: "Feature", id: 3998, properties: { IDEcamera: "3998", DescriptionLocalisationFr: "Aut. 540 (direction ouest) à la hauteur du boul. Wilfrid-Hamel", DescriptionLocalisationEn: "Aut. 540 (westward) at boul. Wilfrid-Hamel", URL_FLUX_DONNEE: "https://www.quebec511.info/Carte/Fenetres/FenetreVideo.html?id=3998" }, geometry: { type: "Point", coordinates: [-71.35488, 46.78853] } },
      { type: "Feature", id: 3999, properties: { IDEcamera: "3999", DescriptionLocalisationEn: "Other host", URL_FLUX_DONNEE: "https://www.quebec511.info.evil.example/x" }, geometry: { type: "Point", coordinates: [-71.3, 46.8] } },
    ] },
    ids: ["qc-3998"],
    first: { kind: "link", name: "Aut. 540 (westward) at boul. Wilfrid-Hamel", url: "https://www.quebec511.info/Carte/Fenetres/FenetreVideo.html?id=3998", credit: expect.stringContaining("Québec 511") },
  },
];
// The two keyed lists (QLDTraffic, TDX) have their own tests below.
const QLD_BODY = { type: "FeatureCollection", features: [
  { type: "Feature", geometry: { type: "Point", crs: { type: "name", properties: { name: "EPSG:7844" } }, coordinates: [153.0086975, -27.5551796] }, properties: { id: 1, description: "Archerfield - Ipswich Motorway & Granard Rd - North", image_url: "https://cameras.qldtraffic.qld.gov.au/Metropolitan/Archerfield_Ipswich_Mwy_sth.jpg" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [153.0, -27.5] }, properties: { id: 2, description: "Other host", image_url: "https://evil.example/x.jpg" } },
] };
const BRISBANE = { lat: -27.47, lng: 153.03 };
const TDX_BODY = { UpdateTime: "2026-11-21T01:17:52+08:00", CCTVs: [
  { CCTVID: "CCTV-N1-S-0.000-M", VideoStreamURL: "https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000", PositionLon: 121.735695, PositionLat: 25.1229931, RoadName: "國道1號", RoadDirection: "S", LocationMile: "0K+000" },
  { CCTVID: "CCTV-N1-N-0.500-M", VideoStreamURL: "http://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10001", PositionLon: 121.73, PositionLat: 25.12, RoadName: "國道1號" },
] };
const KEELUNG = { lat: 25.13, lng: 121.74 };
const regionBody = (host: string) =>
  host === "api.qldtraffic.qld.gov.au" ? QLD_BODY : host === "tdx.transportdata.tw" ? TDX_BODY : REGIONS.find((r) => r.host === host)?.body;

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
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (fail.has(u.host)) return new Response("down", { status: 503 });
    // As the real TripCheck answers (2026-11-21): its .js file is not application/json.
    const accept = String((init?.headers as Record<string, string> | undefined)?.Accept ?? "");
    if (u.host === "tripcheck.com" && !accept.includes("*/*")) return new Response("Not Acceptable", { status: 406 });
    if (u.host === "api.tfl.gov.uk") return Response.json(tflBody);
    if (u.host === "api.data.gov.sg") return Response.json(sgBody);
    if (u.host === "static.data.gov.hk") return new Response(hkXml);
    if (u.host === "cwwp2.dot.ca.gov") return Response.json(u.pathname.startsWith("/data/d4/") ? ctD04 : u.pathname.startsWith("/data/d8/") ? ctD08 : { data: [] });
    if (u.host === "www.trafficnz.info") return new Response(nzXml, { headers: { "Content-Type": "application/xml" } });
    if (u.pathname === "/youtube/v3/search") return Response.json(ytSearch);
    if (u.pathname === "/youtube/v3/videos") return Response.json(ytVideos(at));
    if (u.host === "overpass-api.de") return Response.json(osmBody(at));
    if (u.host === "tdx.transportdata.tw" && u.pathname.startsWith("/auth/")) return Response.json({ access_token: "tdx_test_token_abcdef", expires_in: 86400 });
    const region = regionBody(u.host);
    if (region !== undefined) return Response.json(region);
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
    expect(query).toContain("[timeout:3]"); // the server gives up when our own 3 s budget ends
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

  it("(e) OpenStreetMap: the mirrors share one 3 s budget, so a silent Overpass cannot hold the panel for 9 s", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const limits: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      limits.push(ms);
      return new AbortController().signal;
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (!/overpass/.test(url)) return Response.json({ items: [] });
      clock.mockReturnValue(t0 + 2_500); // the first mirror said nothing for 2.5 s
      throw new DOMException("no answer", "TimeoutError");
    });
    const r = await findCameras({ lat: 49.5, lng: 104.5 });
    expect(r.unavailable).toContain("osm");
    // The first mirror may take the whole budget; with under a second left the next one is not asked.
    expect(Math.min(...limits)).toBe(3_000);
    expect(fetchMock.mock.calls.filter(([u]) => /overpass/.test(u))).toHaveLength(1);
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

describe("findCameras regional open-data lists", () => {
  it.each(REGIONS.map((r) => [r.source, r] as const))("%s: allowed cameras only, nearest first, credited, timed out and cached a day", async (_, r) => {
    at = r.at;
    const res = await findCameras(r.at);
    const cams = res.cameras.filter((c) => c.source === r.source);
    expect(cams.map((c) => c.id)).toEqual(r.ids);
    expect(cams[0]).toMatchObject({ kind: "image", ...r.first });
    expect(cams[0].distanceKm).toBeLessThanOrEqual(60);
    expect(cams[0].updatedAt).toBeUndefined(); // rewritten in place: the list time is not the picture's
    if (cams[0].kind === "image") expect(cams[0].thumb).toBe(cams[0].url);
    expect(res.credit).toContain(cams[0].credit);
    expect(res.unavailable).toEqual([]);
    const [, init] = hits(r.host)[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal); // the shared per-source timeout
    expect(init?.redirect).toBe("error");
    await findCameras({ lat: r.at.lat + 0.01, lng: r.at.lng });
    expect(hits(r.host)).toHaveLength(1);
  });

  it("Digitraffic: names the client and asks for gzip, as Fintraffic requests", async () => {
    await findCameras({ lat: 60.17, lng: 24.94 });
    const headers = hits("tie.digitraffic.fi")[0][1]?.headers as Record<string, string>;
    expect(headers["Digitraffic-User"]).toBe("Aspire/1.0");
    expect(headers["Accept-Encoding"]).toBe("gzip");
  });

  it("each list is fetched only near its own region", async () => {
    await findCameras({ lat: 60.17, lng: 24.94 }); // Helsinki: Finland, not Norway's southern box
    expect(hits("ogckart-sn1.atlas.vegvesen.no")).toHaveLength(0);
    await findCameras(ERDENET);
    for (const r of REGIONS.filter((x) => x.source !== "digitraffic-fi")) expect(hits(r.host)).toHaveLength(0);
  });

  it("Austin: only cameras turned on are asked for", async () => {
    await findCameras({ lat: 30.27, lng: -97.74 });
    expect(new URL(hits("data.austintexas.gov")[0][0]).searchParams.get("camera_status")).toBe("TURNED_ON");
  });

  it("ODOT: asks TripCheck for any type, as it needs (406 to a JSON-only Accept)", async () => {
    at = { lat: 45.52, lng: -122.68 }; // Portland
    const r = await findCameras(at);
    expect((hits("tripcheck.com")[0][1]?.headers as Record<string, string>).Accept).toBe("application/json, */*");
    expect(r.unavailable).toEqual([]);
  });

  it("a regional list that fails is named, the rest still show", async () => {
    at = { lat: 49.28, lng: -123.12 };
    fail = new Set(["www.drivebc.ca"]);
    const r = await findCameras(at);
    expect(r.unavailable).toEqual(["drivebc"]);
  });

  it("a regional list that fails rests 10 minutes: named, not asked again meanwhile", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    at = { lat: 49.28, lng: -123.12 };
    fail = new Set(["www.drivebc.ca"]);
    expect((await findCameras(at)).unavailable).toEqual(["drivebc"]);
    fail = new Set();
    clock.mockReturnValue(t0 + 5 * 60_000);
    expect((await findCameras(at)).unavailable).toEqual(["drivebc"]);
    expect(hits("www.drivebc.ca")).toHaveLength(1);
    clock.mockReturnValue(t0 + 11 * 60_000);
    const r = await findCameras(at);
    expect(r.unavailable).toEqual([]);
    expect(r.cameras.some((c) => c.source === "drivebc")).toBe(true);
    expect(hits("www.drivebc.ca")).toHaveLength(2);
  });

  it("a source slower than the shared 10 s deadline is named; its load goes on and fills the cache", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      at = { lat: 49.28, lng: -123.12 };
      let finish!: () => void;
      const slow = new Promise<void>((resolve) => (finish = resolve));
      const normal = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (url, init) => {
        if (new URL(url).host === "www.drivebc.ca") await slow;
        return normal(url, init);
      });
      const pending = findCameras(at);
      await vi.advanceTimersByTimeAsync(10_000);
      const r = await pending;
      expect(r.unavailable).toEqual(["drivebc"]);
      expect(r.cameras.some((c) => c.source === "osm")).toBe(true); // the others still show
      finish();
      const again = await findCameras(at); // joins the load still running: no second fetch
      expect(again.unavailable).toEqual([]);
      expect(again.cameras.some((c) => c.source === "drivebc")).toBe(true);
      expect(hits("www.drivebc.ca")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("QLDTraffic: skipped silently without QLDTRAFFIC_API_KEY", async () => {
    at = BRISBANE;
    const r = await findCameras(BRISBANE);
    expect(hits("api.qldtraffic.qld.gov.au")).toHaveLength(0);
    expect(r.unavailable).toEqual([]);
  });

  it("QLDTraffic: with the key, its own image host only, and the key never in an error", async () => {
    vi.stubEnv("QLDTRAFFIC_API_KEY", "qld_test_key_456");
    at = BRISBANE;
    const r = await findCameras(BRISBANE);
    expect(r.cameras.filter((c) => c.source === "qldtraffic")).toEqual([expect.objectContaining({
      id: "qld-1", name: "Archerfield - Ipswich Motorway & Granard Rd - North", kind: "image",
      url: "https://cameras.qldtraffic.qld.gov.au/Metropolitan/Archerfield_Ipswich_Mwy_sth.jpg", credit: expect.stringContaining("QLDTraffic"),
    })]);
    expect(new URL(hits("api.qldtraffic.qld.gov.au")[0][0]).searchParams.get("apikey")).toBe("qld_test_key_456");
    clearCameraCache();
    fail = new Set(["api.qldtraffic.qld.gov.au"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await findCameras(BRISBANE)).unavailable).toEqual(["qldtraffic"]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("qld_test_key_456");
  });

  it("TDX: skipped silently without both TDX_CLIENT_ID and TDX_CLIENT_SECRET (anonymous calls get 401)", async () => {
    at = KEELUNG;
    expect((await findCameras(KEELUNG)).unavailable).toEqual([]);
    vi.stubEnv("TDX_CLIENT_ID", "tdx-id");
    expect((await findCameras(KEELUNG)).unavailable).toEqual([]);
    expect(hits("tdx.transportdata.tw")).toHaveLength(0);
  });

  it("TDX: a bearer token from the secret (POST body only) with each list load; live streams, no thumbnail, cached a day", async () => {
    at = KEELUNG;
    vi.stubEnv("TDX_CLIENT_ID", "tdx-id");
    vi.stubEnv("TDX_CLIENT_SECRET", "tdx_secret_789");
    const r = await findCameras(KEELUNG);
    const [tokenCall, listCall] = hits("tdx.transportdata.tw");
    expect(new URL(tokenCall[0]).pathname).toBe("/auth/realms/TDXConnect/protocol/openid-connect/token");
    expect(tokenCall[1]?.method).toBe("POST");
    expect(tokenCall[0]).not.toContain("tdx_secret_789");
    expect(String(tokenCall[1]?.body)).toContain("client_secret=tdx_secret_789");
    expect(listCall[0]).not.toContain("tdx_secret_789");
    expect((listCall[1]?.headers as Record<string, string>).Authorization).toBe("Bearer tdx_test_token_abcdef");
    expect(listCall[1]?.redirect).toBe("error");
    const tw = r.cameras.filter((c) => c.source === "tdx-tw");
    expect(tw).toEqual([expect.objectContaining({ // the http stream is dropped
      id: "tw-CCTV-N1-S-0.000-M", name: "國道1號 0K+000 S", kind: "image",
      url: "https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000", credit: expect.stringContaining("Freeway Bureau"),
    })]);
    expect(tw[0].thumb).toBeUndefined(); // an endless MJPEG stream is no thumbnail
    expect(r.unavailable).toEqual([]);
    await findCameras({ lat: 25.14, lng: 121.74 });
    expect(hits("tdx.transportdata.tw")).toHaveLength(2); // token and list once: one cache for both
  });

  it("TDX: a token that fails names Taiwan, and the secret is never logged", async () => {
    at = KEELUNG;
    vi.stubEnv("TDX_CLIENT_ID", "tdx-id");
    vi.stubEnv("TDX_CLIENT_SECRET", "tdx_secret_789");
    fail = new Set(["tdx.transportdata.tw"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await findCameras(KEELUNG)).unavailable).toEqual(["tdx-tw"]);
    expect(hits("tdx.transportdata.tw")).toHaveLength(1); // no list call without a token
    expect(JSON.stringify(log.mock.calls)).not.toContain("tdx_secret_789");
  });

  it("allow-list: each new image host, camera paths only", () => {
    for (const u of [
      "https://weathercam.digitraffic.fi/C0150301.jpg", "https://kamera.atlas.vegvesen.no/api/images/1229019_1",
      "https://www.vegagerdin.is/vgdata/vefmyndavelar/hellisheidi_1.jpg", "https://cameras.qldtraffic.qld.gov.au/Metropolitan/a.jpg",
      "https://www.drivebc.ca/images/723.jpg", "https://images.wsdot.wa.gov/nw/a.jpg", "https://tripcheck.com/RoadCams/cams/a.jpg",
      "https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/a.jpeg", "https://opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/loc8001.jpg",
      "https://cctv.austinmobility.io/image/1.jpg", "https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000",
    ]) expect(safeCameraUrl("image", u)).toBe(u);
    for (const u of [
      "https://kamera.atlas.vegvesen.no/other", "https://www.vegagerdin.is/", "https://www.drivebc.ca/api/webcams/",
      "https://tripcheck.com/Scripts/map/data/cctvinventory.js", "https://opendata.toronto.ca/other/x.jpg", "https://cctv.austinmobility.io/admin",
      "https://cctvn.freeway.gov.tw/other", "http://images.wsdot.wa.gov/nw/a.jpg", "https://video4.iowadot.gov:8888/ankeny/x/playlist.m3u8",
    ]) expect(safeCameraUrl("image", u)).toBeNull();
    expect(safeCameraUrl("embed", "https://weathercam.digitraffic.fi/C0150301.jpg")).toBeNull();
  });
});

describe("YouTube: game streams are not cameras", () => {
  const ID = "CCCCCCCCCCC";
  const run = async (snippet: Record<string, unknown>, search: Record<string, unknown> = { title: snippet.title }) => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/youtube/v3/search") return Response.json({ items: [{ id: { videoId: ID }, snippet: { channelTitle: "Someone", ...search } }] });
      if (u.pathname === "/youtube/v3/videos") return Response.json({ items: [{ id: ID, snippet, recordingDetails: { location: { latitude: ERDENET.lat, longitude: ERDENET.lng } } }] });
      return Response.json({ elements: [] });
    });
    return (await findCameras(ERDENET)).cameras.filter((c) => c.source === "youtube");
  };

  it("asks videos.list for the snippet and the position in one call", async () => {
    await findCameras(ERDENET);
    const videos = fetchMock.mock.calls.filter(([u]) => new URL(u).pathname === "/youtube/v3/videos");
    expect(videos).toHaveLength(1);
    expect(new URL(videos[0][0]).searchParams.get("part")).toBe("snippet,recordingDetails");
  });

  it.each([
    ["GTA RP roleplay", { title: "GTA 5 RP | Los Santos City Life | NoPixel 4.0 LIVE", categoryId: "20" }],
    ["GTA, not tagged as Gaming", { title: "Los Santos traffic cam LIVE 24/7", description: "Grand Theft Auto V roleplay server, street view", categoryId: "22" }],
    ["FiveM in the tags", { title: "Downtown city streets live", tags: ["FiveM", "police"], categoryId: "24" }],
    ["#gtarp hashtag", { title: "Live city patrol #gtarp", categoryId: "24" }],
    ["Euro Truck Simulator", { title: "ETS2 live - driving through the city", categoryId: "22" }],
    ["Cities: Skylines", { title: "Cities: Skylines traffic fix livestream", categoryId: "24" }],
    ["Minecraft city", { title: "Minecraft city build live", categoryId: "28" }],
    ["Microsoft Flight Simulator", { title: "MSFS 2024 live over the city", categoryId: "19" }],
    ["Let's Play", { title: "Let's Play: Watch Dogs Legion street chaos", categoryId: "24" }],
    ["channel name", { title: "City walk live", channelTitle: "Fortnite Daily", categoryId: "19" }],
    ["Russian", { title: "Стрим: игра GTA 5 - город камера", categoryId: "24" }],
    ["Russian, word only", { title: "Прямой эфир: летсплей, город ночью, камера", categoryId: "24" }],
    ["Chinese", { title: "城市 直播 游戏 镜头", categoryId: "24" }],
    ["Traditional Chinese", { title: "遊戲直播 街景攝像", categoryId: "24" }],
    ["German", { title: "Spiel live: Stadt Kamera", categoryId: "24" }],
    ["Mongolian", { title: "Тоглоом шууд: хотын камер", categoryId: "24" }],
    ["no camera word", { title: "Late night talk show LIVE", categoryId: "24" }],
    ["not camera, camaraderie", { title: "Camaraderie live talk", categoryId: "24" }],
    // Seen live near Los Angeles (2026-11-21): 24/7 mixes in the Music category say "city" in the description.
    ["a music mix", { title: "Deep House Mix 2026 - Late Night Drive LA Vibes", description: "Late night drive through the city.", categoryId: "10" }],
    // GTA roleplay spellings and other game worlds dressed up as city cameras.
    ["GTA5RP", { title: "GTA5RP | Los Santos city patrol LIVE", categoryId: "24" }],
    ["GTAVRP", { title: "GTAVRP city life live", categoryId: "24" }],
    ["GTAO", { title: "GTAO city cruise live", categoryId: "24" }],
    ["GTA Online", { title: "GTA Online city cam live", categoryId: "24" }],
    ["GTA VI", { title: "GTA VI city streets live", categoryId: "24" }],
    ["LSPD", { title: "LSPD patrol live | city streets", categoryId: "24" }],
    ["RedM", { title: "RedM | Saint Denis city streets live", categoryId: "24" }],
    ["Watch_Dogs", { title: "Watch_Dogs 2 live: San Francisco city cams", categoryId: "24" }],
    ["BeamNG", { title: "BeamNG.drive live city traffic", categoryId: "24" }],
    ["a game word in the tags", { title: "City streets live", tags: ["gaming"], categoryId: "24" }],
    ["a game word in the channel", { title: "City streets live", channelTitle: "Night Owl Gaming", categoryId: "24" }],
    ["Russian gaming stream", { title: "Игровой стрим: город, камера", categoryId: "24" }],
  ])("drops %s", async (_, snippet) => {
    expect(await run(snippet)).toEqual([]);
  });

  it.each([
    ["Shibuya crossing", { title: "【LIVE】Shibuya Scramble Crossing Live Camera 渋谷スクランブル交差点", categoryId: "19" }],
    ["harbour webcam", { title: "Sydney Harbour Live Webcam 4K", description: "24/7 live view of the harbour", categoryId: "19" }],
    ["Times Square", { title: "Times Square NYC 24/7 Live Stream", description: "Live street cam from Times Square", categoryId: "22" }],
    ["traffic", { title: "I-95 traffic live", categoryId: "2" }],
    ["Russian webcam", { title: "Москва, Красная площадь: веб-камера онлайн", categoryId: "19" }],
    ["German webcam", { title: "Hamburg Hafen live: Webcam am Elbufer", categoryId: "19" }],
    ["Chinese", { title: "台北101 即時影像 直播 鏡頭", categoryId: "19" }],
    ["description only", { title: "Venice live", description: "Live cam on the Grand Canal", categoryId: "19" }],
    ["Beispiel is not Spiel", { title: "Stadt Kamera live, zum Beispiel der Marktplatz", categoryId: "19" }],
    // Words that also mean other things are not game streams.
    ["Apex, NC", { title: "Apex, NC downtown live cam", categoryId: "19" }],
    ["Apex Mountain Resort", { title: "Apex Mountain Resort live webcam", categoryId: "19" }],
    ["a cyberpunk city", { title: "Tokyo Shinjuku live cam - cyberpunk city at night", categoryId: "19" }],
    ["city skylines in the description", { title: "Hong Kong Victoria Harbour live cam", description: "Enjoy great city skylines day and night.", categoryId: "19" }],
    ["gaming in the description", { title: "Las Vegas Strip live cam", description: "The heart of Las Vegas gaming and shows.", categoryId: "19" }],
    ["Twitch in the description", { title: "Venice Grand Canal live cam", description: "Also live on Twitch.", categoryId: "19" }],
    ["warzone in the description", { title: "Kyiv Maidan live cam", description: "A city in a warzone, live.", categoryId: "19" }],
    ["German match day", { title: "Webcam Volksparkstadion live: vor dem Spiel", categoryId: "19" }],
    ["Russian playground", { title: "Веб-камера: детская игровая площадка", categoryId: "19" }],
    ["Olympic Games in the description", { title: "Сочи веб-камера онлайн", description: "Олимпийский парк, где прошли Олимпийские игры 2014.", categoryId: "19" }],
    ["Mongolian playground", { title: "Хүүхдийн тоглоомын талбай шууд камер", categoryId: "19" }],
    ["Sejm RP", { title: "Warszawa kamera na żywo - Sejm RP", categoryId: "19" }],
    ["GTAA airport", { title: "GTAA airport cam live", categoryId: "19" }],
    ["Los Santos, Panama", { title: "Los Santos, Panama live cam", categoryId: "19" }],
    ["Times Square cam", { title: "Times Square live cam", categoryId: "19" }],
    ["Stuttgart", { title: "Stuttgart live cam", categoryId: "19" }],
    // Camera words in more languages.
    ["Japanese", { title: "【LIVE】大阪 道頓堀 ライブカメラ", categoryId: "19" }],
    ["Korean", { title: "서울 광화문 라이브캠", categoryId: "19" }],
    ["Spanish", { title: "Cámara en vivo Plaza Mayor Madrid", categoryId: "19" }],
    ["Portuguese", { title: "Câmera ao vivo Copacabana Rio", categoryId: "19" }],
    ["French", { title: "Caméra en direct - Vieux-Port de Marseille", categoryId: "19" }],
    ["Italian", { title: "Telecamera in diretta Piazza San Marco", categoryId: "19" }],
    // Seen live and dropped before (2026-11-21): Taoyuan airport, a Finnish weather camera.
    ["Taiwanese 即時影像", { title: "TPE 4K桃園國際機場 南跑道觀景台即時影像", categoryId: "19" }],
    ["Finnish compound", { title: "Larukite kelikamera", categoryId: "17" }],
    ["German compound", { title: "Wetterkamera Zugspitze live", categoryId: "19" }],
    ["Polish plural", { title: "Kamery Kraków na żywo", categoryId: "19" }],
  ])("keeps %s", async (_, snippet) => {
    expect(await run(snippet)).toHaveLength(1);
  });

  it("the full videos.list snippet decides, over the short search one", async () => {
    expect(await run({ title: "City live cam", description: "Playing GTA Online with friends", categoryId: "22" }, { title: "City live cam" })).toEqual([]);
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

  it("tells the model Taiwan's freeway images are live streams, only when they are shown", async () => {
    vi.stubEnv("TDX_CLIENT_ID", "tdx-id");
    vi.stubEnv("TDX_CLIENT_SECRET", "tdx_secret_789");
    at = KEELUNG;
    const taiwan = (await findCamerasTool.run({}, ctx({ source: "web", device: { memory: {}, reminders: [], location: KEELUNG } }))) as { note: string };
    expect(taiwan.note).toContain("Taiwan freeway images (MOTC Freeway Bureau) are live MJPEG video streams");
    const erdenet = (await findCamerasTool.run({}, ctx({ source: "web", device: { memory: {}, reminders: [], location: ERDENET } }))) as { note: string };
    expect(erdenet.note).not.toContain("Taiwan");
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
