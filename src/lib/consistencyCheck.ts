/**
 * 全场一致性核查：每答对照简历全文字段 + 自我介绍 + 历史作答。
 * LLM 优先（由 deepseek.analyzeResumeConsistency 调用）；本模块为启发式兜底与话术。
 */
import { FACT_FIELD_SEVERITY } from "./types";
import type {
  FactField,
  FactSeverity,
  InconsistencyRecord,
  InconsistencySource,
  Question,
  ResumeConflictLevel,
  ResumeConsistencyAnalysis,
  ResumeProfile,
} from "./types";

export type ExtractedFacts = Partial<Record<FactField, string[]>>;

const CHALLENGE_SINGLE = [
  (issue: string) => `等一下，我发现一个问题：${issue}。这是怎么回事？`,
  (issue: string) => `我打断一下，${issue}。你能解释一下吗？`,
  (issue: string) => `稍等，这里我需要澄清一下：${issue}。哪个是对的？`,
  (issue: string) => `我注意到一个矛盾的地方：${issue}。你能说明一下吗？`,
];

function pickChallengeLine(issue: string, seed = 0): string {
  const i = Math.abs(seed) % CHALLENGE_SINGLE.length;
  return CHALLENGE_SINGLE[i]!(issue);
}

function normalizeEntity(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/(有限公司|股份有限公司|公司|集团|科技|网络|大学|学院|学校)$/g, "")
    .toLowerCase();
}

function entitiesOverlap(a: string, b: string): boolean {
  const na = normalizeEntity(a);
  const nb = normalizeEntity(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || out.some((x) => entitiesOverlap(x, t))) continue;
    out.push(t);
  }
  return out;
}

function pushFact(facts: ExtractedFacts, field: FactField, value?: string | null) {
  if (!value) return;
  const v = value.trim();
  if (v.length < 1) return;
  facts[field] = uniq([...(facts[field] || []), v]);
}

