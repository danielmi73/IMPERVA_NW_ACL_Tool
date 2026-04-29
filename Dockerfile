# Build stage: frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ .
RUN npm run build

# Build stage: backend dependencies
FROM python:3.12-slim AS backend-builder
WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target /build/deps

# Final image
FROM python:3.12-slim

# Install Nginx and OpenSSL
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx openssl curl && \
    rm -rf /var/lib/apt/lists/*

# Copy Python deps
COPY --from=backend-builder /build/deps /usr/local/lib/python3.12/site-packages

# Copy backend
WORKDIR /app
COPY backend/ ./backend/
COPY scripts/generate_certs.sh /app/generate_certs.sh
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/generate_certs.sh /app/entrypoint.sh

# Copy nginx config and frontend build
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /frontend/dist /usr/share/nginx/html

# Data volume for SQLite DB and certs
VOLUME ["/app/data"]

EXPOSE 443 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -k -f https://localhost/api/health || exit 1

CMD ["/app/entrypoint.sh"]
