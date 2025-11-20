import crypto from 'crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { upsertDocument, upsertChunks, getDocumentByUrl, type ChunkRow } from '@/lib/db';
import { embedTexts } from '@/lib/embedding';
import { splitIntoChunks } from '@/lib/chunk';

// Set worker path for Node.js runtime (use a dummy path to avoid worker loading)
if (typeof pdfjs.GlobalWorkerOptions !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
}

async function fetchPdfArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
  return await res.arrayBuffer();
}

async function extractPages(arrayBuffer: ArrayBuffer): Promise<{ page: number; text: string }[]> {
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: { page: number; text: string }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map((it: any) => it.str);
    const text = strings.join('\n').trim();
    pages.push({ page: p, text });
  }
  return pages;
}

function computeChecksum(buff: ArrayBuffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(buff));
  return hash.digest('hex');
}

export async function ingestPdf(
  pdfUrl: string,
  options: { chunkSize?: number; overlap?: number } = {}
): Promise<{ documentId: string; chunks: number; skipped?: boolean }> {
  const chunkSize = options.chunkSize ?? 2000;
  const overlap = options.overlap ?? 200;

  // 1. Check if document exists
  const existingDoc = await getDocumentByUrl(pdfUrl);
  
  // 2. Download PDF
  const arrayBuffer = await fetchPdfArrayBuffer(pdfUrl);
  const checksum = computeChecksum(arrayBuffer);

  // 3. Check checksum if document exists
  if (existingDoc && existingDoc.checksum === checksum) {
    // Document unchanged, return existing ID
    return { documentId: existingDoc.id, chunks: 0, skipped: true };
  }

  // 4. Upsert document (creates or updates checksum)
  const documentId = await upsertDocument(pdfUrl, checksum);

  // 5. Parse and Chunk
  const pages = await extractPages(arrayBuffer);
  const allChunks: { text: string; page: number; idx: number }[] = [];
  let chunkIndex = 0;
  for (const pg of pages) {
    const chunks = splitIntoChunks(pg.text, { chunkSize, overlap });
    for (const c of chunks) {
      allChunks.push({ text: c, page: pg.page, idx: chunkIndex++ });
    }
  }

  if (allChunks.length === 0) {
    return { documentId, chunks: 0 };
  }

  // 6. Embed
  const batchSize = 64;
  const vectors: number[][] = [];
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize).map((c) => c.text);
    const embeds = await embedTexts(batch);
    vectors.push(...embeds);
  }

  // 7. Store Chunks
  const rows: ChunkRow[] = allChunks.map((c, i) => ({
    document_id: documentId,
    chunk_id: c.idx,
    content: c.text,
    tokens: null,
    embedding: vectors[i],
    metadata: { page: c.page, source_url: pdfUrl },
  }));

  await upsertChunks(rows);

  return { documentId, chunks: rows.length };
}

