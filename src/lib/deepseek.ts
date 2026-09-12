import OpenAI from "openai";
import { RED_FLAG_PATTERNS } from "./config";
import {
  CANDIDATE_LEVEL_LABEL,
  DEFAULT_CANDIDATE_LEVEL,
  FEEDBACK_DIMENSIONS,
  TRACK_DIMENSION_WEIGHTS,
  TRACK_FOCUS,
  depthExpectation,
  feedbackPolicyBlock,
  polishGlobalPolicyBlock,
  polishRoleLine,
  scoreToBand,
} from "./interviewerPolicy";
import {
  craftResumeConflictUtterance,
  detectResumeConflict,
  heuristicToAnalysis,
  resumeJsonForConsistency,
  shouldAnalyzeResumeConsistency,
} from "./resumeConflict";
import type {
  AbilityTag,
  CandidateLevel,
  FeedbackBand,
  FeedbackDimensionScore,
  FeedbackReport,
  InterviewAction,
  InterviewSession,
  Question,
  ResumeConsistencyAnalysis,
  ResumeProfile,
  TrackId,
  TurnDecision,
} from "./types";

function client() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

function modelName() {
  return process.env.DEEPSEEK_MODEL || "deepseek-flash";
}

/** deepseek-flash 默认会把 token 花在 reasoning，导致 content 为空；解析/话术都应关掉。 */
function thinkingExtra() {
  const mode = (process.env.DEEPSEEK_THINKING || "disabled").toLowerCase();
  if (mode === "enabled" || mode === "on") return {};
  return { thinking: { type: "disabled" as const } };
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("模型未返回可解析 JSON");
  }
}

export function sanitizeUtterance(text: string, fallback: string) {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return fallback;
  if (((out.match(/[？?]/g) || []).length) > 1) {
    const parts = out.split(/(?<=[？?])/);
    out = (parts.find((p) => /[？?]/.test(p)) || parts[0] || fallback).trim();
  }
  if (RED_FLAG_PATTERNS.some((re) => re.test(out))) return fallback;
  return out;
}

export async function polishUtterance(input: {
  action: InterviewAction;
  draft: string;
  questionPrompt: string;
  userAnswer?: string;
  tone: string;
  /** biz = 技术追问；hr_final = 适配/动机/协作 */
  trackId?: TrackId;
  candidateLevel?: CandidateLevel;
  /** 诚信违规结束 / 回复库命中等：跳过润色，保留原句意图与口吻 */
  skipPolish?: boolean;
  /** 可选：命中的 replyBank 风格摘要（仅非 verbatim 时参考） */
  bankStyle?: string;
  /** 简历摘要：用于口述 vs 简历冲突类追问的轻润色 */
  resumeContext?: string;
}) {
  const fallback = input.draft;
  if (input.skipPolish) return { text: fallback, mocked: false };
  const c = client();
  if (!c) return { text: fallback, mocked: true };
  const trackId = input.trackId || "biz";
  const level = input.candidateLevel || DEFAULT_CANDIDATE_LEVEL;
  const isFollowUp = String(input.action).startsWith("FOLLOW_UP");
  const isHint = input.action === "HINT_DIRECTION";
  const isHr = trackId === "hr_final";
  const isRepeat = input.action === "REPEAT";
  if (isRepeat) return { text: fallback, mocked: false };
  const followHint = isFollowUp
    ? isHr
      ? "【追问】跟住候选人上一句里的动机/协作/抗压/规划细节，禁止反复同一句「太笼统/再具体一点」；不要转成算法或架构刨根。"
      : "【追问】必须像真人一样跟住候选人上一句：抓住最新具体名词/职责（设计→问设计细节；改口说写代码/平台→追问写了什么代码、怎么写），可以改写 draft 使其更贴上一句，但禁止重复同一句「太笼统/再具体一点/太空泛」；不要忽略话题转移。"
    : isHint
      ? "【提示】只给方向不给答案；保持尊重，勿嘲讽。"
      : "";
  const resumeHint = input.resumeContext
    ? "【简历冲突】若 draft 在对比简历与口述，必须保留两侧事实原意，仅可微调语气；禁止抹平冲突或改成无关新问题。可问「你实际做了什么」。"
    : "";
  const noBoiler =
    "禁止在句尾机械追加「可以再详细一点」「细节可以补充」；仅当 draft 本身在追问空泛细节时才允许。";
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: isFollowUp ? 0.55 : 0.45,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            polishRoleLine(trackId) +
            polishGlobalPolicyBlock() +
            depthExpectation(level) +
            followHint +
            resumeHint +
            noBoiler,
        },
        {
          role: "user",
          content: JSON.stringify({
            action: input.action,
            tone: input.tone,
            trackId,
            candidateLevel: level,
            draft: input.draft,
            currentQuestion: input.questionPrompt,
            userAnswer: input.userAnswer?.slice(0, 800) ?? "",
            bankStyle: input.bankStyle || undefined,
            resumeContext: input.resumeContext || undefined,
            instruction: input.resumeContext
              ? "若涉及简历不一致，输出一句专业挑战；保留简历侧与口述侧关键信息，质疑真实性并问清实际做了什么。"
              : isFollowUp
                ? isHr
                  ? "根据 userAnswer 输出一句偏适配/动机/协作的贴地追问；勿复读空泛套话，勿硬核架构刨根。"
                  : "根据 userAnswer 里最新具体信息，输出一句贴地追问；勿复读「可以再详细」套话。"
                : undefined,
          }),
        },
      ],
      ...thinkingExtra(),
    });
    const raw = completion.choices[0]?.message?.content?.trim() || fallback;
    return { text: sanitizeUtterance(raw, fallback), mocked: false };
  } catch {
    return { text: fallback, mocked: true };
  }
}

