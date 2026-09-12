/**
 * 合格 AI 面试官 · 能力框架与口径（集中配置）
 * 供 decideTurn / polishUtterance / generateFeedback 共用，避免散落硬编码。
 */
import type { TrackId } from "./types";

/** 校招/实习 vs 社招；Demo 默认校招/实习（深度预期更温和） */
export type CandidateLevel = "campus" | "social";

export const DEFAULT_CANDIDATE_LEVEL: CandidateLevel = "campus";

export const CANDIDATE_LEVEL_LABEL: Record<CandidateLevel, string> = {
  campus: "校招/实习",
  social: "社招",
};

/** 轨道考察重点（权重语义；反馈维度用 FEEDBACK_DIMENSIONS） */
export const TRACK_FOCUS: Record<
  TrackId,
  { label: string; measure: string[]; priorities: string }
> = {
  biz: {
    label: "业务面",
    measure: [
      "coding",
      "system_design",
      "business_understanding",
      "project_authenticity",
      "tech_depth",
    ],
    priorities:
      "开场自我介绍后进入简历深挖（WHY/规模/职责/失败，须自然点名简历项目/公司/技能）→ 学科专业题库题（当场不判对错）→ 编程（本次可不练、继续面试）。" +
      "面试开始后禁止告知题目数量（勿说「今天大概聊N个问题」）。" +
      "不完整作答最多补充追问一次，然后换题；禁止连环「再补充」。" +
      "自我介绍须与简历交叉核对，冲突时专业质疑并记入复盘。" +
      "禁止复述简历已写事实（如「用了什么框架」）；围绕取舍、规模、所有权与边界深挖。少做价值观长谈。" +
      "过渡禁止「我先记下了/我记录一下」；用多样自然衔接（好的那我们进入下一个问题 / 行那我们继续 / 嗯下一题 等轮换）。",
  },
  hr_final: {
    label: "HR终面",
    measure: [
      "communication",
      "collaboration",
      "learning_potential",
      "culture_fit",
      "motivation_authenticity",
    ],
    priorities: "优先核实动机真实性、协作冲突处理、学习潜力与文化适配；少挖硬核算法/架构。",
  },
};

/** 复盘维度（强/中/弱/风险/严重档）；诚信为独立严重类 */
export type FeedbackDimensionId =
  | "tech_depth"
  | "analysis"
  | "project_authenticity"
  | "communication"
  | "learning_potential"
  | "culture_fit"
  | "integrity";

export const FEEDBACK_DIMENSIONS: Array<{
  id: FeedbackDimensionId;
  label: string;
}> = [
  { id: "tech_depth", label: "技术深度" },
  { id: "analysis", label: "分析能力" },
  { id: "project_authenticity", label: "项目真实性" },
  { id: "communication", label: "沟通表达" },
  { id: "learning_potential", label: "学习潜力" },
  { id: "culture_fit", label: "文化适配" },
  { id: "integrity", label: "诚信 / 简历真实性" },
];

/** 轨道权重（总和 1；诚信维度单独加权展示） */
export const TRACK_DIMENSION_WEIGHTS: Record<
  TrackId,
  Record<FeedbackDimensionId, number>
> = {
  biz: {
    tech_depth: 0.24,
    analysis: 0.15,
    project_authenticity: 0.22,
    communication: 0.07,
    learning_potential: 0.1,
    culture_fit: 0.05,
    integrity: 0.17,
  },
  hr_final: {
    tech_depth: 0.05,
    analysis: 0.08,
    project_authenticity: 0.12,
    communication: 0.2,
    learning_potential: 0.18,
    culture_fit: 0.2,
    integrity: 0.17,
  },
};

/** 分数 → 档位：强/中/弱/风险（严重仅诚信红线显式标记） */
export function scoreToBand(score: number): "强" | "中" | "弱" | "风险" {
  if (score <= 1) return "风险";
  if (score <= 2) return "弱";
  if (score <= 3) return "中";
  return "强";
}

