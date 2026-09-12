import { NextResponse } from "next/server";
import { EdgeTTS } from "edge-tts-universal";

export const runtime = "nodejs";

const MAX_CHARS = 600;

/** 男性面试官画像 → 男声（云健） */
export const INTERVIEWER_VOICE = "zh-CN-YunjianNeural";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; voice?: string };
    const text = (body.text || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return NextResponse.json({ error: "缺少文本" }, { status: 400 });
    }

    const clipped = text.slice(0, MAX_CHARS);
    const voice = body.voice || INTERVIEWER_VOICE;
    const tts = new EdgeTTS(clipped, voice);
    const result = await tts.synthesize();
    const buf = Buffer.from(await result.audio.arrayBuffer());

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "语音合成失败" },
      { status: 500 },
    );
  }
}
