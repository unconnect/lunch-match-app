// app/match-finden/page.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { karrierelevelValues } from "@/lib/validation/profile";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { RequestDialog } from "./RequestDialog";

const MapView = dynamic(() => import("./MapView").then((mod) => mod.MapView), { ssr: false });

// How long to wait, after the user stops typing in a free-text filter,
// before that value feeds a query key and fires a request. Keeps typing
// itself instant (inputs stay bound to the raw state) while collapsing a
// burst of keystrokes into a single network request. See the comment atop
// lib/meetingPoints.ts for why this matters for Overpass specifically.
const FILTER_DEBOUNCE_MS = 350;

interface CandidatePerson {
  id: string;
  alias: string | null;
  distanceMeters: number;
  distanceSteps: number;
  branche: string | null;
  position: string | null;
  karrierelevel: (typeof karrierelevelValues)[number] | null;
  lat: number;
  lng: number;
  // Id of an existing active (OPEN/ACCEPTED) request with this person, in
  // either direction — null if none. Non-null means "already requested": not
  // re-requestable, links to the existing conversation instead.
  activeRequestId: string | null;
}

interface MeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface CandidatesResponse {
  radiusMeters: number;
  origin: { lat: number; lng: number };
  people: CandidatePerson[];
}

interface MeetingPointsResponse {
  radiusMeters: number;
  meetingPoints: MeetingPoint[];
}

interface ApiError extends Error {
  status?: number;
}

const karrierelevelLabels: Record<(typeof karrierelevelValues)[number], string> = {
  ANGESTELLT: "Angestellt",
  MITTLERES_MANAGEMENT: "Mittleres Management",
  LEITEND: "Leitender Angestellter",
  GESCHAEFTSFUEHRUNG: "Geschäftsführung",
};

const selectClassName =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// A 4xx response (e.g. "Profil unvollständig: Standort fehlt." for a
// brand-new account) will never succeed by retrying, so don't: retrying
// just delays the error UI for several seconds and, observed during manual
// verification, can leave the query stuck in the transient gap where
// isLoading is false but neither data nor error is set yet, rendering
// nothing at all. Only retry on retryable (network/5xx) failures.
function retryUnlessClientError(failureCount: number, err: ApiError) {
  if (err.status && err.status >= 400 && err.status < 500) return false;
  return failureCount < 3;
}

