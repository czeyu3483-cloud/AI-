import {
  INTEGRITY_END_UTTERANCE,
  POLICY_HR_DEFLECT,
  POLICY_LEADER_DEFLECT,
  POLICY_RAMBLING_NEXT,
  POLICY_THINKING_WAIT,
  PRESSURE_CONFIG,
  SKIP_SOFT_UTTERANCE,
  VAGUE_SOFT_SKIP_UTTERANCE,
  configForTrack,
} from "./config";
import { pickCodingProblem } from "./codingProblems";
import {
  FABRICATION_PROBE_UTTERANCE,
  NOT_DONE_TRANSFER_UTTERANCE,
  DEFAULT_CANDIDATE_LEVEL,
  hintUtterance,
  pickCoachLine,
  RESUME_CONFLICT_GENERIC_UTTERANCE,
} from "./interviewerPolicy";
import {
  extractQuestionFocus,
  heuristicTopicRelevance,
  pickOffTopicCorrection,
  type TopicRelevanceResult,
} from "./offTopic";
import { phaseLabel } from "./phases";
import { matchReplyBank } from "./replyBank";
import {
  analysisToRecord,
  classifyConflictExplanation,
  craftResumeConflictUtterance,
  detectResumeConflict,
  utteranceForExplainOutcome,
} from "./resumeConflict";
import { pickSubjectQuestion } from "./subjectQuestions";
import {
  pickAdvancePrefix,
  pickFollowUpTemplate,
  pickIntroSupplement,
  pickSkipSoftPrefix,
  pickVagueProbe,
} from "./utterancePool";
import { HR_QUESTIONS } from "./questions/hr";
import { RD_QUESTIONS } from "./questions/rd";
import type {
  AbilityTag,
  CandidateLevel,
  InterviewAction,
  InterviewPhase,
  InterviewSession,
  Question,
  QuestionRuntime,
  ResumeConsistencyAnalysis,
  ResumeProfile,
  RoleId,
  StyleId,
  TrackId,
  TurnDecision,
  TurnSignals,
} from "./types";

export function assertDemoSelection(roleId: RoleId, styleId: StyleId, trackId?: TrackId) {
  if (roleId !== "rd_general") throw new Error("当前 Demo 仅开放研发岗（其他岗位暂不可选）");
  if (styleId !== "pressure") throw new Error("当前 Demo 仅开放压力面（其他风格暂不可选）");
  if (trackId === "hr_final") {
    throw new Error("当前 Demo HR终面暂不可选（界面可见但未开放）");
  }
  if (trackId && trackId !== "biz") {
    throw new Error("当前 Demo 仅开放业务面");
  }
}

function addSessionTag(session: InterviewSession, tag: AbilityTag) {
  session.sessionTags = Array.from(new Set([...(session.sessionTags || []), tag]));
}

/** 从简历启发式推断校招/实习 vs 社招；无信号则默认校招/实习 */
export function inferCandidateLevel(resume?: ResumeProfile): CandidateLevel {
  if (!resume) return DEFAULT_CANDIDATE_LEVEL;
  const blob = [
    resume.rawText || "",
    resume.summary || "",
    ...(resume.experiences || []).map((e) => `${e.org || ""} ${e.title || ""} ${e.period || ""}`),
  ]
    .join(" ")
    .toLowerCase();

  const campusHit =
    /实习|校招|应届|在读|本科|研究生|大三|大四|campus|intern|fresh graduate|应届生/.test(blob);
  const socialHit =
    /社招|全职|年经验|工作年限|senior|专家|负责人|带队|\d+\s*年/.test(blob) &&
    !/实习/.test(blob);

  if (campusHit && !socialHit) return "campus";
  if (socialHit && !campusHit) return "social";
  return DEFAULT_CANDIDATE_LEVEL;
}

