# Free government traffic-camera feeds (no key), checked 2026-11-21

All public open data. Credit the publisher next to every image. Cache server-side (lists: 1 day;
images: link directly, they refresh themselves). Only use within the stated radius of each region.

| Region | List endpoint | Format | Notes |
|---|---|---|---|
| London (TfL JamCams) | https://api.tfl.gov.uk/Place/Type/JamCam | JSON array: commonName, lat, lon, additionalProperties[key=imageUrl/videoUrl] | ~900 cams; credit "Transport for London" |
| Singapore (LTA) | https://api.data.gov.sg/v1/transport/traffic-images | JSON items[0].cameras[]: camera_id, image, location{latitude,longitude}, timestamp | ~90 cams; credit "Land Transport Authority" |
| Hong Kong (Transport Department) | https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml | XML: key, region, district, description, easting/northing (HK1980 grid) or lat/lng, url | Images at https://tdcctv.data.one.gov.hk/<key>.JPG; credit "Transport Department, HKSAR" |
| California (Caltrans) | https://cwwp2.dot.ca.gov/data/d{1..12}/cctv/cctvStatusD{01..12}.json | JSON data[].cctv: location{latitude,longitude,locationName,nearbyPlace}, imageData{static{currentImageURL}, streamingVideoURL}, inService | 12 district files; credit "Caltrans" |
| New Zealand (NZTA) | https://www.trafficnz.info/service/traffic/rest/4/cameras/all | XML response/camera: id, description, imageUrl (relative: https://www.trafficnz.info + imageUrl), latitude, longitude | credit "NZ Transport Agency Waka Kotahi" |

## Regional open-data lists (REGIONAL in lib/cameras.ts), checked 2026-11-21

Each is fetched only within 60 km of the box (or boxes) around its own cameras, computed from the
list on 2026-11-21; cached a day per server instance; nearest 12 within 60 km; the shared 10 s
timeout; no redirects. No picture time for any of them (the images are rewritten in place). The
credit string below is shown next to every camera.

