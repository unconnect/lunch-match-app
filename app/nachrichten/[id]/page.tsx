// app/nachrichten/[id]/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { metersToSteps } from "@/lib/searchRadius";
import { DEFAULT_OVERLAP_TOLERANCE_STEPS } from "@/lib/meetingSuggestions";

const SingleMarkerMap = dynamic(() => import("./SingleMarkerMap").then((m) => m.SingleMarkerMap), { ssr: false });

type MatchRequestStatus = "OPEN" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

interface MatchRequestDetail {
  id: string;
  status: MatchRequestStatus;
  type: "MANUAL" | "MATCH_ME";
  counterpartAlias: string | null;
  meetingPointName: string | null;
  meetingPointLat: number | null;
  meetingPointLng: number | null;
  // Recipient only: may accept/decline while OPEN.
  canRespond: boolean;
  // Sender only: may withdraw their own request while OPEN.
  canWithdraw: boolean;
}

interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

interface MeetingSuggestion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceOwnMeters: number;
  distanceCounterpartMeters: number;
}

type SuggestionReason = null | "counterpart-no-location" | "no-overlap" | "none-found";

interface MeetingSuggestionsResponse {
  suggestions: MeetingSuggestion[];
  reason: SuggestionReason;
}

const suggestionEmptyNote: Record<Exclude<SuggestionReason, null>, string> = {
  "counterpart-no-location": "Die andere Person hat noch keinen Standort hinterlegt.",
  "no-overlap":
    "Eure Radien überlappen sich nicht. Erhöhe die Toleranz oder gib einen Treffpunkt frei ein.",
  "none-found": "Im gemeinsamen Bereich wurden keine Orte gefunden.",
};

// Once a request has left OPEN there is nothing left to negotiate: the
// meeting-point proposal form, the accept/decline/withdraw buttons, and the
// message composer would all act on a conversation that is already closed.
// Keep past messages and the meeting point visible (for reference), but hide
// every control that implies the conversation is still live.
const isClosed = (status: MatchRequestStatus) => status === "DECLINED" || status === "WITHDRAWN";

const closedStatusNote: Record<"DECLINED" | "WITHDRAWN", string> = {
  DECLINED: "Diese Anfrage wurde abgesagt. Der Chat ist geschlossen.",
  WITHDRAWN: "Diese Anfrage wurde zurückgezogen. Der Chat ist geschlossen.",
};

const meetingPointSchema = z.object({ meetingPointQuery: z.string().min(1).max(200) });
const messageSchema = z.object({ text: z.string().min(1).max(2000) });

