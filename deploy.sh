#!/bin/sh
# Deploy (or redeploy) sinch-ds on a Docker host behind nginx-proxy. Run it on the host:
#
#   sudo ./deploy.sh [image] [container] [deploy-path]
#
# Defaults: digitalsamba376/sinch-ds:latest, sinch-ds, /opt/deployment/sinch-ds.
# The deploy path must already hold:
#   sinch-ds.env  0600, the variables from sinch-ds/.env.sample plus VIRTUAL_HOST,
#                 LETSENCRYPT_HOST and VIRTUAL_PORT=3030 for nginx-proxy
#   pins.json     the PIN map, readable by uid 1000 (the container's `node` user)
set -eu
IMAGE="${1:-digitalsamba376/sinch-ds:latest}"
CONTAINER="${2:-sinch-ds}"
DEPLOY_PATH="${3:-/opt/deployment/sinch-ds}"
ENV_FILE="$DEPLOY_PATH/sinch-ds.env"
PIN_FILE="$DEPLOY_PATH/pins.json"

for f in "$ENV_FILE" "$PIN_FILE"; do
    [ -s "$f" ] || { echo "Missing $f" >&2; exit 1; }
done
# Secrets stay in the env file: never on a command line (ps, shell history, sudo logs).
if [ "$(stat -c %a "$ENV_FILE")" != 600 ]; then
    echo "$ENV_FILE holds secrets: chmod 600 it first" >&2
    exit 1
fi

echo "Pulling $IMAGE..."
docker pull "$IMAGE"

# Keep the running container until the new one is healthy, so a bad config doesn't
# leave callers with nothing.
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    docker rm -f "$CONTAINER-previous" >/dev/null 2>&1 || true
    docker stop "$CONTAINER" >/dev/null
    docker rename "$CONTAINER" "$CONTAINER-previous"
fi

# No -p: the container is reachable only through the reverse proxy on the
# deployment_proxy network (VIRTUAL_HOST), never on a host port.
docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --network deployment_proxy \
    --env-file "$ENV_FILE" \
    -v "$PIN_FILE:/config/pins.json:ro" \
    "$IMAGE" >/dev/null

# The app refuses to start on bad config; surface that here, not as a crash loop.
status=starting
for _ in $(seq 1 30); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    [ "$status" = healthy ] && break
    sleep 2
done
if [ "$status" != healthy ]; then
    docker logs --tail 30 "$CONTAINER" >&2
    echo "$CONTAINER is $status; rolling back" >&2
    docker rm -f "$CONTAINER" >/dev/null
    if docker inspect "$CONTAINER-previous" >/dev/null 2>&1; then
        docker rename "$CONTAINER-previous" "$CONTAINER"
        docker start "$CONTAINER" >/dev/null
    fi
    exit 1
fi
echo "$CONTAINER healthy. The previous container is kept stopped as $CONTAINER-previous."
