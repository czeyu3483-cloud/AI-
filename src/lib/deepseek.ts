import OpenAI from "openai";
import { RED_FLAG_PATTERNS } from "./config";
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
}) {
  const fallback = input.draft;
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
            "你是大厂研发岗模拟面试官。中立、一次只问一个问题或不问只控场；不暗示对错；不给标准答案；不当场宣判；不嘲讽；压力面语气沉稳偏紧。只输出最终要对候选人说的一句中文。",
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
    projects: [],
    parseMeta: { source, warnings: [] },
  };
  const c = client();
  if (!c) {
    base.parseMeta.warnings.push("未配置 DeepSeek，使用原文");
    base.projects = rawText
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /项目|系统|平台|App|服务/.test(l))
      .slice(0, 2)
      .map((name) => ({ name: name.slice(0, 40), highlights: [] as string[] }));
    return base;
  }
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            '提取简历 JSON：{"name":string?,"education":[{"school","degree","major"}],"skills":string[],"projects":[{"name","role","stack":string[],"highlights":string[]}]}。不要 markdown。',
        },
        { role: "user", content: rawText.slice(0, 10000) },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ""));
    return {
      ...base,
      name: json.name,
      education: Array.isArray(json.education) ? json.education : [],
      skills: Array.isArray(json.skills) ? json.skills.slice(0, 20) : [],
      projects: Array.isArray(json.projects)
        ? json.projects.slice(0, 3).map(
            (p: { name?: string; role?: string; stack?: string[]; highlights?: string[] }) => ({
              name: String(p.name || "未命名项目"),
              role: p.role,
              stack: p.stack ?? [],
              highlights: p.highlights ?? [],
            }),
          )
        : [],
    };
  } catch {
    base.parseMeta.warnings.push("结构化失败，已回退原文");
    return base;
  }
}

export async function generateFeedback(session: InterviewSession): Promise<FeedbackReport> {
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
  };

  const c = client();
  if (!c) return fallback;
  try {
    const completion = await c.chat.completions.create({
      model: modelName(),
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "输出复盘 JSON：{overallSummary, perQuestion:[{questionId,prompt,userAnswer,scores:[{dimension,score,evidence}],tags,improvements}],topActions}。分数1-5。不要宣判通过/不通过。不要 markdown。",
        },
        {
          role: "user",
          content: JSON.stringify({
            roleId: session.roleId,
            style: session.config.styleResolved,
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
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const json = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ""));
    return {
      overallSummary: String(json.overallSummary || fallback.overallSummary),
      perQuestion: Array.isArray(json.perQuestion) ? json.perQuestion : fallback.perQuestion,
      topActions: Array.isArray(json.topActions) ? json.topActions.slice(0, 5) : fallback.topActions,
      roleId: session.roleId,
      styleResolved: session.config.styleResolved,
    };
  } catch {
    return fallback;
  }
}
