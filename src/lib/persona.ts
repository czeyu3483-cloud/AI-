import type { StyleId, TrackId } from "./types";

const INTERVIEWER_NAMES = ["王老师", "李老师", "张老师", "陈老师", "刘老师", "赵老师"];

/** 口语化称呼：三字名取后两字；两字名加「同学」；解析不到则用「同学」 */
export function addressCandidate(rawName?: string): string {
  const name = (rawName || "").replace(/\s+/g, "").replace(/[·•.]/g, "").trim();
  if (!name) return "同学";

  if (/^[\u4e00-\u9fff]{2}$/.test(name)) return `${name}同学`;
  if (/^[\u4e00-\u9fff]{3}$/.test(name)) return name.slice(1);
  if (/^[\u4e00-\u9fff]{4}$/.test(name)) return name.slice(2);
  if (/^[\u4e00-\u9fff]+$/.test(name) && name.length > 4) return name.slice(-2);

  const first = name.split(/[\s_-]+/)[0] || name;
  return first.length <= 12 ? first : "同学";
}

export function pickInterviewerName(): string {
  return INTERVIEWER_NAMES[Math.floor(Math.random() * INTERVIEWER_NAMES.length)]!;
}

export function buildOpeningLine(input: {
  candidateName?: string;
  interviewerName: string;
  questionCount: number;
  trackId?: TrackId;
}): string {
  const who = addressCandidate(input.candidateName);
  const hello = who === "同学" ? "同学你好" : `${who}你好`;
  const focus =
    input.trackId === "hr_final"
      ? "主要了解你的动机、协作方式和职业规划，轻松把经历讲清楚就行"
      : "主要了解你的项目经历和基础功底，你把思路讲清楚就行";
  return (
    `${hello}，我是今天的面试官${input.interviewerName}。` +
    `今天大概聊 ${input.questionCount} 个问题，${focus}。` +
    `我们先开始。`
  );
}

export const DONT_INTERRUPT_LINE = "稍等一下，等我说完你再回答。";
export const THINKING_FILLERS = ["嗯。", "好。", "我听一下。"];

export function pickFiller(): string {
  return THINKING_FILLERS[Math.floor(Math.random() * THINKING_FILLERS.length)]!;
}

/** 回答过于空泛时，面试官可中途插话 */
export function shouldBargeIn(partialAnswer: string): boolean {
  const text = partialAnswer.replace(/\s+/g, "").trim();
  if (text.length < 8) return false;
  if (text.length > 60) return false;
  return /反正就|大概是|然后那个|就是那个|嗯嗯|随便|不太清楚|我忘了/.test(text);
}

export const BARGE_IN_LINE = "等一下，这块有点笼统。你具体负责什么？结果怎么验证的？";

const PRESSURE_NUDGES = [
  "同学？",
  "还在想吗？先说你目前想到的。",
  "卡壳了？没关系，先讲你能确定的部分。",
  "我等你一下——你可以先开口。",
];

const CALM_NUDGES = [
  "同学，还在吗？",
  "不着急，想到多少说多少。",
  "你可以先从结论说起。",
  "需要我把问题再说一遍吗？你先回一句就行。",
];

/** 问完题后长时间无应答时的提醒文案（按风格） */
export function pickNudgeLine(style: StyleId | "pressure" | "calm" = "pressure"): string {
  const resolved = style === "calm" ? "calm" : "pressure";
  const pool = resolved === "calm" ? CALM_NUDGES : PRESSURE_NUDGES;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
export const pickSilenceNudge = pickNudgeLine;

/* ---- compatibility aliases (历史命名漂移) ---- */
export {
  addressCandidate as addressCandidateName,
  pickInterviewerName as pickRandomInterviewerName,
  buildOpeningLine as buildOpeningUtterance,
  pickFiller as pickThinkingFiller,
  shouldBargeIn as shouldInterruptVagueAnswer,
};
export const DONT_INTERRUPT_LINE_ALIAS = DONT_INTERRUPT_LINE;
export const BARGE_IN_LINE_ALIAS = BARGE_IN_LINE;


