// app/nachrichten/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DELETED_USER_ALIAS } from "@/lib/accountDeletion";

interface MatchRequestSummary {
  id: string;
  status: "OPEN" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
  type: "MANUAL" | "MATCH_ME";
  createdAt: string;
  counterpartAlias: string | null;
  counterpartDeleted: boolean;
}

const statusLabels: Record<MatchRequestSummary["status"], string> = {
  OPEN: "Offen",
  ACCEPTED: "Zugesagt",
  DECLINED: "Abgesagt",
  WITHDRAWN: "Zurückgezogen",
};

// Badge only ships default/secondary/outline variants (no destructive) — see
// components/ui/badge.tsx — so DECLINED/WITHDRAWN both map to "secondary"
// rather than reaching for a hardcoded color class.
const statusBadgeVariant: Record<MatchRequestSummary["status"], "default" | "secondary" | "outline"> = {
  OPEN: "outline",
  ACCEPTED: "default",
  DECLINED: "secondary",
  WITHDRAWN: "secondary",
};

const tabs = [
  { value: "", label: "Alle" },
  { value: "OPEN", label: "Offen" },
  { value: "ACCEPTED", label: "Zugesagt" },
  { value: "DECLINED", label: "Abgesagt" },
  { value: "WITHDRAWN", label: "Zurückgezogen" },
];

export default function NachrichtenPage() {
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery<MatchRequestSummary[]>({
    queryKey: ["match-requests", status],
    queryFn: async () => {
      const query = status ? `?status=${status}` : "";
      const res = await fetch(`/api/match-requests${query}`);
      if (!res.ok) throw new Error("Nachrichten konnten nicht geladen werden.");
      return res.json();
    },
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Nachrichten</h1>
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status}>
          {isLoading && <p>Lädt…</p>}
          {!isLoading && data?.length === 0 && <p className="text-muted-foreground">Keine Nachrichten.</p>}
          <div className="flex flex-col gap-3">
            {data?.map((mr) => (
              <Link key={mr.id} href={`/nachrichten/${mr.id}`}>
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>
                      {mr.counterpartDeleted
                        ? DELETED_USER_ALIAS
                        : mr.counterpartAlias ?? "Teilnehmende Person"}
                    </CardTitle>
                    <Badge variant={statusBadgeVariant[mr.status]}>{statusLabels[mr.status]}</Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {new Date(mr.createdAt).toLocaleDateString("de-DE")}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
