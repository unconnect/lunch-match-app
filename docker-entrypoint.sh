#!/bin/sh
set -eu

# Apply pending migrations before the server accepts traffic.
#
# `migrate deploy` is the production verb: non-interactive, and it will never
# reset the database the way `migrate dev` can when it detects drift. Never
# swap one for the other here.
#
# If it fails, this script exits non-zero and the container dies. That is the
# intended behaviour — a deploy that cannot migrate should stay visibly down
# rather than serve traffic against a schema it does not match.
#
# Invoked through its real path rather than node_modules/.bin/prisma: that
# entry is a symlink whose relative requires do not survive being copied
# between build stages.
echo "==> Applying database migrations"
node /app/node_modules/prisma/build/index.js migrate deploy

# `exec` so node replaces this shell as PID 1 and receives Docker's SIGTERM
# directly. Without it the shell remains PID 1, node never sees the signal, and
# every single redeploy sits out the full stop-grace period before being
# SIGKILLed — a slow, lossy shutdown that looks like a hang.
echo "==> Starting Next.js"
exec node /app/server.js
