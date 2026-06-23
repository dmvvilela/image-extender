import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Whether server-side env fallbacks are configured (never exposes key values). */
export async function GET() {
  return NextResponse.json({
    envKeys: {
      google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
      openai: !!process.env.OPENAI_API_KEY?.trim(),
    },
  })
}
