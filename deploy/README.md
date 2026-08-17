# Deployment — Lunch Match

Release-getriebene Pipeline: GitHub-Release → Images auf GHCR → Portainer-Redeploy auf
dem Raspberry Pi (arm64) hinter SWAG. App-URL: https://lunchmatch.nikolasreuber.de

Gleiches Muster wie TrackFoundry, mit drei Unterschieden: der Stack ist zustandsbehaftet
(Postgres), er braucht Secrets, und er sichert die Datenbank auf zwei USB-Platten.

## Fluss

1. Ein GitHub-Release wird veröffentlicht (Tag z. B. `v0.1.0`).
2. `.github/workflows/release-deploy.yml` baut zwei arm64-Images und pusht sie als
   `<tag>` und `latest`:
   - `ghcr.io/unconnect/lunch-match-app` — die Next.js-App
   - `ghcr.io/unconnect/lunch-match-backup` — der `pg_dump`-Sidecar
3. Die Action ruft den Portainer-Stack-Webhook → Portainer zieht `:latest` neu und
   deployt den Stack neu.
4. Beim Start des `web`-Containers läuft `prisma migrate deploy`, danach erst der Server
   (`docker-entrypoint.sh`). Schlägt die Migration fehl, startet der Container nicht —
   das ist beabsichtigt.
5. SWAG proxyt `lunchmatch.nikolasreuber.de` auf den Container; Cloudflare steht davor.

## Einmalige Einrichtung

### 1. USB-Platten mounten

Beide Platten werden dauerhaft und über ihre UUID gemountet, nicht über `/dev/sdX` —
die Gerätenamen können sich beim Booten vertauschen.

```bash
lsblk -f                                    # UUIDs ablesen
sudo mkdir -p /mnt/backup-primary /mnt/backup-mirror
sudo blkid                                  # UUID + Dateisystem bestätigen
```

In `/etc/fstab` je eine Zeile ergänzen (ext4 empfohlen; `nofail`, damit der Pi auch
ohne angesteckte Platte bootet):

```
PARTUUID="304c90fb-9143-fc4e-ae4e-850288de2ba5" /mnt/backup-primary ext4 defaults,nofail,noatime  0  2
PARTUUID="164bac53-13a7-b645-95a2-e2478d7153d2" /mnt/backup-mirror ext4 defaults,nofail,noatime  0  2
```

```bash
sudo mount -a
```

Danach auf **jeder** Platte die Markerdatei anlegen:

```bash
sudo touch /mnt/backup-primary/.lunchmatch-backup-volume
sudo touch /mnt/backup-mirror/.lunchmatch-backup-volume
```

Warum: Docker legt das Quellverzeichnis eines Bind-Mounts an, wenn es fehlt. Ist eine
Platte nicht gemountet, wäre `/mnt/backup-primary` also ein gewöhnliches leeres
Verzeichnis auf der SD-Karte — die Backups würden „erfolgreich" dorthin laufen und die
Karte volllaufen lassen. Der Sidecar verweigert den Dienst, solange die Markerdatei
fehlt, und protokolliert das.

### 2. Cloudflare

DNS-Record `lunchmatch` anlegen (analog den bestehenden Subdomains, proxied).

### 3. SWAG