/**
 * 简历一致性 Agent：对比 resume JSON + 当前题 + 口述。
 * LLM 优先；失败/无 key 时回落启发式。
 */
export async function analyzeResumeConsistency(input: {
  answer: string;
  resume?: ResumeProfile;
  question?: Question;
  alreadyChallenged: boolean;
}): Promise<ResumeConsistencyAnalysis> {
  const { answer, resume, question, alreadyChallenged } = input;
  if (!resume || !shouldAnalyzeResumeConsistency(answer, question)) {
    return { conflict: false, severity: "none", source: "heuristic" };
  }

  const heuristicHit = detectResumeConflict(answer, resume, question);
  const heuristic = heuristicToAnalysis(heuristicHit, alreadyChallenged);

  const c = client();
  if (!c) return heuristic;

  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是资深技术面试官的「简历一致性」助理。对比候选人简历 JSON 与口述回答。" +
            "若简历写项目 A 做了 B，但口述声称完全不同的职责/技术/指标/所有权（不同 ownership），判 conflict。" +
            "补充细节、承认不会、说没做过相邻迁移 ≠ 冲突。" +
            "severity：none=无实质冲突；challenge=首次可质疑的不一致；integrity=明显造假/反复矛盾/所有权明显不符。" +
            "只输出 JSON：{conflict:boolean,severity:\"none\"|\"challenge\"|\"integrity\",kind?:string,resumeSide?:string,answerSide?:string,utterance?:string}。" +
            "utterance 须专业尖锐：质疑「你实际做了什么」，禁止嘲讽。",
        },
        {
          role: "user",
          content: JSON.stringify({
            resume: resumeJsonForConsistency(resume),
            currentQuestion: question?.prompt || "",
            fromResume: Boolean(question?.fromResume),
            alreadyChallenged,
            answer: answer.slice(0, 1200),
            heuristicHint: heuristicHit
              ? {
                  kind: heuristicHit.kind,
                  resumeSide: heuristicHit.resumeSide,
                  answerSide: heuristicHit.answerSide,
                }
              : null,
          }),
        },
      ],
      ...thinkingExtra(),
    });
    const msg = completion.choices[0]?.message as
      | { content?: string | null; reasoning_content?: string | null }
      | undefined;
    const raw = (msg?.content || msg?.reasoning_content || "").trim();
    if (!raw) return heuristic;
    const json = extractJsonObject(raw);
    const conflict = Boolean(json.conflict);
    let severity = String(json.severity || "none") as ResumeConsistencyAnalysis["severity"];
    if (!["none", "challenge", "integrity"].includes(severity)) {
      severity = conflict ? "challenge" : "none";
    }
    if (!conflict) severity = "none";
    // 已挑战过仍冲突 → 至少 integrity
    if (conflict && alreadyChallenged && severity === "challenge") {
      severity = "integrity";
    }
    if (!conflict) {
      // LLM 说无冲突时，若启发式强命中 ownership/project_claim 仍挑战
      if (
        heuristicHit &&
        (heuristicHit.kind === "ownership" ||
          heuristicHit.kind === "project_claim" ||
          heuristicHit.kind === "role")
      ) {
        return heuristic;
      }
      return { conflict: false, severity: "none", source: "llm" };
    }
    const kind = (String(json.kind || heuristicHit?.kind || "other") as ResumeConsistencyAnalysis["kind"]);
    const resumeSide = String(json.resumeSide || heuristicHit?.resumeSide || "").slice(0, 80);
    const answerSide = String(json.answerSide || heuristicHit?.answerSide || "").slice(0, 80);
    const utterance =
      String(json.utterance || "").trim() ||
      (heuristicHit
        ? craftResumeConflictUtterance(heuristicHit)
        : "这个点和简历写法有点不一致——你实际做了什么？");
    return {
      conflict: true,
      severity,
      kind,
      resumeSide,
      answerSide,
      utterance: utterance.slice(0, 120),
      source: "llm",
    };
  } catch {
    return heuristic;
  }
}

