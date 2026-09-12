import { NextResponse } from "next/server";
import { answerLimitsForAction, configForTrack } from "@/lib/config";
import { polishUtterance } from "@/lib/deepseek";
import {
  assertDemoSelection,
  buildQuestionQueue,
  createRuntimes,
  inferCandidateLevel,
  initialAskUtterance,
} from "@/lib/engine";
import { buildOpeningLine, pickInterviewerName } from "@/lib/persona";
import { newSessionId, pushEvent, saveSession } from "@/lib/store";
import type {
  CandidateLevel,
  InterviewSession,
  ResumeProfile,
  RoleId,
  StyleId,
  TrackId,
} from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      roleId?: RoleId;
      styleId?: StyleId;
      trackId?: TrackId;
      candidateLevel?: CandidateLevel;
      resume?: ResumeProfile;
    };
    const roleId = body.roleId ?? "rd_general";
    const styleId = body.styleId ?? "pressure";
    const trackId: TrackId = body.trackId === "hr_final" ? "hr_final" : "biz";
    assertDemoSelection(roleId, styleId, trackId);

    const resume = body.resume
      ? {
          ...body.resume,
          // 结构化后仍保留完整原文，供冲突证据与复盘摘录
          rawText: body.resume.rawText || "",
          experiences: body.resume.experiences ?? [],
          skills: body.resume.skills ?? [],
          projects: body.resume.projects ?? [],
          education: body.resume.education ?? [],
        }
      : undefined;

    const candidateLevel: CandidateLevel =
      body.candidateLevel === "social" || body.candidateLevel === "campus"
        ? body.candidateLevel
        : inferCandidateLevel(resume);

    const cfg = configForTrack(trackId);
    const queue = buildQuestionQueue(resume, trackId);
    const runtimes = createRuntimes(queue);
    const interviewerName = pickInterviewerName();
    const opening = buildOpeningLine({
      candidateName: resume?.name,
      interviewerName,
      questionCount: queue.length,
      trackId,
    });
    const questionDraft = initialAskUtterance(queue[0]!);
    const polished = await polishUtterance({
      action: "ASK",
      draft: questionDraft,
      questionPrompt: queue[0]!.prompt,
      tone: cfg.tone,
      trackId,
      candidateLevel,
    });
    // 开场白保持口语模板，不交给模型改写，避免又冒出「压力面/模拟」等说法
    const utterance = `${opening}${polished.text}`;
    const limits = answerLimitsForAction({
      action: "ASK",
      question: queue[0],
      utterance,
      softSec: cfg.answerSoftLimitSec,
      hardSec: cfg.answerHardLimitSec,
    });

    const session: InterviewSession = {
      id: newSessionId(),
      roleId,
      trackId,
      candidateLevel,
      config: { ...cfg },
      resume,
      queue,
      currentIndex: 0,
      runtimes,
      lastUtterance: utterance,
      lastAction: "ASK",
      status: "active",
      events: [],
      createdAt: new Date().toISOString(),
      interviewerName,
      sessionTags: [],
      authenticityChallengeCount: 0,
      currentPhase: queue[0]?.phase || (trackId === "hr_final" ? "hr_fit" : "resume_research"),
      resumeConflicts: [],
      codingResults: [],
      pendingConflictChallenge: null,
    };
    pushEvent(session, "start", {
      roleId,
      styleId,
      trackId,
      candidateLevel,
      mocked: polished.mocked,
      interviewerName,
    });
    pushEvent(session, "ask", { questionId: queue[0]!.id, utterance });
    saveSession(session);

    return NextResponse.json({
      sessionId: session.id,
      utterance,
      question: queue[0],
      index: 0,
      total: queue.length,
      config: session.config,
      trackId,
      candidateLevel,
      mockedLlm: polished.mocked,
      interviewerName,
      candidateName: resume?.name || null,
      answerSoftLimitSec: limits.answerSoftLimitSec,
      answerHardLimitSec: limits.answerHardLimitSec,
      phase: session.currentPhase,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "开场失败" },
      { status: 400 },
    );
  }
}
