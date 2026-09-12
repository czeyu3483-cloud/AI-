import { NextResponse } from "next/server";
import { getSession } from "@/lib/store";

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已失效" }, { status: 404 });
  }

  const question = session.queue[session.currentIndex] ?? null;
  return NextResponse.json({
    sessionId: session.id,
    utterance: session.lastUtterance,
    question,
    index: session.currentIndex,
    total: session.queue.length,
    config: session.config,
    status: session.status,
    feedback: session.feedback ?? null,
    lastAction: session.lastAction,
  });
}