export async function structureResume(
  rawText: string,
  source: ResumeProfile["parseMeta"]["source"],
): Promise<ResumeProfile> {
  const base: ResumeProfile = {
    rawText: rawText.slice(0, 12000),
    education: [],
    skills: [],
    experiences: [],
    projects: [],
    parseMeta: { source, warnings: [] },
  };
  const c = client();
  if (!c) {
    base.parseMeta.warnings.push("未配置 DeepSeek，无法做 AI 总结");
    base.summary = rawText.slice(0, 180);
    return base;
  }
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是资深技术面试助理。根据候选人简历用中文归纳基本信息，不要死磕关键词或固定章节标题；即使措辞随意也要推断姓名、背景、技能、工作/实习经历与项目。只输出 JSON，字段：name(string|null), summary(string，2-4句概述), education([{school,degree,major}]), skills(string[]), experiences([{org,title,period,highlights:string[]}]), projects([{name,role,stack:string[],highlights:string[]}])。不确定的字段用空字符串或空数组，不要编造。",
        },
        {
          role: "user",
          content: `以下是一位面试者的简历，请根据简历总结基本信息。\n\n${rawText.slice(0, 10000)}`,
        },
      ],
      ...thinkingExtra(),
    });
    const msg = completion.choices[0]?.message as
      | { content?: string | null; reasoning_content?: string | null }
      | undefined;
    const raw = (msg?.content || msg?.reasoning_content || "").trim();
    if (!raw) throw new Error("模型返回空内容");
    const json = extractJsonObject(raw);

    const education = Array.isArray(json.education) ? json.education : [];
    const skills = Array.isArray(json.skills)
      ? (json.skills as unknown[]).map(String).filter(Boolean).slice(0, 24)
      : [];
    const experiences = Array.isArray(json.experiences)
      ? (json.experiences as Array<Record<string, unknown>>).slice(0, 4).map((e) => ({
          org: e.org ? String(e.org) : undefined,
          title: e.title ? String(e.title) : undefined,
          period: e.period ? String(e.period) : undefined,
          highlights: Array.isArray(e.highlights)
            ? (e.highlights as unknown[]).map(String).slice(0, 4)
            : [],
        }))
      : [];
    const projects = Array.isArray(json.projects)
      ? (json.projects as Array<Record<string, unknown>>).slice(0, 4).map((p) => ({
          name: String(p.name || "未命名项目"),
          role: p.role ? String(p.role) : undefined,
          stack: Array.isArray(p.stack) ? (p.stack as unknown[]).map(String) : [],
          highlights: Array.isArray(p.highlights)
            ? (p.highlights as unknown[]).map(String).slice(0, 5)
            : [],
        }))
      : [];

    return {
      ...base,
      name: json.name ? String(json.name) : undefined,
      summary: json.summary ? String(json.summary) : undefined,
      education: education as ResumeProfile["education"],
      skills,
      experiences,
      projects,
    };
  } catch (e) {
    base.parseMeta.warnings.push(
      e instanceof Error ? `AI 总结失败：${e.message}` : "AI 总结失败，已回退原文",
    );
    base.summary = rawText.slice(0, 180);
    return base;
  }
}

