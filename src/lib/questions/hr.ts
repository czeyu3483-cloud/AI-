import type { Question } from "../types";

/** HR终面题库：适配性 / 动机 / 协作 / 抗压 / 职业规划；少硬核算法架构 */
export const HR_QUESTIONS: Question[] = [
  {
    id: "hr_q1",
    roleId: "rd_general",
    trackId: "hr_final",
    prompt:
      "先聊聊你为什么想做研发、为什么对我们这类岗位感兴趣？近期职业上最想证明的一件事是什么？",
    intent: "motivation_fit",
    followUpHints: ["动机真实性", "岗位理解", "近期目标"],
    rubrics: [
      { dimension: "motivation", weight: 0.4, good: "动机具体可验证", poor: "空话套话" },
      { dimension: "fit", weight: 0.3, good: "理解岗位日常", poor: "只谈薪资/名气" },
      { dimension: "self_awareness", weight: 0.3, good: "清楚自己短板", poor: "全是优点" },
    ],
    referencePoints: ["为什么研发", "为什么现在", "想证明什么"],
  },
  {
    id: "hr_q2",
    roleId: "rd_general",
    trackId: "hr_final",
    prompt:
      "讲一次和同学/同事协作不顺的经历：分歧在哪、你怎么处理的、最后结果怎样？",
    intent: "collaboration",
    followUpHints: ["沟通方式", "冲突处理", "复盘"],
    rubrics: [
      { dimension: "collaboration", weight: 0.4, good: "有具体动作与结果", poor: "怪别人" },
      { dimension: "communication", weight: 0.3, good: "对齐预期", poor: "回避冲突" },
      { dimension: "ownership", weight: 0.3, good: "承担自己部分", poor: "甩锅" },
    ],
    referencePoints: ["分歧", "动作", "结果"],
  },
  {
    id: "hr_q3",
    roleId: "rd_general",
    trackId: "hr_final",
    prompt:
      "压力大或节奏很紧的时候，你一般怎么调整？举一个最近的例子。",
    intent: "resilience",
    followUpHints: ["抗压策略", "求助边界", "可持续节奏"],
    rubrics: [
      { dimension: "resilience", weight: 0.4, good: "有可复用方法", poor: "只会硬扛" },
      { dimension: "self_management", weight: 0.3, good: "能拆优先级", poor: "一团乱" },
      { dimension: "support", weight: 0.3, good: "适时求助", poor: "独自硬撑到崩" },
    ],
    referencePoints: ["场景", "调整动作", "效果"],
  },
  {
    id: "hr_q4",
    roleId: "rd_general",
    trackId: "hr_final",
    prompt:
      "未来一到三年，你希望自己成长成什么样？如果入职，前三个月你打算怎么上手？",
    intent: "career_plan",
    followUpHints: ["成长路径", "上手计划", "价值观"],
    rubrics: [
      { dimension: "career", weight: 0.4, good: "目标可落地", poor: "空泛大词" },
      { dimension: "learning", weight: 0.3, good: "有学习节奏", poor: "等安排" },
      { dimension: "values", weight: 0.3, good: "与协作/诚信一致", poor: "只谈回报" },
    ],
    referencePoints: ["三年目标", "前三月", "学习方式"],
  },
];
