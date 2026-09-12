import { NextResponse } from "next/server";
import { configForTrack } from "@/lib/config";
import { polishUtterance } from "@/lib/deepseek";
import {
  assertDemoSelection,
  buildQuestionQueue,
  createRuntimes,
  initialAskUtterance,
} from "@/lib/engine";
import { buildOpeningLine, pickInterviewerName } from "@/lib/persona";
import { newSessionId, pushEvent, saveSession } from "@/lib/store";
import type { InterviewSession, ResumeProfile, RoleId, StyleId, TrackId } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      roleId?: RoleId;
      styleId?: StyleId;
      trackId?: TrackId;
      resume?: ResumeProfile;
    };
    const roleId = body.roleId ?? "rd_general";
    const styleId = body.styleId ?? "pressure";
    const trackId: TrackId = body.trackId === "hr_final" ? "hr_final" : "biz";
    assertDemoSelection(roleId, styleId, trackId);

    const resume = body.resume
      ? {
          ...body.resume,
          experiences: body.resume.experiences ?? [],
          skills: body.resume.skills ?? [],
          projects: body.resume.projects ?? [],
          education: body.resume.education ?? [],
        }
      : undefined;
    const behavior = configForTrack(trackId);
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
      tone: behavior.tone,
      trackId,
    });
    // 开场白保持口语模板，不交给模型改写，避免又冒出「压力面/模拟」等说法
    const utterance = `${opening}${polished.text}`;

    const session: InterviewSession = {
      id: newSessionId(),
      roleId,
      trackId,
      config: behavior,
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
    };
    pushEvent(session, "start", {
      roleId,
      styleId,
      trackId,
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
      mockedLlm: polished.mocked,
      interviewerName,
      candidateName: resume?.name || null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "开场失败" },
      { status: 400 },
    );
  }
}