/** 诚信/简历造假结束（与软跳过「不会」不同）：仍出全量评分，并单独严重标记诚信维。 */
export function detectIntegrityBreach(session: InterviewSession): boolean {
  if (session.runtimes.some((rt) => rt.tags.includes("role_mismatch_suspected"))) {
    return true;
  }
  for (const ev of session.events) {
    if (ev.type !== "decision") continue;
    const payload = ev.payload as Partial<TurnDecision> | null;
    if (!payload || typeof payload !== "object") continue;
    if (payload.signals?.integrityBreach) return true;
    if (
      payload.action === "FINISH" &&
      payload.pendingTags?.includes("role_mismatch_suspected")
    ) {
      return true;
    }
  }
  return false;
}

function ensureIntegritySummary(summary: string, breach: boolean): string {
  if (!breach) return summary;
  if (/诚信|造假|注水|挂名|欺诈|严重/.test(summary)) return summary;
  return (
    summary.trim() +
    " 另需严肃点名：本场因简历/经历真实性问题触碰诚信红线，属于严重风险；技术表现再好也无法掩盖诚信缺口。"
  );
}

function applyIntegrityDimension(
  dims: FeedbackDimensionScore[],
  trackId: TrackId,
  breach: boolean,
  authenticityRisk: boolean,
): FeedbackDimensionScore[] {
  const others = dims.filter((d) => !/诚信/.test(d.dimension));
  const adjusted = breach
    ? others.map((d) => ({
        ...d,
        score: Math.max(1, Math.min(d.score, 3)),
        band: (d.score <= 2 ? "弱" : scoreToBand(Math.min(d.score, 3))) as FeedbackBand,
        evidence: d.evidence || "诚信问题下其余维度仅作参考、整体下调",
      }))
    : others;

  const integrity: FeedbackDimensionScore = {
    dimension: "诚信 / 简历真实性",
    score: breach ? 1 : authenticityRisk ? 2 : 4,
    band: breach ? "严重" : authenticityRisk ? "风险" : "强",
    weight: TRACK_DIMENSION_WEIGHTS[trackId].integrity,
    evidence: breach
      ? "诚信红线：简历乱写/注水/挂名或反复与简历矛盾，标记为严重"
      : authenticityRisk
        ? "口述与简历不一致，真实性风险"
        : "本场未见明显诚信问题",
  };
  return [...adjusted, integrity];
}

function sessionHasVagueTag(session: InterviewSession): boolean {
  if (session.sessionTags?.includes("vague_insufficient_detail")) return true;
  return session.runtimes.some((rt) => rt.tags.includes("vague_insufficient_detail"));
}

function sessionHasAuthenticityRisk(session: InterviewSession): boolean {
  if (session.sessionTags?.includes("authenticity_risk")) return true;
  return session.runtimes.some((rt) => rt.tags.includes("authenticity_risk"));
}

