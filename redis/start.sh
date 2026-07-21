#!/bin/sh
set -e

exec redis-server \
  --requirepass "$REDIS_PASSWORD" \
  --appendonly yes \
  --dir /data \
  --maxmemory 200mb \
  --maxmemory-policy noeviction \
  --bind 0.0.0.0 ::