/** 从口述/介绍文本抽取关键事实（启发式） */
export function extractFactsFromText(text: string): ExtractedFacts {
  const facts: ExtractedFacts = {};
  const t = text.trim();
  if (!t) return facts;

  const nameClaim =
    t.match(/(?:我(?:叫|是)|本人(?:叫|是)|候选人(?:叫|是))([\u4e00-\u9fff]{2,4})(?:[，,。.\s]|$)/) ||
    t.match(/^([\u4e00-\u9fff]{2,4})(?:[，,。.\s]|同学)/);
  if (nameClaim?.[1] && !/你好|大家|今天|面试|负责|参与|同学|老师/.test(nameClaim[1])) {
    pushFact(facts, "姓名", nameClaim[1]);
  }

  const school =
    t.match(/(?:毕业于|就读于|来自|在)([\u4e00-\u9fffA-Za-z0-9]{2,20}?(?:大学|学院|学校))/) ||
    t.match(/([\u4e00-\u9fff]{2,12}(?:大学|学院))/);
  if (school?.[1]) pushFact(facts, "学校", school[1]);

  const major = t.match(
    /(?:专业(?:是|为)?|就读)([\u4e00-\u9fffA-Za-z]{2,16}?)(?:专业|方向)?(?:[，,。.\s]|$)/,
  );
  if (major?.[1] && !/相关|那个/.test(major[1])) pushFact(facts, "专业", major[1]);

  const org =
    t.match(
      /(?:在|于|就职于|实习于|供职于)([\u4e00-\u9fffA-Za-z0-9]{2,16}?)(?:公司|集团|科技|网络)?(?:实习|工作|就职|任职)/,
    ) || t.match(/([\u4e00-\u9fffA-Za-z0-9]{2,12}(?:公司|集团|科技))(?:实习|工作)/);
  if (org?.[1]) pushFact(facts, "公司", org[1].replace(/(公司|集团|科技|网络)$/g, "") || org[1]);

  const title = t.match(
    /(?:担任|职位是|岗位是|做|当)([\u4e00-\u9fffA-Za-z]{2,12}?)(?:实习|工程师|开发|岗|生)/,
  );
  if (title?.[1]) {
    const full = title[0].replace(/^(担任|职位是|岗位是|做|当)/, "");
    pushFact(facts, "职位", full.slice(0, 16));
  }

  const periods = t.match(
    /\d{4}\s*[./年-]\s*\d{1,2}(?:\s*[-–—至到]\s*\d{4}\s*[./年-]?\s*\d{0,2})?/g,
  );
  if (periods) {
    for (const p of periods.slice(0, 3)) pushFact(facts, "时间", p.replace(/\s+/g, ""));
  }

  const project =
    t.match(/(?:项目|做过|负责过)[「『《“"]([\u4e00-\u9fffA-Za-z0-9·\-_]{2,24})[」』》”"]/) ||
    t.match(/([\u4e00-\u9fffA-Za-z0-9·\-_]{2,16}(?:平台|系统|中台|项目))/);
  if (project?.[1] && !/相关|那个|这个/.test(project[1])) {
    pushFact(facts, "项目名称", project[1]);
  }

  if (/主导|独立负责|负责人|核心开发|owner/i.test(t)) {
    pushFact(facts, "项目角色", "主导/负责人");
  } else if (/参与|协助|帮忙|跟做/.test(t) && /项目|模块/.test(t)) {
    pushFact(facts, "项目角色", "参与/协助");
  }

  const gpa = t.match(/(?:GPA|绩点|均分)[为是:：\s]*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/i);
  if (gpa?.[1]) pushFact(facts, "GPA", gpa[1].replace(/\s+/g, ""));

  const award = t.match(
    /(?:获得|拿过|获)([\u4e00-\u9fffA-Za-z0-9]{2,20}?(?:奖|奖学金|竞赛|名|等奖))/,
  );
  if (award?.[1]) pushFact(facts, "奖项", award[1]);

  const ranks = t.match(
    /(\d+(?:\.\d+)?)\s*(%|％|ms|毫秒|秒|倍|名|QPS|qps)|第\s*(\d+)\s*名|排名\s*(\d+)/gi,
  );
  if (ranks) {
    for (const r of ranks.slice(0, 4)) pushFact(facts, "数字/排名", r.replace(/\s+/g, ""));
  }

  const skillHints = [
    "React",
    "Vue",
    "Angular",
    "Next.js",
    "TypeScript",
    "JavaScript",
    "Python",
    "Java",
    "Go",
    "Node.js",
    "PostgreSQL",
    "MySQL",
    "Redis",
    "Docker",
    "Kubernetes",
  ];
  for (const s of skillHints) {
    if (new RegExp(s.replace(".", "\\."), "i").test(t)) pushFact(facts, "技能", s);
  }

  return facts;
}

/** 从结构化简历抽取对照事实 */
export function extractFactsFromResume(resume?: ResumeProfile): ExtractedFacts {
  const facts: ExtractedFacts = {};
  if (!resume) return facts;
  if (resume.name) pushFact(facts, "姓名", resume.name);
  for (const e of resume.education || []) {
    pushFact(facts, "学校", e.school);
    pushFact(facts, "专业", e.major);
  }
  for (const exp of resume.experiences || []) {
    pushFact(facts, "公司", exp.org);
    pushFact(facts, "职位", exp.title);
    pushFact(facts, "时间", exp.period);
  }
  for (const p of resume.projects || []) {
    pushFact(facts, "项目名称", p.name);
    pushFact(facts, "项目角色", p.role);
    for (const s of p.stack || []) pushFact(facts, "技能", s);
  }
  for (const s of resume.skills || []) pushFact(facts, "技能", s);

  const raw = resume.rawText || "";
  const gpa = raw.match(/(?:GPA|绩点|均分)[为是:：\s]*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/i);
  if (gpa?.[1]) pushFact(facts, "GPA", gpa[1].replace(/\s+/g, ""));
  const awardHits = raw.match(
    /[\u4e00-\u9fffA-Za-z0-9]{2,20}?(?:奖学金|一等奖|二等奖|三等奖|竞赛奖)/g,
  );
  if (awardHits) {
    for (const a of awardHits.slice(0, 4)) pushFact(facts, "奖项", a);
  }
  // 再用 raw 补抽姓名/学校等（结构化可能不全）
  const fromRaw = extractFactsFromText(raw.slice(0, 800));
  for (const field of Object.keys(fromRaw) as FactField[]) {
    for (const v of fromRaw[field] || []) pushFact(facts, field, v);
  }
  return facts;
}

