import { GoogleGenerativeAI } from '@google/generative-ai';

const EMBEDDING_MODEL = 'text-embedding-004';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  // Batch embed while keeping order
  const res = await model.batchEmbedContents({
    requests: texts.map((text) => ({ content: { parts: [{ text }] } })),
  });

  // Extract embeddings from response
  return res.embeddings.map((e) => e.values);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

export const embeddingDimension = 768;


