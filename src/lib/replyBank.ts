import type { AbilityTag, InterviewAction } from "./types";

/**
 * 候选人高频反应 → 面试官固定口语回复库。
 *
 * 生产库目前仅收录 id 1–30（用户已确认的回复）。
 * TODO: 待用户提供面试官回复后，再补全 id 31–100；切勿提前硬编码 31–100。
 */

export type ReplyBankFlags = {
  /** 诚信/挂名等红线：直接结束本场 */
  endInterview?: boolean;
  /** 仅第一次给轻提示；已提示过则本条不命中 */
  hintOnce?: boolean;
  /** 收束本题并软换下一题（预留；1–30 暂未使用） */
  softSkip?: boolean;
};

export type ReplyBankEntry = {
  id: number;
  patterns: RegExp[];
  reply: string;
  flags?: ReplyBankFlags;
  tags?: AbilityTag[];
  action?: InterviewAction;
};

export type ReplyBankMatch = {
  id: number;
  reply: string;
  flags: ReplyBankFlags;
  tags?: AbilityTag[];
  action?: InterviewAction;
};

/**
 * 仅 1–30。匹配顺序：更具体 / 红线优先于泛化「不会」等。
 * 阶段说明落在 flags，不进 reply 正文。
 */
export const REPLY_BANK: ReplyBankEntry[] = [
  // —— 诚信红线 → endInterview ——
  {
    id: 5,
    patterns: [/简历是乱写的/, /简历.*乱写/, /简历.*瞎写/],
    reply: "好的，那你先把简历改扎实了再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 6,
    patterns: [/项目经历有一部分是编的/, /项目.*是编的/, /经历.*是编的/, /有一部分是编的/],
    reply: "好的，那你先把项目经历写扎实了再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 7,
    patterns: [/这个项目其实不是我做的/, /项目其实不是我做的/, /其实不是我做的/],
    reply: "好的，那你先把真实负责的项目整理清楚再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 8,
    patterns: [/只是挂名/, /我只是挂名/, /主要是别人做的.*挂名/, /挂名/],
    reply: "好的，那你先把个人贡献写清楚再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },

  // —— 要提示 / 要答案 / 想跳题（先于泛化「不会」）——
  {
    id: 27,
    patterns: [/你能给我一点提示吗/, /给我一点提示/, /给点提示/, /能提示一下/],
    reply: "你可以思考思考",
    flags: { hintOnce: true },
    tags: ["weak_independent_problem_solving"],
    action: "REFRAME",
  },
  {
    id: 28,
    patterns: [/标准答案是什么/, /标准答案/, /正确答案是什么/],
    reply: "没有标准答案，我要你的思考过程。",
    tags: ["weak_independent_problem_solving"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 29,
    patterns: [/这题能跳过吗/, /能跳过吗/, /可以跳过吗/],
    reply: "没有标准答案，你谈谈你的思考过程也行。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 30,
    patterns: [/下一题吧.*真不会/, /这题我真不会/, /下一题吧/],
    reply: "没有标准答案，你谈谈你的思考过程也行。",
    action: "FORMULA_DEFLECT",
  },

  // —— 卡壳 / 不会（追问规划，不换题）——
  {
    id: 1,
    patterns: [/我想一下/, /嗯+[…\.．。]*我想一下/, /让我想一下/, /我想想/],
    reply: "嗯，你想一下可以，也可以说说你第一反应是什么。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 2,
    patterns: [/这个我不太清楚/, /我不太清楚/, /不太清楚/],
    reply: "不太清楚没关系，说说你推测会怎么查。",
    tags: ["can_reason_trainable"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 4,
    patterns: [/我没学过这块/, /没学过这块/, /这块没学过/, /没学过/],
    reply: "没学过这块，那你学过的最接近的是什么？",
    tags: ["knowledge_gap_not_learned"],
    action: "REFRAME",
  },
  {
    id: 3,
    patterns: [/^我不会[。.!！]?$/, /我不会[。.!！]?$/, /我不会做/],
    reply: "不会可以，那你要告诉我你的规划呢。",
    tags: ["can_reason_trainable"],
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 项目表述虚 / 团队 ——
  {
    id: 9,
    patterns: [/我当时负责接口开发/, /负责接口开发/],
    reply: "你负责接口开发，具体接口几个、QPS多少？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 10,
    patterns: [/我用的是\s*React\s*和\s*Node/i, /React\s*和\s*Node/i],
    reply: "React 和 Node 都用过，状态管理怎么做的？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 11,
    patterns: [/大概就是做了一个系统/, /做了一个系统吧/, /做了一个系统/],
    reply: "做了一个系统太虚了，系统解决什么问题？你在其中有什么贡献？",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 12,
    patterns: [/就是优化了一下/, /优化了一下/, /然后那个.+优化/],
    reply: "优化了一下，优化前指标是什么？优化的效果如何？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 13,
    patterns: [/反正就那样/, /效果还行/],
    reply: "可以说说具体效果？行到什么程度？有数据吗？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 14,
    patterns: [/我们团队一起做的/, /团队一起做的/],
    reply: "团队一起做的，那你个人独立负责哪块？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 15,
    patterns: [/我们把性能优化了很多/, /性能优化了很多/],
    reply: "性能优化了很多，很多是多少？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 有数据 / 深挖 ——
  {
    id: 16,
    patterns: [/P95\s*从\s*800\s*ms\s*优化到\s*200\s*ms/i, /接口\s*P95.+800.+200/i],
    reply: "嗯",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 17,
    patterns: [/我负责排查线上慢查询/, /排查线上慢查询/, /排查慢查询/],
    reply: "你负责排查慢查询，慢在哪条 SQL？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 18,
    patterns: [/具体指标我忘了/, /指标我忘了/],
    reply: "具体指标忘了，那你怎么证明优化有效？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 19,
    patterns: [/结果怎么验证的我不太记得/, /怎么验证的我不太记得/, /验证.+不太记得/],
    reply: "那你说说落地效果呢？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 选型 / 失败 / 边界 ——
  {
    id: 20,
    patterns: [/选型是因为大家都在用/, /因为大家都在用/, /大家都在用/],
    reply: "那你自己是怎么感觉呢？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 21,
    patterns: [/选\s*PostgreSQL.+复杂查询/i, /我选\s*PostgreSQL/i, /选 PostgreSQL 是因为/i],
    reply: "选 PostgreSQL 的理由可以，但对比过什么？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 22,
    patterns: [/失败过一次方案/, /后来回滚了/],
    reply: "失败过一次方案，为什么失败？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 23,
    patterns: [/没失败过.*一直很顺利/, /没失败过/, /一直很顺利/],
    reply: "那你觉得会遇到什么问题？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 24,
    patterns: [/边界情况我没怎么想/, /边界.?没怎么想/, /边界情况.*没/],
    reply: "边界情况没怎么想，现在想两个。",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 25,
    patterns: [/高并发下可能会有锁竞争/, /可能会有锁竞争/, /锁竞争/],
    reply: "高并发锁竞争，具体什么锁？",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 26,
    patterns: [/我可以画一下架构/, /画一下架构/, /画个架构/],
    reply: "我们主要先口头交流吧。",
    action: "FORMULA_DEFLECT",
  },
];

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ");
}

/**
 * 在 decideTurn 早期调用：命中则优先原样回复。
 * 按库顺序取首个强匹配（库内已把具体/红线条目排前）。
 * hintOnce 且本题已提示过 → 视为未命中。
 */
export function matchReplyBank(
  answer: string,
  ctx: { hintCount?: number } = {},
): ReplyBankMatch | null {
  const text = normalizeAnswer(answer);
  if (!text) return null;

  for (const entry of REPLY_BANK) {
    if (entry.flags?.hintOnce && (ctx.hintCount ?? 0) >= 1) continue;
    if (entry.patterns.some((re) => re.test(text))) {
      return {
        id: entry.id,
        reply: entry.reply,
        flags: entry.flags ?? {},
        tags: entry.tags,
        action: entry.action,
      };
    }
  }
  return null;
}

export function bankStyleHint(match: ReplyBankMatch): string {
  const flags = Object.entries(match.flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(",");
  return `replyBank#${match.id}${flags ? `(${flags})` : ""}`;
}
