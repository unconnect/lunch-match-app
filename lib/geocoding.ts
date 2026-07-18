export interface GeocodeResult {
  lat: number;
  lng: number;
}

const NOMINATIM_USER_AGENT = "lunch-match-app/0.1 (student project, non-commercial)";

// Nominatim's usage policy caps requests at 1/second. We serialize all
// requests through a shared promise chain so concurrent callers queue up
// instead of racing a plain "time since last request" check (which two
// concurrent callers could both pass).
const MIN_REQUEST_INTERVAL_MS = 1000;
let lastRequestTime = 0;
let requestQueue: Promise<void> = Promise.resolve();

function waitForRateLimitSlot(): Promise<void> {
  const scheduled = requestQueue.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL_MS - now);
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
    lastRequestTime = Date.now();
  });
  requestQueue = scheduled;
  return scheduled;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  try {
    await waitForRateLimitSlot();

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Array<{ lat: string; lon: string }>;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  } catch (error) {
    console.error("geocodeAddress failed", { query, error });
    return null;
  }
}
