#!/bin/sh
set -e

# A brand-new database (no rows yet) gets the Risk Radar risks, ML alerts and synthetic experts.
# A database that already has data is left alone. RESEED=true wipes it and seeds again.
if [ "$RESEED" = "true" ]; then
  echo "RESEED=true: wiping and seeding the database"
  python -m app.seed
else
  python -m app.seed --if-empty
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
