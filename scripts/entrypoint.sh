#!/bin/bash
set -e

echo "=== DDoS Prefix Manager — Starting ==="

# Step 1: Generate TLS cert if needed
bash /app/generate_certs.sh

# Step 2: Create data directory
mkdir -p /app/data

# Step 3: Run DB migrations
echo "Running database migrations..."
cd /app/backend && python -m alembic upgrade head

# Step 4: Start Nginx in background
echo "Starting Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Step 5: Start FastAPI
echo "Starting FastAPI backend..."
cd /app/backend && python -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 1 \
    --log-level info

# If FastAPI exits, also kill nginx
kill $NGINX_PID
