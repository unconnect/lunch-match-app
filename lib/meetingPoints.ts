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

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };

  return (data.elements ?? []).map((element) => ({
    id: String(element.id),
    name: element.tags?.name ?? "Unbenannter Treffpunkt",
    lat: element.lat,
    lng: element.lon,
    cuisine: element.tags?.cuisine,
  }));
}
