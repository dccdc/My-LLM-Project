export const runtime = 'nodejs';

import { matchChunks } from '@/lib/db';
import { embedQuery } from '@/lib/embedding';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { NextRequest } from 'next/server';

type QueryBody = {
  question: string;
  topK?: number;
  minSimilarity?: number;
};

function buildPrompt(contexts: { content: string; page?: number }[], question: string) {
  const sources = contexts
    .map((c, i) => `[#${i + 1}${c.page ? ` p.${c.page}` : ''}] ${c.content}`)
    .join('\n\n');
  const prompt = `You are a helpful assistant. Answer ONLY using the provided context. If unsure, say you don't know.

Context:
${sources}

Question: ${question}
Answer in the same language as the question.`;
  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const { question, topK = 8, minSimilarity = 0 } = (await req.json()) as QueryBody;
    if (!question || !question.trim()) {
      return new Response('Missing question', { status: 400 });
    }

    console.log(`[Query] Question: "${question}"`);

    const queryEmbedding = await embedQuery(question);
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error(`[Query] Invalid embedding generated. Length: ${queryEmbedding?.length}`);
      throw new Error('Failed to generate valid embedding');
    }
    // Check for NaNs
    if (queryEmbedding.some(isNaN)) {
       console.error(`[Query] Embedding contains NaN`);
       throw new Error('Embedding contains NaN');
    }

    console.log(`[Query] Embedding generated. Length: ${queryEmbedding.length}. First 3 values: [${queryEmbedding.slice(0,3).join(', ')}]`);
    console.log(`[Query] Calling matchChunks with minSimilarity: ${minSimilarity}...`);
    const matches = await matchChunks(queryEmbedding, topK, minSimilarity);

    console.log(`[Query] matchChunks returned. Type: ${typeof matches}, isArray: ${Array.isArray(matches)}, length: ${matches?.length}`);
    console.log(`[Query] Found ${matches.length} matches.`);
    if (matches.length > 0) {
      console.log(`[Query] Top match similarity: ${matches[0].similarity}`);
      console.log(`[Query] Top match preview: ${matches[0].content.slice(0, 100)}...`);
    } else {
      console.warn(`[Query] No matches found! Check if pdfUrl matches exactly or if minSimilarity is too high.`);
    }

    const contexts = (matches ?? []).map((m) => ({
      content: m.content,
      page: (m.metadata?.page as number) ?? undefined,
      similarity: m.similarity,
      source_url: m.metadata?.source_url as string | undefined,
    }));

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const prompt = buildPrompt(contexts, question);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Return as markdown format for better display in Postman
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500 }
    );
  }
}


