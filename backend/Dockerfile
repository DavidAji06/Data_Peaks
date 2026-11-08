# FastAPI backend. Build from the REPO ROOT (it needs data/, contracts/ and ml/pipeline):
#   docker build -f backend/Dockerfile -t data-peaks-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/data_peaks.db
# Set DATABASE_URL (Postgres) in production; without it the API uses SQLite at DATABASE_PATH

WORKDIR /srv

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Same layout as the repo, so the code's relative paths (parents[N]) still resolve
COPY contracts contracts
COPY data/risk-radar-export.csv data/risk-radar-export.csv
COPY data/processed/alerts.json data/processed/ranked_risks.json data/processed/similar_risks.json data/processed/
COPY ml/pipeline ml/pipeline
COPY backend/app backend/app
COPY backend/docker-entrypoint.sh backend/docker-entrypoint.sh
RUN sed -i 's/\r$//' backend/docker-entrypoint.sh && chmod +x backend/docker-entrypoint.sh && mkdir -p /data

WORKDIR /srv/backend
EXPOSE 8000
CMD ["./docker-entrypoint.sh"]
