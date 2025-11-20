export type PageChunk = {
  page: number;
  content: string;
};

export function splitIntoChunks(
  text: string,
  options: { chunkSize?: number; overlap?: number; page?: number } = {}
): string[] {
  const chunkSize = options.chunkSize ?? 2000; // characters
  const overlap = options.overlap ?? 200;
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    const piece = text.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end === text.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}