export function buildQuestionQueue(
  resume?: ResumeProfile,
  trackId: TrackId = "biz",
): Question[] {
  const cfg = configForTrack(trackId);

  if (trackId === "hr_final") {
    const fromResume: Question[] = (resume?.projects || []).slice(0, 1).map((p, idx) => ({
      id: `hr_resume_proj_${idx + 1}`,
      roleId: "rd_general" as const,
      trackId: "hr_final" as const,
      phase: "hr_fit" as const,
      prompt: `结合你简历里的「${p.name}」：你在团队里更常扮演什么角色？和别人协作时你最在意什么？`,
      intent: "hr_resume_collab",
      followUpHints: ["协作方式", "冲突", ...(p.highlights || [])],
      rubrics: [
        { dimension: "collaboration", weight: 0.5, good: "角色与协作清晰", poor: "空泛表态" },
        { dimension: "fit", weight: 0.5, good: "价值观可落地", poor: "套话" },
      ],
      referencePoints: [],
      fromResume: true,
    }));
    const fromExp: Question[] = (resume?.experiences || []).slice(0, 1).map((e, idx) => ({
      id: `hr_resume_exp_${idx + 1}`,
      roleId: "rd_general" as const,
      trackId: "hr_final" as const,
      phase: "hr_fit" as const,
      prompt: `你在${e.org || "上一段经历"}时，印象最深的一次协作或冲突是什么？你怎么处理的？`,
      intent: "hr_resume_conflict",
      followUpHints: ["沟通", ...(e.highlights || [])],
      rubrics: [
        { dimension: "collaboration", weight: 0.5, good: "有动作与结果", poor: "空话" },
        { dimension: "communication", weight: 0.5, good: "对齐预期", poor: "回避" },
      ],
      referencePoints: [],
      fromResume: true,
    }));
    const hrBank = HR_QUESTIONS.map((q) => ({ ...q, phase: "hr_fit" as const }));
    return [...fromResume, ...fromExp, ...hrBank].slice(0, cfg.questionsPerSession);
  }

  // —— 业务面：自我介绍 + 约 4 主问题 ——
  // 0 自我介绍；1–2 简历深挖（结合简历自然点名）；3 学科专业题库；4 编程（本次可不练）
  const introQ: Question = {
    id: "biz_self_intro",
    roleId: "rd_general",
    trackId: "biz",
    phase: "self_intro",
    prompt: "先做个简单的自我介绍吧，简短说一下就行，重点说说你的背景和最近在做的事。",
    intent: "self_intro",
    followUpHints: ["背景", "经历", "动机"],
    rubrics: [
      { dimension: "communication", weight: 0.6, good: "结构清楚、重点突出", poor: "东拉西扯" },
      { dimension: "fit", weight: 0.4, good: "与岗位相关", poor: "完全无关" },
    ],
    referencePoints: [],
    fromResume: false,
    isSelfIntro: true,
  };

  const primary = resume?.projects?.[0];
  const secondary = resume?.projects?.[1];
  const exp0 = resume?.experiences?.[0];
  const skill0 = (resume?.skills || [])[0];
  const stackHint = (primary?.stack || resume?.skills || []).slice(0, 4);
  const stackKnown = stackHint.length > 0;
  const digTarget = primary?.name;
  const altStack =
    stackHint[0] && /react/i.test(stackHint[0])
      ? "Vue"
      : stackHint[0] && /vue/i.test(stackHint[0])
        ? "React"
        : "更常见的替代方案";

  const digs: Question[] = [];
  if (primary && digTarget) {
    digs.push({
      id: "biz_dig_why_scale",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: stackKnown
        ? `你简历里写了做过「${digTarget}」项目，我注意到上面写到${stackHint.slice(0, 2).join("、")}——为什么选它，而不是${altStack}？数据量大概多大，列表/状态这类难点你怎么处理的？`
        : `你简历里写了做过「${digTarget}」项目，能具体说说你在里面负责什么吗？最关键的一次技术取舍是什么，规模与约束大概怎样？`,
      intent: "resume_dig_why_scale",
      followUpHints: ["取舍理由", "规模", "虚拟列表/状态", ...(primary.highlights || [])],
      rubrics: [
        { dimension: "tradeoff", weight: 0.5, good: "讲清为何选", poor: "无取舍" },
        { dimension: "depth", weight: 0.5, good: "有规模与约束", poor: "空谈技术名" },
      ],
      referencePoints: stackHint,
      fromResume: true,
    });
    digs.push({
      id: "biz_dig_ownership",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: `再围绕简历上的「${digTarget}」往下挖：哪个模块是你个人真正负责的？出过错或失败方案吗，你怎么收的？`,
      intent: "resume_dig_ownership",
      followUpHints: ["模块边界", "失败", "协作", ...(primary.highlights || [])],
      rubrics: [
        { dimension: "ownership", weight: 0.5, good: "落到个人动作", poor: "复述宣传语" },
        { dimension: "pitfall", weight: 0.5, good: "有失败与复盘", poor: "只谈成功" },
      ],
      referencePoints: primary.highlights || [],
      fromResume: true,
    });
  } else if (secondary) {
    digs.push({
      id: "biz_dig_secondary_why",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: `我看你简历里提到「${secondary.name}」，能具体说说你在里面负责什么吗？最难的一次取舍是什么，规模大概怎样？`,
      intent: "resume_dig_why_scale",
      followUpHints: ["取舍", "规模", ...(secondary.highlights || [])],
      rubrics: [
        { dimension: "tradeoff", weight: 0.5, good: "讲清为何选", poor: "无取舍" },
        { dimension: "depth", weight: 0.5, good: "有规模与约束", poor: "空谈" },
      ],
      referencePoints: [],
      fromResume: true,
    });
    digs.push({
      id: "biz_dig_secondary_own",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: `还是「${secondary.name}」：你个人真正负责哪一块？有没有失败方案，你怎么收的？`,
      intent: "resume_dig_ownership",
      followUpHints: ["职责", "失败", ...(secondary.highlights || [])],
      rubrics: [
        { dimension: "ownership", weight: 0.5, good: "落到个人动作", poor: "全程我们" },
        { dimension: "pitfall", weight: 0.5, good: "有失败与复盘", poor: "只谈成功" },
      ],
      referencePoints: [],
      fromResume: true,
    });
  } else if (exp0) {
    digs.push({
      id: "biz_dig_exp_why",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: `我看你的简历里有提到在${exp0.org || "相关单位"}${/实习/.test(`${exp0.title || ""}${exp0.period || ""}`) ? "实习" : "工作"}过，那我想问一下：担任${exp0.title || "相关角色"}时，最关键的一次技术或方案取舍是什么？为什么这么选？`,
      intent: "resume_dig_why_scale",
      followUpHints: ["取舍理由", ...(exp0.highlights || [])],
      rubrics: [
        { dimension: "tradeoff", weight: 0.5, good: "讲清为何选", poor: "无取舍" },
        { dimension: "depth", weight: 0.5, good: "有过程与约束", poor: "空谈" },
      ],
      referencePoints: [],
      fromResume: true,
    });
    digs.push({
      id: "biz_dig_exp_own",
      roleId: "rd_general",
      trackId: "biz",
      phase: "resume_deep_dive",
      prompt: skill0
        ? `我注意到你简历上写熟练掌握${skill0}，结合刚才那段经历：哪件事是你独立闭环的？出过错吗，你怎么定位和收尾的？`
        : `同一段经历里，哪件事是你独立闭环的？出过错吗，你怎么定位和收尾的？`,
      intent: "resume_dig_ownership",
      followUpHints: ["个人动作", "失败", ...(exp0.highlights || [])],
      rubrics: [
        { dimension: "ownership", weight: 0.5, good: "落到个人动作", poor: "空泛描述" },
        { dimension: "pitfall", weight: 0.5, good: "有失败与复盘", poor: "只谈成功" },
      ],
      referencePoints: [],
      fromResume: true,
    });
  } else {
    // 无简历锚点：用题库里偏取舍/故障的深挖题，避开「介绍项目背景」类复述
    digs.push({
      ...RD_QUESTIONS[1]!,
      id: "biz_dig_fallback_1",
      phase: "resume_deep_dive",
      fromResume: false,
    });
    digs.push({
      ...RD_QUESTIONS[2]!,
      id: "biz_dig_fallback_2",
      phase: "resume_deep_dive",
      fromResume: false,
    });
  }

  // Q3：学科专业题库（高等代数/线性代数/概率论/数理统计/微积分）；当场不判对错
  const resumeBlob = [
    resume?.rawText || "",
    resume?.summary || "",
    ...(resume?.education || []).map((e) => `${e.major || ""} ${e.degree || ""}`),
    ...(resume?.skills || []),
  ].join(" ");
  const subject = pickSubjectQuestion(
    (resume?.projects?.length || 0) * 17 + (resume?.skills?.length || 0) * 3 + 11,
    resumeBlob,
  );
  const knowledgeQ: Question = {
    id: `biz_subject_${subject.id}`,
    roleId: "rd_general",
    trackId: "biz",
    phase: "professional_knowledge",
    prompt: skill0
      ? `我注意到你简历上的专业背景，想问一道${subject.category}相关的问题：${subject.prompt}`
      : `接下来一道${subject.category}的问题：${subject.prompt}`,
    intent: "subject_bank",
    followUpHints: [subject.category],
    rubrics: [
      { dimension: "subject_accuracy", weight: 0.6, good: "要点对齐标准答案", poor: "概念错误或空白" },
      { dimension: "subject_clarity", weight: 0.4, good: "表述清楚可检验", poor: "含糊不清" },
    ],
    referencePoints: [],
    fromResume: false,
    subjectQuestionId: subject.id,
    subjectCategory: subject.category,
    standardAnswer: subject.standardAnswer,
    gradingCriteria: subject.gradingCriteria,
  };

  const codingProblem = pickCodingProblem((resume?.projects?.length || 0) + 1);
  const codingQ: Question = {
    id: `biz_coding_${codingProblem.id}`,
    roleId: "rd_general",
    trackId: "biz",
    phase: "coding",
    prompt: `编程环节：${codingProblem.title}。请在编辑器里手写实现并跑测；如果这次不想练这道题，也可以先不练、继续面试。${codingProblem.prompt}`,
    intent: "coding_exercise",
    followUpHints: [codingProblem.complexityHint || "复杂度"],
    rubrics: [
      { dimension: "coding", weight: 0.6, good: "用例通过且思路清晰", poor: "无法运行或全错" },
      { dimension: "complexity", weight: 0.4, good: "能说明复杂度", poor: "无复杂度意识" },
    ],
    referencePoints: [],
    fromResume: false,
    isCoding: true,
    codingProblemId: codingProblem.id,
  };

  // 自我介绍 + 4 主问题（深挖×2 + 学科题 + 编程）
  const main = [...digs.slice(0, 2), knowledgeQ, codingQ];
  return [introQ, ...main];
}

