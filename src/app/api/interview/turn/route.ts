import { NextResponse } from "next/server";
import { generateFeedback, polishUtterance } from "@/lib/deepseek";
import { decideTurn } from "@/lib/engine";
import { resumeContextForPolish } from "@/lib/resumeConflict";
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
        signals: { integrityBreach: Boolean(session.feedback?.integrityBreach) },
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

    // FINISH / bank endInterview / integrity 一律视为本场结束
    const shouldEnd =
      Boolean(decision.done) ||
      decision.action === "FINISH" ||
      Boolean(decision.signals.integrityBreach);
    if (shouldEnd) {
      decision.done = true;
      decision.action = "FINISH";
    }

    const q = session.queue[Math.min(session.currentIndex, session.queue.length - 1)]!;
    // REPEAT / replyBank / 全局控场原句 / 诚信结束：保留口吻，不做润色改写
    // 简历冲突：可带 resumeContext 轻润色，但 draft 已含两侧事实
    // FOLLOW_UP 非 verbatim：带上候选人上一句，让润色贴着具体名词追问
    const skipPolish = Boolean(
      decision.verbatim ||
        decision.action === "REPEAT" ||
        decision.signals.repeatRequest ||
        decision.signals.integrityBreach ||
        decision.signals.needsTimeToThink ||
        decision.signals.replyBankId != null ||
        shouldEnd,
    );
    const polished = await polishUtterance({
      action: decision.action,
      draft: decision.utterance,
      questionPrompt: q.prompt,
      userAnswer: body.answer,
      tone: session.config.tone,
      trackId: session.trackId || "biz",
      candidateLevel: session.candidateLevel || "campus",
      skipPolish,
      bankStyle:
        decision.signals.replyBankId != null
          ? `replyBank#${decision.signals.replyBankId}`
          : undefined,
      resumeContext: decision.signals.resumeConflict
        ? resumeContextForPolish(session.resume)
        : undefined,
    });
    decision.utterance = polished.text;

    if (decision.pendingTags?.length) {
      const rt = session.runtimes[session.currentIndex];
      if (rt) rt.tags = Array.from(new Set([...rt.tags, ...decision.pendingTags]));
    }

    // REPEAT：必须保持与上一句完全一致（防止任何路径改写）
    if (decision.action === "REPEAT" || decision.signals.repeatRequest) {
      decision.utterance =
        (session.lastUtterance && session.lastUtterance.trim()) || decision.utterance;
      decision.verbatim = true;
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
        done: true,
        action: "FINISH",
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
