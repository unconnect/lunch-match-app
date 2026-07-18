import type { Coordinates } from "@/lib/geo";

export interface MeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cuisine?: string;
}

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: { name?: string; cuisine?: string };
}

const OVERPASS_USER_AGENT = "lunch-match-app/0.1 (student project, non-commercial)";

// Unlike lib/geocoding.ts (Nominatim, which mandates a 1 req/s throttle),
// this client deliberately has no rate limiting. Overpass is only called
// once per discrete user action (a "find a match" page load), not per
// keystroke, so there is no risk of hammering the API the way an
// autocomplete-style caller could. Do not add a throttle here without
// re-checking that assumption.

export async function findMeetingPoints(
  origin: Coordinates,
  radiusMeters: number,
  cuisineFilter?: "vegetarian" | "vegan"
): Promise<MeetingPoint[]> {
  const dietClause = cuisineFilter ? `["diet:${cuisineFilter}"="yes"]` : "";
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"restaurant|cafe"]${dietClause}(around:${radiusMeters},${origin.lat},${origin.lng});
    );
    out body;
  `;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": OVERPASS_USER_AGENT },
      body: query,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { elements?: OverpassElement[] };

    return (data.elements ?? [])
      .filter((element) => {
        const valid = Number.isFinite(element.lat) && Number.isFinite(element.lon);
        if (!valid) {
          console.error("findMeetingPoints skipped element with invalid coordinates", { element });
        }
        return valid;
      })
      .map((element) => ({
        id: String(element.id),
        name: element.tags?.name ?? "Unbenannter Treffpunkt",
        lat: element.lat,
        lng: element.lon,
        cuisine: element.tags?.cuisine,
      }));
  } catch (error) {
    console.error("findMeetingPoints failed", { origin, radiusMeters, error });
    return [];
  }
}