/** 自我介绍结束后，用介绍细节 enrichment 后续深挖题干 */
export function enrichDigsWithSelfIntro(session: InterviewSession) {
  const intro = (session.selfIntroText || "").trim();
  if (!intro) return;
  const resumeNames = [
    ...(session.resume?.projects || []).map((p) => p.name),
    ...(session.resume?.experiences || []).map((e) => e.org || "").filter(Boolean),
  ].filter(Boolean) as string[];
  const fromResume = resumeNames.find((n) => n && intro.includes(n));
  const clip =
    intro
      .replace(/\s+/g, "")
      .match(/(?:在|于)?([\u4e00-\u9fff]{2,12}(?:公司|大学|学院)?|(?:负责|参与)[\u4e00-\u9fff]{2,10})/g) ||
    [];
  const hook = fromResume || clip[0]?.replace(/^(在|于)/, "") || null;
  if (!hook || hook.length < 2) return;
  for (const rt of session.runtimes) {
    if (rt.question.phase !== "resume_deep_dive") continue;
    if (/刚才自我介绍|你刚提到/.test(rt.question.prompt)) continue;
    rt.question.prompt = `结合你刚才自我介绍里提到的「${hook}」，以及简历：${rt.question.prompt}`;
    const qi = session.queue.findIndex((q) => q.id === rt.question.id);
    if (qi >= 0) session.queue[qi] = rt.question;
  }
}

export function phaseOf(session: InterviewSession): InterviewPhase {
  const q = session.queue[session.currentIndex];
  return q?.phase || (session.trackId === "hr_final" ? "hr_fit" : "resume_research");
}

export { phaseLabel } from "./phases";

export function createRuntimes(queue: Question[]): QuestionRuntime[] {
  return queue.map((question) => ({
    question,
    followUpCount: 0,
    hintCount: 0,
    reframeCount: 0,
    answerRequestCount: 0,
    vagueFollowUpCount: 0,
    coachCount: 0,
    transferProbeCount: 0,
    resumeConflictProbeCount: 0,
    offTopicProbeCount: 0,
    hintLevel: 0,
    userAnswers: [],
    tags: [],
  }));
}

function pressureOf(rt: QuestionRuntime) {
  return rt.followUpCount + rt.hintCount + rt.reframeCount;
}

/**
 * 根据候选人最新一句里的具体名词/职责转移，生成下一刀追问。
 * 例：先说「负责设计」→ 问设计细节；改口「写代码」→ 追问代码内容/怎么写。
 * 避免反复同一句「太笼统/再具体一点/可以再详细」。
 */
export function craftGroundedFollowUp(
  answer: string,
  action: InterviewAction,
  trackId: TrackId = "biz",
): string {
  const text = answer.trim();
  const seed = text.length + action.length;

  if (trackId === "hr_final") {
    if (/团队|协作|同学|同事|沟通/.test(text)) {
      return "当时分歧具体在哪？你做了哪一步沟通？";
    }
    if (/压力|加班|紧张|熬夜|节奏/.test(text)) {
      return "那种节奏下你具体怎么拆优先级、怎么调整状态？";
    }
    if (/兴趣|喜欢|想做|动机|为什么/.test(text)) {
      return "这个兴趣从哪件事开始的？最近一次能证明它的经历是什么？";
    }
    if (/规划|三年|成长|上手/.test(text)) {
      return "前三个月你会先补哪一块？怎么衡量自己上手了？";
    }
    if (text.length > 0 && text.length < 80) {
      const clip = text.replace(/\s+/g, "").slice(0, 24);
      return `你说「${clip}」——能举一个具体场景吗？你当时怎么想、怎么做的？`;
    }
    return pickFollowUpTemplate(action, trackId, seed);
  }

  // 后说的职责优先（话题转移）：代码/编写压过纯「设计」
  if (/代码|编写|写代码|coding|实现(?!方案)/i.test(text)) {
    return "你刚提到写代码——具体写的哪一块？关键逻辑你是怎么实现的？";
  }
  if (/接口|API/i.test(text)) {
    return "接口这块：你负责哪几个、主要路径是什么？量和延迟你怎么看的？";
  }
  if (/平台/.test(text) && /负责|做了|编写|开发/.test(text)) {
    return "这个平台里你亲手落地的模块是哪一块？怎么落到代码里的？";
  }
  if (/设计|架构/.test(text) && !/代码|编写|实现/.test(text)) {
    return "你提到设计，设计里你拍板的最关键一块是什么？依据是什么？";
  }
  if (/优化|性能|耗时|延迟|QPS/i.test(text)) {
    return "优化前指标是什么？你改了哪处、效果怎么验证？";
  }
  if (/排查|故障|慢查询|bug|线上/i.test(text)) {
    return "排查时你第一步看什么？最后根因是什么、你怎么确认的？";
  }
  if (/数据库|SQL|索引|缓存|Redis|MySQL|Postgres/i.test(text)) {
    return "数据这块你具体怎么选型的？有没有踩过坑？";
  }
  {
    const we = (text.match(/我们/g) || []).length;
    const i = (text.match(/我(?!们)/g) || []).length;
    if (we >= 2 && i === 0) {
      return "团队分工里，哪一段是你独立完成的？怎么证明？";
    }
  }

  if (action === "FOLLOW_UP_BOUNDARY") {
    return pickFollowUpTemplate("FOLLOW_UP_BOUNDARY", trackId, seed);
  }
  if (action === "FOLLOW_UP_PITFALL") {
    return pickFollowUpTemplate("FOLLOW_UP_PITFALL", trackId, seed);
  }
  if (action === "FOLLOW_UP_TRADEOFF") {
    return pickFollowUpTemplate("FOLLOW_UP_TRADEOFF", trackId, seed);
  }
  // ownership / default：仍要落到上一句，而不是空洞的「再具体一点」
  if (text.length > 0 && text.length < 80) {
    const clip = text.replace(/\s+/g, "").slice(0, 24);
    return `你说「${clip}」——其中你亲自做的动作是哪一步？结果怎么验证？`;
  }
  return pickFollowUpTemplate(action, trackId, seed);
}

/** 候选人要求复述当前问题/上一句面试官话术（原样重播，禁止改写） */
export function isRepeatRequest(answer: string): boolean {
  const text = answer.trim();
  if (!text || text.length > 80) return false;
  return (
    /再说一遍|再讲一遍|重复一下|重复一遍|没听清|没有听清|没听清楚|听不清|你能把问题再说一遍|把问题再说一遍|问题再说一遍|再说一遍问题|再问一遍|再读一遍/.test(
      text,
    )
  );
}

