import type {
  BehaviorConfig,
  InterviewAction,
  Question,
  RoleId,
  StyleId,
  TrackId,
} from "./types";

export const DEMO_ROLES: Array<{ id: RoleId; label: string; enabled: boolean }> = [
  { id: "rd_general", label: "研发岗", enabled: true },
  { id: "pm", label: "产品岗", enabled: false },
  { id: "ops", label: "运营岗", enabled: false },
  { id: "algo", label: "算法岗", enabled: false },
];

export const DEMO_STYLES: Array<{ id: StyleId; label: string; enabled: boolean }> = [
  { id: "pressure", label: "压力面", enabled: true },
  { id: "calm", label: "平和面", enabled: false },
  { id: "random", label: "随机", enabled: false },
];

/** 研发岗下第二层选择；目前仅 rd_general 开放 */
export const DEMO_TRACKS: Array<{
  id: TrackId;
  label: string;
  hint: string;
  enabled: boolean;
}> = [
  {
    id: "biz",
    label: "业务面",
    hint: "简历调研→深挖→专业题→编程；追问细节与取舍，不编无关题库",
    enabled: true,
  },
  {
    id: "hr_final",
    label: "HR终面",
    hint: "简历协作切入 → 适配/动机/协作；中立不中途夸赞",
    enabled: true,
  },
];

/**
 * 业务面：按 ~30–40 分钟语音面设计（约 8 主问题：调研/深挖/专业/编程）。
 * 偏技术深挖，允许更多 FOLLOW_UP / 分级提示。
 */
export const PRESSURE_CONFIG: BehaviorConfig = {
  silenceThinkingMs: 2000,
  silenceNudgeMs: 5000,
  silenceStuckMs: 12000,
  maxFollowUpsPerQuestion: 2,
  maxPressurePerQuestion: 3,
  /** 业务面允许 L1–L3 分级提示 */
  maxHintsPerQuestion: 3,
  maxReframesPerQuestion: 1,
  minAnswerChars: 30,
  questionsPerSession: 8,
  allowFirstHintOnRequest: true,
  answerSoftLimitSec: 90,
  answerHardLimitSec: 140,
  styleChosen: "pressure",
  styleResolved: "pressure",
  tone: "steady_firm",
  maxVagueFollowUpsPerQuestion: 1,
};

/** HR终面：更长会话但少硬追问；偏软性问题 */
export const HR_FINAL_CONFIG: BehaviorConfig = {
  ...PRESSURE_CONFIG,
  maxFollowUpsPerQuestion: 1,
  maxPressurePerQuestion: 2,
  maxHintsPerQuestion: 1,
  questionsPerSession: 7,
  allowFirstHintOnRequest: false,
  answerSoftLimitSec: 80,
  answerHardLimitSec: 120,
  tone: "steady_warm",
  maxVagueFollowUpsPerQuestion: 1,
};

export function configForTrack(trackId: TrackId): BehaviorConfig {
  return trackId === "hr_final" ? { ...HR_FINAL_CONFIG } : { ...PRESSURE_CONFIG };
}

export const SKIP_SOFT_UTTERANCE = "好，这题我先记下了，我们换一个。";

/** 空泛追问过一次后仍不够细 → 软换题（不机械追加「细节可以补充」） */
export const VAGUE_SOFT_SKIP_UTTERANCE =
  "好，这题我先记下了，我们换一个。";

/** 空泛时的唯一一次短探（仅当真薄时使用） */
export const VAGUE_PROBE_UTTERANCE =
  "这块有点笼统，你具体负责哪一步？结果怎么验证的？";

/** HR 轨道空泛短探（语气更软） */
export const VAGUE_PROBE_UTTERANCE_HR =
  "能再具体一点吗？比如你当时怎么想、怎么做的？";

/**
 * 当面试官话术/题目暗示限时，或动作为 TIMEBOX 时，
 * 把 config 的 soft/hard 时限交给客户端强制执行。
 */
export function answerLimitsForAction(input: {
  action: InterviewAction;
  question?: Question | null;
  utterance?: string;
  softSec: number;
  hardSec: number;
}): { answerSoftLimitSec?: number; answerHardLimitSec?: number } {
  const blob = `${input.utterance || ""} ${input.question?.prompt || ""}`;
  const twoMin = /两分钟|2\s*分钟|二分钟|120\s*秒/.test(blob);
  const oneMin = /一分钟|1\s*分钟|六十秒|60\s*秒/.test(blob);
  const timedPhrase =
    /限时|时间内|时间到|请在.{0,6}内|TIMEBOX|软时限|硬时限/.test(blob) ||
    twoMin ||
    oneMin;
  const timedAction = input.action === "TIMEBOX";

  if (!timedAction && !timedPhrase) return {};

  let soft = input.softSec;
  let hard = input.hardSec;
  if (twoMin) {
    soft = 120;
    hard = Math.max(140, Math.min(Math.max(input.hardSec, 150), 180));
  } else if (oneMin) {
    soft = 60;
    hard = Math.max(75, Math.min(Math.max(input.hardSec, 90), 100));
  }
  return { answerSoftLimitSec: soft, answerHardLimitSec: hard };
}

/** 简历/经历明显不实或主动承认乱写时，直接结束 */
export const INTEGRITY_END_UTTERANCE =
  "那你先把简历改扎实了再来面试，今天就先到这里。";

/** 全局控场：薪资/加班等 HR 话题 */
export const POLICY_HR_DEFLECT = "这块后面 HR 会聊。";

/** 全局控场：过不过/录用/内部政策等，面试环节不好说 */
export const POLICY_LEADER_DEFLECT = "这个面试环节不好说，我们先回到题目。";

/** 全局控场：候选人要思考时间 → 只应答、不追问、不换题 */
export const POLICY_THINKING_WAIT = "好的。";

/** 全局控场：答太长/跑火车 → 软换下一题 */
export const POLICY_RAMBLING_NEXT = "那我们先看下一个问题。";

/** @deprecated 开场白改为 persona.buildOpeningLine，保留常量以免旧引用报错 */
export const INTRO_PRESSURE = "";

export const RED_FLAG_PATTERNS = [
  /你停一下/,
  /别说了/,
  /你错了/,
  /正确答案是/,
  /标准答案/,
  /你通过了/,
  /你挂了/,
  /太棒了/,
  /完全正确/,
  /换简单的/,
  /压力面/,
  /模拟面试/,
  /数字人/,
];

export const SAMPLE_RESUME = `张三
本科 · 计算机科学
技能：TypeScript、React、Node.js、MySQL、Redis
项目：校园二手交易平台
- 负责商品发布与检索模块，使用 Next.js + PostgreSQL
- 将列表接口 P95 从 800ms 优化到 200ms
项目：监控告警中台
- 负责告警收敛策略，减少夜间无效告警 40%
`;
