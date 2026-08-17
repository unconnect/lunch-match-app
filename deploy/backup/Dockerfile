# syntax=docker/dockerfile:1

# Based on the same Postgres major version as the server it dumps. pg_dump
# refuses to dump from a server newer than itself, so these two must be bumped
# together — if you move the db service to postgres:17, move this too.
FROM postgres:16-bookworm

COPY --chmod=0755 backup.sh /usr/local/bin/backup.sh
COPY --chmod=0755 restore.sh /usr/local/bin/restore.sh

# Overrides the Postgres image's own entrypoint: this container is a client,
# it never starts a database of its own.
ENTRYPOINT ["/usr/local/bin/backup.sh"]