function isShortThinkingRequest(text: string) {
  // 短句要思考时间；长答里顺带「我想一下」不算纯等待
  if (text.length > 40) return false;
  return /我想一下|让我想一下|我想想|给我一点时间|给我点时间|重新组织一下|稍等一下|让我整理一下/.test(
    text,
  );
}

function detectRambling(text: string) {
  const thenCount = (text.match(/然后/g) || []).length;
  const filler =
    /总而言之|综上所述|简单来说就是|反正就是|然后又然后|这个那个|就是说就是说/.test(text);
  return text.length > 450 || thenCount >= 6 || (text.length > 280 && (thenCount >= 4 || filler));
}

/** 空泛 / 笼统 / 不够细致：缺具体动作、数据、场景 */
export function isVagueAnswer(answer: string): boolean {
  const text = answer.trim();
  if (!text) return false;

  const vaguePhrase =
    /大概|反正就|就是那个|然后那个|随便|差不多|之类的|等等吧|整体上|基本上就是|做了一些|参与了一下|负责相关|比较笼统|不太细|说不太清|没什么特别|一般般|还行吧|感觉还行|就那样|空泛|笼统|不太清楚细节|主要是帮忙|跟着做/.test(
      text,
    );

  const hasConcrete =
    /\d+%|\d+\s*ms|\d+\s*秒|P95|QPS|接口|SQL|索引|缓存|回滚|根因|我独立|我负责.{0,8}(模块|接口|页面|服务)|具体(做了|改了|查了)|第一步|验证/.test(
      text,
    );

  // 短而不落地，或套话多、几乎无「我」的动作
  if (text.length > 0 && text.length < 40 && !hasConcrete) return true;
  if (vaguePhrase && !hasConcrete) return true;
  if (text.length < 100 && vaguePhrase) return true;

  const we = (text.match(/我们/g) || []).length;
  const i = (text.match(/我(?!们)/g) || []).length;
  if (text.length >= 40 && text.length <= 160 && we >= 2 && i === 0 && !hasConcrete) {
    return true;
  }
  return false;
}

export function detectSignals(answer: string, silenceStuck?: boolean): TurnSignals {
  const text = answer.trim();
  const signals: TurnSignals = {};
  if (silenceStuck || text.length === 0) signals.stuckSubtype = "cannot_solve";
  if (text.length > 0 && text.length < PRESSURE_CONFIG.minAnswerChars) signals.tooShort = true;

  // 区分：不会 / 没学过 / 没做过（互不混同）
  const notDone = /没做过|没有做过|没有实践|没实操过|纯理论|没落地过|没有相关实战/.test(text);
  const notLearned = /没学过|没接触过|不熟悉这|这块没学/.test(text);
  const cannotSolve = /不会|答不上来|不知道怎么|想不出来|做不出来/.test(text);

  if (notDone) {
    signals.notDoneBefore = true;
  } else if (notLearned) {
    signals.stuckSubtype = "not_learned";
  } else if (cannotSolve) {
    signals.stuckSubtype = "cannot_solve";
  }

  if (/紧张|有点乱|组织不好|语无伦次|不知道怎么组织/.test(text)) {
    signals.stuckSubtype = "nervous";
    signals.needsCoach = true;
  }
  if (/提示|告诉我答案|标准答案|直接说答案/.test(text)) signals.askedForHint = true;
  if (/跳过|下一题|不会做了|放弃/.test(text)) signals.explicitGiveUp = true;

  // 主动承认简历/项目造假、乱写、挂名
  if (
    /乱写|瞎写|编的|编造|杜撰|假的|造假|注水|假经历|挂名|简历.*(乱|假|编)|项目.*(乱写|假的|编的)|经历.*(乱写|假的|编)/.test(
      text,
    )
  ) {
    signals.integrityBreach = true;
  }

  // 未承认造假，但细节含糊可疑 → 交叉核实（不直接结束）
  if (
    !signals.integrityBreach &&
    text.length > 20 &&
    /应该是|大概是|可能是|我猜|好像是|记不清具体|差不多就|估计有/.test(text) &&
    /(项目|简历|负责|指标|优化|上线|性能)/.test(text)
  ) {
    signals.fabricationSuspicion = true;
  }

  if (isShortThinkingRequest(text)) {
    signals.needsTimeToThink = true;
  }

  // 跑题/元问题：薪资加班等 → HR；过不过/录用/内部政策/改约八卦 → 领导/面试环节
  if (/薪资|工资|多少钱|HC|加班|调休|福利|五险|年终奖|发多少|什么待遇/.test(text)) {
    signals.metaQuestionType = "salary";
  } else if (
    /你觉得我|我能过吗|能不能过|面得怎么样|有机会吗|录用|offer|过不过|能过吗|通过概率|内部政策|编制|名额/.test(
      text,
    )
  ) {
    signals.metaQuestionType = "challenge_interviewer";
  } else if (
    /改约|改时间|下次再面|你们组.*怎么样|领导.*怎么样|面试官你几级|什么时候出结果|多久能知道|团队栈.*听说|八卦/.test(
      text,
    )
  ) {
    signals.metaQuestionType = "process";
  }

  const weCount = (text.match(/我们/g) || []).length;
  const iCount = (text.match(/我(?!们)/g) || []).length;
  if (text.length > 80 && weCount >= 3 && iCount <= 1) signals.scriptedAnswerSuspicion = true;

  if (text.length > 450) signals.tooLong = "timeout";
  if (detectRambling(text)) {
    signals.rambling = true;
    // 超长才直接 timebox；中等啰嗦可先教练结构化
    if (text.length > 450) signals.tooLong = "timeout";
    if (text.length >= 80 && text.length <= 450 && !isVagueAnswer(text)) {
      signals.needsCoach = true;
    }
  }

  if (isVagueAnswer(text)) signals.vague = true;

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
  const seed = session.currentIndex + (session.authenticityChallengeCount || 0);
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
  session.currentPhase = next.question.phase || phaseOf(session);
  // 学科题作答后：只用自然过渡，绝不暗示对错
  const fromSubject =
    current.question.phase === "professional_knowledge" ||
    Boolean(current.question.subjectQuestionId);
  const prefix =
    via === "SKIP_SOFT"
      ? skipText || pickSkipSoftPrefix(seed)
      : fromSubject
        ? pickAdvancePrefix(seed + 11) // 学科题后只过渡，不暗示对错；话术轮换
        : pickAdvancePrefix(seed);
  // 阶段切换时简短提示（不赞美、不嘲讽）
  const prevPhase = current.question.phase;
  const nextPhase = next.question.phase;
  const phaseBridge =
    prevPhase &&
    nextPhase &&
    prevPhase !== nextPhase &&
    prevPhase !== "self_intro" &&
    !fromSubject
      ? `接下来进入${phaseLabel(nextPhase)}。`
      : "";
  return {
    action: via === "SKIP_SOFT" ? "SKIP_SOFT" : "ASK",
    utterance: `${prefix}${phaseBridge}${next.question.prompt}`,
    questionId: next.question.id,
    followUpCount: next.followUpCount,
    hintCount: next.hintCount,
    reframeCount: next.reframeCount,
    signals,
    pendingTags,
    // 过渡+题干已成型：禁止润色改写成打断/追问，避免卡在自我介绍后听感错乱
    verbatim: true,
  };
}

