# Lunch-Match-App — Design (v1)

## Hintergrund

Die Bachelor-Thesis (Repo `Bachelor-Thesis`, siehe `kapitel/04_ergebnisse.tex` und `kapitel/anhang/anforderungen/user-stories/*`) beschreibt das Konzept einer Lunch-Matching-Anwendung für im Homeoffice arbeitende Personen: Sie sollen unabhängig vom Unternehmen andere Personen in ihrer unmittelbaren Umgebung für eine gemeinsame Mittagspause finden, um sozialer Isolation und Bewegungsmangel entgegenzuwirken. Grundlage sind die in den User Stories und Wireframes (`abbildungen/Wireframes/*.png` im Thesis-Repo) dokumentierten Anforderungen.

Dieses Repository enthält die erste funktionierende Ausbaustufe (v1) einer echten, lauffähigen Web-App auf Basis dieses Konzepts. Spätere Ausbaustufen (v2+) ergänzen Gamification, Favoriten und echte Fitness-Tracker-Anbindung.

## Ziel von v1

Eine voll funktionierende Web-App, in der eine Person:

1. anonym (ohne E-Mail/Passwort) ein Konto anlegt,
2. ein Profil mit Standort, beruflichen Angaben und Schritteziel pflegt,
3. andere Personen und Treffpunkte in der Umgebung findet (Liste + Karte, mit Filtern),
4. eine Anfrage sendet (individuell oder per Zufalls-"Match me") und
5. über eine Chat-Ansicht Details abstimmt und das Treffen zu- oder absagt.

**Explizit nicht Teil von v1**: Dashboard/Gamification (Rangliste, Abzeichen, Herausforderungen, Schrittekonto-Historie), Favoriten-Liste, echte Fitness-Tracker-Synchronisation. Diese Bereiche sind in den User Stories (`gamification.tex`, `favoriten.tex`, `schrittekonto.tex`) beschrieben und werden in v2 aufgegriffen.

## Architektur

- **Next.js 14 (App Router) + TypeScript**, ein Projekt für UI und API (Route Handlers unter `app/api/*`). Kein separates Backend.
- **PostgreSQL + Prisma** als Datenhaltung, lokal via Docker Compose (kein externer Cloud-Dienst nötig für Entwicklung).
- **Auth**: NextAuth mit eigenem Credentials-Provider; Account-ID + Recovery-Key übernehmen die Rolle von Benutzername/Passwort. Session als httpOnly-Cookie.
- **Karten & Geodaten**: Leaflet + OpenStreetMap-Tiles fürs Kartenrendering, Nominatim für Geocoding (Adresse/PLZ/Ort → Koordinaten), Overpass API für Treffpunkt-Vorschläge (Restaurants/Cafés inkl. Küche-Tags für vegetarisch/vegan-Filter). Alle drei Dienste sind kostenlos nutzbar und benötigen keinen API-Key.
- Dieses Repo (`lunch-match-app`) ist eigenständig und unabhängig vom Thesis-Repo (`Bachelor-Thesis`); es liegt als Nachbarordner auf derselben Verzeichnisebene.

## Anonyme Identität (Threema-Style)

Beim ersten Öffnen der App generiert der Server:

- eine öffentliche, eindeutige **Account-ID** (z. B. 10 alphanumerische Zeichen), gespeichert im Klartext (dient als Lookup-Schlüssel),
- einen **Recovery-Key** (längerer Zufallsstring, z. B. 24 Zeichen), von dem nur ein bcrypt-Hash gespeichert wird.

Beide Werte werden dem Nutzer **einmalig** angezeigt, mit deutlichem Hinweis, sie sicher zu speichern — der Recovery-Key ist danach nicht mehr abrufbar. Die Person wird direkt eingeloggt (Session-Cookie).

**Wiederherstellung** auf einem neuen Gerät oder nach Cache-Löschen: Eingabe von Account-ID + Recovery-Key in einem "Konto wiederherstellen"-Formular. Der Server sucht den User per `accountId` und prüft den Key gegen `recoveryKeyHash`. Es gibt **keinen** Passwort-Vergessen-Flow — ein verlorener Recovery-Key bedeutet endgültigen Verlust des Kontos; das wird beim Anlegen unmissverständlich kommuniziert.

### Fehlerfälle

- Falsche Account-ID oder falscher Recovery-Key bei der Wiederherstellung → generische Fehlermeldung (kein Hinweis, welcher Teil falsch war, um Enumeration zu vermeiden).
- Verlust von Account-ID oder Recovery-Key → kein Wiederherstellungsweg; Nutzer muss ein neues Konto anlegen.

## Datenmodell (Prisma)

