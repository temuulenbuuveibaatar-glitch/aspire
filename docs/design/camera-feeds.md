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

Need a free key (skip unless the owner provides one): Ontario 511, Alberta 511, New York 511, other US 511s, Taiwan TDX, Windy.

## How lib/cameras.ts uses them

- All five lists are cached per server instance: TfL 1 hour, Singapore 2 minutes (it carries the
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
