-- Enable pgvector
create extension if not exists vector;

-- Documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source_url text unique,
  title text,
  checksum text,
  created_at timestamptz default now()
);

-- Chunks table
-- Adjust dimensions to the embedding model dimension (text-embedding-004 currently 768 or 3072 depending on config; we use 768 here)
create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_id int not null,
  content text not null,
  tokens int,
  embedding vector(768) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (document_id, chunk_id)
);

-- Vector index
create index if not exists chunks_embedding_ivfflat on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Helpful index for filters
create index if not exists chunks_document_id_idx on public.chunks(document_id);

-- Matching function for similarity search
-- Returns top-k chunks with similarity score
create or replace function public.match_chunks(
  query_embedding vector(768),
  match_count int default 8,
  min_similarity double precision default 0
)
returns table(
  id uuid,
  document_id uuid,
  chunk_id int,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql stable parallel safe as $$
  select c.id,
         c.document_id,
         c.chunk_id,
         c.content,
         c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding asc
  limit match_count;
$$;

-- RLS (example: off by default; adjust as needed)
alter table public.documents enable row level security;
alter table public.chunks enable row level security;

-- Example policies for read-only access (adjust/enable if exposing to anon)
-- create policy "Allow read documents" on public.documents for select using (true);
-- create policy "Allow read chunks" on public.chunks for select using (true);


