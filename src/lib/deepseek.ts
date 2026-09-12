import OpenAI from "openai";
import { RED_FLAG_PATTERNS } from "./config";
import { analyzeSessionDelivery } from "./fluency";
import type {
  FeedbackReport,
  InterviewAction,
  InterviewSession,
  ResumeProfile,
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
  /** 诚信违规结束等场景：跳过润色，保留原句意图 */
  skipPolish?: boolean;
}) {
  const fallback = input.draft;
  if (input.skipPolish) return { text: fallback, mocked: false };
  const c = client();
  if (!c) return { text: fallback, mocked: true };
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.4,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "你是大厂研发岗真人面试官。口语自然，像当面聊天。中立、一次只问一个问题或不问只控场；不暗示对错；不给标准答案；不当场宣判；不嘲讽。语气沉稳偏紧。禁止说出「模拟」「压力面」「AI」「数字人」等元信息。若候选人承认简历/项目是乱写、编造，应直接结束面试并让其完善后再来，不要继续追问上一题。若候选人明显不会，简短记下并换题，不要刨根问底。只输出最终要对候选人说的一句中文。草稿已写清结束或换题意图时，请保留该意图，不要改成继续追问。",
        },
        {
          role: "user",
          content: JSON.stringify({
            action: input.action,
            tone: input.tone,
            draft: input.draft,
            currentQuestion: input.questionPrompt,
            userAnswer: input.userAnswer?.slice(0, 800) ?? "",
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

export async function generateFeedback(session: InterviewSession): Promise<FeedbackReport> {

  const deliveryStats = analyzeSessionDelivery(
    session.runtimes.map((rt) => ({ questionId: rt.question.id, answers: rt.userAnswers })),
  ).overall;
  const delivery = {
    fluencyScore: deliveryStats.fluencyScore,
    expressionScore: deliveryStats.expressionScore,
    fillerCount: deliveryStats.fillerCount,
    topFillers: deliveryStats.topFillers,
    notes: deliveryStats.notes,
  };
  const fallback: FeedbackReport = {
    overallSummary:
      "本场为研发岗压力面模拟。整体完成了主流程；建议继续用项目细节、取舍与边界证明实践深度。本报告不做录用结论。",
    perQuestion: session.runtimes.map((rt) => ({
      questionId: rt.question.id,
      prompt: rt.question.prompt,
      userAnswer: rt.userAnswers.join("\n") || "（未作答/卡壳）",
      scores: rt.question.rubrics.map((r) => ({
        dimension: r.dimension,
        score: rt.userAnswers.join("").length > 60 ? 3 : 2,
        evidence: rt.userAnswers[0]?.slice(0, 80) || "信息不足",
      })),
      tags: rt.tags,
      improvements: ["补充个人职责边界", "说明取舍与失效场景", "用数据或现象验证结果"],
    })),
    topActions: ["准备量化结果的项目故事", "每题主动讲清取舍与边界", "用故障复盘练排查路径"],
    roleId: session.roleId,
    styleResolved: session.config.styleResolved,
    delivery,
  };

  const c = client();
  if (!c) return fallback;
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "输出复盘 JSON：{overallSummary, perQuestion:[{questionId,prompt,userAnswer,scores:[{dimension,score,evidence}],tags,improvements}],topActions}。分数1-5。不要宣判通过/不通过。不要 markdown。可结合 delivery 里的语气词与流畅度信号写 overallSummary。",
        },
        {
          role: "user",
          content: JSON.stringify({
            roleId: session.roleId,
            style: session.config.styleResolved,
            delivery,
            items: session.runtimes.map((rt) => ({
              questionId: rt.question.id,
              prompt: rt.question.prompt,
              intent: rt.question.intent,
              rubrics: rt.question.rubrics,
              answers: rt.userAnswers,
              tags: rt.tags,
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
    return {
      overallSummary: String(json.overallSummary || fallback.overallSummary),
      perQuestion: Array.isArray(json.perQuestion) ? json.perQuestion : fallback.perQuestion,
      topActions: Array.isArray(json.topActions) ? json.topActions.slice(0, 5) : fallback.topActions,
      roleId: session.roleId,
      styleResolved: session.config.styleResolved,
      delivery,
    };
  } catch {
    return fallback;
  }
}
