#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-"http://localhost:3000"}

PDF_URL="https://asset-downloads.zeiss.com/catalogs/download/iqs/6db5ba23-a8f5-40bd-a397-68e80f525b90/EN_60_025_ZEISS_IQS_LINE_GUIDE_04_2025_complete.pdf.pdf"
QUESTION=${QUESTION:-"What is the scope of ZEISS IQS Line?"}

echo "[1/2] Ingesting PDF to vector DB..."
curl -sS -X POST "$BASE_URL/api/rag/ingest" \
  -H 'Content-Type: application/json' \
  -d "{\"pdfUrl\": \"$PDF_URL\"}" | tee /tmp/rag_ingest_out.json

echo "\n[2/2] Asking a question..."
curl -sS -X POST "$BASE_URL/api/rag/query" \
  -H 'Content-Type: application/json' \
  -d "{\"question\": \"$QUESTION\", \"topK\": 8}" | tee /tmp/rag_query_out.json

echo "\nDone.\n- Ingest output: /tmp/rag_ingest_out.json\n- Query output:  /tmp/rag_query_out.json"