function ensureVagueFeedbackText(summary: string, vague: boolean): string {
  if (!vague) return summary;
  if (/不够细致|不够具体|空泛|笼统|细节不足|not detailed/i.test(summary)) return summary;
  return (
    summary.trim() +
    " 另外需明确指出：候选人多次回答偏空泛/笼统，整体不够细致（回答不够细致），需用具体动作、场景与可验证结果把经历讲扎实。"
  );
}

function ensureAuthenticityFeedbackText(summary: string, risk: boolean): string {
  if (!risk) return summary;
  if (/真实性风险|与简历不一致|口述与简历|authenticity/i.test(summary)) return summary;
  return (
    summary.trim() +
    " 另需点名：本场存在口述与简历不一致之处，项目真实性存在风险，下次面试前请先对齐简历与可复盘细节。"
  );
}

function heuristicDimensionScores(
  session: InterviewSession,
  trackId: TrackId,
  vague: boolean,
  authenticityRisk: boolean,
  integrityBreach: boolean,
): FeedbackDimensionScore[] {
  const allTags = new Set(session.runtimes.flatMap((rt) => rt.tags));
  const answered = session.runtimes.filter((rt) => rt.userAnswers.join("").length > 40).length;
  const total = Math.max(1, session.runtimes.length);
  const coverage = answered / total;
  const afterHint = allTags.has("answered_after_hint");
  const stillCant = allTags.has("cannot_solve_after_hint");
  const transfer = allTags.has("transfer_experience_shown");
  const base = integrityBreach ? 2 : vague ? 2 : coverage >= 0.75 ? 3 : 2;

  const scoreOf = (id: (typeof FEEDBACK_DIMENSIONS)[number]["id"]): number => {
    if (id === "integrity") return integrityBreach ? 1 : authenticityRisk ? 2 : 4;
    let s = base;
    if (id === "project_authenticity" && allTags.has("surface_knowledge_no_practice")) s = Math.min(s, 2);
    if (id === "project_authenticity" && (authenticityRisk || allTags.has("authenticity_risk"))) {
      s = Math.min(s, 2);
    }
    if (id === "project_authenticity" && integrityBreach) s = 1;
    if (id === "tech_depth" && trackId === "biz") {
      if (stillCant) s = Math.min(s, 2);
      if (afterHint) s = Math.min(s, 3);
    }
    if (id === "learning_potential") {
      if (afterHint || transfer) s = Math.max(s, 3);
      if (allTags.has("can_reason_trainable")) s = Math.max(s, 3);
      if (stillCant) s = Math.min(s, 2);
      if (integrityBreach) s = Math.min(s, 2);
    }
    if (id === "communication" && allTags.has("nervous_but_capable")) s = Math.max(s, 3);
    if (id === "culture_fit" && trackId === "hr_final") s = Math.max(s, base);
    if (integrityBreach) s = Math.min(s, 3);
    return Math.max(1, Math.min(5, s));
  };

  return FEEDBACK_DIMENSIONS.map((d) => {
    const score = scoreOf(d.id);
    let band: FeedbackBand = scoreToBand(score);
    if (d.id === "integrity" && integrityBreach) band = "严重";
    else if (d.id === "integrity" && authenticityRisk) band = "风险";
    return {
      dimension: d.label,
      score,
      band,
      weight: TRACK_DIMENSION_WEIGHTS[trackId][d.id],
      evidence:
        d.id === "integrity" && integrityBreach
          ? "诚信红线触发：严重"
          : authenticityRisk && d.id === "project_authenticity"
            ? "口述与简历冲突，真实性风险"
            : vague
              ? "回答偏空泛，细节不足"
              : "基于本场作答与标签启发式估计",
    };
  });
}

