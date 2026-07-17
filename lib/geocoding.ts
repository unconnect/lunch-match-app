export interface GeocodeResult {
  lat: number;
  lng: number;
}

const NOMINATIM_USER_AGENT = "lunch-match-app/0.1 (student project, non-commercial)";

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
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

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
