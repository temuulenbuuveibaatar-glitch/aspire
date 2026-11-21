// Loads the Google Maps JavaScript API once (dynamic bootstrap: one script tag, then importLibrary).
// No npm dependency, so the few types the app uses are declared here.
// Resolves to null when the browser key is missing, the script fails, or Google rejects the key.

export interface LatLng { lat: number; lng: number }
export interface Listener { remove(): void }
export interface GOverlay { setMap(map: GMap | null): void }
export interface GMap {
  panTo(p: LatLng): void;
  getZoom(): number | undefined;
  setZoom(z: number): void;
}
export interface GMarker extends GOverlay {
  setPosition(p: LatLng): void;
  setIcon(icon: object | string): void;
  addListener(event: "click", fn: () => void): Listener;
}
export interface MapsApi {
  Map: new (el: HTMLElement, opts: object) => GMap;
  TrafficLayer: new () => GOverlay;
  TransitLayer: new () => GOverlay;
  Polyline: new (opts: object) => GOverlay;
  Marker: new (opts: object) => GMarker;
  Point: new (x: number, y: number) => object;
  SymbolPath: { CIRCLE: number };
  importLibrary(name: string): Promise<unknown>;
}

type MapsWindow = Window & {
  google?: { maps?: MapsApi };
  gm_authFailure?: () => void;
  __aspireMapsReady?: () => void;
};

let loading: Promise<MapsApi | null> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** Calls `fn` when Google rejects the key (wrong referrer, API off). Returns an unsubscribe. */
export function onMapsAuthFailure(fn: () => void): () => void {
  if (authFailed) fn();
  authListeners.add(fn);
  return () => void authListeners.delete(fn);
}

export function loadGoogleMaps(language?: string): Promise<MapsApi | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key || typeof window === "undefined" || authFailed) return Promise.resolve(null);
  return (loading ??= inject(key, language).catch(() => {
    loading = null; // a later mount may retry (e.g. after going back online)
    return null;
  }));
}

function inject(key: string, language?: string): Promise<MapsApi> {
  const w = window as MapsWindow;
  w.gm_authFailure = () => {
    authFailed = true;
    authListeners.forEach((f) => f());
  };
  return new Promise<void>((resolve, reject) => {
    if (w.google?.maps?.importLibrary) return resolve();
    const params = new URLSearchParams({ key, v: "weekly", loading: "async", callback: "__aspireMapsReady" });
    if (language) params.set("language", language);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = () => {
      s.remove();
      reject(new Error("Google Maps could not load"));
    };
    w.__aspireMapsReady = () => resolve();
    document.head.append(s);
  }).then(async () => {
    const maps = w.google!.maps!;
    await Promise.all([maps.importLibrary("maps"), maps.importLibrary("marker")]);
    return maps;
  });
}
