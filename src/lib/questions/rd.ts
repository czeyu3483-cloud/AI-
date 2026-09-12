import type { Question } from "../types";

/** 业务面题库：技术 / 项目深度 */
export const RD_QUESTIONS: Question[] = [
  {
    id: "rd_q1",
    roleId: "rd_general",
    trackId: "biz",
    prompt: "请用两分钟介绍一个你最有代表性的技术项目：背景、你的职责，以及最终结果。",
    intent: "ownership_and_impact",
    followUpHints: ["个人职责边界", "量化结果", "关键取舍"],
    rubrics: [
      { dimension: "ownership", weight: 0.4, good: "清楚区分我与我们", poor: "全程我们" },
      { dimension: "structure", weight: 0.3, good: "背景-行动-结果清晰", poor: "流水账" },
      { dimension: "impact", weight: 0.3, good: "有可验证结果", poor: "无结果" },
    ],
    referencePoints: ["角色", "难点", "结果指标"],
  },
  {
    id: "rd_q2",
    roleId: "rd_general",
    trackId: "biz",
    prompt: "在那个项目里，你做过最重要的一次技术取舍是什么？为什么选它，什么场景下你会不选？",
    intent: "tradeoff",
    followUpHints: ["备选方案", "失效场景"],
    rubrics: [
      { dimension: "tradeoff", weight: 0.5, good: "讲清代价收益", poor: "只说选择" },
      { dimension: "boundary", weight: 0.5, good: "说清不适用场景", poor: "绝对化" },
    ],
    referencePoints: ["方案对比", "约束"],
  },
  {
    id: "rd_q3",
    roleId: "rd_general",
    trackId: "biz",
    prompt: "讲一次线上或联调故障：你怎么定位，最终改了什么，如何避免再发生？",
    intent: "debugging",
    followUpHints: ["排查路径", "根因", "防再发"],
    rubrics: [
      { dimension: "method", weight: 0.4, good: "排查有路径", poor: "靠蒙" },
      { dimension: "root_cause", weight: 0.3, good: "定位根因", poor: "修表象" },
      { dimension: "prevention", weight: 0.3, good: "有机制", poor: "无沉淀" },
    ],
    referencePoints: ["现象", "证据", "修复"],
  },
  {
    id: "rd_q4",
    roleId: "rd_general",
    trackId: "biz",
    prompt: "如果需求很急、技术方案还不完整，你会怎么推进并控制风险？",
    intent: "delivery_under_uncertainty",
    followUpHints: ["分期交付", "风险", "沟通"],
    rubrics: [
      { dimension: "risk", weight: 0.4, good: "风险可控", poor: "硬上" },
      { dimension: "communication", weight: 0.3, good: "对齐预期", poor: "单干" },
      { dimension: "engineering", weight: 0.3, good: "最小可用", poor: "空想" },
    ],
    referencePoints: ["MVP", "回滚"],
  },
];
