// app/match-finden/MapView.tsx
"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineDistanceMeters } from "@/lib/geo";

// Leaflet's default marker icon paths don't resolve under Next.js's bundler; point them at the CDN instead.
// (Nothing below uses L.Icon.Default any more — every marker gets its own
// divIcon — but this stays in case a future marker falls back to it.)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// A real run can return thousands of meeting points against a handful of
// participants (observed: 4370 vs. 2). Participants are what the user is
// actually choosing between, so they get a distinct, prominent marker;
// meeting points are deliberately small and muted so they recede instead
// of burying the people. Colours come from the app's own theme tokens
// (see app/globals.css) rather than new ad-hoc colours: --primary (the
// warm amber/terracotta accent) for participants, --accent (green) for the
// user's own origin so it reads as a third, unrelated marker, and
// --muted-foreground for meeting points.
const PARTICIPANT_SIZE = 26;
const PARTICIPANT_SIZE_SELECTED = 34;
const MEETING_POINT_SIZE = 10;
const ORIGIN_SIZE = 26;

function squareIcon(size: number, className: string) {
  return L.divIcon({
    className: "",
    html: `<div class="h-full w-full ${className}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Participants use the warm --primary marker. A participant the current user
// has already requested is instead drawn in --accent (green) with a check
// glyph, so "already asked" reads at a glance on the map — distinct from both
// a still-requestable participant (amber) and a meeting point (small, muted).
function participantIcon(selected: boolean, alreadyRequested: boolean) {
  const size = selected ? PARTICIPANT_SIZE_SELECTED : PARTICIPANT_SIZE;
  const fill = alreadyRequested ? "bg-accent" : "bg-primary";
  const ring = selected ? (alreadyRequested ? "ring-4 ring-accent/30" : "ring-4 ring-primary/30") : "";
  const border = selected
    ? "border-foreground"
    : alreadyRequested
      ? "border-accent-foreground"
      : "border-primary-foreground";
  const check = alreadyRequested
    ? '<span class="text-[11px] font-bold leading-none text-accent-foreground">✓</span>'
    : "";
  return L.divIcon({
    className: "",
    html: `<div class="flex h-full w-full items-center justify-center rounded-full border-2 shadow-md ${fill} ${border} ${ring}">${check}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const meetingPointIcon = squareIcon(MEETING_POINT_SIZE, "rounded-full border border-background bg-muted-foreground/70");

const originIcon = squareIcon(ORIGIN_SIZE, "rotate-45 rounded-md border-2 border-background bg-accent shadow-lg");

// Rendering every returned meeting point (potentially thousands) is both a
// perf risk and, per the finding this fixes, a usability one — it's what
// buried the participant markers in the first place. Cap how many render,
// nearest-first, and say so on screen rather than truncating silently.
const MAX_MEETING_POINTS_SHOWN = 300;

export interface MapPerson {
  id: string;
  alias: string | null;
  lat: number;
  lng: number;
  alreadyRequested?: boolean;
}

export interface MapMeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MapViewProps {
  origin: { lat: number; lng: number };
  people: MapPerson[];
  meetingPoints: MapMeetingPoint[];
  selectedId: string | null;
  onSelectPerson: (id: string) => void;
}

function RecenterOnOrigin({ origin }: { origin: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([origin.lat, origin.lng], map.getZoom());
  }, [origin, map]);
  return null;
}

export function MapView({ origin, people, meetingPoints, selectedId, onSelectPerson }: MapViewProps) {
  const visibleMeetingPoints = useMemo(() => {
    const sorted = [...meetingPoints].sort(
      (a, b) => haversineDistanceMeters(origin, a) - haversineDistanceMeters(origin, b)
    );
    return sorted.slice(0, MAX_MEETING_POINTS_SHOWN);
  }, [meetingPoints, origin]);
  const hiddenMeetingPointsCount = meetingPoints.length - visibleMeetingPoints.length;

  return (
    <div className="flex flex-col gap-2">
      <MapContainer center={[origin.lat, origin.lng]} zoom={15} className="h-80 w-full rounded-lg">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnOrigin origin={origin} />
        <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
          <Popup>Dein Standort</Popup>
        </Marker>
        {visibleMeetingPoints.map((point) => (
          <Marker key={point.id} position={[point.lat, point.lng]} icon={meetingPointIcon}>
            <Popup>{point.name}</Popup>
          </Marker>
        ))}
        {people.map((person) => (
          <Marker
            key={person.id}
            position={[person.lat, person.lng]}
            icon={participantIcon(person.id === selectedId, person.alreadyRequested ?? false)}
            eventHandlers={{ click: () => onSelectPerson(person.id) }}
          >
            <Popup>
              {person.alias ?? "Teilnehmende Person"}
              {person.alreadyRequested ? " · bereits angefragt" : ""}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {hiddenMeetingPointsCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Nur die nächsten {MAX_MEETING_POINTS_SHOWN} von {meetingPoints.length} Treffpunkten werden angezeigt.
        </p>
      )}
    </div>
  );
}
