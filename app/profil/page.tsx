// app/profil/page.tsx
"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  profileSchema,
  type ProfileInput,
  locationPrecisionValues,
  karrierelevelValues,
} from "@/lib/validation/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProfileResponse {
  alias: string | null;
  locationQuery: string | null;
  locationPrecision: (typeof locationPrecisionValues)[number] | null;
  branche: string | null;
  brancheVisible: boolean;
  position: string | null;
  karrierelevel: (typeof karrierelevelValues)[number] | null;
  schritteziel: number | null;
}

const precisionLabels: Record<(typeof locationPrecisionValues)[number], string> = {
  EXACT: "Genaue Adresse",
  POSTAL_CODE: "Nur Postleitzahl",
  CITY: "Nur Ort",
};

const karrierelevelLabels: Record<(typeof karrierelevelValues)[number], string> = {
  ANGESTELLT: "Angestellt",
  MITTLERES_MANAGEMENT: "Mittleres Management",
  LEITEND: "Leitender Angestellter",
  GESCHAEFTSFUEHRUNG: "Geschäftsführung",
};

export default function ProfilPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Profil konnte nicht geladen werden.");
      return res.json();
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      alias: "",
      locationQuery: "",
      locationPrecision: "CITY",
      branche: "",
      brancheVisible: false,
      position: "",
      karrierelevel: undefined,
      schritteziel: undefined,
    },
  });

  useEffect(() => {
    if (!data) return;
    reset({
      alias: data.alias ?? "",
      locationQuery: data.locationQuery ?? "",
      locationPrecision: data.locationPrecision ?? "CITY",
      branche: data.branche ?? "",
      brancheVisible: data.brancheVisible,
      position: data.position ?? "",
      karrierelevel: data.karrierelevel ?? undefined,
      schritteziel: data.schritteziel ?? undefined,
    });
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileInput) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Profil konnte nicht gespeichert werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-6">Lädt…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="alias">Alias</Label>
              <Input id="alias" {...register("alias")} />
              {errors.alias && <p className="text-sm text-destructive">{errors.alias.message}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="locationQuery">Standort (Adresse, PLZ oder Ort)</Label>
              <Input
                id="locationQuery"
                {...register("locationQuery")}
                placeholder="z. B. Musterstraße 1, 12345 Musterstadt"
              />
              {errors.locationQuery && (
                <p className="text-sm text-destructive">{errors.locationQuery.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="locationPrecision">Genauigkeit</Label>
              <select
                id="locationPrecision"
                {...register("locationPrecision")}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {locationPrecisionValues.map((value) => (
                  <option key={value} value={value}>
                    {precisionLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="branche">Branche</Label>
              <Input id="branche" {...register("branche")} />
            </div>

            <Controller
              control={control}
              name="brancheVisible"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="brancheVisible"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <Label htmlFor="brancheVisible" className="font-normal">
                    Branche für andere sichtbar machen
                  </Label>
                </div>
              )}
            />

            <div className="flex flex-col gap-1">
              <Label htmlFor="position">Berufliche Position</Label>
              <Input id="position" {...register("position")} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="karrierelevel">Karrierelevel</Label>
              <select
                id="karrierelevel"
                {...register("karrierelevel")}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Keine Angabe</option>
                {karrierelevelValues.map((value) => (
                  <option key={value} value={value}>
                    {karrierelevelLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="schritteziel">Schritteziel pro Mittagspause</Label>
              <Input
                id="schritteziel"
                type="number"
                {...register("schritteziel")}
                placeholder="Standard: 1000"
              />
              {errors.schritteziel && (
                <p className="text-sm text-destructive">{errors.schritteziel.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? "Wird gespeichert…" : "Speichern"}
            </Button>

            {mutation.isSuccess && <p className="text-sm text-accent">Profil gespeichert.</p>}
            {mutation.isError && (
              <p className="text-sm text-destructive">{mutation.error?.message}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
