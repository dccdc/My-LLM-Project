This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## RAG APIs (Gemini + Supabase pgvector)

Two server APIs are provided:

1. `POST /api/rag/ingest` – download a PDF, chunk it, embed with Gemini `text-embedding-004`, and store in Supabase pgvector.
2. `POST /api/rag/query` – embed the user question, retrieve top-k similar chunks from Supabase, and answer using Gemini with citations.

### Prerequisites
- Supabase project with `pgvector` extension enabled
- Node.js 18+
- Accounts/keys:
  - `GOOGLE_GENERATIVE_AI_API_KEY` (Google AI Studio)
  - `SUPABASE_URL` (Postgres connection string, e.g. `postgresql://...:5432/postgres` or Pooler URI)

### Setup
1) Create database schema and function

Run `supabase/schema.sql` using one of the following:

- Supabase SQL Editor: open the editor, paste the file contents, run all
- psql/CLI (example):
```
psql "${SUPABASE_URL}" -f supabase/schema.sql
```

2) Configure environment variables

Create `.env.local` with:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_google_generative_ai_key
SUPABASE_POOLER_URL=postgresql://USER:PASSWORD@aws-xxx.pooler.supabase.com:6543/postgres
```

**Important**: Use the **Connection Pooling URL** (port 6543) instead of direct connection (port 5432) for better reliability and to avoid DNS issues.

To find your pooler URL:
1. Go to Supabase Dashboard > Your Project > Database
2. Click "Connection Pooling" tab
3. Copy the "Connection string" (psql format)
4. Use it as `SUPABASE_POOLER_URL` (or `DATABASE_URL` / `SUPABASE_URL` - all are supported)

If you get `ENOTFOUND` DNS errors, the pooler URL usually resolves better than direct connection URLs.

3) Install dependencies and run

```
pnpm install
pnpm dev
```

### API Usage

1) Ingest the provided PDF

```
curl -X POST http://localhost:3000/api/rag/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "pdfUrl": "https://asset-downloads.zeiss.com/catalogs/download/iqs/6db5ba23-a8f5-40bd-a397-68e80f525b90/EN_60_025_ZEISS_IQS_LINE_GUIDE_04_2025_complete.pdf.pdf"
  }'
```

2) Query

```
curl -X POST http://localhost:3000/api/rag/query \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "What is the scope of ZEISS IQS Line?",
    "topK": 8
  }'
```

### Notes
- Vector search runs directly in Postgres with pgvector.
- Routes run on Node.js runtime to support PDF parsing.
- This project uses a direct Postgres connection; no Service Role key is required.

### End-to-End Test
With the server running (`pnpm dev`), run:

```
pnpm e2e:rag
```

Environment variables for the script:

```
# override base url if needed
BASE_URL=http://localhost:3000 QUESTION="Summarize key capabilities" pnpm e2e:rag
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# My-LLM-Project
