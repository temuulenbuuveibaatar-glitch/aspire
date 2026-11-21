# Erdenet open city feeds (Орхон ТКХДТ, dedtuv.erdenet.mn)

All public, no auth, checked 2026-11-21. Credit "Орхон ТКХДТ" wherever shown. Poll politely
(server-side cache, plain User-Agent from lib/site.ts). Never call private endpoints:
`/api/transit/nats-creds`, `/api/stream/*`, `/api/parking` (401) are off limits.

| Feed | Endpoint | Shape | Cache |
|---|---|---|---|
| Transit static | GET /api/transit/static | routes, stations ([lng,lat]), routePaths ([lat,lng]) | 6 h |
| Live buses | GET /api/transit/vehicles | [{id,name(plate),lat,lng,speed(m/s),heading,updatedAt}] | 10 s |
| Traffic cameras | GET /api/traffic | [{id,name,lat,lng,vehicleCount,loadLevel LOW/MEDIUM/HIGH,detectedAt}] (16) | 30 s |
| Parking | GET /api/parking/stream (Server-Sent Events, `data: {"lots":[{id,name,total,occupied,available,cameraName,cameraId,lat,lng}]}`) — read the first event and close | 12 lots, 875 places | 60 s |
| Fuel stations | GET /api/fuel-stations | [{id,name,address,organization,logoUrl,lat,lng,active,availability:[{fuelType AI92/AI95/DIESEL/GAS/EURO92,status,availableAt,limitMode,limitValue,updatedAt}],camera,community:{<fuel>:{status,confidence,queueLevel,waitMinutes,totalVotes,updatedAt}}}] (32) | 5 min |
| Site info | GET /api/settings | siteName, phone, address | 1 day |

Pages (embeddable, no X-Frame-Options): /live (26 cameras, video player), /transit, /parking, /fuel.
Camera video is a private stream: show it by embedding https://dedtuv.erdenet.mn/live in an
iframe sheet ("Live cameras by Орхон ТКХДТ"), never by tapping the stream.

Truth rules: show each item's own timestamp/age; fuel "status unknown" when null (31 of 32
stations have no data today); parking counts come from camera vision ("approx.").

## Other Mongolian cities (researched 2026-11-21)

- Ulaanbaatar: the official source is ubtraffic.mn (city Traffic Management Center, ЗХУТ): 43 live cameras,
  closed roads, parking. Not an open feed: every API needs an anonymous session cookie, streams allow only
  their own origin, and viewing is limited to 20 s per camera on purpose. No published reuse terms.
  => Show a "Live cameras" button that OPENS https://ubtraffic.mn in a new tab (do not proxy, scrape or embed
  their streams). In-app camera locations or video need written permission from ЗХУТ (https://ubtraffic.mn/contact).
  UB traffic level: Google Routes traffic readout (already in /api/ambient).
- Darkhan, Murun (Khuvsgul), Tsetserleg (Arkhangai): no public cameras, bus feeds or city data found.
  => Say "no live city data for <city> yet" honestly; buses from Transitous/Google where they exist.
