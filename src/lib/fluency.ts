/** Heuristic delivery / fluency signals from ASR transcripts. */

const FILLER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /嗯+/g, label: "嗯" },
  { re: /啊+/g, label: "啊" },
  { re: /呃+/g, label: "呃" },
  { re: /额+/g, label: "额" },
  { re: /然后(?!。)/g, label: "然后" },
  { re: /就是/g, label: "就是" },
  { re: /那个/g, label: "那个" },
  { re: /这个/g, label: "这个" },
  { re: /怎么说/g, label: "怎么说" },
  { re: /的话/g, label: "的话" },
];

export type DeliveryStats = {
  charCount: number;
  fillerCount: number;
  fillerRatio: number;
  topFillers: Array<{ word: string; count: number }>;
  fluencyScore: number;
  expressionScore: number;
  notes: string[];
};

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  return (text.match(copy) || []).length;
}

export function analyzeDelivery(answers: string[]): DeliveryStats {
  const text = answers.join("\n").replace(/\s+/g, "");
  const charCount = text.length;
  const fillerTally = new Map<string, number>();
  let fillerCount = 0;

  for (const { re, label } of FILLER_PATTERNS) {
    const n = countMatches(text, re);
    if (n > 0) {
      fillerTally.set(label, (fillerTally.get(label) || 0) + n);
      fillerCount += n;
    }
  }

  const fillerRatio = charCount > 0 ? fillerCount / Math.max(charCount / 4, 1) : 0;
  // fluency: fewer fillers + enough content
  let fluencyScore = 5;
  if (charCount < 20) fluencyScore = 2;
  else if (fillerRatio > 0.55) fluencyScore = 2;
  else if (fillerRatio > 0.35) fluencyScore = 3;
  else if (fillerRatio > 0.2) fluencyScore = 4;

  // expression: structure cues + length + not only fillers
  let expressionScore = 3;
  if (charCount >= 80) expressionScore += 1;
  if (/因为|所以|比如|例如|具体|结果|指标|我负责/.test(text)) expressionScore += 1;
  if (fillerRatio > 0.4) expressionScore -= 1;
  if (charCount < 30) expressionScore -= 1;
  expressionScore = Math.max(1, Math.min(5, expressionScore));

  const notes: string[] = [];
  const topFillers = [...fillerTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word, count]) => ({ word, count }));

  if (topFillers.length) {
    notes.push(
      `语气词偏多：${topFillers.map((f) => `「${f.word}」×${f.count}`).join("、")}。可先在心里起句再开口。`,
    );
  } else if (charCount >= 40) {
    notes.push("语气词控制得不错，表达比较干净。");
  }
  if (charCount < 40) {
    notes.push("回答偏短，完整度不够，建议用「结论→做法→结果」把话说满。");
  }
  if (!/我|自己|负责/.test(text) && charCount >= 40) {
    notes.push("少见第一人称落地，表达上可以更明确「我做了什么」。");
  }

  return {
    charCount,
    fillerCount,
    fillerRatio: Number(fillerRatio.toFixed(3)),
    topFillers,
    fluencyScore,
    expressionScore,
    notes,
  };
}

export function analyzeSessionDelivery(
  perQuestionAnswers: Array<{ questionId: string; answers: string[] }>,
): {
  overall: DeliveryStats;
  perQuestion: Array<{ questionId: string } & DeliveryStats>;
} {
  const perQuestion = perQuestionAnswers.map((q) => ({
    questionId: q.questionId,
    ...analyzeDelivery(q.answers),
  }));
  const overall = analyzeDelivery(perQuestionAnswers.flatMap((q) => q.answers));
  return { overall, perQuestion };
}
