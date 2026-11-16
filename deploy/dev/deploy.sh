#!/usr/bin/env bash
# Builds the game and deploys it as the ABYRUS dev environment: Cloud Run (nginx), behind a password.
# Run from the project folder:   bash deploy/dev/deploy.sh
#
#   GCP_PROJECT   default shiplabjapan
#   GCP_REGION    default asia-northeast1
#   SERVICE       default abyrus-dev
#   DEV_USER      default abyrus
#   DEV_PASSWORD  default: a random one, printed at the end
#   AUTH          default on: the user name and password. AUTH=off: the URL alone opens the game
#                 (only sensible with PUBLIC=1, and only for content you do not mind showing).
#   PUBLIC        default keep: who may reach the service stays as it is (a new service starts private).
#                 1: anyone with the URL reaches the login (what makes it open from a phone).
#                 0: only Google accounts allowed on the project (see the end of this script).
#
# deploy/dev/.env (git-ignored) may hold these as KEY=VALUE lines, one per line; a value already in
# the environment wins over the file. The VITE_FIREBASE_* values (see BACKEND_SETUP.md) are read from
# the project's own .env at build time, as for any build.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if [ -f "$HERE/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      "" | "#"*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    if [ -z "${!key+x}" ]; then export "$key=$val"; fi
  done < "$HERE/.env"
fi

PROJECT="${GCP_PROJECT:-shiplabjapan}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${SERVICE:-abyrus-dev}"
DEV_USER="${DEV_USER:-abyrus}"
PUBLIC="${PUBLIC:-keep}"
AUTH="${AUTH:-on}"
GENERATED=0
if [ -z "${DEV_PASSWORD:-}" ]; then
  DEV_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  GENERATED=1
fi

echo "== build =="
# VITE_DEV_ENV=1 makes the game open with its 開発版（DEV）notice.
(cd "$ROOT" && VITE_DEV_ENV=1 npm run build)

echo "== stage =="
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$HERE/Dockerfile" "$HERE/nginx.conf.template" "$STAGE/"
cp -r "$ROOT/dist" "$STAGE/dist"
echo "${DEV_USER}:$(openssl passwd -apr1 "$DEV_PASSWORD")" > "$STAGE/htpasswd"
if [ "$AUTH" = off ]; then sed -i '/auth_basic/d' "$STAGE/nginx.conf.template"; fi
# Search engines are asked to stay away.
printf 'User-agent: *\nDisallow: /\n' > "$STAGE/dist/robots.txt"

echo "== deploy ($SERVICE in $PROJECT / $REGION) =="
ACCESS=""
if [ "$PUBLIC" = 1 ]; then ACCESS="--allow-unauthenticated"; fi
if [ "$PUBLIC" = 0 ]; then ACCESS="--no-allow-unauthenticated"; fi
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --source "$STAGE" \
  ${ACCESS:+"$ACCESS"} --ingress all \
  --cpu 1 --memory 256Mi --min-instances 0 --max-instances 2 \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo
echo "URL      : $URL"
if [ "$AUTH" = off ]; then
  echo "Login    : none - the URL alone opens it"
else
  echo "User     : $DEV_USER"
  if [ "$GENERATED" = 1 ]; then echo "Password : $DEV_PASSWORD"; else echo "Password : (the DEV_PASSWORD you gave)"; fi
fi
if [ "$PUBLIC" = 0 ]; then
  echo
  echo "Private: open it on this PC with   gcloud run services proxy $SERVICE --project $PROJECT --region $REGION --port 8088"
  echo "         then http://localhost:8088 .  To open it from a phone, deploy again with PUBLIC=1."
fi
