#!/bin/bash
set -e
cd /root/bird-frost-brick-zenith
docker build -f Dockerfile.fast -t boundless-studio:fast-v1 .
docker rm -f boundless-studio-clean-v11 || true
docker run -d \
  --name boundless-studio-clean-v11 \
  -p 127.0.0.1:18081:8080 \
  -v /opt/1panel/www/sites/bfbz-test/works:/app/.vercel/output/static/works \
  -v /opt/1panel/www/sites/bfbz-test/data:/app/data \
  -e VITE_AUTH_ENABLED=false \
  --restart unless-stopped \
  boundless-studio:fast-v1
sleep 2
curl -s http://127.0.0.1:18081/client-api/health
rm -f /root/bird-frost-brick-zenith/run-fast.sh