`deploy/swag/lunchmatch.subdomain.conf` in den SWAG-`proxy-confs`-Ordner kopieren
(Dateiname beibehalten). Die Subdomain `lunchmatch` muss von einem Zertifikat abgedeckt
sein: entweder per Wildcard-Cert (`*.nikolasreuber.de`) oder — bei subdomain-basierten
Certs — `lunchmatch` zur SWAG-`SUBDOMAINS`-Env hinzufügen. Danach SWAG **neu starten**;
bei frisch angefordertem Cert kann es **zwei Neustarts** dauern, bis das Zertifikat
greift (sonst schließt SWAG die Verbindung → curl bekommt „empty reply").

### 4. Portainer-Stack

>>> NEXT 2. deploy

Neuen Stack `lunch-match` anlegen, Inhalt aus `deploy/docker-compose.yml` in den
Web-Editor kopieren, und unter *Environment variables* setzen:

>>> NEXT 1. create env vars

| Variable | Wert |
|---|---|
| `POSTGRES_USER` | `lunchmatch` |
| `POSTGRES_PASSWORD` | selbst erzeugen, z. B. `openssl rand -base64 24` |
| `POSTGRES_DB` | `lunchmatch` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `BACKUP_PRIMARY_PATH` | `/mnt/backup-primary/lunchmatch` |
| `BACKUP_MIRROR_PATH` | `/mnt/backup-mirror/lunchmatch` |

`AUTH_SECRET` niemals nachträglich ändern, ohne es zu wollen: alle bestehenden Sessions
werden damit ungültig.

Deployen. Die Container bleiben zunächst down, bis das erste Release Images
veröffentlicht hat — das ist erwartet.

### 5. Webhook

Für den Stack einen Webhook aktivieren **mit** „Re-pull image"; die Webhook-URL
kopieren.

### 6. GitHub-Secret

Im Repo unter *Settings → Secrets and variables → Actions* das Secret
`PORTAINER_WEBHOOK_URL` = diese URL setzen.

### 7. GHCR public

Nach dem ersten Release-Lauf **beide** GHCR-Packages (`lunch-match-app` und
`lunch-match-backup`, unter *github.com/unconnect?tab=packages*) auf **public** stellen,
damit Portainer ohne Login pullt. Danach den Webhook einmal erneut auslösen.

### 8. Demo-Daten einspielen (einmalig)

Die Datenbank ist nach dem ersten Deploy migriert, aber leer. Die Demo-Konten aus
`lib/demoAccounts.ts` werden **einmalig und von Hand** eingespielt — niemals aus dem
Entrypoint oder der Pipeline, denn `db:seed` **löscht vorher alle** Nutzer,
Match-Anfragen und Nachrichten.

Der `db`-Container veröffentlicht Port 5433 nur auf dem Loopback-Interface des Pi. Vom
eigenen Rechner also per SSH-Tunnel:

```bash
# Terminal 1 — Tunnel offen halten
ssh -N -L 55432:127.0.0.1:5433 <pi-host>

# Terminal 2 — im Repo
DATABASE_URL="postgresql://lunchmatch:<POSTGRES_PASSWORD>@127.0.0.1:55432/lunchmatch" \
  npm run db:seed
```

Zwei Sicherungen greifen dabei: Das Skript bricht ab, wenn `APP_ENV`/`NODE_ENV` auf
`production` steht, **und** wenn die Datenbank Konten enthält, die nicht aus dem Seed
stammen (also echte Besucher:innen). Beides lässt sich mit `SEED_FORCE=yes`
überstimmen — bitte nur bewusst.

## Release ausführen

Auf GitHub ein Release veröffentlichen (Tag setzen, „Publish release"). Der Rest läuft
automatisch.

## Rollback

In Portainer die Images im Stack auf feste Tags setzen
(`ghcr.io/unconnect/lunch-match-app:vX.Y.Z`) und neu deployen.

**Achtung:** Migrationen laufen nur vorwärts. Ein Rollback der App auf eine ältere
Version rollt das Datenbankschema *nicht* zurück. Wenn das Release eine Migration
enthielt, die die ältere App nicht verträgt, ist der Weg zurück ein Restore aus dem
Backup — nicht ein Image-Downgrade.

## Backups

Der `backup`-Sidecar erzeugt beim Start und danach alle 24 h einen gzip-komprimierten
`pg_dump` nach `/backup/primary` und kopiert ihn nach `/backup/mirror`.
Aufbewahrung: 30 Tage primär, 180 Tage auf der Spiegelplatte.

```bash
docker logs lunchmatch-backup            # Läuft es? Was wurde geschrieben?
ls -lht /mnt/backup-primary/lunchmatch   # Liegen die Dumps da?
```

Geschrieben wird immer erst auf einen `.partial`-Namen und danach umbenannt. Ein
abgebrochener Lauf oder eine gezogene Platte hinterlässt daher höchstens eine
`.partial`-Datei, nie ein halbes Backup unter einem echten Namen.

### Restore

```bash
docker stop lunchmatch                   # nichts darf während des Restores schreiben
docker exec -it lunchmatch-backup restore.sh          # listet verfügbare Backups
docker exec -it -e CONFIRM=yes lunchmatch-backup \
  restore.sh /backup/primary/lunchmatch-<timestamp>.sql.gz
docker start lunchmatch
```

Ein Restore sollte mindestens einmal geprobt werden, solange noch keine echten Daten
drin sind. Ein ungetestetes Backup ist kein Backup.

## Lokaler Test (ohne öffentliches DNS)

```bash
# Läuft der Container + liefert er aus (genau der Weg, den SWAG intern nimmt):
docker exec swag curl -sI http://lunchmatch:3000/

# Volle SWAG-Route inkl. TLS vom LAN:
curl --resolve lunchmatch.nikolasreuber.de:443:<PI_LAN_IP> \
  https://lunchmatch.nikolasreuber.de/ -sI
```

Ein Host-Port-Mapping am App-Container ist **nicht** nötig — SWAG erreicht ihn
containerintern über `swag_default` per Name.

## Bekannte Stolpersteine

- **Prisma-Engine und Architektur.** Die Images werden auf amd64 gebaut und laufen auf
  arm64. Das geht nur, weil `prisma/schema.prisma` per `binaryTargets` explizit die
  arm64-Engine mitgenerieren lässt. Bricht der Container beim Start mit einem Engine-
  oder Plattformfehler ab, sind die beiden `--platform=$BUILDPLATFORM`-Flags im
  `Dockerfile` zu entfernen — dann baut alles nativ unter Emulation, langsamer, aber
  unempfindlich.
- **`AUTH_TRUST_HOST`.** Ohne dieses Flag lehnt NextAuth v5 den von SWAG
  weitergereichten Host-Header ab. Das Symptom sieht nach kaputten Cookies aus, nicht
  nach einem Konfigurationsfehler.
- **`public/`.** Das Repo hat aktuell kein `public/`-Verzeichnis. Kommt eines dazu,
  braucht das `Dockerfile` eine eigene `COPY`-Zeile dafür — Next tracet es nicht in den
  Standalone-Build hinein.
