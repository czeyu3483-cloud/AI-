import { NextResponse } from "next/server";
import { generateFeedback } from "@/lib/deepseek";
import { getSession, pushEvent, saveSession } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }
    const session = getSession(body.sessionId);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

    if (!session.feedback) {
      session.feedback = await generateFeedback(session);
      pushEvent(session, "feedback", session.feedback);
    }
    session.status = "finished";
    session.lastAction = "FINISH";
    session.lastUtterance =
      "本场模拟面试结束。下面是结构化复盘，仅供练习参考，不代表任何录用结论。";
    saveSession(session);

    return NextResponse.json({
      done: true,
      utterance: session.lastUtterance,
      feedback: session.feedback,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "结束失败" },
      { status: 500 },
    );
  }
}
