import type { BehaviorConfig, RoleId, StyleId } from "./types";

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

export const PRESSURE_CONFIG: BehaviorConfig = {
  silenceThinkingMs: 900,
  silenceStuckMs: 4500,
  maxFollowUpsPerQuestion: 3,
  maxPressurePerQuestion: 3,
  maxHintsPerQuestion: 0,
  maxReframesPerQuestion: 1,
  minAnswerChars: 30,
  questionsPerSession: 4,
  allowFirstHintOnRequest: false,
  answerSoftLimitSec: 70,
  answerHardLimitSec: 110,
  styleChosen: "pressure",
  styleResolved: "pressure",
  tone: "steady_firm",
};

export const SKIP_SOFT_UTTERANCE = "没关系，这题先过，换个方向聊聊。";

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