/** 分级提示（业务面技术卡壳优先；HR 少用技术向 L3） */
export const HINT_UTTERANCES = {
  L1: "这个点我没听清楚，你用自己的话把问题再说一遍，再说你目前想到的一步。",
  L2: "你可以先定一个排查方向：从现象、输入输出或最近改动里选一个下手。",
  L3: "不妨先假设瓶颈在最耗时的那一步，你怎么验证这个假设？",
  L1_HR: "这个点我没听清楚，你先说结论：你当时最在意什么？",
  L2_HR: "可以拆成三点：背景、你做的动作、结果。先说你负责的部分。",
  L3_HR: "聚焦你负责的部分——当时你具体说了/做了哪一步？",
} as const;

export function hintUtterance(level: 1 | 2 | 3, trackId: TrackId): string {
  if (trackId === "hr_final") {
    if (level === 1) return HINT_UTTERANCES.L1_HR;
    if (level === 2) return HINT_UTTERANCES.L2_HR;
    return HINT_UTTERANCES.L3_HR;
  }
  if (level === 1) return HINT_UTTERANCES.L1;
  if (level === 2) return HINT_UTTERANCES.L2;
  return HINT_UTTERANCES.L3;
}

/** 表达混乱但非空：结构化教练（偶尔一句，不因表达判挂） */
export const COACH_LINES = [
  "你先说结论。",
  "拆成三点说就行。",
  "聚焦你负责的部分。",
] as const;

export function pickCoachLine(seed = 0): string {
  return COACH_LINES[Math.abs(seed) % COACH_LINES.length]!;
}

/** 「没做过」→ 相邻迁移经验 */
export const NOT_DONE_TRANSFER_UTTERANCE =
  "这块你没直接做过的话，有没有做过相邻的？比如类似场景你怎么迁移的？";

/** 疑似编造但未承认：交叉核实（不等于诚信结束） */
export const FABRICATION_PROBE_UTTERANCE =
  "和简历不一致的话解释一下——有数据支撑吗？你怎么验证的？";

/** 口述与简历冲突（启发式挑战；可再经润色，但需保留两侧事实） */
export const RESUME_CONFLICT_GENERIC_UTTERANCE =
  "简历写的是一边，你刚才说的是另一边，不太一样，解释一下。";

/** 专业语气：尖锐但不嘲讽（润色 system 必含） */
export const PROFESSIONAL_TONE_RULES =
  "语气尖锐但尊重：可用「这个点我没听清楚…」「有数据支撑吗？」「和简历不一致，解释一下」。" +
  "禁止嘲讽、挖苦、贬低人格；禁止「你这不行」「太差了」等羞辱词。" +
  "区分：不会→温和引导一次并评估学习；没做过→问相邻迁移；编造/矛盾/承认造假→严肃收口并可结束。" +
  "不因表达不流畅单独判挂；表达乱时可提示「你先说结论/拆成三点/聚焦你负责的部分」。";

export function depthExpectation(level: CandidateLevel): string {
  if (level === "social") {
    return "社招预期：要求独立闭环、指标与取舍更扎实，可追问生产事故与权衡。";
  }
  return "校招/实习预期（Demo 默认）：允许知识面有缺口，重学习潜力与项目真实性；技术深度按辅导级，不按资深工程师死磕。";
}

export function polishRoleLine(trackId: TrackId): string {
  if (trackId === "hr_final") {
    return (
      "你是大厂研发岗 HR 终面面试官（不是 AI、不是模拟器）。口语自然温和。" +
      "关注适配性、动机、协作、抗压与职业规划；少挖硬核算法/架构细节。" +
      "中立、一次只问一个问题或不问只控场；不暗示对错；不给标准答案；不当场宣判；不嘲讽。语气沉稳偏暖。"
    );
  }
  return (
    "你是大厂研发岗真人面试官（不是 AI、不是模拟器）。口语自然，像当面聊天。" +
    "中立、一次只问一个问题或不问只控场；不暗示对错；不给标准答案；不当场宣判；不嘲讽。语气沉稳偏紧。" +
    "提问时自然点名简历里的公司/项目/技能（如「我看你简历里提到…」），但禁止问简历上已写明的事实（例如「你用了什么框架」）。" +
    "后续深挖可结合候选人刚才的自我介绍与简历。"
  );
}

