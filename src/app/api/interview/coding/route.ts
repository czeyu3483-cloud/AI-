import { NextResponse } from "next/server";
import { getCodingProblem } from "@/lib/codingProblems";
import { runCodingSubmission } from "@/lib/codingRunner";
import { phaseOf, phaseLabel } from "@/lib/engine";
import { generateFeedback } from "@/lib/deepseek";
import { getSession, pushEvent, saveSession } from "@/lib/store";

/**
 * 编程环节提交：跑测 → 记入 session → 推进下一题或结束并出反馈。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      code?: string;
      notes?: string;
      problemId?: string;
    };
    if (!body.sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }
    const session = getSession(body.sessionId);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (session.status === "finished") {
      return NextResponse.json({
        done: true,
        feedback: session.feedback,
        codingResult: session.codingResults?.[session.codingResults.length - 1] || null,
      });
    }

    const rt = session.runtimes[session.currentIndex];
    const q = rt?.question;
    if (!q?.isCoding) {
      return NextResponse.json({ error: "当前不是编程环节" }, { status: 400 });
    }

    const problemId = body.problemId || q.codingProblemId;
    const problem = problemId ? getCodingProblem(problemId) : undefined;
    if (!problem) {
      return NextResponse.json({ error: "编程题不存在" }, { status: 400 });
    }

    const codingResult = runCodingSubmission({
      problem,
      code: body.code || "",
      notes: body.notes,
    });
    session.codingResults = [...(session.codingResults || []), codingResult];
    pushEvent(session, "coding_result", codingResult);

    const summary = codingResult.passed
      ? `【编程通过】${codingResult.passedCount}/${codingResult.total}；复杂度备注：${codingResult.complexityNotes || "—"}`
      : `【编程未全过】${codingResult.passedCount}/${codingResult.total}${
          codingResult.error ? `；错误：${codingResult.error}` : ""
        }；复杂度备注：${codingResult.complexityNotes || "—"}`;
    if (rt) {
      rt.userAnswers.push(summary);
      if (codingResult.passed) {
        rt.tags = Array.from(new Set([...rt.tags, "confident_and_solid" as const]));
      }
    }

    const nextIndex = session.currentIndex + 1;
    let done = false;
    let utterance = "";
    let action: "ASK" | "FINISH" = "ASK";

    if (nextIndex >= session.queue.length) {
      done = true;
      action = "FINISH";
      utterance = codingResult.passed
        ? "编程题跑测通过了，本场问题到这里。我来整理结构化复盘。"
        : `编程结果我记下了（${codingResult.passedCount}/${codingResult.total}）。本场到这里，我来整理复盘。`;
    } else {
      session.currentIndex = nextIndex;
      const next = session.runtimes[nextIndex]!;
      session.currentPhase = next.question.phase || phaseOf(session);
      const bridge =
        next.question.phase && next.question.phase !== "coding"
          ? `接下来进入${phaseLabel(next.question.phase)}。`
          : "";
      utterance = codingResult.passed
        ? `编程用例过了。${bridge}${next.question.prompt}`
        : `编程结果记下了（${codingResult.passedCount}/${codingResult.total}）。${bridge}${next.question.prompt}`;
      action = "ASK";
    }

    session.lastAction = action;
    session.lastUtterance = utterance;
    session.currentPhase = phaseOf(session);
    pushEvent(session, "decision", {
      action,
      utterance,
      done,
      questionId: session.queue[session.currentIndex]?.id,
      codingResult,
    });

    if (done) {
      session.status = "finished";
      session.feedback = await generateFeedback(session);
      pushEvent(session, "feedback", session.feedback);
      saveSession(session);
      return NextResponse.json({
        action: "FINISH",
        utterance,
        done: true,
        codingResult,
        feedback: session.feedback,
        index: session.currentIndex,
        total: session.queue.length,
        question: session.queue[session.currentIndex] ?? null,
        phase: session.currentPhase,
      });
    }

    saveSession(session);
    const question = session.queue[session.currentIndex]!;
    return NextResponse.json({
      action: "ASK",
      utterance,
      done: false,
      codingResult,
      index: session.currentIndex,
      total: session.queue.length,
      question,
      phase: session.currentPhase,
      codingProblem: question.isCoding
        ? getCodingProblem(question.codingProblemId || "")
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "编程提交失败" },
      { status: 500 },
    );
  }
}
