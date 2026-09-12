import { NextResponse } from "next/server";
import { generateFeedback, polishUtterance } from "@/lib/deepseek";
import { decideTurn } from "@/lib/engine";
import { getSession, pushEvent, saveSession } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      answer?: string;
      silenceStuck?: boolean;
    };
    if (!body.sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }
    const session = getSession(body.sessionId);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (session.status === "finished") {
      return NextResponse.json({
        done: true,
        utterance: session.lastUtterance,
        feedback: session.feedback,
        action: "FINISH",
      });
    }

    pushEvent(session, "answer", {
      answer: body.answer || "",
      silenceStuck: Boolean(body.silenceStuck),
    });

    const decision = decideTurn({
      session,
      answer: body.answer || "",
      silenceStuck: Boolean(body.silenceStuck),
    });

    const q = session.queue[Math.min(session.currentIndex, session.queue.length - 1)]!;
    // 诚信问题结束语不要被润色改掉意图
    const polished = await polishUtterance({
      action: decision.action,
      draft: decision.utterance,
      questionPrompt: q.prompt,
      userAnswer: body.answer,
      tone: session.config.tone,
      skipPolish: Boolean(decision.signals.integrityBreach),
    });
    decision.utterance = polished.text;

    if (decision.pendingTags?.length) {
      const rt = session.runtimes[session.currentIndex];
      if (rt) rt.tags = Array.from(new Set([...rt.tags, ...decision.pendingTags]));
    }

    session.lastAction = decision.action;
    session.lastUtterance = decision.utterance;
    pushEvent(session, "decision", decision);

    if (decision.done) {
      session.status = "finished";
      session.feedback = await generateFeedback(session);
      pushEvent(session, "feedback", session.feedback);
      saveSession(session);
      return NextResponse.json({
        ...decision,
        mockedLlm: polished.mocked,
        feedback: session.feedback,
        index: session.currentIndex,
        total: session.queue.length,
        question: session.queue[session.currentIndex] ?? null,
      });
    }

    saveSession(session);
    return NextResponse.json({
      ...decision,
      mockedLlm: polished.mocked,
      index: session.currentIndex,
      total: session.queue.length,
      question: session.queue[session.currentIndex],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "回合失败" },
      { status: 500 },
    );
  }
}