export async function generateFeedback(session: InterviewSession): Promise<FeedbackReport> {
  const trackId = session.trackId || "biz";
  const level = session.candidateLevel || DEFAULT_CANDIDATE_LEVEL;
  const vague = sessionHasVagueTag(session);
  const authenticityRisk = sessionHasAuthenticityRisk(session);
  const integrityBreach = detectIntegrityBreach(session);
  const trackLabel = TRACK_FOCUS[trackId].label;
  const levelLabel = CANDIDATE_LEVEL_LABEL[level];

  const baseSummary = integrityBreach
    ? `本场为研发岗${trackLabel}练习（深度预期：${levelLabel}），因简历/经历诚信问题提前结束。` +
      `这属于严重风险：存在简历乱写、经历注水、挂名或与简历明显矛盾等情形。` +
      `以下仍给出各能力维度评分供复盘（诚信维单独标为严重）；本报告不做录用结论。`
    : trackId === "hr_final"
      ? `本场为研发岗${trackLabel}练习（深度预期：${levelLabel}）。整体完成了主流程；建议用具体协作场景、动机证据与上手计划证明适配度。本报告不做录用结论。`
      : `本场为研发岗${trackLabel}练习（深度预期：${levelLabel}）。整体完成了主流程；建议继续用项目细节、取舍与边界证明实践深度。本报告不做录用结论。`;

  let dimensions = heuristicDimensionScores(
    session,
    trackId,
    vague,
    authenticityRisk,
    integrityBreach,
  );
  dimensions = applyIntegrityDimension(
    dimensions,
    trackId,
    integrityBreach,
    authenticityRisk,
  );

  const fallback: FeedbackReport = {
    overallSummary: ensureIntegritySummary(
      ensureAuthenticityFeedbackText(
        ensureVagueFeedbackText(baseSummary, vague),
        authenticityRisk || integrityBreach,
      ),
      integrityBreach,
    ),
    perQuestion: session.runtimes.map((rt) => {
      const tags = integrityBreach
        ? Array.from(new Set<AbilityTag>([...rt.tags, "role_mismatch_suspected"]))
        : rt.tags;
      return {
        questionId: rt.question.id,
        prompt: rt.question.prompt,
        userAnswer: rt.userAnswers.join("\n") || "（未作答/卡壳）",
        scores: rt.question.rubrics.map((r) => ({
          dimension: r.dimension,
          score: integrityBreach
            ? Math.min(2, vague ? 2 : rt.userAnswers.join("").length > 60 ? 2 : 1)
            : vague
              ? 2
              : rt.userAnswers.join("").length > 60
                ? 3
                : 2,
          evidence: integrityBreach
            ? "诚信问题下本项参考分（已下调）"
            : rt.userAnswers[0]?.slice(0, 80) || "信息不足",
        })),
        tags,
        improvements: integrityBreach
          ? [
              "删除未亲历或无法讲清细节的项目/职责",
              "每条经历准备可验证的个人动作、数据与复盘",
              "面试中绝不夸大、挂名或临场编造",
            ]
          : trackId === "hr_final"
            ? ["用一件具体事说明协作/动机", "讲清你当时怎么想、怎么做", "补上可验证结果或复盘"]
            : ["补充个人职责边界", "说明取舍与失效场景", "用数据或现象验证结果"],
      };
    }),
    dimensions,
    topActions: integrityBreach
      ? [
          "重写简历：只保留可深挖的真实经历",
          "对每个项目准备「我做了什么 / 取舍 / 验证」三句话",
          "下次面试前自检：能否承受连续追问而不崩",
        ]
      : trackId === "hr_final"
        ? ["准备 2 个协作冲突小故事", "写清「为什么研发 + 为什么现在」", "列出入职前三月上手清单"]
        : ["准备量化结果的项目故事", "每题主动讲清取舍与边界", "用故障复盘练排查路径"],
    roleId: session.roleId,
    trackId,
    candidateLevel: level,
    styleResolved: session.config.styleResolved,
    integrityBreach: integrityBreach || undefined,
    vagueInsufficientDetail: vague || undefined,
    authenticityRisk: authenticityRisk || integrityBreach || undefined,
    integritySevere: integrityBreach || undefined,
  };

  if (vague && !integrityBreach) {
    fallback.topActions = [
      "回答不够细致：每题至少补「我做了什么 / 场景 / 怎么验证」三句话",
      ...fallback.topActions,
    ].slice(0, 5);
  }
  if (authenticityRisk && !integrityBreach) {
    fallback.topActions = [
      "对齐简历与口述：指标、技术栈、职责以可复盘事实为准",
      ...fallback.topActions,
    ].slice(0, 5);
  }

  const c = client();
  if (!c) return fallback;
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.3,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "输出复盘 JSON：{overallSummary, perQuestion:[{questionId,prompt,userAnswer,scores:[{dimension,score,evidence}],tags,improvements}],dimensions:[{dimension,score,band,weight,evidence}],topActions}。" +
            "分数1-5；band 为 强/中/弱/风险/严重（严重仅用于诚信维）。不要宣判通过/不通过。不要 markdown。" +
            "即使诚信失败也必须给各维度分数，禁止只写结束语。" +
            feedbackPolicyBlock({
              trackId,
              level,
              vague,
              authenticityRisk,
              integrityBreach,
            }),
        },
        {
          role: "user",
          content: JSON.stringify({
            roleId: session.roleId,
            trackId,
            candidateLevel: level,
            style: session.config.styleResolved,
            sessionTags: session.sessionTags || [],
            vagueInsufficientDetail: vague,
            authenticityRisk,
            integrityBreach,
            dimensionWeights: TRACK_DIMENSION_WEIGHTS[trackId],
            items: session.runtimes.map((rt) => ({
              questionId: rt.question.id,
              prompt: rt.question.prompt,
              intent: rt.question.intent,
              rubrics: rt.question.rubrics,
              answers: rt.userAnswers,
              tags: rt.tags,
              hintLevel: rt.hintLevel,
              answerIndependence: rt.answerIndependence,
            })),
          }),
        },
      ],
      ...thinkingExtra(),
    });
    const msg = completion.choices[0]?.message as
      | { content?: string | null; reasoning_content?: string | null }
      | undefined;
    const raw = (msg?.content || msg?.reasoning_content || "").trim();
    const json = extractJsonObject(raw);
    const dimsRaw = Array.isArray(json.dimensions) ? json.dimensions : null;
    let dims: FeedbackDimensionScore[] = dimsRaw
      ? (dimsRaw as Array<Record<string, unknown>>).map((d, i) => {
          const score = Number(d.score) || dimensions[i]?.score || 2;
          const bandRaw = String(d.band || "");
          const band = (
            ["强", "中", "弱", "风险", "严重"].includes(bandRaw)
              ? bandRaw
              : scoreToBand(score)
          ) as FeedbackBand;
          return {
            dimension: String(d.dimension || FEEDBACK_DIMENSIONS[i]?.label || "维度"),
            score,
            band,
            weight: Number(d.weight) || dimensions[i]?.weight || 0,
            evidence: String(d.evidence || ""),
          };
        })
      : dimensions;
    dims = applyIntegrityDimension(dims, trackId, integrityBreach, authenticityRisk);
    return {
      overallSummary: ensureIntegritySummary(
        ensureAuthenticityFeedbackText(
          ensureVagueFeedbackText(
            String(json.overallSummary || fallback.overallSummary),
            vague,
          ),
          authenticityRisk || integrityBreach,
        ),
        integrityBreach,
      ),
      perQuestion: Array.isArray(json.perQuestion) ? json.perQuestion : fallback.perQuestion,
      dimensions: dims,
      topActions: Array.isArray(json.topActions) ? json.topActions.slice(0, 5) : fallback.topActions,
      roleId: session.roleId,
      trackId,
      candidateLevel: level,
      styleResolved: session.config.styleResolved,
      integrityBreach: integrityBreach || undefined,
      vagueInsufficientDetail: vague || undefined,
      authenticityRisk: authenticityRisk || integrityBreach || undefined,
      integritySevere: integrityBreach || undefined,
    };
  } catch {
    return fallback;
  }
}
