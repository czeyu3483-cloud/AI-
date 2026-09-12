import { INTEGRITY_END_UTTERANCE, PRESSURE_CONFIG, SKIP_SOFT_UTTERANCE } from "./config";
import { matchReplyBank } from "./replyBank";
import { RD_QUESTIONS } from "./questions/rd";
import type {
  AbilityTag,
  InterviewAction,
  InterviewSession,
  Question,
  QuestionRuntime,
  ResumeProfile,
  RoleId,
  StyleId,
  TurnDecision,
  TurnSignals,
} from "./types";

export function assertDemoSelection(roleId: RoleId, styleId: StyleId) {
  if (roleId !== "rd_general") throw new Error("当前 Demo 仅开放研发岗（其他岗位暂不可选）");
  if (styleId !== "pressure") throw new Error("当前 Demo 仅开放压力面（其他风格暂不可选）");
}

export function buildQuestionQueue(resume?: ResumeProfile): Question[] {
  const fromProjects: Question[] = (resume?.projects || []).slice(0, 2).map((p, idx) => ({
    id: `resume_proj_${idx + 1}`,
    roleId: "rd_general" as const,
    prompt: `看你简历里的「${p.name}」：你个人具体负责哪一块？当时最关键的技术取舍是什么？`,
    intent: "resume_ownership_tradeoff",
    followUpHints: ["个人贡献", "失败方案", "边界", ...(p.highlights || [])],
    rubrics: [
      { dimension: "ownership", weight: 0.5, good: "落到个人动作", poor: "复述宣传语" },
      { dimension: "tradeoff", weight: 0.5, good: "讲清为何选", poor: "无取舍" },
    ],
    referencePoints: p.stack || [],
    fromResume: true,
  }));
  const fromExp: Question[] = (resume?.experiences || []).slice(0, 1).map((e, idx) => ({
    id: `resume_exp_${idx + 1}`,
    roleId: "rd_general" as const,
    prompt: `你在${e.org || "上一段经历"}担任${e.title || "相关角色"}时，印象最深的一次排查或取舍是什么？你具体做了什么？`,
    intent: "resume_experience_depth",
    followUpHints: ["职责边界", ...(e.highlights || [])],
    rubrics: [
      { dimension: "ownership", weight: 0.5, good: "落到个人动作", poor: "空泛描述" },
      { dimension: "depth", weight: 0.5, good: "有过程与结果", poor: "只有结论" },
    ],
    referencePoints: [],
    fromResume: true,
  }));
  return [...fromProjects, ...fromExp, ...RD_QUESTIONS].slice(0, PRESSURE_CONFIG.questionsPerSession);
}

export function createRuntimes(queue: Question[]): QuestionRuntime[] {
  return queue.map((question) => ({
    question,
    followUpCount: 0,
    hintCount: 0,
    reframeCount: 0,
    answerRequestCount: 0,
    userAnswers: [],
    tags: [],
  }));
}

function pressureOf(rt: QuestionRuntime) {
  return rt.followUpCount + rt.hintCount + rt.reframeCount;
}

export function detectSignals(answer: string, silenceStuck?: boolean): TurnSignals {
  const text = answer.trim();
  const signals: TurnSignals = {};
  if (silenceStuck || text.length === 0) signals.stuckSubtype = "cannot_solve";
  if (text.length > 0 && text.length < PRESSURE_CONFIG.minAnswerChars) signals.tooShort = true;
  if (/不会|没学过|不熟悉|没接触过|答不上来|不知道/.test(text)) {
    signals.stuckSubtype = /没学过|没接触过|不熟悉/.test(text) ? "not_learned" : "cannot_solve";
  }
  if (/紧张|有点乱|组织不好/.test(text)) signals.stuckSubtype = "nervous";
  if (/提示|告诉我答案|标准答案|直接说答案/.test(text)) signals.askedForHint = true;
  if (/跳过|下一题|不会做了|放弃/.test(text)) signals.explicitGiveUp = true;
  // 主动承认简历/项目造假、乱写
  if (
    /乱写|瞎写|编的|编造|杜撰|假的|造假|注水|简历.*(乱|假|编)|项目.*(乱写|假的|编的)|经历.*(乱写|假的)/.test(
      text,
    )
  ) {
    signals.integrityBreach = true;
  }
  if (/薪资|多少钱|HC|加班|转正/.test(text)) {
    signals.metaQuestionType = /薪资|多少钱/.test(text) ? "salary" : "process";
  }
  if (/你觉得我|我能过吗|面得怎么样/.test(text)) signals.metaQuestionType = "challenge_interviewer";
  const weCount = (text.match(/我们/g) || []).length;
  const iCount = (text.match(/我(?!们)/g) || []).length;
  if (text.length > 80 && weCount >= 3 && iCount <= 1) signals.scriptedAnswerSuspicion = true;
  if (text.length > 450) signals.tooLong = "timeout";
  return signals;
}

