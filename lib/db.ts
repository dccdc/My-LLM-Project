import './polyfill'; // Polyfill for Promise.withResolvers
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, uuid, text, integer, jsonb, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(768)',
  toDriver: (value: number[]) => `[${value.join(',')}]`,
  fromDriver: (value: string) => {
    const arr = value.replace(/[\[\]]/g, '').split(',').map(Number);
    return arr;
  },
});

type ChunkRow = {
  document_id: string;
  chunk_id: number;
  content: string;
  tokens: number | null;
  embedding: number[];
  metadata: Record<string, any>;
};

// Drizzle schema
const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceUrl: text('source_url').notNull().unique(),
  title: text('title'),
  checksum: text('checksum'),
  createdAt: text('created_at'),
});

const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull(),
  chunkId: integer('chunk_id').notNull(),
  content: text('content').notNull(),
  tokens: integer('tokens'),
  embedding: vector('embedding').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: text('created_at'),
});


// -------- Postgres mode --------
async function getPgClient() {
  // Try pooler URL first (more reliable), then fallback to direct connection
  const connectionString =
    process.env.SUPABASE_POOLER_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_URL;
  
  if (!connectionString) {
    throw new Error(
      'Missing Postgres connection string. Set SUPABASE_POOLER_URL, DATABASE_URL, or SUPABASE_URL.\n' +
      'Note: Use Connection Pooling URL (port 6543) for better reliability. Find it in Supabase Dashboard > Database > Connection Pooling.'
    );
  }

  // Extract host for better error messages
  const hostMatch = connectionString.match(/@([^:]+)/);
  const host = hostMatch ? hostMatch[1] : 'unknown';

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000, // 10 second timeout
  });

  try {
    await client.connect();
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
      throw new Error(
        `Cannot resolve database host "${host}". DNS resolution failed.\n` +
        `Possible fixes:\n` +
        `1. Use Connection Pooling URL (port 6543) instead of direct connection (port 5432)\n` +
        `2. Check your network connection and DNS settings\n` +
        `3. Verify the connection string in Supabase Dashboard\n` +
        `Original error: ${errMsg}`
      );
    }
    throw error;
  }

  return client;
}

async function pgUpsertDocument(sourceUrl: string, checksum: string): Promise<string> {
  const client = await getPgClient();
  const db = drizzle(client);
  try {
    const res = await db
      .insert(documents)
      .values({ sourceUrl, checksum } as any)
      .onConflictDoUpdate({ target: documents.sourceUrl, set: { checksum: sql`excluded.checksum` } as any })
      .returning({ id: documents.id });
    return res[0].id as string;
  } finally {
    await client.end();
  }
}

function toVectorLiteral(vec: number[]): string {
  return `'[${vec.join(',')}]'`;
}

async function pgUpsertChunks(rows: ChunkRow[]): Promise<void> {
  const client = await getPgClient();
  const db = drizzle(client);
  try {
    await db.transaction(async (trx) => {
      for (const r of rows) {
        await trx
          .insert(chunks)
          .values({
            documentId: r.document_id,
            chunkId: r.chunk_id,
            content: r.content,
            tokens: r.tokens ?? null,
            embedding: r.embedding as any,
            metadata: r.metadata ?? {},
          } as any)
          .onConflictDoUpdate({
            target: [chunks.documentId, chunks.chunkId],
            set: {
              content: sql`excluded.content`,
              tokens: sql`excluded.tokens`,
              embedding: sql`excluded.embedding`,
              metadata: sql`excluded.metadata`,
            } as any,
          });
      }
    });
  } finally {
    await client.end();
  }
}

async function pgMatchChunks(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number
) {
  const client = await getPgClient();
  const db = drizzle(client);
  try {
    const lit = toVectorLiteral(queryEmbedding);
    
    // Simple query: Calculate similarity, NO ORDER BY (to avoid compatibility issues)
    // We'll sort in application layer
    const res = await db.execute(sql`
      SELECT id, document_id, chunk_id, content, metadata,
             1 - (embedding <=> ${sql.raw(lit)}::vector) as similarity
      FROM public.chunks
      LIMIT ${topK * 3}
    `);

    console.log(`[DB] Query executed. rowCount: ${(res as any).rowCount}, rows.length: ${(res as any).rows?.length}`);
    console.log(`[DB] First row (if any):`, (res as any).rows?.[0] ? JSON.stringify((res as any).rows[0]).slice(0, 200) : 'NONE');

    // @ts-ignore drizzle returns { rows }
    let rows = (res as any).rows as Array<{
      id: string;
      document_id: string;
      chunk_id: number;
      content: string;
      metadata: any;
      similarity: number;
    }>;

    // Sort by similarity DESC (higher is better) in application layer
    rows = rows.sort((a, b) => b.similarity - a.similarity);
    
    // Filter by minSimilarity threshold
    rows = rows.filter(row => row.similarity >= minSimilarity);
    
    // Take top K results
    rows = rows.slice(0, topK);

    console.log(`[DB] After sorting, filtering (>= ${minSimilarity}), and slicing, returning ${rows.length} rows to caller`);
    return rows;
  } finally {
    await client.end();
  }
}

async function pgGetDocumentByUrl(sourceUrl: string) {
  const client = await getPgClient();
  const db = drizzle(client);
  try {
    const res = await db
      .select()
      .from(documents)
      .where(sql`${documents.sourceUrl} = ${sourceUrl}`)
      .limit(1);
    return res[0];
  } finally {
    await client.end();
  }
}

// -------- Public API --------
export async function getDocumentByUrl(sourceUrl: string) {
  return pgGetDocumentByUrl(sourceUrl);
}

export async function upsertDocument(sourceUrl: string, checksum: string): Promise<string> {
  return pgUpsertDocument(sourceUrl, checksum);
}

export async function upsertChunks(rows: ChunkRow[]): Promise<void> {
  return pgUpsertChunks(rows);
}

export async function matchChunks(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number,
  _filter?: { documentId?: string; sourceUrl?: string }
) {
  return pgMatchChunks(queryEmbedding, topK, minSimilarity);
}

export type { ChunkRow };


