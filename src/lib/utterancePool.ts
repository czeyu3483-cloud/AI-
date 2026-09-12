import type { InterviewAction, TrackId } from "./types";

/** 多样化口语模板：避免每句都像「可以再详细一点」脚本 */

const ADVANCE_PREFIXES = [
  "下一个问题。",
  "好，我们往下看。",
  "行，换个角度。",
  "嗯，下一题。",
  "好，接着聊。",
];

const SKIP_SOFT_PREFIXES = [
  "好，这题我先记下了，我们换一个。",
  "没关系，这题先过，换个方向聊聊。",
  "行，这块我记下了，我们看下一个。",
  "好，先到这儿，换一题。",
];

const VAGUE_PROBES_BIZ = [
  "这块有点笼统，你具体负责哪一步？结果怎么验证的？",
  "我还没听到可验证的细节——你亲手改了哪一处？",
  "落到动作上：你当时第一步做了什么？",
];

const VAGUE_PROBES_HR = [
  "能再具体一点吗？比如你当时怎么想、怎么做的？",
  "举一个具体场景就行：分歧在哪、你说了什么？",
  "落到一件事上：你个人做了哪一步？",
];

const OWNERSHIP_POOL = [
  "其中哪一部分是你独立完成的？怎么证明？",
  "团队分工里，哪一段是你闭环的？",
  "你个人的动作是什么？别人做的先放一边。",
];

const TRADEOFF_POOL = [
  "如果只能保留一个关键取舍，你会留哪个？为什么？",
  "当时备选方案是什么？为什么没选？",
  "这个选择的代价是什么？",
];

const BOUNDARY_POOL = [
  "这个方案在什么场景下会失效？你怎么兜底？",
  "边界情况你想过哪两个？",
  "量上去之后哪里会先撑不住？",
];

const PITFALL_POOL = [
  "落地时踩过什么坑？你怎么处理的？",
  "有没有失败过一版？为什么失败？",
  "如果重来一次，你会改哪一步？",
];

const HR_FOLLOW_POOL = [
  "能再落到一件具体事上吗？你个人做了什么？",
  "当时分歧具体在哪？你做了哪一步沟通？",
  "这个判断从哪段经历来的？",
  "前三个月你会先补哪一块？怎么衡量自己上手了？",
];

function pick<T>(pool: T[], seed = 0): T {
  const i = Math.abs(seed) % pool.length;
  return pool[i]!;
}

export function pickAdvancePrefix(seed = Date.now()): string {
  return pick(ADVANCE_PREFIXES, seed);
}

export function pickSkipSoftPrefix(seed = Date.now()): string {
  return pick(SKIP_SOFT_PREFIXES, seed);
}

export function pickVagueProbe(trackId: TrackId, seed = Date.now()): string {
  return pick(trackId === "hr_final" ? VAGUE_PROBES_HR : VAGUE_PROBES_BIZ, seed);
}

export function pickFollowUpTemplate(
  action: InterviewAction,
  trackId: TrackId,
  seed = Date.now(),
): string {
  if (trackId === "hr_final") return pick(HR_FOLLOW_POOL, seed);
  if (action === "FOLLOW_UP_TRADEOFF") return pick(TRADEOFF_POOL, seed);
  if (action === "FOLLOW_UP_BOUNDARY") return pick(BOUNDARY_POOL, seed);
  if (action === "FOLLOW_UP_PITFALL") return pick(PITFALL_POOL, seed);
  return pick(OWNERSHIP_POOL, seed);
}

/** 禁止机械追加的空壳收尾（润色侧也会禁） */
export const DETAIL_BOILERPLATE_RE =
  /可以再详细|细节可以补充|细节还可以再补|再具体一点吧|太空泛了再讲讲/;
