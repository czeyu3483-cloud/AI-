/**
 * 专业/学科题库：Q3 从中随机抽取。
 * 面试过程中不判对错；仅在最终反馈对照标准答案与评判标准打分。
 */

export type SubjectCategory =
  | "高等代数"
  | "线性代数"
  | "概率论"
  | "数理统计"
  | "微积分";

export type SubjectQuestion = {
  id: string;
  category: SubjectCategory;
  prompt: string;
  /** 标准答案要点（反馈用，面试中不宣读） */
  standardAnswer: string;
  /** 评判标准（反馈用） */
  gradingCriteria: string;
};

export const SUBJECT_QUESTIONS: SubjectQuestion[] = [
  // —— 高等代数 ——
  {
    id: "subj_ha_1",
    category: "高等代数",
    prompt: "请简述矩阵可逆的等价条件，至少说出三条。",
    standardAnswer:
      "常见等价条件包括：行列式非零；满秩（秩等于阶数）；存在逆矩阵；齐次方程只有零解；列（行）向量线性无关；可表为初等矩阵乘积等。",
    gradingCriteria:
      "至少准确说出 3 条互不等价表述的条件；仅背一条或混淆奇异/可逆扣分。",
  },
  {
    id: "subj_ha_2",
    category: "高等代数",
    prompt: "什么是线性无关？如何用行列式或秩判断一组向量是否线性无关？",
    standardAnswer:
      "一组向量线性无关是指只有全零系数的线性组合才等于零向量。对 n 个 n 维列向量，组成方阵后行列式非零则无关；更一般地，向量组的秩等于向量个数则无关。",
    gradingCriteria:
      "能说清定义，并能用行列式或秩给出可操作判据；只说「不能互相表示」但无法检验则偏弱。",
  },
  {
    id: "subj_ha_3",
    category: "高等代数",
    prompt: "特征值与特征向量的定义是什么？特征多项式怎么来的？",
    standardAnswer:
      "若存在非零向量 x 使 Ax=λx，则 λ 为特征值、x 为对应特征向量。特征多项式为 det(A−λI)=0；根为特征值。",
    gradingCriteria:
      "定义正确且提到特征方程/特征多项式；混淆左右特征或漏「非零」扣分。",
  },
  // —— 线性代数 ——
  {
    id: "subj_la_1",
    category: "线性代数",
    prompt: "解释一下矩阵的秩，以及它和线性方程组解的关系。",
    standardAnswer:
      "秩是行（列）空间维数，也等于非零子式的最高阶。对 Ax=b：系数矩阵与增广矩阵秩相等则有解；秩等于未知数个数则唯一解，小于则无穷多解。",
    gradingCriteria:
      "秩的含义正确，并能说清有解/唯一/无穷与秩的关系；只会背公式无解释则中等。",
  },
  {
    id: "subj_la_2",
    category: "线性代数",
    prompt: "正交矩阵有什么性质？为什么说它保持长度和内积？",
    standardAnswer:
      "正交矩阵满足 A^T A = I（列/行向量标准正交）。对任意向量，||Ax||=||x||，且 (Ax)·(Ay)=x·y，因此保持长度与内积（正交变换）。",
    gradingCriteria:
      "写出 A^T A=I 并解释保范/保内积；只说「旋转」但推不出性质则偏弱。",
  },
  {
    id: "subj_la_3",
    category: "线性代数",
    prompt: "简述高斯消元法在解线性方程组时在做什么，主元为零时怎么办？",
    standardAnswer:
      "通过初等行变换把增广矩阵化为阶梯形/行最简形，再回代求未知数。主元为零时需行交换选主元；若整列为零则该未知数为自由变量或判无解。",
    gradingCriteria:
      "说清行变换目标与回代；能提到换主元/自由元；完全不会处理奇异情况扣分。",
  },
  // —— 概率论 ——
  {
    id: "subj_pr_1",
    category: "概率论",
    prompt: "条件概率的定义是什么？全概率公式怎么用？",
    standardAnswer:
      "P(A|B)=P(A∩B)/P(B)（P(B)>0）。若 {B_i} 构成样本空间划分，则 P(A)=Σ P(A|B_i)P(B_i)。",
    gradingCriteria:
      "定义正确且能写出全概率；只会口头说「在已知下」但无公式则弱。",
  },
  {
    id: "subj_pr_2",
    category: "概率论",
    prompt: "独立与互斥有什么区别？举一个例子说明二者不能混用。",
    standardAnswer:
      "互斥：不能同时发生，P(A∩B)=0。独立：互不影响，P(A∩B)=P(A)P(B)。两正面事件互斥则一般不独立（除非概率为 0）；掷两次硬币正面独立但不互斥。",
    gradingCriteria:
      "能区分并举对例子；把独立说成「没有交集」则判错。",
  },
  {
    id: "subj_pr_3",
    category: "概率论",
    prompt: "期望的线性性是什么？方差有线性性吗？",
    standardAnswer:
      "E(aX+bY)=aE(X)+bE(Y) 恒成立（无需独立）。Var(aX+bY)=a²Var(X)+b²Var(Y)+2abCov(X,Y)；独立或不相关时协方差为 0 才可简单相加，方差无无条件线性性。",
    gradingCriteria:
      "期望线性说对；指出方差一般不线性并提到协方差/独立条件。",
  },
  // —— 数理统计 ——
  {
    id: "subj_st_1",
    category: "数理统计",
    prompt: "点估计里，无偏性和一致性分别是什么意思？",
    standardAnswer:
      "无偏：估计量的期望等于真参数。一致性：样本量→∞ 时估计量依概率收敛到真参数。无偏不一定一致，一致也不要求每有限 n 无偏。",
    gradingCriteria:
      "两个概念都说清；混淆「方差小」与无偏则扣分。",
  },
  {
    id: "subj_st_2",
    category: "数理统计",
    prompt: "假设检验里，第一类错误和第二类错误分别指什么？",
    standardAnswer:
      "第一类错误（α）：原假设为真却拒绝它（弃真）。第二类错误（β）：原假设为假却未拒绝（取伪）。显著性水平常控制 α；功效为 1−β。",
    gradingCriteria:
      "两类错误定义正确；说反或只背 α/β 符号无含义则弱。",
  },
  {
    id: "subj_st_3",
    category: "数理统计",
    prompt: "样本均值的抽样分布，在总体方差已知时常用什么区间估计？依据是什么？",
    standardAnswer:
      "正态总体或大样本下，x̄ ± z_{α/2} σ/√n（σ 已知用 z）。依据中心极限定理或正态抽样；σ 未知则改用 t 分布与 s。",
    gradingCriteria:
      "写出或说清 z 区间形式与 √n；能区分 σ 已知/未知；完全不会构造区间则弱。",
  },
  // —— 微积分 ——
  {
    id: "subj_cal_1",
    category: "微积分",
    prompt: "导数的几何意义和物理意义分别是什么？可导一定连续吗？反过来呢？",
    standardAnswer:
      "几何上是切线斜率；物理上常表示瞬时变化率（如速度）。可导⇒连续；连续不一定可导（如 |x| 在 0 点）。",
    gradingCriteria:
      "两意义正确，且单向关系说对；说成「连续⇒可导」则判错。",
  },
  {
    id: "subj_cal_2",
    category: "微积分",
    prompt: "牛顿-莱布尼茨公式在说什么？用它求定积分需要什么条件？",
    standardAnswer:
      "若 F'=f 在 [a,b] 上成立（F 为 f 的一个原函数），则 ∫_a^b f(x)dx = F(b)−F(a)。要求 f 可积且存在原函数（常见为连续）。",
    gradingCriteria:
      "公式写对并提到原函数/连续性条件；只会算不会陈述则中等。",
  },
  {
    id: "subj_cal_3",
    category: "微积分",
    prompt: "洛必达法则适用于哪类极限？使用前要注意什么？",
    standardAnswer:
      "适用于 0/0 或 ∞/∞ 型未定式。需分子分母在去心邻域可导、分母导数≠0，且导数比值极限存在（或为∞）时原极限等于该极限；不是未定式时不能硬套。",
    gradingCriteria:
      "点名未定式类型与条件；滥用在非未定式上要能指出错误。",
  },
];