function sourceLabel(s: InconsistencySource): string {
  switch (s) {
    case "resume":
      return "简历";
    case "self_intro":
      return "自我介绍";
    case "previous_answer":
      return "前面回答";
    case "current_answer":
      return "你刚才";
    default:
      return "口述";
  }
}

function makeIssue(
  field: FactField,
  sideA: string,
  sideB: string,
  sourceA: InconsistencySource,
  sourceB: InconsistencySource,
): string {
  return `${sourceLabel(sourceA)}写${sideA}，${sourceLabel(sourceB)}说${sideB}`;
}

function conflictOnField(
  field: FactField,
  valuesA: string[],
  valuesB: string[],
  sourceA: InconsistencySource,
  sourceB: InconsistencySource,
): Omit<InconsistencyRecord, "id" | "detectedAt" | "utterance"> | null {
  if (!valuesA.length || !valuesB.length) return null;
  // 技能：族内互斥才算冲突（简化：同条明确对立才记）
  if (field === "技能") {
    const families = [
      ["react", "vue", "angular"],
      ["postgresql", "mysql", "mongodb"],
    ];
    for (const fam of families) {
      const aHit = valuesA.filter((v) => fam.some((f) => normalizeEntity(v).includes(f)));
      const bHit = valuesB.filter((v) => fam.some((f) => normalizeEntity(v).includes(f)));
      if (aHit.length && bHit.length) {
        const mismatch = bHit.filter(
          (b) => !aHit.some((a) => entitiesOverlap(a, b) || normalizeEntity(a) === normalizeEntity(b)),
        );
        if (mismatch.length) {
          return {
            field,
            severity: FACT_FIELD_SEVERITY[field],
            issue: makeIssue(field, aHit[0]!, mismatch[0]!, sourceA, sourceB),
            sideA: aHit[0]!,
            sideB: mismatch[0]!,
            sourceA,
            sourceB,
          };
        }
      }
    }
    return null;
  }

  // 项目角色：主导 vs 参与
  if (field === "项目角色") {
    const aLead = valuesA.some((v) => /主导|负责|核心|owner/i.test(v));
    const aSoft = valuesA.some((v) => /参与|协助|帮忙/.test(v));
    const bLead = valuesB.some((v) => /主导|负责|核心|owner/i.test(v));
    const bSoft = valuesB.some((v) => /参与|协助|帮忙/.test(v));
    if ((aSoft && !aLead && bLead) || (aLead && bSoft && !bLead)) {
      return {
        field,
        severity: FACT_FIELD_SEVERITY[field],
        issue: makeIssue(field, valuesA[0]!, valuesB[0]!, sourceA, sourceB),
        sideA: valuesA[0]!,
        sideB: valuesB[0]!,
        sourceA,
        sourceB,
      };
    }
    return null;
  }

  // 一般字段：B 中有值且与 A 全部对不上
  const unmatched = valuesB.filter((b) => !valuesA.some((a) => entitiesOverlap(a, b)));
  if (!unmatched.length) return null;

  // 姓名/学校/公司/GPA：只要口述给出了不同实体就冲突
  const hard: FactField[] = ["姓名", "学校", "公司", "GPA", "职位", "时间", "数字/排名"];
  if (!hard.includes(field) && field !== "专业" && field !== "项目名称" && field !== "奖项") {
    return null;
  }

  // 时间：年份差 ≥1 才记
  if (field === "时间") {
    const yearA = valuesA.map((v) => v.match(/\d{4}/)?.[0]).filter(Boolean);
    const yearB = unmatched.map((v) => v.match(/\d{4}/)?.[0]).filter(Boolean);
    if (
      yearA.length &&
      yearB.length &&
      yearA.some((ya) => yearB.some((yb) => ya && yb && Math.abs(Number(ya) - Number(yb)) >= 1))
    ) {
      return {
        field,
        severity: FACT_FIELD_SEVERITY[field],
        issue: makeIssue(field, valuesA[0]!, unmatched[0]!, sourceA, sourceB),
        sideA: valuesA[0]!,
        sideB: unmatched[0]!,
        sourceA,
        sourceB,
      };
    }
    return null;
  }

  // GPA / 数字：数值差大
  if (field === "GPA" || field === "数字/排名") {
    const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ""));
    for (const a of valuesA) {
      for (const b of unmatched) {
        const na = num(a);
        const nb = num(b);
        if (Number.isFinite(na) && Number.isFinite(nb) && na > 0) {
          if (Math.abs(na - nb) / na >= 0.15 || Math.abs(na - nb) >= 0.3) {
            return {
              field,
              severity: FACT_FIELD_SEVERITY[field],
              issue: makeIssue(field, a, b, sourceA, sourceB),
              sideA: a,
              sideB: b,
              sourceA,
              sourceB,
            };
          }
        }
      }
    }
    // GPA 字符串明显不同也记
    if (field === "GPA" && unmatched.length) {
      return {
        field,
        severity: FACT_FIELD_SEVERITY[field],
        issue: makeIssue(field, valuesA[0]!, unmatched[0]!, sourceA, sourceB),
        sideA: valuesA[0]!,
        sideB: unmatched[0]!,
        sourceA,
        sourceB,
      };
    }
    return null;
  }

  return {
    field,
    severity: FACT_FIELD_SEVERITY[field],
    issue: makeIssue(field, valuesA[0]!, unmatched[0]!, sourceA, sourceB),
    sideA: valuesA[0]!,
    sideB: unmatched[0]!,
    sourceA,
    sourceB,
  };
}

