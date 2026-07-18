import { afterEach, describe, expect, it, vi } from "vitest";
import { findMeetingPoints } from "@/lib/meetingPoints";

describe("findMeetingPoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Overpass elements to MeetingPoint objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { id: 123, lat: 52.521, lon: 13.406, tags: { name: "Cafe Sonne", cuisine: "vegetarian" } },
          { id: 456, lat: 52.522, lon: 13.407, tags: {} },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000);

    expect(result).toEqual([
      { id: "123", name: "Cafe Sonne", lat: 52.521, lng: 13.406, cuisine: "vegetarian" },
      { id: "456", name: "Unbenannter Treffpunkt", lat: 52.522, lng: 13.407, cuisine: undefined },
    ]);
  });

  it("includes a diet filter clause in the query when a cuisine filter is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000, "vegan");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toContain('"diet:vegan"="yes"');
  });

  it("returns an empty list when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    expect(await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000)).toEqual([]);
  });
});