export default function MatchFindenPage() {
  const router = useRouter();
  const [branche, setBranche] = useState("");
  const [position, setPosition] = useState("");
  const [karrierelevel, setKarrierelevel] = useState("");
  const [kueche, setKueche] = useState("");
  const [radiusOverride, setRadiusOverride] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<CandidatePerson | null>(null);

  // Only these debounced values feed query keys — the inputs themselves
  // stay bound to the raw (non-debounced) state above, so typing remains
  // instant.
  const debouncedBranche = useDebouncedValue(branche, FILTER_DEBOUNCE_MS);
  const debouncedPosition = useDebouncedValue(position, FILTER_DEBOUNCE_MS);
  const debouncedRadiusOverride = useDebouncedValue(radiusOverride, FILTER_DEBOUNCE_MS);

  // People and meeting points are fetched as two separate queries against
  // two separate routes. Meeting points depend only on origin, radius, and
  // the cuisine filter — never on the people filters (Branche, Position,
  // Karrierelevel) — so this split means narrowing by Karrierelevel, for
  // instance, never re-triggers the (comparatively slow, rate-limited)
  // Overpass call behind the meeting-points route.
  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    error: candidatesError,
  } = useQuery<CandidatesResponse, ApiError>({
    queryKey: ["match-candidates", debouncedBranche, debouncedPosition, karrierelevel, debouncedRadiusOverride],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (debouncedBranche) searchParams.set("branche", debouncedBranche);
      if (debouncedPosition) searchParams.set("position", debouncedPosition);
      if (karrierelevel) searchParams.set("karrierelevel", karrierelevel);
      if (debouncedRadiusOverride) searchParams.set("radius", debouncedRadiusOverride);

      const res = await fetch(`/api/match/candidates?${searchParams.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body.error === "string" ? body.error : "Suche fehlgeschlagen.";
        const err: ApiError = new Error(message);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    retry: retryUnlessClientError,
  });

  const {
    data: meetingPointsData,
    isLoading: meetingPointsLoading,
    error: meetingPointsError,
  } = useQuery<MeetingPointsResponse, ApiError>({
    queryKey: ["match-meeting-points", kueche, debouncedRadiusOverride],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (kueche) searchParams.set("kueche", kueche);
      if (debouncedRadiusOverride) searchParams.set("radius", debouncedRadiusOverride);

      const res = await fetch(`/api/match/meeting-points?${searchParams.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body.error === "string" ? body.error : "Treffpunkte konnten nicht geladen werden.";
        const err: ApiError = new Error(message);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    retry: retryUnlessClientError,
  });

  const people = useMemo(() => candidatesData?.people ?? [], [candidatesData]);
  const meetingPoints = useMemo(() => meetingPointsData?.meetingPoints ?? [], [meetingPointsData]);

  // People who haven't already been requested — the pool "Match me" draws from,
  // and what gates its enabled state. Someone already asked must not receive a
  // second automatic request.
  const requestablePeople = useMemo(() => people.filter((p) => !p.activeRequestId), [people]);

  // Markers carry a plain alreadyRequested flag so the map can style them
  // distinctly without knowing about request ids.
  const mapPeople = useMemo(
    () => people.map((p) => ({ id: p.id, alias: p.alias, lat: p.lat, lng: p.lng, alreadyRequested: !!p.activeRequestId })),
    [people]
  );

  const matchMeMutation = useMutation({
    mutationFn: async () => {
      if (requestablePeople.length === 0) throw new Error("Keine anfragbaren Personen im Suchradius gefunden.");
      const random = requestablePeople[Math.floor(Math.random() * requestablePeople.length)];
      const res = await fetch("/api/match-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: random.id,
          type: "MATCH_ME",
          message: "möchte mit dir eine gemeinsame Mittagspause verbringen.",
        }),
      });
      if (!res.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => router.push(`/nachrichten/${created.id}`),
  });

  // The people-candidates query is the one that gates the page: it carries
  // the origin the map centers on and the "Standort fehlt" 400 that a
  // brand-new account hits. Meeting points load independently and degrade
  // gracefully (see below) so a flaky Overpass response never blocks the
  // core people/matching flow.
  if (candidatesLoading) return <main className="p-6">Lädt…</main>;

  if (candidatesError) {
    // A brand-new account has no lat/lng yet, so the API responds 400 with
    // "Profil unvollständig: Standort fehlt." — that is the exact state a
    // just-created account is in, so point the user at the fix instead of
    // just showing the raw error text.
    const isMissingLocation = candidatesError.status === 400;
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <p className="text-destructive">{candidatesError.message}</p>
        {isMissingLocation && (
          <Button asChild>
            <Link href="/profil">Zum Profil</Link>
          </Button>
        )}
      </main>
    );
  }

  // Defense in depth: TanStack Query's isLoading (isPending && isFetching)
  // can be momentarily false without data or error being set yet (e.g. in
  // the gap between retry attempts). Never render a blank page for that —
  // fall back to the same loading message rather than null.
  if (!candidatesData) return <main className="p-6">Lädt…</main>;

  return (
    <main className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-4">
        <h2 className="font-semibold">Filter</h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="branche-filter">Branche</Label>
          <Input
            id="branche-filter"
            value={branche}
            onChange={(event) => setBranche(event.target.value)}
            placeholder="z. B. IT"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="position-filter">Berufliche Position</Label>
          <Input
            id="position-filter"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="z. B. Entwicklerin"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="karrierelevel-filter">Karrierelevel</Label>
          <select
            id="karrierelevel-filter"
            value={karrierelevel}
            onChange={(event) => setKarrierelevel(event.target.value)}
            className={selectClassName}
          >
            <option value="">Alle</option>
            {karrierelevelValues.map((value) => (
              <option key={value} value={value}>
                {karrierelevelLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="kueche-filter">Gastronomisches Angebot</Label>
          <select
            id="kueche-filter"
            value={kueche}
            onChange={(event) => setKueche(event.target.value)}
            className={selectClassName}
          >
            <option value="">Egal</option>
            <option value="vegetarian">Vegetarisch</option>
            <option value="vegan">Vegan</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="radius-filter">Suchradius (Meter)</Label>
          <Input
            id="radius-filter"
            type="number"
            min="0"
            value={radiusOverride}
            onChange={(event) => setRadiusOverride(event.target.value)}
            placeholder={`Standard: ${Math.round(candidatesData.radiusMeters)} m`}
          />
        </div>
        <Button
          onClick={() => matchMeMutation.mutate()}
          disabled={requestablePeople.length === 0 || matchMeMutation.isPending}
        >
          Match me
        </Button>
        {matchMeMutation.isError && (
          <p className="text-sm text-destructive">{(matchMeMutation.error as Error).message}</p>
        )}
      </aside>

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Match finden</h1>
        <MapView
          origin={candidatesData.origin}
          people={mapPeople}
          meetingPoints={meetingPoints}
          selectedId={selectedId}
          onSelectPerson={setSelectedId}
        />
        {meetingPointsLoading && <p className="text-xs text-muted-foreground">Lädt Treffpunkte…</p>}
        {meetingPointsError && (
          <p className="text-xs text-muted-foreground">
            Treffpunkte konnten nicht geladen werden. Personen in deiner Nähe sind trotzdem sichtbar.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {people.length === 0 && <p className="text-muted-foreground">Keine Personen im Suchradius gefunden.</p>}
          {people.map((person) => (
            <Card
              key={person.id}
              className={person.id === selectedId ? "border-primary" : undefined}
              onClick={() => setSelectedId(person.id)}
            >
              <CardHeader>
                <CardTitle>{person.alias ?? "Teilnehmende Person"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {person.distanceSteps} Schritte entfernt
                {person.branche && ` · ${person.branche}`}
                {person.position && ` · ${person.position}`}
              </CardContent>
              <CardFooter>
                {person.activeRequestId ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" disabled>
                      <Check className="mr-1 h-4 w-4" /> Bereits angefragt
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/nachrichten/${person.activeRequestId}`}>Nachricht öffnen</Link>
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setRequestTarget(person)}>
                    Anfragen
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {requestTarget && (
        <RequestDialog
          person={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSent={(id) => router.push(`/nachrichten/${id}`)}
        />
      )}
    </main>
  );
}