```
User
  id                String   @id @default(cuid())
  accountId         String   @unique
  recoveryKeyHash   String
  alias             String?
  lat               Float?
  lng               Float?
  locationPrecision LocationPrecision?  // EXACT | POSTAL_CODE | CITY
  branche           String?
  brancheVisible    Boolean  @default(false)
  position          String?
  karrierelevel     Karrierelevel?      // ANGESTELLT | MITTLERES_MANAGEMENT | LEITEND | GESCHAEFTSFUEHRUNG
  schritteziel      Int?                // Schritte pro Mittagspause; Default 1000 wenn nicht gesetzt
  createdAt         DateTime @default(now())

MatchRequest
  id                String   @id @default(cuid())
  fromUserId        String
  toUserId          String
  type              MatchType   // MANUAL | MATCH_ME
  status            MatchStatus // OPEN | ACCEPTED | DECLINED
  proposedTimeslot  DateTime?
  meetingPointLat   Float?
  meetingPointLng   Float?
  meetingPointName  String?
  createdAt         DateTime @default(now())

Message
  id                String   @id @default(cuid())
  matchRequestId    String
  senderId          String
  text              String
  createdAt         DateTime @default(now())
```

### Suchradius-Berechnung

Wie in der Thesis (Kap. `Berechnung des Suchradius`) hergeleitet:

- Standardsuchradius ohne Schritteziel: **1.000 Schritte ≙ 732 Meter**.
- Mit gesetztem Schritteziel: `radius_meter = schritteziel × 0,73`.

Diese Formel wird als reine Funktion implementiert und per Unit-Test abgesichert.

## Feature-Flows

### 1. Profil

Formular für Alias, Standort (Adresse/PLZ/Ort, mit Auswahl der Genauigkeitsstufe — analog Thesis-Anforderung, dass nicht jede Person eine exakte Adresse angeben muss), Branche (mit Sichtbarkeits-Toggle "für andere sichtbar"), berufliche Position, Karrierelevel, Schritteziel. Speichern triggert Geocoding der Standortangabe über Nominatim und speichert `lat`/`lng`.

### 2. Match finden

- **Karte** (Leaflet): Marker für andere Personen und Treffpunkte innerhalb des berechneten Suchradius um den eigenen Standort.
- **Ergebnisliste**: gefundene Personen mit Alias, Entfernung (Schritte), sofern freigegeben Branche/Position/Karrierelevel, "Anfragen"-Button.
- **Filter**: Suchradius (aus Schritteziel ableitbar, manuell überschreibbar), Branche, Position, Karrierelevel, gastronomisches Angebot (vegetarisch/vegan, via Overpass-Küche-Tags auf Treffpunkte angewendet).
- **Auswahl-Synchronisierung**: Klick auf Listeneintrag hebt zugehörigen Marker hervor und umgekehrt.
- **Anfragen-Button**: individuelle Nachricht, führt zur Nachrichten-Detailansicht mit vorausgefülltem Empfänger.
- **Match-Me-Button**: sendet automatisch generierte Nachricht ("`Alias` aus der Branche `X` möchte mit dir am `Datum` eine gemeinsame Mittagspause verbringen") an eine zufällige Person aus der aktuell gefilterten Ergebnisliste. Ist die Liste leer, ist der Button deaktiviert (siehe User Story `US:MatchAnfrageZuaellig`, Szenario 2).

### 3. Nachrichten

- **Übersicht**: Liste aller `MatchRequest`s der eigenen Person (gesendet und empfangen), filterbar nach Status (Offen/Zugesagt/Abgesagt).
- **Detail**: Info-Karte der Gegenperson mit Karte des (optional) vorgeschlagenen Treffpunkts, Zusagen-/Absagen-Buttons (setzen `status`), Chat-Verlauf (`Message`-Liste, aufsteigend nach `createdAt`), Formular zum Senden neuer Nachrichten mit Zurücksetzen-Button.
- Aktualisierung des Chats per einfachem Polling (kein WebSocket-Infrastruktur-Aufwand in v1).

## Testing & Fehlerbehandlung

- **Unit-Tests (Vitest)** für: Suchradius-Berechnung, Matching-/Filter-Logik (z. B. Ausschlusskriterien-Vergleich), Identity-Hashing (Erzeugen/Prüfen des Recovery-Keys).
- Fehlerfälle aus den Thesis-User-Stories werden direkt umgesetzt (z. B. leere Ergebnisliste → Match-Me-Button inaktiv; falsche Zugangsdaten bei Wiederherstellung → Fehleranzeige).
- Manuelles Durchklicken der Flows im Dev-Server vor Abschluss der Implementierung; kein automatisiertes E2E in v1.

## Offene Punkte für v2 (bewusst außerhalb des Scopes)

- Dashboard mit Rangliste, Abzeichen, Herausforderungen, Schrittekonto-Historie.
- Favoriten-Liste für bereits getroffene Personen.
- Echte Fitness-Tracker-Anbindung (Schritte-Sync).
