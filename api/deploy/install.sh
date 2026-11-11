#!/bin/sh
# Installs or updates the System Designer sign-in service from this checkout. Run as root on the server: sh api/deploy/install.sh
# First run: creates the sdapi user, the data folder, /etc/systemdesigner-api/env with a random SESSION_SECRET (never printed)
# and empty provider settings. Later runs replace the code and restart; they never touch the settings file or the database.
# The Caddy block goes to /etc/caddy/sites-pending only; the live Caddy config is not changed.
set -eu

SRC=$(cd "$(dirname "$0")/../.." && pwd)
DEST=/srv/systemdesigner-api
DATA=/var/lib/systemdesigner-api
ETC=/etc/systemdesigner-api
NODE=$(command -v node)
[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || { echo "Node 24 or newer is needed." >&2; exit 1; }

# A system user with no login shell owns the service.
id sdapi >/dev/null 2>&1 || useradd --system --user-group --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin sdapi

# Code: the service plus the game modules it replays results with. Tests and local data stay behind.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
for d in api account sim catalog content compete; do cp -R "$SRC/$d" "$STAGE/$d"; done
mkdir "$STAGE/core"
cp "$SRC/core/countries.js" "$SRC/core/feedback-contract.js" "$STAGE/core/"
rm -rf "$STAGE/api/test" "$STAGE/api/data"
printf '{ "private": true, "type": "module" }\n' > "$STAGE/package.json"
install -d -m 755 "$DEST"
rsync -a --delete "$STAGE"/ "$DEST"/
chown -R sdapi:sdapi "$DEST"
find "$DEST" -type d -exec chmod 755 {} +
find "$DEST" -type f -exec chmod 644 {} +

# Data folder, private to the service.
install -d -o sdapi -g sdapi -m 700 "$DATA" "$DATA/backups"

# Settings: written once. Client ids and the GitHub secret start empty; the session secret is random and never shown.
install -d -o root -g sdapi -m 750 "$ETC"
if [ ! -f "$ETC/env" ]; then
  (
    umask 077
    {
      echo "NODE_ENV=production"
      echo "HOST=127.0.0.1"
      echo "PORT=8791"
      echo "DB_PATH=$DATA/systemdesigner.db"
      printf 'SESSION_SECRET=%s\n' "$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
      echo "GOOGLE_CLIENT_ID="
      echo "GITHUB_CLIENT_ID="
      echo "GITHUB_CLIENT_SECRET="
      echo "DEV=0"
      echo "AUTH_FAKE=0"
    } > "$ETC/env"
  )
fi
chown root:sdapi "$ETC/env"
chmod 640 "$ETC/env"

# Units.
for u in systemdesigner-api.service systemdesigner-api-backup.service systemdesigner-api-backup.timer; do
  sed "s#@NODE@#$NODE#g" "$SRC/api/deploy/$u" > "/etc/systemd/system/$u"
  chmod 644 "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable systemdesigner-api.service systemdesigner-api-backup.timer >/dev/null 2>&1
systemctl restart systemdesigner-api.service
systemctl start systemdesigner-api-backup.timer

# Caddy block, pending until go-live.
install -d -m 755 /etc/caddy/sites-pending
install -m 644 "$SRC/api/deploy/systemdesigner-api.caddy" /etc/caddy/sites-pending/systemdesigner-api.caddy

sleep 1
systemctl is-active --quiet systemdesigner-api.service && echo "systemdesigner-api is running on 127.0.0.1:8791" || { echo "systemdesigner-api did not start; see: journalctl -u systemdesigner-api" >&2; exit 1; }