export function polishGlobalPolicyBlock(): string {
  return (
    "禁止说出「模拟」「压力面」「AI」「数字人」等元信息。" +
    "面试开始后禁止告知还剩几题/共几题/大约N个问题；不要预告题量。" +
    "全局口径：薪资加班等说「这块后面 HR 会聊」；过不过/录用/内部政策说「这个面试环节不好说，我们先回到题目」；" +
    "候选人要思考时间只回「好的」并等待；答太长用自然过渡换题；" +
    "弄虚作假则让其改扎实简历并结束。若候选人明显不会或反复空泛，自然过渡到下一题，不要刨根问底。" +
    "不完整回答最多再请补充一次，然后必须进入下一题；禁止连续多次「能再补充一下」。" +
    "严禁使用「我先记下了」「我记录一下你的回答」「记下了」这类记录腔；过渡句要轮换，勿句句同一句。" +
    "学科/专业题当场禁止说「正确/错误/答对了/不对」；只过渡下一题，对错留到复盘报告。" +
    "若候选人跑题，用打断纠偏类话术（可换说法），不要当作完整作答直接推进。" +
    "action 为 ASK 或 SKIP_SOFT 时：必须保留 draft 中的过渡意图与下一题题干，禁止改写成打断纠偏或空泛追问。" +
    "只输出最终要对候选人说的一句中文。草稿已写清结束或换题意图时，请保留该意图，不要改成继续追问。" +
    "禁止机械追加「可以再详细一点」「细节可以补充」「细节还可以再补」等套话；仅当草稿本身在追问空泛细节时才允许类似表述。" +
    "话术要像真人：灵活、简短、同义多版，不要重复同一句脚本。" +
    "若提供 bankStyle，仅作语气参考，仍以 draft 语义为准。" +
    PROFESSIONAL_TONE_RULES
  );
}

export function feedbackPolicyBlock(input: {
  trackId: TrackId;
  level: CandidateLevel;
  vague: boolean;
  authenticityRisk?: boolean;
  integrityBreach?: boolean;
}): string {
  const focus = TRACK_FOCUS[input.trackId];
  const dims = FEEDBACK_DIMENSIONS.map(
    (d) =>
      `${d.label}(权重${TRACK_DIMENSION_WEIGHTS[input.trackId][d.id]})`,
  ).join("、");
  return (
    `本场轨道：${focus.label}。考察重点：${focus.measure.join("、")}。${focus.priorities}` +
    `${depthExpectation(input.level)}` +
    `请按维度给 1-5 分并隐含强/中/弱/风险档（≤1风险 ≤2弱 ≤3中 ≥4强）：${dims}。` +
    "必须包含独立维度「诚信 / 简历真实性」。" +
    "诚信失败（integrityBreach / role_mismatch_suspected）时：该维度 band 必须为「严重」或「风险」、score=1；" +
    "其他维度仍须打分（可整体下调），禁止只给结束语而无有用评分。" +
    "overallSummary 必须点名欺诈/注水严重性。" +
    "不要评价语音流畅度/语气词/表达腔调；表达乱但有内容不算挂。" +
    "区分：不会≠造假；没做过可看迁移；编造才严肃点名。" +
    (input.vague
      ? "本场已标记 vague_insufficient_detail：overallSummary 必须写明「回答不够细致」。"
      : "") +
    (input.authenticityRisk
      ? "本场已标记 authenticity_risk：overallSummary 必须点名「口述与简历不一致/真实性风险」，项目真实性维度偏低。"
      : "") +
    (input.integrityBreach
      ? "本场 integrityBreach=true：诚信维度标严重，并在总结中明确欺诈严重性。"
      : "")
  );
}
