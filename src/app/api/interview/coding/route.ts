import { NextResponse } from "next/server";
import { getCodingProblem } from "@/lib/codingProblems";
import { runCodingSubmission } from "@/lib/codingRunner";
import { phaseOf, phaseLabel } from "@/lib/engine";
import { generateFeedback } from "@/lib/deepseek";
import { pickAdvancePrefix } from "@/lib/utterancePool";
import { getSession, pushEvent, saveSession } from "@/lib/store";
import type { CodingRunResult } from "@/lib/types";

/**
 * 编程环节提交：后台跑测并记入 session；面试中不宣判对错，评价仅进终局复盘。
 * skip 仍可用但不在开场/主 UI 宣传。
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
        complexityNotes: body.notes || "（本环节未提交代码）",
        skipped: true,
        ranAt: new Date().toISOString(),
      };
      session.codingResults = [...(session.codingResults || []), codingResult];
      pushEvent(session, "coding_skipped", codingResult);
      if (rt) {
        rt.userAnswers.push("【编程】候选人进入下一环节（未提交代码）");
      }
    } else {
      codingResult = runCodingSubmission({
        problem,
        code: body.code || "",
        notes: body.notes,
      });
      session.codingResults = [...(session.codingResults || []), codingResult];
      pushEvent(session, "coding_result", codingResult);

      // 面试中不向候选人暴露对错；答案摘要仅记内部事件，runtime 用中性文案
      if (rt) {
        rt.userAnswers.push(
          `【编程已提交】复杂度备注：${codingResult.complexityNotes || "—"}`,
        );
        // 标签仍记，供复盘；不在 utterance 泄露
        if (codingResult.passed) {
          rt.tags = Array.from(new Set([...rt.tags, "confident_and_solid" as const]));
        }
      }
    }

    const nextIndex = session.currentIndex + 1;
    let done = false;
    let utterance = "";
    let action: "ASK" | "FINISH" | "SKIP_SOFT" = "ASK";
    const seed = session.currentIndex + (session.authenticityChallengeCount || 0);

    if (nextIndex >= session.queue.length) {
      done = true;
      action = body.skip ? "SKIP_SOFT" : "FINISH";
      utterance = "好，本场问题到这里。我来整理结构化复盘，不当场宣判结果。";
    } else {
      session.currentIndex = nextIndex;
      const next = session.runtimes[nextIndex]!;
      session.currentPhase = next.question.phase || phaseOf(session);
      const bridge =
        next.question.phase && next.question.phase !== "coding"
          ? `接下来进入${phaseLabel(next.question.phase)}。`
          : "";
      action = body.skip ? "SKIP_SOFT" : "ASK";
      // 中性过渡：绝不提用例通过/失败数字
      utterance = `${pickAdvancePrefix(seed)}${bridge}${next.question.prompt}`;
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
      // 结果仅日志；响应里仍带 codingResult 供复盘页，但 utterance 不含对错
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