export default function NachrichtenDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [toleranceSteps, setToleranceSteps] = useState(String(DEFAULT_OVERLAP_TOLERANCE_STEPS));
  const debouncedToleranceSteps = useDebouncedValue(toleranceSteps, 350);

  const { data: matchRequest, isLoading } = useQuery<MatchRequestDetail>({
    queryKey: ["match-request", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/match-requests/${params.id}`);
      if (!res.ok) throw new Error("Nicht gefunden.");
      return res.json();
    },
    // Poll the request itself, not just the messages: the counterpart's
    // accept/decline (or the sender's own withdraw from another tab) is a
    // status change on this same resource, and without this the other side
    // would only see it after a manual reload. Same interval as messages so
    // both stay in sync together.
    refetchInterval: 4000,
  });

  const { data: messages } = useQuery<MessageItem[]>({
    queryKey: ["match-request-messages", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/match-requests/${params.id}/messages`);
      if (!res.ok) throw new Error("Nachrichten konnten nicht geladen werden.");
      return res.json();
    },
    refetchInterval: 4000,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "ACCEPTED" | "DECLINED" | "WITHDRAWN") => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status konnte nicht aktualisiert werden.");
      return res.json();
    },
    onSuccess: () => {
      setStatusError(null);
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
    },
    onError: () => setStatusError("Status konnte nicht aktualisiert werden."),
  });

  const meetingPointForm = useForm<z.infer<typeof meetingPointSchema>>({
    resolver: zodResolver(meetingPointSchema),
  });
  const meetingPointMutation = useMutation({
    mutationFn: async (values: z.infer<typeof meetingPointSchema>) => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Treffpunkt konnte nicht gespeichert werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
      meetingPointForm.reset();
    },
  });

  const closedForSuggestions = matchRequest ? isClosed(matchRequest.status) : true;
  const suggestionsQuery = useQuery<MeetingSuggestionsResponse>({
    queryKey: ["meeting-suggestions", params.id, debouncedToleranceSteps],
    enabled: !closedForSuggestions,
    queryFn: async () => {
      const res = await fetch(
        `/api/match-requests/${params.id}/meeting-suggestions?toleranceSteps=${encodeURIComponent(debouncedToleranceSteps)}`
      );
      if (!res.ok) throw new Error("Vorschläge konnten nicht geladen werden.");
      return res.json();
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async (suggestion: MeetingSuggestion) => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingPoint: { name: suggestion.name, lat: suggestion.lat, lng: suggestion.lng },
        }),
      });
      if (!res.ok) throw new Error("Treffpunkt konnte nicht übernommen werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
    },
  });

  const messageForm = useForm<z.infer<typeof messageSchema>>({ resolver: zodResolver(messageSchema) });
  const sendMessageMutation = useMutation({
    mutationFn: async (values: z.infer<typeof messageSchema>) => {
      const res = await fetch(`/api/match-requests/${params.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Nachricht konnte nicht gesendet werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request-messages", params.id] });
      messageForm.reset();
    },
  });

  if (isLoading || !matchRequest) return <main className="p-6">Lädt…</main>;

  const ownId = session?.user?.id;
  const closed = isClosed(matchRequest.status);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Treffen mit {matchRequest.counterpartAlias ?? "Teilnehmende Person"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Treffpunkt</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {matchRequest.meetingPointLat != null && matchRequest.meetingPointLng != null ? (
            <>
              <p>{matchRequest.meetingPointName}</p>
              <SingleMarkerMap
                lat={matchRequest.meetingPointLat}
                lng={matchRequest.meetingPointLng}
                label={matchRequest.meetingPointName ?? ""}
              />
            </>
          ) : (
            <p className="text-muted-foreground">Noch kein Treffpunkt festgelegt.</p>
          )}
          {!closed && (
            <>
              <div className="flex flex-col gap-2 border-b pb-3">
                <p className="font-medium">Vorschläge in eurer Nähe</p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tolerance-steps">Toleranz (Schritte)</Label>
                  <Input
                    id="tolerance-steps"
                    type="number"
                    min="0"
                    value={toleranceSteps}
                    onChange={(event) => setToleranceSteps(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ein höherer Wert vergrößert die Reichweite beider Personen, sodass mehr Orte infrage kommen.
                  </p>
                </div>
                {suggestionsQuery.isLoading && (
                  <p className="text-sm text-muted-foreground">Lädt Vorschläge…</p>
                )}
                {suggestionsQuery.isError && (
                  <p className="text-sm text-destructive">
                    Vorschläge konnten nicht geladen werden.
                  </p>
                )}
                {suggestionsQuery.data && suggestionsQuery.data.reason && (
                  <p className="text-sm text-muted-foreground">
                    {suggestionEmptyNote[suggestionsQuery.data.reason]}
                  </p>
                )}
                {suggestionsQuery.data?.suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm">{suggestion.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Du: {metersToSteps(suggestion.distanceOwnMeters)} Schritte · Andere:{" "}
                        {metersToSteps(suggestion.distanceCounterpartMeters)} Schritte
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => applySuggestionMutation.mutate(suggestion)}
                      disabled={applySuggestionMutation.isPending}
                    >
                      Übernehmen
                    </Button>
                  </div>
                ))}
                {applySuggestionMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(applySuggestionMutation.error as Error).message}
                  </p>
                )}
              </div>
              <form
                onSubmit={meetingPointForm.handleSubmit((values) => meetingPointMutation.mutate(values))}
                className="flex gap-2"
              >
                <Input placeholder="Treffpunkt vorschlagen…" {...meetingPointForm.register("meetingPointQuery")} />
                <Button type="submit" disabled={meetingPointMutation.isPending}>
                  Vorschlagen
                </Button>
              </form>
              {meetingPointMutation.isError && (
                <p className="text-sm text-destructive">{(meetingPointMutation.error as Error).message}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!closed && matchRequest.canRespond && matchRequest.status === "OPEN" && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => statusMutation.mutate("DECLINED")} disabled={statusMutation.isPending}>
            Absagen
          </Button>
          <Button onClick={() => statusMutation.mutate("ACCEPTED")} disabled={statusMutation.isPending}>
            Zusagen
          </Button>
        </div>
      )}
      {!closed && matchRequest.canWithdraw && matchRequest.status === "OPEN" && (
        <div>
          <Button
            variant="outline"
            onClick={() => statusMutation.mutate("WITHDRAWN")}
            disabled={statusMutation.isPending}
          >
            Zurückziehen
          </Button>
        </div>
      )}
      {statusError && <p className="text-sm text-destructive">{statusError}</p>}
      {closed && <p className="text-sm text-muted-foreground">{closedStatusNote[matchRequest.status as "DECLINED" | "WITHDRAWN"]}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Nachrichten</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {messages?.map((message) => {
            const isOwn = ownId != null && message.senderId === ownId;
            return (
              <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}
                >
                  {message.text}
                </div>
              </div>
            );
          })}
          {!closed && (
            <form
              onSubmit={messageForm.handleSubmit((values) => sendMessageMutation.mutate(values))}
              className="flex flex-col gap-2"
            >
              <Textarea placeholder="Nachricht…" {...messageForm.register("text")} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => messageForm.reset()}>
                  Zurücksetzen
                </Button>
                <Button type="submit" disabled={sendMessageMutation.isPending}>
                  Absenden
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