function advance(
  session: InterviewSession,
  via: "SKIP_SOFT" | "ASK",
  skipText: string,
  signals: TurnSignals,
  pendingTags: AbilityTag[],
): TurnDecision {
  const current = session.runtimes[session.currentIndex]!;
  if (pendingTags.length) current.tags = Array.from(new Set([...current.tags, ...pendingTags]));
  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.queue.length) {
    return {
      action: "FINISH",
      utterance:
        via === "SKIP_SOFT"
          ? `${skipText}今天的问题都过完了，我来整理复盘，不当场给通过与否的结论。`
          : "好，本场问题到这里。我来整理结构化复盘，不当场宣判结果。",
      questionId: current.question.id,
      followUpCount: current.followUpCount,
      hintCount: current.hintCount,
      reframeCount: current.reframeCount,
      signals,
      pendingTags,
      done: true,
    };
  }
  session.currentIndex = nextIndex;
  const next = session.runtimes[nextIndex]!;
  const prefix = via === "SKIP_SOFT" ? skipText : "下一个问题。";
  return {
    action: via === "SKIP_SOFT" ? "SKIP_SOFT" : "ASK",
    utterance: `${prefix}${next.question.prompt}`,
    questionId: next.question.id,
    followUpCount: next.followUpCount,
    hintCount: next.hintCount,
    reframeCount: next.reframeCount,
    signals,
    pendingTags,
  };
}