/** 跑题：最多纠偏 1 次；再偏/空泛走既有 soft-skip */
function handleOffTopicCap(
  session: InterviewSession,
  rt: QuestionRuntime,
  signals: TurnSignals,
  pendingTags: AbilityTag[],
  topic?: TopicRelevanceResult,
): TurnDecision | null {
  if (!signals.offTopic && !topic?.offTopic) return null;
  signals.offTopic = true;
  const focus = topic?.focus || extractQuestionFocus(rt.question);
  if (rt.offTopicProbeCount >= 1) {
    // 纠偏后仍跑题 → 视作不够切题，软换题（沿用 vague soft-skip 节奏）
    pendingTags.push("vague_insufficient_detail");
    addSessionTag(session, "vague_insufficient_detail");
    return advance(session, "SKIP_SOFT", VAGUE_SOFT_SKIP_UTTERANCE, signals, pendingTags);
  }
  rt.offTopicProbeCount += 1;
  rt.followUpCount += 1;
  const utterance = pickOffTopicCorrection(focus, rt.offTopicProbeCount + session.currentIndex);
  return {
    action: "REFRAME",
    utterance,
    questionId: rt.question.id,
    followUpCount: rt.followUpCount,
    hintCount: rt.hintCount,
    reframeCount: rt.reframeCount,
    signals,
    pendingTags: pendingTags.length ? pendingTags : undefined,
    verbatim: true,
  };
}

/** 空泛：最多 1 次短探，再软换题并打标；诚信红线仍走结束路径 */
function handleVagueCap(
  session: InterviewSession,
  rt: QuestionRuntime,
  signals: TurnSignals,
  pendingTags: AbilityTag[],
  preferredUtterance?: string,
): TurnDecision | null {
  if (!signals.vague) return null;
  const maxVague = session.config.maxVagueFollowUpsPerQuestion ?? 1;
  const trackId = session.trackId || "biz";

  if (rt.vagueFollowUpCount >= maxVague) {
    pendingTags.push("vague_insufficient_detail");
    addSessionTag(session, "vague_insufficient_detail");
    rt.tags = Array.from(new Set([...rt.tags, "vague_insufficient_detail"]));
    return advance(session, "SKIP_SOFT", VAGUE_SOFT_SKIP_UTTERANCE, signals, pendingTags);
  }

  rt.vagueFollowUpCount += 1;
  rt.followUpCount += 1;
  pendingTags.push("vague_insufficient_detail");
  addSessionTag(session, "vague_insufficient_detail");
  const probe =
    preferredUtterance || pickVagueProbe(trackId, rt.followUpCount + rt.vagueFollowUpCount);
  return {
    action: "FOLLOW_UP_OWNERSHIP",
    utterance: probe,
    questionId: rt.question.id,
    followUpCount: rt.followUpCount,
    hintCount: rt.hintCount,
    reframeCount: rt.reframeCount,
    signals,
    pendingTags,
  };
}

