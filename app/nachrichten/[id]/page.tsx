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
import { orderSuggestionsIntoBatches, SUGGESTION_BATCH_SIZE } from "@/lib/meetingSuggestionsPaging";
import { deriveNegotiationState, type Proposal } from "@/lib/meetingPointNegotiation";
import { mergeTimeline } from "@/lib/timeline";

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
  proposals: Proposal[];
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

const proposalStatusLabel: Record<Proposal["status"], string> = {
  PENDING: "wartet auf Antwort",
  ACCEPTED: "angenommen",
  REJECTED: "abgelehnt",
  SUPERSEDED: "überholt",
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
  const { data: session, status: sessionStatus } = useSession();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [toleranceSteps, setToleranceSteps] = useState(String(DEFAULT_OVERLAP_TOLERANCE_STEPS));
  const debouncedToleranceSteps = useDebouncedValue(toleranceSteps, 350);
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [visibleCount, setVisibleCount] = useState(SUGGESTION_BATCH_SIZE);

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

  // Proposing replaces the old instant-apply: a suggestion pick sends a
  // structured point, the free-text field sends a query to geocode. Either
  // creates a PENDING proposal the counterpart must answer.
  const proposeMutation = useMutation({
    mutationFn: async (
      input: { name: string; lat: number; lng: number } | { query: string }
    ) => {
      const res = await fetch(`/api/match-requests/${params.id}/meeting-point-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Vorschlag konnte nicht gesendet werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
      meetingPointForm.reset();
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (input: { proposalId: string; action: "accept" | "reject" }) => {
      const res = await fetch(
        `/api/match-requests/${params.id}/meeting-point-proposals/${input.proposalId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: input.action }),
        }
      );
      if (!res.ok) throw new Error("Antwort konnte nicht gespeichert werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
    },
  });

  const closedForSuggestions = matchRequest ? isClosed(matchRequest.status) : true;
  const suggestionsQuery = useQuery<MeetingSuggestionsResponse>({
    queryKey: ["meeting-suggestions", params.id, debouncedToleranceSteps],
    enabled: suggestionsRequested && !closedForSuggestions,
    queryFn: async () => {
      const res = await fetch(
        `/api/match-requests/${params.id}/meeting-suggestions?toleranceSteps=${encodeURIComponent(debouncedToleranceSteps)}`
      );
      if (!res.ok) throw new Error("Vorschläge konnten nicht geladen werden.");
      return res.json();
    },
  });

  const loadSuggestions = () => {
    setShuffleSeed(Date.now());
    setVisibleCount(SUGGESTION_BATCH_SIZE);
    setSuggestionsRequested(true);
  };

  // Both "Schließen" and any tolerance edit return to the collapsed button
  // state and disable the query; the next load re-fetches with the current
  // tolerance and a fresh shuffle.
  const resetSuggestions = () => {
    setSuggestionsRequested(false);
    setVisibleCount(SUGGESTION_BATCH_SIZE);
  };

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

  // Wait for the session too: it races the match-request query, and every
  // "is this mine?" decision below (proposals and messages alike) reads the
  // viewer id. Rendering before it resolves shows the wrong actor's controls.
  if (isLoading || !matchRequest || sessionStatus === "loading")
    return <main className="p-6">Lädt…</main>;

  const ownId = session?.user?.id ?? null;
  const closed = isClosed(matchRequest.status);
  const negotiation = deriveNegotiationState(
    matchRequest.proposals,
    matchRequest.meetingPointLat != null && matchRequest.meetingPointLng != null,
    ownId
  );
  const counterpartLabel = matchRequest.counterpartAlias ?? "Die andere Person";

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
              {negotiation.headerState === "pending-awaiting-you" && negotiation.pendingProposal && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-sm">
                    <span className="font-medium">{counterpartLabel}</span> schlägt{" "}
                    <span className="font-medium">{negotiation.pendingProposal.name}</span> vor.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        respondMutation.mutate({ proposalId: negotiation.pendingProposal!.id, action: "reject" })
                      }
                      disabled={respondMutation.isPending}
                    >
                      Ablehnen
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({ proposalId: negotiation.pendingProposal!.id, action: "accept" })
                      }
                      disabled={respondMutation.isPending}
                    >
                      Zusagen
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    …oder mach unten einen Gegenvorschlag.
                  </p>
                </div>
              )}
              {negotiation.headerState === "pending-awaiting-them" && negotiation.pendingProposal && (
                <p className="text-sm text-muted-foreground">
                  Dein Vorschlag <span className="font-medium">{negotiation.pendingProposal.name}</span> wartet
                  auf eine Antwort.
                </p>
              )}
              {negotiation.canPropose && (
                <>
              <div className="flex flex-col gap-2 border-b pb-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Vorschläge in eurer Nähe</p>
                  {suggestionsRequested && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetSuggestions}>
                      Schließen
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tolerance-steps">Toleranz (Schritte)</Label>
                  <Input
                    id="tolerance-steps"
                    type="number"
                    min="0"
                    value={toleranceSteps}
                    onChange={(event) => {
                      setToleranceSteps(event.target.value);
                      resetSuggestions();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ein höherer Wert vergrößert die Reichweite beider Personen, sodass mehr Orte infrage kommen.
                  </p>
                </div>

                {!suggestionsRequested && (
                  <Button type="button" variant="outline" onClick={loadSuggestions}>
                    Lade 10 Vorschläge
                  </Button>
                )}

                {suggestionsRequested && (
                  <>
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
                    {suggestionsQuery.data &&
                      orderSuggestionsIntoBatches(
                        suggestionsQuery.data.suggestions,
                        shuffleSeed,
                        visibleCount
                      ).map((suggestion) => {
                        const isApplied =
                          matchRequest.meetingPointLat === suggestion.lat &&
                          matchRequest.meetingPointLng === suggestion.lng;
                        return (
                          <div
                            key={suggestion.id}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                              isApplied && "bg-muted"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{suggestion.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Du: {metersToSteps(suggestion.distanceOwnMeters)} Schritte · Andere:{" "}
                                {metersToSteps(suggestion.distanceCounterpartMeters)} Schritte
                              </span>
                            </div>
                            {isApplied ? (
                              <span className="text-xs font-medium text-muted-foreground">Übernommen</span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  proposeMutation.mutate({
                                    name: suggestion.name,
                                    lat: suggestion.lat,
                                    lng: suggestion.lng,
                                  })
                                }
                                disabled={proposeMutation.isPending}
                              >
                                Vorschlagen
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    {suggestionsQuery.data &&
                      visibleCount < suggestionsQuery.data.suggestions.length && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setVisibleCount((c) => c + SUGGESTION_BATCH_SIZE)}
                        >
                          Weitere 10 laden
                        </Button>
                      )}
                    {proposeMutation.isError && (
                      <p className="text-sm text-destructive">
                        {(proposeMutation.error as Error).message}
                      </p>
                    )}
                  </>
                )}
              </div>
              <form
                onSubmit={meetingPointForm.handleSubmit((values) =>
                  proposeMutation.mutate({ query: values.meetingPointQuery })
                )}
                className="flex gap-2"
              >
                <Input placeholder="Treffpunkt vorschlagen…" {...meetingPointForm.register("meetingPointQuery")} />
                <Button type="submit" disabled={proposeMutation.isPending}>
                  Vorschlagen
                </Button>
              </form>
                </>
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
          {mergeTimeline(messages ?? [], matchRequest.proposals).map((entry) => {
            if (entry.kind === "message") {
              const isOwn = ownId != null && entry.message.senderId === ownId;
              return (
                <div key={`m-${entry.id}`} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                      isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}
                  >
                    {entry.message.text}
                  </div>
                </div>
              );
            }
            const p = entry.proposal;
            const isOwn = ownId != null && p.proposedById === ownId;
            const who = isOwn ? "Du" : counterpartLabel;
            return (
              <div key={`p-${entry.id}`} className="flex justify-center">
                <div className="rounded-lg border px-3 py-2 text-center text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{who}</span> schlägt{" "}
                  <span className="font-medium text-foreground">{p.name}</span> vor · {proposalStatusLabel[p.status]}
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