export function decideTurn(input: {
  session: InterviewSession;
  answer: string;
  silenceStuck?: boolean;
}): TurnDecision {
  const { session } = input;
  const cfg = session.config;
  const rt = session.runtimes[session.currentIndex];
  if (!rt) {
    return {
      action: "FINISH",
      utterance: "今天的面试环节到这里。我会整理结构化复盘，不当场宣判结果。",
      followUpCount: 0,
      hintCount: 0,
      reframeCount: 0,
      signals: {},
      done: true,
    };
  }

  const signals = detectSignals(input.answer, input.silenceStuck);
  const pendingTags: AbilityTag[] = [];
  if (input.answer.trim()) rt.userAnswers.push(input.answer.trim());

  // 固定反应库优先：命中则原样回复（1–30；31–100 TODO 见 replyBank.ts）
  const bankHit = matchReplyBank(input.answer, { hintCount: rt.hintCount });
  if (bankHit) {
    signals.replyBankId = bankHit.id;
    if (bankHit.flags.endInterview) {
      pendingTags.push("role_mismatch_suspected");
      signals.integrityBreach = true;
      if (pendingTags.length) rt.tags = Array.from(new Set([...rt.tags, ...pendingTags]));
      return {
        action: "FINISH",
        utterance: bankHit.reply,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags,
        done: true,
        verbatim: true,
      };
    }
    if (bankHit.flags.hintOnce) {
      rt.hintCount += 1;
      pendingTags.push("weak_independent_problem_solving");
      return {
        action: "REFRAME",
        utterance: bankHit.reply,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals: { ...signals, askedForHint: true, answerRequestCount: rt.answerRequestCount },
        pendingTags,
        verbatim: true,
      };
    }
    // 常规追问式命中：同题继续，话术不润色
    if (pressureOf(rt) < cfg.maxPressurePerQuestion) {
      rt.followUpCount += 1;
    }
    return {
      action: "FOLLOW_UP_OWNERSHIP",
      utterance: bankHit.reply,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      verbatim: true,
    };
  }

  // 简历/经历不实：真人面试官会直接结束，而不是继续控场套话
  if (signals.integrityBreach) {
    pendingTags.push("role_mismatch_suspected");
    if (pendingTags.length) rt.tags = Array.from(new Set([...rt.tags, ...pendingTags]));
    return {
      action: "FINISH",
      utterance: INTEGRITY_END_UTTERANCE,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      pendingTags,
      done: true,
      verbatim: true,
    };
  }

  if (signals.metaQuestionType) {
    return {
      action: "FORMULA_DEFLECT",
      utterance:
        signals.metaQuestionType === "salary"
          ? "薪资这块一般是 HR 那边聊，咱们先把技术问题过完。"
          : "录用结论这边不好当场说，咱们继续把当前问题聊清楚。",
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
    };
  }

  if (signals.askedForHint) {
    rt.answerRequestCount += 1;
    pendingTags.push("weak_independent_problem_solving");
    return {
      action: "FORMULA_DEFLECT",
      utterance: "我不会直接给答案。你可以先讲你目前能想到的排查或设计思路。",
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals: { ...signals, answerRequestCount: rt.answerRequestCount },
      pendingTags,
    };
  }

  const stuck =
    Boolean(input.silenceStuck) ||
    Boolean(signals.explicitGiveUp) ||
    signals.stuckSubtype === "not_learned" ||
    signals.stuckSubtype === "cannot_solve";

  if (stuck) {
    if (signals.stuckSubtype === "not_learned") pendingTags.push("knowledge_gap_not_learned");
    if (signals.stuckSubtype === "cannot_solve") pendingTags.push("can_reason_trainable");
    if (signals.stuckSubtype === "nervous") pendingTags.push("nervous_but_capable");

    // 明显答不上来：记录表现后换题，不刨根问底
    return advance(session, "SKIP_SOFT", SKIP_SOFT_UTTERANCE, signals, pendingTags);
  }

  if (signals.tooShort && pressureOf(rt) < cfg.maxPressurePerQuestion) {
    rt.followUpCount += 1;
    return {
      action: "FOLLOW_UP_OWNERSHIP",
      utterance: "再具体一点：你当时亲自做了哪一步？结果怎么验证？",
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
    };
  }

  if (signals.scriptedAnswerSuspicion && rt.followUpCount < cfg.maxFollowUpsPerQuestion) {
    rt.followUpCount += 1;
    pendingTags.push("surface_knowledge_no_practice");
    return {
      action: "FOLLOW_UP_PITFALL",
      utterance: "听起来很完整。当时有没有失败过的方案？你为什么放弃它？",
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      pendingTags,
    };
  }

  if (signals.tooLong === "timeout") {
    return {
      action: "TIMEBOX",
      utterance: "你讲得比较完整，我先记一下。时间关系，这个点我们先收到这里。",
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
    };
  }

  const enough =
    input.answer.trim().length >= cfg.minAnswerChars &&
    (rt.followUpCount >= 1 || input.answer.trim().length >= 80);

  if (
    !enough &&
    rt.followUpCount < cfg.maxFollowUpsPerQuestion &&
    pressureOf(rt) < cfg.maxPressurePerQuestion
  ) {
    rt.followUpCount += 1;
    const actions: InterviewAction[] = [
      "FOLLOW_UP_BOUNDARY",
      "FOLLOW_UP_PITFALL",
      "FOLLOW_UP_OWNERSHIP",
      "FOLLOW_UP_TRADEOFF",
    ];
    const action = actions[Math.floor(Math.random() * 3)]!;
    const utterance =
      action === "FOLLOW_UP_BOUNDARY"
        ? "这个方案在什么场景下会失效？"
        : action === "FOLLOW_UP_PITFALL"
          ? "落地时踩过什么坑？你怎么处理的？"
          : action === "FOLLOW_UP_OWNERSHIP"
            ? "其中哪一部分是你独立完成的？怎么证明？"
            : "如果只能保留一个关键取舍，你会留哪个？为什么？";
    return {
      action,
      utterance,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
    };
  }

  return advance(session, "ASK", "", signals, pendingTags);
}

export function initialAskUtterance(first: Question) {
  // 开场白由 start 路由用 persona 组装；这里仅返回首题，避免重复介绍
  return first.prompt;
}
