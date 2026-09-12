import { NextResponse } from "next/server";
import { getCodingProblem } from "@/lib/codingProblems";
import { runCodingSubmission } from "@/lib/codingRunner";
import { phaseOf, phaseLabel } from "@/lib/engine";
import { generateFeedback } from "@/lib/deepseek";
import { getSession, pushEvent, saveSession } from "@/lib/store";
import type { CodingRunResult } from "@/lib/types";

/**
 * 编程环节提交：跑测 → 记入 session → 推进下一题或结束并出反馈。
 * 也可 skip: true 表示本次先不练这道题、继续面试（不记硬性失败）。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      code?: string;
      notes?: string;
      problemId?: string;
      skip?: boolean;
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

    let codingResult: CodingRunResult;
    if (body.skip) {
      codingResult = {
        problemId: problem.id,
        title: problem.title,
        code: body.code || "",
        passed: false,
        total: problem.tests.length,
        passedCount: 0,
        failedTests: [],
        complexityNotes: body.notes || "（本次先不练这道题）",
        skipped: true,
        ranAt: new Date().toISOString(),
      };
      session.codingResults = [...(session.codingResults || []), codingResult];
      pushEvent(session, "coding_skipped", codingResult);
      if (rt) {
        rt.userAnswers.push("【编程】候选人选择本次先不练这道题、继续面试");
      }
    } else {
      codingResult = runCodingSubmission({
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
    }

    const nextIndex = session.currentIndex + 1;
    let done = false;
    let utterance = "";
    let action: "ASK" | "FINISH" | "SKIP_SOFT" = "ASK";

    if (nextIndex >= session.queue.length) {
      done = true;
      action = body.skip ? "SKIP_SOFT" : "FINISH";
      if (body.skip) {
        utterance = "好的，那我们看下一个问题。本场问题到这里，我来整理结构化复盘。";
      } else {
        utterance = codingResult.passed
          ? "编程题跑测通过了，本场问题到这里。我来整理结构化复盘。"
          : `好，编程环节先到这里（${codingResult.passedCount}/${codingResult.total}）。本场到这里，我来整理复盘。`;
      }
    } else {
      session.currentIndex = nextIndex;
      const next = session.runtimes[nextIndex]!;
      session.currentPhase = next.question.phase || phaseOf(session);
      const bridge =
        next.question.phase && next.question.phase !== "coding"
          ? `接下来进入${phaseLabel(next.question.phase)}。`
          : "";
      if (body.skip) {
        action = "SKIP_SOFT";
        utterance = `行，那我们继续。${bridge}${next.question.prompt}`;
      } else {
        utterance = codingResult.passed
          ? `编程用例过了。${bridge}${next.question.prompt}`
          : `好的，那我们看下一个问题。${bridge}${next.question.prompt}`;
        action = "ASK";
      }
    }

    session.lastAction = action === "SKIP_SOFT" ? "SKIP_SOFT" : action;
    session.lastUtterance = utterance;
    session.currentPhase = phaseOf(session);
    pushEvent(session, "decision", {
      action,
      utterance,
      done,
      questionId: session.queue[session.currentIndex]?.id,
      codingResult,
      skipped: Boolean(body.skip),
    });

    if (done) {
      session.status = "finished";
      session.feedback = await generateFeedback(session);
      pushEvent(session, "feedback", session.feedback);
      saveSession(session);
      return NextResponse.json({
        action: body.skip ? "SKIP_SOFT" : "FINISH",
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
      action,
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