const CATEGORIES: SubjectCategory[] = [
  "高等代数",
  "线性代数",
  "概率论",
  "数理统计",
  "微积分",
];

/** 根据专业关键词偏好学科；无命中则全体随机 */
export function preferCategoriesFromResume(blob: string): SubjectCategory[] {
  const text = blob.toLowerCase();
  const hits: SubjectCategory[] = [];
  if (/高等代数|近世代数|抽象代数/.test(text)) hits.push("高等代数");
  if (/线性代数|矩阵论|linear algebra/.test(text)) hits.push("线性代数");
  if (/概率论|随机过程|probability/.test(text)) hits.push("概率论");
  if (/数理统计|统计学|假设检验|regression/.test(text)) hits.push("数理统计");
  if (/微积分|数学分析|calculus|高等数学/.test(text)) hits.push("微积分");
  if (/数学|应用数学|统计学|数据/.test(text) && hits.length === 0) {
    return [...CATEGORIES];
  }
  return hits.length ? hits : [...CATEGORIES];
}

export function pickSubjectQuestion(seed = Date.now(), resumeBlob = ""): SubjectQuestion {
  const preferred = preferCategoriesFromResume(resumeBlob);
  const pool = SUBJECT_QUESTIONS.filter((q) => preferred.includes(q.category));
  const use = pool.length ? pool : SUBJECT_QUESTIONS;
  return use[Math.abs(seed) % use.length]!;
}

/** 启发式对照标准答案要点打分 1–5（反馈用，非面试当场） */
export function scoreSubjectAnswer(
  answer: string,
  item: Pick<SubjectQuestion, "standardAnswer" | "gradingCriteria" | "prompt">,
): { score: number; evidence: string } {
  const text = answer.trim();
  if (!text || text.length < 8) {
    return { score: 1, evidence: "几乎未作答，对照标准答案缺口大" };
  }
  const keys = item.standardAnswer
    .split(/[；;。，,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 24);
  const hit = keys.filter((k) => text.includes(k.slice(0, Math.min(6, k.length)))).length;
  const ratio = keys.length ? hit / Math.min(keys.length, 6) : 0;
  let score = 2;
  if (ratio >= 0.5 && text.length >= 40) score = 4;
  else if (ratio >= 0.3 || text.length >= 80) score = 3;
  else if (text.length >= 30) score = 2;
  else score = 1;
  if (/不会|不知道|没学过|不清楚/.test(text) && text.length < 40) score = Math.min(score, 2);
  return {
    score,
    evidence: `对照标准答案要点命中约 ${hit} 处；评判：${item.gradingCriteria.slice(0, 60)}`,
  };
}

export function getSubjectQuestionById(id: string): SubjectQuestion | undefined {
  return SUBJECT_QUESTIONS.find((q) => q.id === id);
}
