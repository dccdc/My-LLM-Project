export const runtime = 'nodejs';

import { ingestPdf } from '@/lib/rag';
import type { NextRequest } from 'next/server';

type IngestBody = {
  pdfUrl?: string;
  chunkSize?: number;
  overlap?: number;
  rebuild?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IngestBody;
    const pdfUrl =
      body.pdfUrl ||
      'https://assets.stg.core-services.zeiss.com/catalogs/download/iqs/d8586e62-5f08-4e2c-9c2f-5bf6bf3fc860/ZEISS_Training_Brochure_EN_lowres.pdf.pdf';
    const chunkSize = body.chunkSize;
    const overlap = body.overlap;

    const result = await ingestPdf(pdfUrl, { chunkSize, overlap });

    return Response.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500 }
    );
  }
}


