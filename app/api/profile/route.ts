// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { profileSchema } from "@/lib/validation/profile";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({
    alias: user.alias,
    locationQuery: user.locationLabel,
    locationPrecision: user.locationPrecision,
    branche: user.branche,
    brancheVisible: user.brancheVisible,
    position: user.position,
    karrierelevel: user.karrierelevel,
    schritteziel: user.schritteziel,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const geocoded = await geocodeAddress(parsed.data.locationQuery);
  if (!geocoded) {
    return NextResponse.json(
      { error: "Standort konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
      { status: 422 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      alias: parsed.data.alias,
      locationLabel: parsed.data.locationQuery,
      lat: geocoded.lat,
      lng: geocoded.lng,
      locationPrecision: parsed.data.locationPrecision,
      branche: parsed.data.branche || null,
      brancheVisible: parsed.data.brancheVisible,
      position: parsed.data.position || null,
      karrierelevel: parsed.data.karrierelevel || null,
      schritteziel: parsed.data.schritteziel ?? null,
    },
  });

  return NextResponse.json({ id: updated.id });
}
