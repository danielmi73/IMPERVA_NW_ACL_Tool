#!/bin/bash
set -e

CERT_DIR="${CERT_DIR:-/app/data/certs}"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "Generating self-signed TLS certificate..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:4096 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/CN=ddos-manager/O=DDoS Manager/C=IL" \
        -addext "subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:ddos-manager"
    chmod 600 "$KEY_FILE"
    chmod 644 "$CERT_FILE"
    echo "Certificate generated at $CERT_FILE"
else
    echo "TLS certificate already exists — skipping generation"
fi