function compareFactMaps(
  mapA: ExtractedFacts,
  mapB: ExtractedFacts,
  sourceA: InconsistencySource,
  sourceB: InconsistencySource,
): Array<Omit<InconsistencyRecord, "id" | "detectedAt" | "utterance">> {
  const out: Array<Omit<InconsistencyRecord, "id" | "detectedAt" | "utterance">> = [];
  const fields = Object.keys(FACT_FIELD_SEVERITY) as FactField[];
  for (const field of fields) {
    const hit = conflictOnField(
      field,
      mapA[field] || [],
      mapB[field] || [],
      sourceA,
      sourceB,
    );
    if (hit) out.push(hit);
  }
  return out;
}

export function craftConsistencyChallenge(
  issues: Array<Pick<InconsistencyRecord, "issue" | "sideA" | "sideB" | "field">>,
  seed = Date.now(),
): string {
  if (!issues.length) {
    return pickChallengeLine("这里口径不太一致", seed);
  }
  if (issues.length === 1) {
    return pickChallengeLine(issues[0]!.issue, seed + issues[0]!.issue.length);
  }
  const lines = issues
    .slice(0, 4)
    .map((it, i) => `${i + 1}. ${it.issue}`)
    .join("；");
  return `等一下，我发现了几个问题需要澄清：${lines}`;
}

export function severityToConflictLevel(severity: FactSeverity): ResumeConflictLevel {
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  return 4;
}

export type ConsistencyCheckInput = {
  answer: string;
  resume?: ResumeProfile;
  selfIntroText?: string;
  /** 本题之前各题作答（按时间） */
  previousAnswers?: string[];
  question?: Question;
  questionId?: string;
};

export type ConsistencyCheckResult = {
  conflicts: InconsistencyRecord[];
  analysis: ResumeConsistencyAnalysis;
};