| Source (`source`) | List endpoint | Key | Picture | Licence and credit shown |
|---|---|---|---|---|
| Fintraffic Digitraffic weathercams (`digitraffic-fi`) | https://tie.digitraffic.fi/api/weathercam/v1/stations (GeoJSON; sends `Digitraffic-User: Aspire/1.0` and `Accept-Encoding: gzip`, as Digitraffic asks) | none | https://weathercam.digitraffic.fi/{presetId}.jpg, the first preset in collection of each GATHERING station (808 of 809) | CC BY 4.0; "Fintraffic / digitraffic.fi, CC BY 4.0" |
| Statens vegvesen webkamera (`vegvesen-no`) | DATEX 3.1 via the public GeoServer WFS: https://ogckart-sn1.atlas.vegvesen.no/datex_3_1/wfs?...typeNames=datex_3_1:CctvSimple_v2&outputFormat=application/json&srsName=EPSG:4326 | none (the REST DATEX server needs registration; not used) | STILL_IMAGE_URL on kamera.atlas.vegvesen.no/api/images/ only, when STATUS_STILL_IMAGE_AVAILABILITY is videoOrImagesAvailable (893 of 919). Three boxes (south, middle, north), so Sweden and Finland do not download it | NLOD; "Statens vegvesen (NLOD)"; do not distort |
| Vegagerdin / IRCA (`vegagerdin-is`) | https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1 (JSON: Slod, Breidd, Lengd, Skyring, Myndavel) | none | Slod on www.vegagerdin.is/vgdata/vefmyndavelar/ only; the id is the file name (499 views) | CC BY 4.0 per the IRCA data terms; "Icelandic Road and Coastal Administration (IRCA), CC BY 4.0"; no implied endorsement |
| QLDTraffic webcams (`qldtraffic`) | https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=... (GeoJSON, EPSG:7844, the same as WGS84 at this scale) | `QLDTRAFFIC_API_KEY` (QLDTraffic's free key; read from env only, never hardcoded or logged) | image_url on cameras.qldtraffic.qld.gov.au (137) | Queensland Government open data, CC BY 4.0; "QLDTraffic, Department of Transport and Main Roads, CC BY 4.0" |
| DriveBC webcams (`drivebc`) | https://www.drivebc.ca/api/webcams/ (JSON; backs the DriveBC site, not separately documented) | none | https://www.drivebc.ca/images/{id}.jpg when is_on and not marked_stale (1052 of 1072) | BC Open Government Licence; "DriveBC.ca" (dbc_mark) |
| WSDOT highway cameras (`wsdot`) | https://data.wsdot.wa.gov/mobile/Cameras.json (anonymous feed of WSDOT's own app) | none (the documented REST API needs `WSDOT_ACCESS_CODE`; not used yet) | url on images.wsdot.wa.gov only; the few airport and city cameras on other hosts are left out (1627 of 1635) | WSDOT public traveler information; "WSDOT" |
| ODOT TripCheck (`odot`) | https://tripcheck.com/Scripts/map/data/cctvinventory.js (Esri JSON; backs the TripCheck map) | none (the documented API needs `ODOT_TRIPCHECK_KEY`; not used yet) | https://tripcheck.com/RoadCams/cams/{filename}, the file name checked and URL-encoded; the id is publishedImageId (1182) | ODOT public traveler data; "ODOT TripCheck" |
| Iowa DOT (`iowadot`) | ArcGIS Traffic_Cameras_View FeatureServer query, outFields Desc_, ImageURL, latitude, longitude | none | ImageURL on atmsqf.iowadot.gov; the id is the image file name (a rest area has several views). The HLS VideoURL uses port 8888, which the allow-list refuses, so no clip (1257) | Iowa DOT open data; "Iowa DOT" |
| City of Toronto (`toronto`) | CKAN traffic-camera-list-4326.geojson (MultiPoint) | none | IMAGEURL on opendata.toronto.ca/transportation/tmc/rescucameraimages/CameraImages/ (336); the http REFURL reference images are not used | Open Government Licence - Toronto; "City of Toronto, Open Government Licence - Toronto" |
| City of Austin (`austin`) | https://data.austintexas.gov/resource/b4k4-adkb.json?camera_status=TURNED_ON&$limit=2000 (Socrata) | none (an optional app token only raises the rate limit; not used) | screenshot_address on cctv.austinmobility.io/image/ (823) | City of Austin open data terms; "City of Austin Transportation" |
| Quebec 511 (`quebec511`) | MTMD WFS ms:infos_cameras, outputformat geojson, srsName EPSG:4326 | none | Link only: URL_FLUX_DONNEE must start with https://www.quebec511.info/. The viewer page is behind a bot check, so it opens in the person's browser and is never fetched, framed or proxied (683) | Donnees Quebec, CC BY 4.0; "Ministère des Transports et de la Mobilité durable du Québec (Québec 511), CC BY 4.0" |
| Taiwan freeway CCTV via TDX (`tdx-tw`) | https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Freeway?$format=JSON | anonymous, rate-limited per IP (a second check on 2026-11-21 got 401 "Valid API Key Required"; then the source is named as unavailable). Optional `TDX_CLIENT_ID` + `TDX_CLIENT_SECRET` (free registration): a client-credentials token, the secret in the POST body only, the token cached 12 h | VideoStreamURL, a live MJPEG stream that an `<img>` plays, on cctvn.freeway.gov.tw/abs2mjpg/ only | Open Government Data License 1.0 (Taiwan); "MOTC Freeway Bureau via TDX, Open Government Data License 1.0" |

Allow-list additions (lib/tools/camera-types.ts, exact hosts, with a path prefix where the host
serves other things): weathercam.digitraffic.fi, kamera.atlas.vegvesen.no (/api/images/),
www.vegagerdin.is (/vgdata/vefmyndavelar/), cameras.qldtraffic.qld.gov.au, www.drivebc.ca
(/images/), images.wsdot.wa.gov, tripcheck.com (/RoadCams/cams/), atmsqf.iowadot.gov,
opendata.toronto.ca (/transportation/tmc/rescucameraimages/CameraImages/), cctv.austinmobility.io
(/image/), cctvn.freeway.gov.tw (/abs2mjpg/).

Free keys the owner can register for (set the env var and redeploy):
- `QLDTRAFFIC_API_KEY`: QLDTraffic (Queensland). Without it Queensland is skipped silently.
- `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`: TDX (Taiwan), for a quota beyond anonymous calls.

Not implemented (the endpoint answers, but its camera data could not be verified without a key):
Trafikverket Sweden (`TRAFIKVERKET_API_KEY`, CC0), Transport for NSW (`TFNSW_API_KEY`, CC BY 4.0),
Ontario, Alberta and Alaska 511 (`ON511_API_KEY`, `AB511_API_KEY`, `AK511_API_KEY`), New York 511
and other US 511s. The documented keyed APIs of WSDOT (`WSDOT_ACCESS_CODE`) and ODOT
(`ODOT_TRIPCHECK_KEY`) are the better path for documented terms once the owner registers. Windy:
skipped by the owner's decision. Never: Insecam or any list of private or unsecured cameras.

## YouTube live: no game streams

search.list (eventType=live, with a location) is followed by one videos.list call with
`part=snippet,recordingDetails` (1 unit). A stream is shown only when (`isCameraStream`):
- its category is not 20 (Gaming);
- no game word appears, as a whole word, in its title, description, channel name or tags: GTA (GTA V,
  GTA RP, #gtarp), Grand Theft Auto, roleplay, RP, FiveM, NoPixel, Minecraft, Fortnite, Roblox,
  gameplay, gaming, gamer, playthrough, walkthrough, let's play, ETS2, Euro Truck, Cities: Skylines,
  simulator, MSFS, Cyberpunk, Watch Dogs, The Sims, VTuber, stream sniping, speedrun, Twitch,
  Valorant, PUBG, CS2, CS:GO, Apex, Warzone, Call of Duty; Russian игра, игры, игровой, летсплей,
  прохождение; Mongolian тоглоом; German Spiel, Spiele, Videospiel, zocken; Chinese 游戏, 遊戲,
  电竞, 電競;
- its title or description has a camera word: live cam, webcam, cam, camera, CCTV, street, traffic,
  city, panorama, Kamera, камера, веб-камера, 镜头, 鏡頭, 摄像, 攝像, 监控, 監控.
The full videos.list snippet (description, tags, category) is used over search's short one.

## How lib/cameras.ts uses them

- The first five lists are cached per server instance: TfL 1 hour, Singapore 2 minutes (it carries the
  picture time), Hong Kong, Caltrans and NZTA 1 day. Cameras are shown within 60 km, nearest 12 per source.
- Caltrans: a district list is fetched only when the place is within 60 km of that district's
  camera box. The boxes were computed once from the twelve lists (2026-11-21) and live in the code
  (`CALTRANS_SEED`); each loaded list can only widen its box. Rows with `inService` other than
  "true" are left out. `currentImageURL` is the picture; `streamingVideoURL` (HLS .m3u8 on
  wzmedia.dot.ca.gov) becomes the optional clip only when it is https (some D8 rows say http).
  No picture time: the image is rewritten in place and the record time is days or months old.
  If any nearby district list fails, Caltrans is named as unavailable.
- NZTA: fetched only within 60 km of the box around its cameras ([-45.9, 168.66, -36.38, 176.88]).
  Cameras with `offline` or `underMaintenance` "true" are left out (about 70 of 313 on 2026-11-21).
  Nested `journey`, `journeyLeg`, `region` and `way` blocks have their own `id` and `name`, so
  they are removed before reading the camera's. `imageUrl` must be a path ("/camera/60.jpg"),
  joined to https://www.trafficnz.info. Name: "name: description". No picture time.
- Allow-list (lib/tools/camera-types.ts, exact hosts): cwwp2.dot.ca.gov (path /data/ only),
  wzmedia.dot.ca.gov, www.trafficnz.info (path /camera/ only).