export function decideTurn(input: {
  session: InterviewSession;
  answer: string;
  silenceStuck?: boolean;
  /** 简历一致性 Agent（LLM 优先）；缺省时引擎内回落启发式 */
  resumeAnalysis?: ResumeConsistencyAnalysis;
  /** 切题判断（LLM 优先 + 启发式） */
  topicRelevance?: TopicRelevanceResult;
}): TurnDecision {
  const { session } = input;
  const cfg = session.config;
  const trackId = session.trackId || "biz";
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

  // 0) 「再说一遍」：原样重播上一句面试官话术；优先于 replyBank 的改写/REFRAME
  if (isRepeatRequest(input.answer)) {
    signals.repeatRequest = true;
    const utterance =
      (session.lastUtterance && session.lastUtterance.trim()) ||
      rt.question.prompt;
    return {
      action: "REPEAT",
      utterance,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      verbatim: true,
    };
  }

  if (input.answer.trim()) rt.userAnswers.push(input.answer.trim());

  // 自我介绍：落盘供后续深挖；不完整最多补充 1 次，然后必须进入主问题（修复「卡在自我介绍」）
  // 若正在解释上一轮简历冲突挑战，则跳过本段，交给下方冲突解释逻辑
  if (
    (rt.question.isSelfIntro || rt.question.phase === "self_intro") &&
    !session.pendingConflictChallenge
  ) {
    const text = input.answer.trim();
    const INTRO_MIN = 16;
    const isTimeoutPlaceholder = /时间到|作答截止/.test(text);
    const incomplete = !text || text.length < INTRO_MIN || isTimeoutPlaceholder;

    if (text && !isTimeoutPlaceholder) {
      const prev = (session.selfIntroText || "").trim();
      session.selfIntroText =
        !prev || text.length >= prev.length ? text : `${prev} ${text}`.trim();
    }

    // 不完整：最多一次补充（与全局「最多补充一次」对齐）；静默卡死/二次短答则放行
    if (incomplete && rt.vagueFollowUpCount < 1 && !input.silenceStuck) {
      rt.vagueFollowUpCount += 1;
      rt.followUpCount += 1;
      return {
        action: "FOLLOW_UP_OWNERSHIP",
        utterance: pickIntroSupplement(rt.followUpCount + session.currentIndex),
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        verbatim: true,
      };
    }

    if (!session.selfIntroText && text) session.selfIntroText = text;
    enrichDigsWithSelfIntro(session);

    // 自我介绍 vs 简历：实质性冲突时专业挑战一次，再进入主问题
    const introBlob = (session.selfIntroText || text || "").trim();
    if (introBlob.length >= INTRO_MIN && rt.resumeConflictProbeCount < 1) {
      const alreadyChallenged =
        (session.authenticityChallengeCount || 0) > 0 ||
        Boolean(session.pendingConflictChallenge);
      let analysis = input.resumeAnalysis;
      if (!analysis || analysis.severity === "none") {
        const hit = detectResumeConflict(introBlob, session.resume, rt.question);
        if (hit) {
          analysis = {
            conflict: true,
            severity:
              alreadyChallenged && (hit.level === 1 || hit.level === 3)
                ? "integrity"
                : "challenge",
            level: hit.level,
            kind: hit.kind,
            resumeSide: hit.resumeSide,
            answerSide: hit.answerSide,
            utterance: craftResumeConflictUtterance(hit),
            resumeExcerpt: hit.resumeExcerpt,
            source: "heuristic",
          };
        }
      }
      if (
        analysis?.conflict &&
        analysis.severity !== "none" &&
        [1, 2, 3, 5].includes(analysis.level || 3)
      ) {
        signals.resumeConflict = true;
        signals.resumeConflictLevel = analysis.level || 3;
        pendingTags.push("authenticity_risk");
        addSessionTag(session, "authenticity_risk");
        const record = analysisToRecord(analysis, rt.question.id);
        if (record) {
          session.pendingConflictChallenge = record;
        }
        rt.resumeConflictProbeCount += 1;
        rt.followUpCount += 1;
        session.authenticityChallengeCount =
          (session.authenticityChallengeCount || 0) + 1;
        return {
          action: "FOLLOW_UP_PITFALL",
          utterance:
            analysis.utterance ||
            RESUME_CONFLICT_GENERIC_UTTERANCE,
          questionId: rt.question.id,
          followUpCount: rt.followUpCount,
          hintCount: rt.hintCount,
          reframeCount: rt.reframeCount,
          signals: { ...signals, resumeConflictSeverity: "challenge" },
          pendingTags,
          verbatim: true,
        };
      }
    }

    return advance(session, "ASK", "", signals, pendingTags);
  }

  // —— 全局政策优先（先于重追问）——

  // 跑题检测（优先于充实推进；在 replyBank 之后处理元问题之前也可，但放在银行命中后更稳）
  // 先处理银行与诚信等硬规则，再在追问段处理跑题——见下方 early off-topic
  const topic =
    input.topicRelevance ||
    heuristicTopicRelevance(input.answer, rt.question);
  if (topic.offTopic) {
    signals.offTopic = true;
  }

  // 1) 固定反应库：命中则原样回复（生产仅 1–30；诚信类可直接结束）
  // 注意：若库内曾映射「再说一遍」→ REFRAME，已被上方 REPEAT 覆盖
  const bankHit = matchReplyBank(input.answer, { hintCount: rt.hintCount });
  if (bankHit) {
    signals.replyBankId = bankHit.id;
    if (bankHit.tags?.length) pendingTags.push(...bankHit.tags);

    if (bankHit.flags.endInterview || signals.integrityBreach) {
      if (!pendingTags.includes("role_mismatch_suspected")) {
        pendingTags.push("role_mismatch_suspected");
      }
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

    if (bankHit.flags.wait || signals.needsTimeToThink) {
      signals.needsTimeToThink = true;
      return {
        action: bankHit.action || "CONTINUE_LISTEN",
        utterance: bankHit.reply || POLICY_THINKING_WAIT,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags: pendingTags.length ? pendingTags : undefined,
        verbatim: true,
      };
    }

    if (bankHit.flags.hintOnce) {
      rt.hintCount += 1;
      rt.answerRequestCount += 1;
      if (!pendingTags.includes("weak_independent_problem_solving")) {
        pendingTags.push("weak_independent_problem_solving");
      }
      return {
        action: bankHit.action || "REFRAME",
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

    if (bankHit.flags.softSkip) {
      const decision = advance(session, "SKIP_SOFT", `${bankHit.reply}`, signals, pendingTags);
      decision.verbatim = true;
      return decision;
    }

    const action: InterviewAction =
      bankHit.action ||
      (signals.metaQuestionType || signals.askedForHint ? "FORMULA_DEFLECT" : "FOLLOW_UP_OWNERSHIP");

    // 空泛 + 追问类命中：计入短探上限，不要无限 FOLLOW_UP
    if (action.startsWith("FOLLOW_UP") && signals.vague) {
      const capped = handleVagueCap(session, rt, signals, pendingTags, bankHit.reply);
      if (capped) {
        capped.verbatim = true;
        capped.signals = { ...capped.signals, replyBankId: bankHit.id };
        return capped;
      }
    }

    if (action.startsWith("FOLLOW_UP") && pressureOf(rt) < cfg.maxPressurePerQuestion) {
      rt.followUpCount += 1;
    }
    if (action === "REFRAME") rt.reframeCount += 1;

    return {
      action,
      utterance: bankHit.reply,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      pendingTags: pendingTags.length ? pendingTags : undefined,
      verbatim: true,
    };
  }

  // 2) 弄虚作假：改简历再来 + 结束
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

  // 3) 要思考时间：只回「好的。」，等待，不换题
  if (signals.needsTimeToThink) {
    return {
      action: "CONTINUE_LISTEN",
      utterance: POLICY_THINKING_WAIT,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      verbatim: true,
    };
  }

  // 4) 跑题/元问题：HR 或 领导/面试环节不好说
  // 注意：HR终面轨道仍用同一口径挡薪资八卦，不因轨道名放开
  if (signals.metaQuestionType) {
    return {
      action: "FORMULA_DEFLECT",
      utterance:
        signals.metaQuestionType === "salary" ? POLICY_HR_DEFLECT : POLICY_LEADER_DEFLECT,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      verbatim: true,
    };
  }

  // 4b) 跑题纠偏：不推进为完整作答
  if (signals.offTopic || topic.offTopic) {
    const capped = handleOffTopicCap(session, rt, signals, pendingTags, topic);
    if (capped) return capped;
  }

  // 学科专业题：有实质作答则直接过渡下一题，当场不判对错、少追问
  if (
    (rt.question.phase === "professional_knowledge" || rt.question.subjectQuestionId) &&
    input.answer.trim().length >= 20 &&
    !signals.explicitGiveUp &&
    !signals.stuckSubtype
  ) {
    return advance(session, "ASK", "", signals, pendingTags);
  }

  // 5) 答太长：直接 timebox 换题；中等啰嗦：先教练一次再听
  if (signals.tooLong === "timeout") {
    const decision = advance(session, "SKIP_SOFT", POLICY_RAMBLING_NEXT, signals, pendingTags);
    decision.verbatim = true;
    return decision;
  }
  if (signals.rambling || signals.needsCoach || signals.stuckSubtype === "nervous") {
    if (rt.coachCount < 1 && (signals.needsCoach || signals.stuckSubtype === "nervous")) {
      rt.coachCount += 1;
      pendingTags.push("nervous_but_capable");
      const coach = pickCoachLine(rt.coachCount + rt.followUpCount);
      return {
        action: "CONTINUE_LISTEN",
        utterance: coach,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags,
        verbatim: true,
      };
    }
    if (signals.rambling) {
      const decision = advance(session, "SKIP_SOFT", POLICY_RAMBLING_NEXT, signals, pendingTags);
      decision.verbatim = true;
      return decision;
    }
  }

  if (signals.askedForHint) {
    rt.answerRequestCount += 1;
    pendingTags.push("weak_independent_problem_solving");
    // 业务面：要提示时走分级提示，不直接挡回
    if (
      trackId === "biz" &&
      cfg.allowFirstHintOnRequest &&
      rt.hintCount < cfg.maxHintsPerQuestion &&
      pressureOf(rt) < cfg.maxPressurePerQuestion
    ) {
      const level = Math.min(3, rt.hintCount + 1) as 1 | 2 | 3;
      rt.hintCount += 1;
      rt.hintLevel = level;
      return {
        action: "HINT_DIRECTION",
        utterance: hintUtterance(level, trackId),
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals: { ...signals, answerRequestCount: rt.answerRequestCount },
        pendingTags,
        verbatim: true,
      };
    }
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

  // 疑似编造（未承认）：交叉核实一次；承认/矛盾仍走诚信结束（上文）
  if (
    signals.fabricationSuspicion &&
    rt.followUpCount < cfg.maxFollowUpsPerQuestion &&
    pressureOf(rt) < cfg.maxPressurePerQuestion
  ) {
    rt.followUpCount += 1;
    pendingTags.push("surface_knowledge_no_practice");
    return {
      action: "FOLLOW_UP_PITFALL",
      utterance: FABRICATION_PROBE_UTTERANCE,
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      pendingTags,
      verbatim: true,
    };
  }

  // 口述 vs 简历冲突：按 1–5 级处理；先处理「待解释」的上一挑战
  {
    // A) 上一轮已挑战 → 本轮归类解释（若像新冲突陈述则跳出，改走新检测）
    if (session.pendingConflictChallenge) {
      const pending = session.pendingConflictChallenge;
      const looksLikeFreshClaim =
        /用的是|我们用|技术栈|换成|改成|不是\s*(React|Vue|Angular|Next)/i.test(
          input.answer,
        ) && !/因为|解释一下|实际(做|是)|简历(写|表述)|不完整|记不清/.test(input.answer);

      if (looksLikeFreshClaim) {
        // 上一挑战暂记为未充分解释，转入新冲突检测
        pending.explainOutcome = "pending";
        session.resumeConflicts = [...(session.resumeConflicts || []), pending];
        session.pendingConflictChallenge = null;
      } else {
      const outcome = classifyConflictExplanation(input.answer);
      signals.conflictExplainOutcome = outcome;
      signals.resumeConflict = true;
      signals.resumeConflictLevel = pending.level;
      pending.explainOutcome = outcome;
      session.resumeConflicts = [...(session.resumeConflicts || []), pending];
      session.pendingConflictChallenge = null;

      if (outcome === "admits_fabricate") {
        signals.integrityBreach = true;
        signals.resumeConflictSeverity = "integrity";
        pendingTags.push("authenticity_risk", "role_mismatch_suspected");
        addSessionTag(session, "authenticity_risk");
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

      if (outcome === "chaotic_integrity_risk") {
        pendingTags.push("authenticity_risk");
        addSessionTag(session, "authenticity_risk");
        // Level 1 混乱解释 → 可升级诚信结束；其余记风险后换题/继续
        if (pending.level === 1 || (session.authenticityChallengeCount || 0) >= 2) {
          signals.integrityBreach = true;
          signals.resumeConflictSeverity = "integrity";
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
        const decision = advance(
          session,
          "SKIP_SOFT",
          utteranceForExplainOutcome(outcome),
          signals,
          pendingTags,
        );
        decision.verbatim = true;
        return decision;
      }

      // ok / memory_fuzzy：专业收口后继续本题或推进
      const note = utteranceForExplainOutcome(outcome);
      if (outcome === "memory_fuzzy") {
        pendingTags.push("authenticity_risk");
        addSessionTag(session, "authenticity_risk");
      }
      // 自我介绍阶段的冲突解释：收口后进入主问题，不再就介绍死磕
      if (rt.question.isSelfIntro || rt.question.phase === "self_intro") {
        if (input.answer.trim()) {
          const prev = (session.selfIntroText || "").trim();
          const cur = input.answer.trim();
          session.selfIntroText =
            !prev || cur.length >= prev.length ? cur : `${prev} ${cur}`.trim();
        }
        enrichDigsWithSelfIntro(session);
        const decision = advance(session, "ASK", note, signals, pendingTags);
        decision.utterance = `${note}${decision.utterance.replace(/^好[，,。. ]?/, "")}`;
        decision.verbatim = true;
        return decision;
      }
      if (input.answer.trim().length >= 40 && outcome === "ok_incomplete_resume") {
        // 解释可接受 → 推进，不重复死磕
        const decision = advance(session, "ASK", note, signals, pendingTags);
        decision.utterance = `${note}${decision.utterance.replace(/^好[，,。. ]?/, "")}`;
        decision.verbatim = true;
        return decision;
      }
      return {
        action: "FOLLOW_UP_OWNERSHIP",
        utterance: `${note}那就按实际经历说：你亲手做的那一步是什么？`,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags: pendingTags.length ? pendingTags : undefined,
        verbatim: true,
      };
      }
    }

    // B) 新冲突检测
    const alreadyChallenged =
      (session.authenticityChallengeCount || 0) > 0 || rt.resumeConflictProbeCount > 0;
    let analysis = input.resumeAnalysis;
    if (!analysis) {
      const hit = detectResumeConflict(input.answer, session.resume, rt.question);
      if (hit) {
        analysis = {
          conflict: true,
          severity:
            alreadyChallenged && (hit.level === 1 || hit.level === 3)
              ? "integrity"
              : "challenge",
          level: hit.level,
          kind: hit.kind,
          resumeSide: hit.resumeSide,
          answerSide: hit.answerSide,
          utterance: craftResumeConflictUtterance(hit),
          resumeExcerpt: hit.resumeExcerpt,
          source: "heuristic",
        };
      }
    }
    // LLM 弱冲突且启发式无命中：早期调研阶段不挂起 pending，避免误伤
    if (
      analysis?.conflict &&
      analysis.source === "llm" &&
      !detectResumeConflict(input.answer, session.resume, rt.question) &&
      (rt.question.phase === "resume_research" || analysis.level === 4)
    ) {
      // 仅记风险，不挑战打断
      if (analysis.level === 4) {
        const record = analysisToRecord(analysis, rt.question.id);
        if (record) {
          record.explainOutcome = "pending";
          session.resumeConflicts = [...(session.resumeConflicts || []), record];
        }
        pendingTags.push("authenticity_risk");
        addSessionTag(session, "authenticity_risk");
        analysis = { conflict: false, severity: "none", source: "llm" };
      } else if ((analysis.level || 3) >= 4) {
        analysis = { conflict: false, severity: "none", source: "llm" };
      }
    }
    if (analysis?.conflict && analysis.severity !== "none") {
      signals.resumeConflict = true;
      const level = analysis.level || 3;
      signals.resumeConflictLevel = level;
      pendingTags.push("authenticity_risk");
      addSessionTag(session, "authenticity_risk");

      const record = analysisToRecord(analysis, rt.question.id);

      // Level 4：风险备注，不立刻强挑战升级；仅短记一次
      if (level === 4 && rt.resumeConflictProbeCount === 0) {
        if (record) {
          record.explainOutcome = "pending";
          session.resumeConflicts = [...(session.resumeConflicts || []), record];
        }
        rt.resumeConflictProbeCount += 1;
        rt.followUpCount += 1;
        return {
          action: "FOLLOW_UP_PITFALL",
          utterance:
            analysis.utterance ||
            "这个点目前偏模糊。对照简历，你能补一个可核验的细节吗？",
          questionId: rt.question.id,
          followUpCount: rt.followUpCount,
          hintCount: rt.hintCount,
          reframeCount: rt.reframeCount,
          signals: { ...signals, resumeConflictSeverity: "challenge" },
          pendingTags,
          verbatim: true,
        };
      }

      const escalate =
        analysis.severity === "integrity" ||
        // 仅本题已被挑战过仍出现硬冲突才升级；跨题不因历史挑战直接诚信结束
        (rt.resumeConflictProbeCount >= 1 && (level === 1 || level === 3));

      if (escalate) {
        signals.resumeConflictSeverity = "integrity";
        signals.integrityBreach = true;
        pendingTags.push("role_mismatch_suspected");
        if (record) {
          record.explainOutcome = "chaotic_integrity_risk";
          session.resumeConflicts = [...(session.resumeConflicts || []), record];
        }
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

      // 首次挑战：挂起等待解释；专业语气，不说造假
      signals.resumeConflictSeverity = "challenge";
      rt.resumeConflictProbeCount += 1;
      rt.followUpCount += 1;
      session.authenticityChallengeCount = (session.authenticityChallengeCount || 0) + 1;
      if (record) {
        session.pendingConflictChallenge = record;
      }
      return {
        action: "FOLLOW_UP_OWNERSHIP",
        utterance:
          analysis.utterance ||
          (analysis.resumeSide && analysis.answerSide
            ? craftResumeConflictUtterance({
                kind: analysis.kind || "other",
                level,
                resumeSide: analysis.resumeSide,
                answerSide: analysis.answerSide,
                resumeExcerpt: analysis.resumeExcerpt,
              })
            : RESUME_CONFLICT_GENERIC_UTTERANCE),
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags,
        verbatim: false,
      };
    }
  }

  // 「没做过」≠ 不会/造假：问一次相邻迁移
  if (signals.notDoneBefore) {
    if (rt.transferProbeCount < 1 && pressureOf(rt) < cfg.maxPressurePerQuestion) {
      rt.transferProbeCount += 1;
      rt.followUpCount += 1;
      pendingTags.push("can_reason_trainable");
      return {
        action: "FOLLOW_UP_OWNERSHIP",
        utterance: NOT_DONE_TRANSFER_UTTERANCE,
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags,
        verbatim: true,
      };
    }
    pendingTags.push("knowledge_gap_not_learned");
    return advance(session, "SKIP_SOFT", SKIP_SOFT_UTTERANCE, signals, pendingTags);
  }

  const stuck =
    Boolean(input.silenceStuck) ||
    Boolean(signals.explicitGiveUp) ||
    signals.stuckSubtype === "not_learned" ||
    signals.stuckSubtype === "cannot_solve";

  if (stuck) {
    if (signals.stuckSubtype === "not_learned") pendingTags.push("knowledge_gap_not_learned");
    if (signals.stuckSubtype === "nervous") pendingTags.push("nervous_but_capable");

    // 明确放弃 / 沉默卡死 / 没学过：软换题，不按造假惩罚
    if (
      signals.explicitGiveUp ||
      input.silenceStuck ||
      signals.stuckSubtype === "not_learned" ||
      !input.answer.trim()
    ) {
      if (rt.hintCount > 0) {
        pendingTags.push("cannot_solve_after_hint");
        rt.answerIndependence = "still_cant";
      }
      return advance(session, "SKIP_SOFT", SKIP_SOFT_UTTERANCE, signals, pendingTags);
    }

    // 「不会」：业务面给分级提示（最多 maxHints）；HR 少提示；用尽后软换题
    if (
      signals.stuckSubtype === "cannot_solve" &&
      rt.hintCount < cfg.maxHintsPerQuestion &&
      pressureOf(rt) < cfg.maxPressurePerQuestion
    ) {
      const level = Math.min(3, rt.hintCount + 1) as 1 | 2 | 3;
      // HR 终面最多 L1
      const cappedLevel = trackId === "hr_final" ? (1 as const) : level;
      rt.hintCount += 1;
      rt.hintLevel = cappedLevel;
      pendingTags.push("can_reason_trainable");
      return {
        action: "HINT_DIRECTION",
        utterance: hintUtterance(cappedLevel, trackId),
        questionId: rt.question.id,
        followUpCount: rt.followUpCount,
        hintCount: rt.hintCount,
        reframeCount: rt.reframeCount,
        signals,
        pendingTags,
        verbatim: true,
      };
    }

    if (rt.hintCount > 0) {
      pendingTags.push("cannot_solve_after_hint");
      rt.answerIndependence = "still_cant";
    } else {
      pendingTags.push("can_reason_trainable");
    }
    return advance(session, "SKIP_SOFT", SKIP_SOFT_UTTERANCE, signals, pendingTags);
  }

  // 提示后若给出较完整回答 → 记 answered_after_hint（不按造假）
  if (
    rt.hintCount > 0 &&
    input.answer.trim().length >= cfg.minAnswerChars &&
    !signals.vague &&
    rt.answerIndependence !== "still_cant"
  ) {
    pendingTags.push("answered_after_hint");
    rt.answerIndependence = "after_hint";
  } else if (
    rt.hintCount === 0 &&
    input.answer.trim().length >= 80 &&
    !signals.vague &&
    !rt.answerIndependence
  ) {
    rt.answerIndependence = "independent";
  }

  // 6) 空泛/笼统：至多 1 次短探，再软跳过（不无限 FOLLOW_UP；非空泛不套「再详细」）
  {
    const capped = handleVagueCap(session, rt, signals, pendingTags);
    if (capped) return capped;
  }

  if (signals.tooShort && pressureOf(rt) < cfg.maxPressurePerQuestion) {
    rt.followUpCount += 1;
    return {
      action: "FOLLOW_UP_OWNERSHIP",
      utterance: craftGroundedFollowUp(input.answer, "FOLLOW_UP_OWNERSHIP", trackId),
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
      utterance: craftGroundedFollowUp(input.answer, "FOLLOW_UP_PITFALL", trackId),
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
      pendingTags,
    };
  }

  const textLen = input.answer.trim().length;
  const hasConcrete =
    /\d+%|\d+\s*ms|\d+\s*秒|P95|QPS|接口|SQL|索引|缓存|回滚|根因|我独立|我负责|具体(做了|改了|查了)|第一步|验证/.test(
      input.answer,
    );
  // 充实回答可直接推进，不强制每题都追问「再详细」
  const solidEnough =
    !signals.vague &&
    !signals.tooShort &&
    ((textLen >= 120 && hasConcrete) ||
      (textLen >= cfg.minAnswerChars && rt.followUpCount >= 1) ||
      (trackId === "hr_final" && textLen >= 90 && rt.followUpCount >= 1));

  if (
    !solidEnough &&
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
    // HR终面少做架构/边界硬刨，偏 ownership；业务面更多技术深挖
    const action =
      trackId === "hr_final"
        ? "FOLLOW_UP_OWNERSHIP"
        : actions[Math.floor(Math.random() * 3)]!;
    return {
      action,
      utterance: craftGroundedFollowUp(input.answer, action, trackId),
      questionId: rt.question.id,
      followUpCount: rt.followUpCount,
      hintCount: rt.hintCount,
      reframeCount: rt.reframeCount,
      signals,
    };
  }

  // 迁移追问后有内容 → 打标
  if (rt.transferProbeCount > 0 && input.answer.trim().length >= 40) {
    pendingTags.push("transfer_experience_shown");
  }

  return advance(session, "ASK", "", signals, pendingTags);
}

export function initialAskUtterance(first: Question) {
  // 开场白由 start 路由用 persona 组装；这里仅返回首题，避免重复介绍
  return first.prompt;
}