function newId(): string {
  return `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 每答全量一致性核查：当前答 vs 简历 / 自我介绍 / 历史答。
 */
export function runConsistencyCheck(input: ConsistencyCheckInput): ConsistencyCheckResult {
  const answer = (input.answer || "").trim();
  if (answer.length < 6 || input.question?.isCoding) {
    return {
      conflicts: [],
      analysis: { conflict: false, severity: "none", source: "heuristic" },
    };
  }
  if (/乱写|瞎写|编的|编造|杜撰|假的|造假|注水|挂名/.test(answer)) {
    return {
      conflicts: [],
      analysis: { conflict: false, severity: "none", source: "heuristic" },
    };
  }

  const current = extractFactsFromText(answer);
  const resumeFacts = extractFactsFromResume(input.resume);
  const introFacts = extractFactsFromText(input.selfIntroText || "");
  const prevJoined = (input.previousAnswers || []).join("\n");
  const prevFacts = extractFactsFromText(prevJoined);

  const rawHits = [
    ...compareFactMaps(resumeFacts, current, "resume", "current_answer"),
    ...compareFactMaps(introFacts, current, "self_intro", "current_answer"),
    ...compareFactMaps(prevFacts, current, "previous_answer", "current_answer"),
  ];

  // 自我介绍阶段：也要把介绍整体 vs 简历核一遍（姓名等）
  if (input.question?.isSelfIntro || input.question?.phase === "self_intro") {
    const introBlob = extractFactsFromText(
      [(input.selfIntroText || "").trim(), answer].filter(Boolean).join(" "),
    );
    rawHits.push(...compareFactMaps(resumeFacts, introBlob, "resume", "self_intro"));
  }

  // 去重（同 field+sideB）
  const seen = new Set<string>();
  const conflicts: InconsistencyRecord[] = [];
  for (const h of rawHits) {
    const key = `${h.field}|${normalizeEntity(h.sideA)}|${normalizeEntity(h.sideB)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({
      ...h,
      id: newId(),
      detectedAt: new Date().toISOString(),
      questionId: input.questionId || input.question?.id,
    });
  }

  // 低严重度技能冲突默认不打断（仍可记入列表由调用方决定）；高/中打断
  const actionable = conflicts.filter((c) => c.severity !== "low");
  if (!actionable.length) {
    return {
      conflicts,
      analysis: { conflict: false, severity: "none", source: "heuristic" },
    };
  }

  const top = [...actionable].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  })[0]!;
  const utterance = craftConsistencyChallenge(actionable, answer.length + actionable.length);
  for (const c of conflicts) c.utterance = utterance;

  return {
    conflicts,
    analysis: {
      conflict: true,
      severity: "challenge",
      level: severityToConflictLevel(top.severity),
      kind: top.field === "技能" ? "stack_mismatch" : "direct_contradiction",
      resumeSide: top.sideA,
      answerSide: top.sideB,
      utterance,
      resumeExcerpt: (input.resume?.rawText || "").slice(0, 160),
      source: "heuristic",
    },
  };
}

/** 合并新冲突到 session.inconsistencies（按 field+sides 去重） */
export function appendInconsistencies(
  existing: InconsistencyRecord[] | undefined,
  next: InconsistencyRecord[],
): InconsistencyRecord[] {
  const list = [...(existing || [])];
  for (const n of next) {
    const dup = list.some(
      (e) =>
        e.field === n.field &&
        entitiesOverlap(e.sideA, n.sideA) &&
        entitiesOverlap(e.sideB, n.sideB),
    );
    if (!dup) list.push(n);
  }
  return list;
}

export function inconsistenciesBySeverity(list: InconsistencyRecord[] | undefined): {
  high: InconsistencyRecord[];
  medium: InconsistencyRecord[];
  low: InconsistencyRecord[];
} {
  const high: InconsistencyRecord[] = [];
  const medium: InconsistencyRecord[] = [];
  const low: InconsistencyRecord[] = [];
  for (const item of list || []) {
    if (item.severity === "high") high.push(item);
    else if (item.severity === "medium") medium.push(item);
    else low.push(item);
  }
  return { high, medium, low };
}
