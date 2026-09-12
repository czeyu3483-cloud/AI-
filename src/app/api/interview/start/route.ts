import { NextResponse } from "next/server";
import { PRESSURE_CONFIG } from "@/lib/config";
import { polishUtterance } from "@/lib/deepseek";
import {
  assertDemoSelection,
  buildQuestionQueue,
  createRuntimes,
  initialAskUtterance,
} from "@/lib/engine";
import { newSessionId, pushEvent, saveSession } from "@/lib/store";
import type { InterviewSession, ResumeProfile, RoleId, StyleId } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      roleId?: RoleId;
      styleId?: StyleId;
      resume?: ResumeProfile;
    };
    const roleId = body.roleId ?? "rd_general";
    const styleId = body.styleId ?? "pressure";
    assertDemoSelection(roleId, styleId);

    const resume = body.resume
      ? {
          ...body.resume,
          experiences: body.resume.experiences ?? [],
          skills: body.resume.skills ?? [],
          projects: body.resume.projects ?? [],
          education: body.resume.education ?? [],
        }
      : undefined;
    const queue = buildQuestionQueue(resume);
    const runtimes = createRuntimes(queue);
    const draft = initialAskUtterance(queue[0]!);
    const polished = await polishUtterance({
      action: "ASK",
      draft,
      questionPrompt: queue[0]!.prompt,
      tone: PRESSURE_CONFIG.tone,
    });

    const session: InterviewSession = {
      id: newSessionId(),
      roleId,
      config: { ...PRESSURE_CONFIG },
      resume,
      queue,
      currentIndex: 0,
      runtimes,
      lastUtterance: polished.text,
      lastAction: "ASK",
      status: "active",
      events: [],
      createdAt: new Date().toISOString(),
    };
    pushEvent(session, "start", { roleId, styleId, mocked: polished.mocked });
    pushEvent(session, "ask", { questionId: queue[0]!.id, utterance: polished.text });
    saveSession(session);

    return NextResponse.json({
      sessionId: session.id,
      utterance: polished.text,
      question: queue[0],
      index: 0,
      total: queue.length,
      config: session.config,
      mockedLlm: polished.mocked,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "开场失败" },
      { status: 400 },
    );
  }
}
