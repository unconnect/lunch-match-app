// app/match-finden/MapView.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon paths don't resolve under Next.js's bundler; point them at the CDN instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapPerson {
  id: string;
  alias: string | null;
  lat: number;
  lng: number;
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
  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={15} className="h-80 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterOnOrigin origin={origin} />
      <Marker position={[origin.lat, origin.lng]}>
        <Popup>Dein Standort</Popup>
      </Marker>
      {people.map((person) => (
        <Marker
          key={person.id}
          position={[person.lat, person.lng]}
          eventHandlers={{ click: () => onSelectPerson(person.id) }}
          opacity={selectedId && selectedId !== person.id ? 0.6 : 1}
        >
          <Popup>{person.alias ?? "Teilnehmende Person"}</Popup>
        </Marker>
      ))}
      {meetingPoints.map((point) => (
        <Marker key={point.id} position={[point.lat, point.lng]}>
          <Popup>{point.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
