/**
 * 跑题检测：LLM（DeepSeek）优先 + 关键词启发式兜底。
 * 跑题时不推进为完整作答，先纠偏拉回题目。
 */
import type { Question } from "./types";

export type TopicRelevanceResult = {
  offTopic: boolean;
  /** 题目焦点摘要，用于纠偏话术里的「XX」 */
  focus: string;
  source: "llm" | "heuristic";
  reason?: string;
};

const OFF_TOPIC_CORRECTIONS = [
  (focus: string) =>
    `我打断一下，我问的是${focus}，你能围绕这个再具体说说吗？`,
  (focus: string) =>
    `你这个回答好像有点偏了，我想了解的是${focus}，你能重新说一下吗？`,
  (focus: string) =>
    `不好意思打断一下，我们回到刚才那个问题，我问的是${focus}。`,
  (focus: string) =>
    `先停一下——我们回到题目：${focus}。你从这个点接着说。`,
  (focus: string) =>
    `这段有点跑远了。我真正想听的是${focus}，请直接回答这一点。`,
  (focus: string) =>
    `我们先把话题拉回来：关于${focus}，你怎么看？`,
];

export function pickOffTopicCorrection(focus: string, seed = 0): string {
  const i = Math.abs((seed * 17 + (Date.now() % 503)) | 0) % OFF_TOPIC_CORRECTIONS.length;
  const line = OFF_TOPIC_CORRECTIONS[i]!;
  return line(focus);
}

/** 从题干抽一句短焦点，供纠偏脚本填空 */
export function extractQuestionFocus(question?: Question | null): string {
  if (!question?.prompt) return "刚才那个问题";
  const p = question.prompt.replace(/\s+/g, "").trim();
  if (question.phase === "self_intro" || question.isSelfIntro) return "你的自我介绍";
  if (question.phase === "professional_knowledge" || question.subjectQuestionId) {
    return p.length > 36 ? `「${p.slice(0, 36)}……」` : `「${p}」`;
  }
  // 简历深挖：尽量保留项目名/公司名
  const m =
    p.match(/「([^」]{1,20})」/) ||
    p.match(/在([\u4e00-\u9fffA-Za-z0-9]{2,16})(?:公司|实习|担任)/) ||
    p.match(/项目[：:]?\s*([\u4e00-\u9fffA-Za-z0-9]{2,16})/);
  if (m?.[1]) return `和「${m[1]}」相关的经历`;
  if (/负责|模块|取舍|失败|协作/.test(p)) return "你在项目里的具体职责与做法";
  return p.length > 28 ? `「${p.slice(0, 28)}……」` : `「${p}」`;
}

const HOBBY_RE =
  /爱好|兴趣是|喜欢打游戏|追剧|旅游|看球|运动健身|唱歌|刷短视频|宅在家|闲暇时|课外爱好/;
const PROJECT_Q_RE =
  /项目|负责|模块|取舍|实习|公司|协作|失败|规模|接口|优化|排查|技术/;
const SUBJECT_Q_RE =
  /矩阵|秩|特征|概率|期望|方差|假设检验|导数|积分|洛必达|线性无关|正交/;
const INTRO_Q_RE = /自我介绍|介绍一下你自己|简单介绍/;

/**
 * 启发式：题干偏项目/专业，回答大段跑去兴趣爱好且缺少题干锚点 → 跑题
 */
export function heuristicTopicRelevance(
  answer: string,
  question?: Question | null,
): TopicRelevanceResult {
  const focus = extractQuestionFocus(question);
  const text = answer.trim();
  if (!text || text.length < 12 || !question) {
    return { offTopic: false, focus, source: "heuristic" };
  }

  // 自我介绍允许谈兴趣，不算跑题
  if (question.phase === "self_intro" || question.isSelfIntro || INTRO_Q_RE.test(question.prompt)) {
    return { offTopic: false, focus, source: "heuristic" };
  }

  const prompt = question.prompt;
  const isProjectish = PROJECT_Q_RE.test(prompt) || question.phase === "resume_deep_dive";
  const isSubject =
    SUBJECT_Q_RE.test(prompt) ||
    question.phase === "professional_knowledge" ||
    Boolean(question.subjectQuestionId);

  const hobbyHeavy = HOBBY_RE.test(text) && text.length >= 12;
  const hasProjectAnchor =
    /项目|负责|模块|接口|优化|实习|公司|我做了|实现|排查|上线|指标|协作|取舍/.test(text);
  const hasSubjectAnchor =
    /因为|所以|等于|定义|公式|行列式|概率|期望|方差|导数|连续|假设|原假设|样本/.test(text);

  if (isProjectish && hobbyHeavy && !hasProjectAnchor) {
    return {
      offTopic: true,
      focus,
      source: "heuristic",
      reason: "题干问项目经历，回答偏兴趣爱好",
    };
  }
  // 问项目却完全不沾经历词，且内容像闲聊
  if (
    isProjectish &&
    text.length >= 16 &&
    !hasProjectAnchor &&
    /爱好|兴趣|游戏|旅游|看球|追剧|闲着|没事/.test(text)
  ) {
    return {
      offTopic: true,
      focus,
      source: "heuristic",
      reason: "题干问经历，回答偏个人兴趣",
    };
  }
  if (isSubject && hobbyHeavy && !hasSubjectAnchor) {
    return {
      offTopic: true,
      focus,
      source: "heuristic",
      reason: "题干问专业概念，回答未触及知识点",
    };
  }
  if (isSubject && text.length >= 40 && !hasSubjectAnchor && /我觉得|我感觉|随便|不知道/.test(text)) {
    // 空泛不等于跑题；交给 vague 路径
    return { offTopic: false, focus, source: "heuristic" };
  }
  // 问项目却大谈无关政策/八卦且无项目词
  if (
    isProjectish &&
    text.length >= 50 &&
    !hasProjectAnchor &&
    /薪资|加班|八卦|录用|天气|今天吃|回家/.test(text)
  ) {
    return {
      offTopic: true,
      focus,
      source: "heuristic",
      reason: "题干问经历，回答完全离题",
    };
  }

  return { offTopic: false, focus, source: "heuristic" };
}
