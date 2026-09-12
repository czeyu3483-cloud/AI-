import { NextResponse } from "next/server";
import { answerLimitsForAction } from "@/lib/config";
import { getCodingProblem } from "@/lib/codingProblems";
import {
  analyzeResumeConsistency,
  analyzeTopicRelevance,
  generateFeedback,
  polishUtterance,
} from "@/lib/deepseek";
import { decideTurn, phaseOf } from "@/lib/engine";
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

    const currentRt = session.runtimes[session.currentIndex];
    // 编程题请走 /api/interview/coding
    if (currentRt?.question.isCoding) {
      return NextResponse.json(
        {
          error: "当前是编程环节，请在编辑器中提交代码",
          phase: "coding",
          codingProblem: getCodingProblem(currentRt.question.codingProblemId || "") || null,
          question: currentRt.question,
          index: session.currentIndex,
          total: session.queue.length,
        },
        { status: 409 },
      );
    }

    const alreadyChallenged =
      (session.authenticityChallengeCount || 0) > 0 ||
      Boolean(currentRt && currentRt.resumeConflictProbeCount > 0) ||
      Boolean(session.pendingConflictChallenge);

    const [resumeAnalysis, topicRelevance] = await Promise.all([
      analyzeResumeConsistency({
        answer: body.answer || "",
        resume: session.resume,
        question: currentRt?.question,
        alreadyChallenged,
      }),
      analyzeTopicRelevance({
        answer: body.answer || "",
        question: currentRt?.question,
      }),
    ]);

    const decision = decideTurn({
      session,
      answer: body.answer || "",
      silenceStuck: Boolean(body.silenceStuck),
      resumeAnalysis,
      topicRelevance,
    });

    const shouldEnd =
      Boolean(decision.done) ||
      decision.action === "FINISH" ||
      Boolean(decision.signals.integrityBreach);
    if (shouldEnd) {
      decision.done = true;
      decision.action = "FINISH";
    }

    const q = session.queue[Math.min(session.currentIndex, session.queue.length - 1)]!;
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

    if (decision.action === "REPEAT" || decision.signals.repeatRequest) {
      decision.utterance =
        (session.lastUtterance && session.lastUtterance.trim()) || decision.utterance;
      decision.verbatim = true;
    }

    const limits = answerLimitsForAction({
      action: decision.action,
      question: session.queue[session.currentIndex] ?? q,
      utterance: decision.utterance,
      softSec: session.config.answerSoftLimitSec,
      hardSec: session.config.answerHardLimitSec,
    });
    decision.answerSoftLimitSec = limits.answerSoftLimitSec;
    decision.answerHardLimitSec = limits.answerHardLimitSec;

    session.lastAction = decision.action;
    session.lastUtterance = decision.utterance;
    session.currentPhase = phaseOf(session);
    pushEvent(session, "decision", decision);

    const activeQ = session.queue[session.currentIndex];
    const codingProblem =
      activeQ?.isCoding && activeQ.codingProblemId
        ? getCodingProblem(activeQ.codingProblemId) || null
        : null;

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
        phase: session.currentPhase,
        codingProblem: null,
      });
    }

    saveSession(session);
    return NextResponse.json({
      ...decision,
      mockedLlm: polished.mocked,
      index: session.currentIndex,
      total: session.queue.length,
      question: session.queue[session.currentIndex],
      phase: session.currentPhase,
      codingProblem,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "回合失败" },
      { status: 500 },
    );
  }
}
