import type {
  ConflictExplainOutcome,
  Question,
  ResumeConflictKind,
  ResumeConflictLevel,
  ResumeConflictRecord,
  ResumeConsistencyAnalysis,
  ResumeProfile,
} from "./types";

export type ResumeConflictHit = {
  kind: ResumeConflictKind;
  level: ResumeConflictLevel;
  resumeSide: string;
  answerSide: string;
  resumeExcerpt?: string;
};

/** 互斥技术族：简历写了族内 A、口述强调族内 B → 冲突 */
const STACK_FAMILIES: string[][] = [
  ["react", "vue", "angular", "svelte"],
  ["next.js", "nextjs", "nuxt", "django", "flask", "spring boot", "spring"],
  ["postgresql", "postgres", "mysql", "mongodb", "mongo", "sqlite", "tidb"],
  ["redis", "memcached"],
  ["typescript", "javascript", "python", "java", "golang", "go", "rust", "c++"],
  ["node.js", "nodejs", "node", "deno", "bun"],
  ["kubernetes", "k8s", "docker swarm"],
];

const LEVEL_LABEL: Record<ResumeConflictLevel, string> = {
  1: "直接矛盾",
  2: "角色漂移",
  3: "贡献注水",
  4: "细节模糊",
  5: "技术栈不符",
};

export function conflictLevelLabel(level: ResumeConflictLevel): string {
  return LEVEL_LABEL[level];
}

/** 旧 kind → 规范 level */
export function levelForKind(kind: ResumeConflictKind): ResumeConflictLevel {
  switch (kind) {
    case "direct_contradiction":
    case "metric":
      return 1;
    case "role_drift":
    case "role":
    case "timeline":
      return 2;
    case "contribution_inflation":
    case "ownership":
    case "project_claim":
      return 3;
    case "fuzzy_detail":
      return 4;
    case "stack_mismatch":
    case "stack":
      return 5;
    default:
      return 3;
  }
}

function normalizeTech(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/\.js$/i, "js");
}

function resumeTechList(resume: ResumeProfile): string[] {
  const raw = [
    ...(resume.skills || []),
    ...(resume.projects || []).flatMap((p) => p.stack || []),
    resume.rawText || "",
  ]
    .join(" ")
    .toLowerCase();
  const found: string[] = [];
  for (const family of STACK_FAMILIES) {
    for (const tech of family) {
      const n = normalizeTech(tech);
      if (raw.includes(n) || raw.includes(tech.toLowerCase())) {
        found.push(tech);
      }
    }
  }
  return Array.from(new Set(found));
}

function answerTechMentions(answer: string): string[] {
  const lower = answer.toLowerCase();
  const found: string[] = [];
  for (const family of STACK_FAMILIES) {
    for (const tech of family) {
      const re = new RegExp(
        tech.replace(/\./g, "\\.").replace(/\+/g, "\\+"),
        "i",
      );
      if (re.test(lower) || lower.includes(normalizeTech(tech))) {
        found.push(tech);
      }
    }
  }
  return Array.from(new Set(found));
}

function extractPercentsAndMs(text: string): string[] {
  const out: string[] = [];
  const re =
    /(\d+(?:\.\d+)?)\s*(%|％|ms|毫秒|秒|s\b|QPS|qps|倍)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(`${m[1]}${m[2]}`.replace(/\s+/g, ""));
  }
  return out;
}

function projectNames(resume: ResumeProfile): string[] {
  return (resume.projects || []).map((p) => p.name.trim()).filter(Boolean);
}

function nameMentioned(hay: string, name: string): boolean {
  if (!name || name.length < 2) return false;
  return hay.includes(name) || hay.includes(name.replace(/\s+/g, ""));
}

function excerptAround(blob: string, needle: string, radius = 60): string {
  if (!blob || !needle) return (blob || "").slice(0, 120);
  const idx = blob.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return blob.slice(0, 120);
  const start = Math.max(0, idx - radius);
  const end = Math.min(blob.length, idx + needle.length + radius);
  return `${start > 0 ? "…" : ""}${blob.slice(start, end)}${end < blob.length ? "…" : ""}`;
}

/**
 * 轻量启发式：口述 vs 简历冲突，并给出 1–5 等级。
 * 明确承认造假/挂名不在此处理（走诚信结束）。
 */
export function detectResumeConflict(
  answer: string,
  resume?: ResumeProfile,
  question?: Question,
): ResumeConflictHit | null {
  if (!resume) return null;
  const text = answer.trim();
  if (text.length < 8) return null;

  if (
    /乱写|瞎写|编的|编造|杜撰|假的|造假|注水|假经历|挂名|其实不是我做的|项目其实不是我做的/.test(
      text,
    )
  ) {
    return null;
  }

  const names = projectNames(resume);
  const resumeBlob = [
    resume.rawText || "",
    resume.summary || "",
    ...(resume.projects || []).flatMap((p) => [
      p.name,
      p.role || "",
      ...(p.stack || []),
      ...(p.highlights || []),
    ]),
    ...(resume.experiences || []).flatMap((e) => [
      e.org || "",
      e.title || "",
      ...(e.highlights || []),
    ]),
  ].join("\n");
  const raw = resume.rawText || resumeBlob;

  // Level 5: 栈不符
  const resumeTechs = resumeTechList(resume);
  const answerTechs = answerTechMentions(text);
  if (
    /用的是|我们用|技术栈|基于|采用|换成|改成|写的是|主要是/.test(text) ||
    answerTechs.length > 0
  ) {
    for (const family of STACK_FAMILIES) {
      const onResume = family.filter((t) =>
        resumeTechs.some((r) => normalizeTech(r) === normalizeTech(t)),
      );
      const inAnswer = family.filter((t) =>
        answerTechs.some((a) => normalizeTech(a) === normalizeTech(t)),
      );
      if (onResume.length && inAnswer.length) {
        const conflictAnswer = inAnswer.filter(
          (a) =>
            !onResume.some((r) => normalizeTech(r) === normalizeTech(a)),
        );
        if (conflictAnswer.length) {
          return {
            kind: "stack_mismatch",
            level: 5,
            resumeSide: onResume[0]!,
            answerSide: conflictAnswer[0]!,
            resumeExcerpt: excerptAround(raw, onResume[0]!),
          };
        }
      }
    }
  }

  // Level 1: 指标直接矛盾（同单位偏差大）
  const resumeMetrics = extractPercentsAndMs(resumeBlob);
  const answerMetrics = extractPercentsAndMs(text);
  if (resumeMetrics.length && answerMetrics.length) {
    const norm = (m: string) => m.toLowerCase().replace(/％/g, "%");
    const resumeSet = new Set(resumeMetrics.map(norm));
    type Cand = { rm: string; am: string; rel: number };
    const cands: Cand[] = [];
    for (const am of answerMetrics) {
      if (resumeSet.has(norm(am))) continue;
      const aNum = parseFloat(am);
      const aUnit = am.replace(/[\d.]/g, "");
      if (!Number.isFinite(aNum)) continue;
      for (const rm of resumeMetrics) {
        const rNum = parseFloat(rm);
        const rUnit = rm.replace(/[\d.]/g, "");
        if (!Number.isFinite(rNum) || rNum <= 0) continue;
        const unitSimilar =
          aUnit.toLowerCase() === rUnit.toLowerCase() ||
          (/%|％/.test(aUnit) && /%|％/.test(rUnit)) ||
          (/ms|毫秒/.test(aUnit) && /ms|毫秒/.test(rUnit));
        if (!unitSimilar) continue;
        const rel = Math.abs(aNum - rNum) / rNum;
        if (rel >= 0.4) cands.push({ rm, am, rel });
      }
    }
    if (cands.length) {
      cands.sort((a, b) => a.rel - b.rel);
      const best = cands[0]!;
      return {
        kind: "direct_contradiction",
        level: 1,
        resumeSide: best.rm,
        answerSide: best.am,
        resumeExcerpt: excerptAround(raw, best.rm),
      };
    }
  }

  // Level 3: 贡献注水 — 该项目简历明确「参与/协助」，口述却「主导/独立负责」
  {
    const proj =
      names.find((n) => nameMentioned(question?.prompt || "", n) || nameMentioned(text, n)) ||
      names[0];
    if (proj) {
      const p = (resume.projects || []).find((x) => x.name === proj);
      const projBlob = `${p?.role || ""} ${(p?.highlights || []).join(" ")}`;
      const resumeSoft = /参与|协助|帮忙|跟做|打杂/.test(projBlob);
      const resumeLead = /主导|独立负责|负责人|核心开发|owner/i.test(projBlob);
      const answerLead =
        /我(独立)?(主导|从零搭建|一个人做完)|我是(核心|owner|负责人)|我独立负责/.test(text);
      if (resumeSoft && !resumeLead && answerLead) {
        return {
          kind: "contribution_inflation",
          level: 3,
          resumeSide: `${proj}（简历偏参与/协助）`,
          answerSide: text.replace(/\s+/g, "").slice(0, 28),
          resumeExcerpt: excerptAround(raw, proj),
        };
      }
    }
  }

  // Level 2 / ownership: 简历写负责，口述推给别人（角色漂移 / 弱否认）
  const onResumeProject =
    Boolean(question?.fromResume) ||
    names.some((n) => nameMentioned(question?.prompt || "", n));
  if (
    onResumeProject &&
    /不是我(主)?做的|我没怎么做|主要是(别人|同学|同事|学长)|我只是打杂|我参与不多|我只是旁边|基本上别人做|我主要是整理材料|沟通联络/.test(
      text,
    )
  ) {
    const proj =
      names.find((n) => nameMentioned(question?.prompt || "", n)) ||
      names[0] ||
      "该项目";
    const role =
      (resume.projects || []).find((p) => p.name === proj)?.role || "负责/核心参与";
    const isRoleDrift = /整理材料|沟通联络|打杂|对接/.test(text);
    return {
      kind: isRoleDrift ? "role_drift" : "ownership",
      level: isRoleDrift ? 2 : 3,
      resumeSide: `${proj}（${role}）`,
      answerSide: text.replace(/\s+/g, "").slice(0, 24),
      resumeExcerpt: excerptAround(raw, proj),
    };
  }

  // Level 3: 宣称主导一个简历上没有的项目
  const claimMatchers: RegExp[] = [
    /我(?:独立)?(?:做过|做了|主导|完成了?|负责)(?:了|过)?了?[「『《“"]([\u4e00-\u9fffA-Za-z0-9·\-_]{2,20})[」』》”"]/,
    /我(?:独立)?(?:做过|做了|主导|完成了?|负责).{0,4}一个([\u4e00-\u9fffA-Za-z0-9·\-_]{2,16})(?:项目|系统|平台|中台)/,
    /我(?:独立)?(?:做过|做了|主导|完成了?|负责)(?:了|过)?了?([\u4e00-\u9fffA-Za-z0-9·\-_]{2,16})(?:项目|系统|平台|中台)/,
  ];
  for (const re of claimMatchers) {
    const claim = text.match(re);
    if (!claim) continue;
    const claimed = (claim[1] || "").trim();
    if (
      !claimed ||
      /相关|那个|这个|某个|一个|负责|主导|同学|别人|实习|做过|做了/.test(claimed)
    ) {
      continue;
    }
    if (
      names.length > 0 &&
      !names.some(
        (n) =>
          nameMentioned(claimed, n) ||
          nameMentioned(n, claimed) ||
          n.includes(claimed) ||
          claimed.includes(n),
      )
    ) {
      return {
        kind: "project_claim",
        level: 3,
        resumeSide: names.slice(0, 2).join("、"),
        answerSide: /项目|系统|平台|中台/.test(claimed) ? claimed : `${claimed}项目`,
        resumeExcerpt: (resume.rawText || "").slice(0, 160),
      };
    }
  }

  // Level 2: 角色冲突 — 简历负责人 vs 口述打杂
  const resumeOwner = /负责人|核心开发|独立负责|owner|tech lead/i.test(resumeBlob);
  if (
    resumeOwner &&
    /我只是实习打杂|我没什么话语权|决策都是别人|我定不了|我主要是整理材料|沟通联络/.test(text)
  ) {
    return {
      kind: "role_drift",
      level: 2,
      resumeSide: "负责人/核心职责",
      answerSide: text.replace(/\s+/g, "").slice(0, 24),
      resumeExcerpt: excerptAround(raw, "负责"),
    };
  }

  // Level 1 / 2：自我介绍等口述里的公司/学校与简历明显对不上
  {
    const resumeOrgs = (resume.experiences || [])
      .map((e) => (e.org || "").trim())
      .filter((o) => o.length >= 2);
    const resumeSchools = (resume.education || [])
      .map((e) => (e.school || "").trim())
      .filter((s) => s.length >= 2);
    const orgClaim =
      text.match(
        /(?:在|于|就职于|实习于|供职于)([\u4e00-\u9fffA-Za-z0-9]{2,16}?)(?:公司|集团|科技|网络)?(?:实习|工作|就职|任职)/,
      ) ||
      text.match(
        /([\u4e00-\u9fffA-Za-z0-9]{2,12}(?:公司|集团|科技))(?:实习|工作)/,
      );
    if (orgClaim?.[1] && resumeOrgs.length) {
      const claimed = orgClaim[1].replace(/(公司|集团|科技|网络)$/g, "");
      const matched = resumeOrgs.some(
        (o) =>
          o.includes(claimed) ||
          claimed.includes(o.replace(/(公司|集团|科技|网络)$/g, "")),
      );
      if (!matched && claimed.length >= 2) {
        return {
          kind: "direct_contradiction",
          level: 1,
          resumeSide: resumeOrgs.slice(0, 2).join("、"),
          answerSide: claimed,
          resumeExcerpt: excerptAround(raw, resumeOrgs[0]!),
        };
      }
    }
    const schoolClaim = text.match(
      /(?:毕业于|就读于|来自)([\u4e00-\u9fffA-Za-z0-9]{2,20}?(?:大学|学院|学校))/,
    );
    if (schoolClaim?.[1] && resumeSchools.length) {
      const claimed = schoolClaim[1];
      const matched = resumeSchools.some(
        (s) => s.includes(claimed) || claimed.includes(s),
      );
      if (!matched) {
        return {
          kind: "direct_contradiction",
          level: 1,
          resumeSide: resumeSchools.slice(0, 2).join("、"),
          answerSide: claimed,
          resumeExcerpt: excerptAround(raw, resumeSchools[0]!),
        };
      }
    }
  }

  // Level 4: 模糊细节（风险备注，非即时造假）
  if (
    text.length > 24 &&
    /应该是|大概是|可能是|我猜|好像是|记不清具体|差不多就|估计有|不太记得/.test(text) &&
    /(项目|简历|负责|指标|优化|上线|性能|模块)/.test(text)
  ) {
    return {
      kind: "fuzzy_detail",
      level: 4,
      resumeSide: "简历中的可核验细节",
      answerSide: text.replace(/\s+/g, "").slice(0, 28),
      resumeExcerpt: (resume.rawText || resumeBlob).slice(0, 120),
    };
  }

  return null;
}

/**
 * 专业挑战话术：永不说「你造假」。
 * 「简历写的是 A，你刚才说 B，不太一样，解释一下」
 */
export function craftResumeConflictUtterance(hit: ResumeConflictHit): string {
  const r = hit.resumeSide.slice(0, 40);
  const a = hit.answerSide.slice(0, 40);
  const seed = (r.length * 7 + a.length * 3 + hit.level) % 3;
  switch (hit.level) {
    case 1: {
      const lines = [
        `简历写的是「${r}」，你刚才说「${a}」，不太一样，解释一下——哪边是可核验的事实？`,
        `这边对不上：简历是「${r}」，你口述是「${a}」。以哪边为准？`,
        `「${r}」和你刚才说的「${a}」有冲突，你展开说一下实际经历。`,
      ];
      return lines[seed]!;
    }
    case 2: {
      const lines = [
        `简历写的是「${r}」，你刚才更像在说「${a}」。你实际交付物是什么？边界在哪？`,
        `角色口径不一致：简历「${r}」，口述「${a}」。你个人闭环的是哪一块？`,
        `对照简历「${r}」，你刚才的「${a}」听起来职责不同——实际边界是什么？`,
      ];
      return lines[seed]!;
    }
    case 3: {
      const lines = [
        `简历侧是「${r}」，你口述强调「${a}」。哪一部分是你拍板/独立交付的？有没有评审或上线记录可以对照？`,
        `贡献口径需要核实：简历「${r}」，你说「${a}」。你亲手交付的证据是什么？`,
        `「${r}」和「${a}」差一截——你独立负责到哪一步？`,
      ];
      return lines[seed]!;
    }
    case 4: {
      const lines = [
        `这个点目前偏模糊。对照简历，你能补一个可核验的细节吗（数字、模块名或你亲手改的文件/接口）？`,
        `先落到可核验细节：对照简历，补一个数字、模块或接口名就行。`,
        `这块还不够实。你能对着简历给一个可核对的点吗？`,
      ];
      return lines[seed]!;
    }
    case 5: {
      const lines = [
        `简历写的是「${r}」，你刚才提到「${a}」。是哪个项目/阶段用的，还是自学/包装进简历的？`,
        `技术栈对不上：简历「${r}」，口述「${a}」。分别用在什么场景？`,
        `「${r}」和「${a}」怎么同时出现的？按项目拆开说一下。`,
      ];
      return lines[seed]!;
    }
    default:
      return `简历写的是「${r}」，你刚才说「${a}」，不太一样，解释一下。`;
  }
}

/** 解释归类：OK → 简历表述不完整；混乱 → 诚信风险；忘记 → 记忆模糊；承认 → 造假 */
export function classifyConflictExplanation(answer: string): ConflictExplainOutcome {
  const text = answer.trim();
  if (
    /乱写|瞎写|编的|编造|杜撰|假的|造假|注水|挂名|我承认|确实是吹|简历写大了|夸大了/.test(
      text,
    )
  ) {
    return "admits_fabricate";
  }
  if (/记不清|忘了|不太记得|想不起来|记忆有点模糊|时间太久/.test(text)) {
    return "memory_fuzzy";
  }
  if (
    text.length >= 40 &&
    (/简历.*(写|表述).*(不全|笼统|简化|没写清)|表述不完整|简历没写细|当时简历空间不够|我实际做的是/.test(
      text,
    ) ||
      (/\d|接口|模块|PR|commit|评审|上线|我独立|我负责/.test(text) &&
        !/应该是|大概|可能|好像|猜/.test(text)))
  ) {
    return "ok_incomplete_resume";
  }
  if (
    text.length < 25 ||
    /反正|随便|差不多|就是那样|说不清|混乱|不知道怎么说/.test(text)
  ) {
    return "chaotic_integrity_risk";
  }
  // 有一定内容但不够扎实
  if (/应该是|大概|可能|好像|猜/.test(text)) return "chaotic_integrity_risk";
  return "ok_incomplete_resume";
}

export function utteranceForExplainOutcome(outcome: ConflictExplainOutcome): string {
  switch (outcome) {
    case "ok_incomplete_resume":
      return "明白了，更像是简历表述不完整。我们按你刚才说的实际交付继续。";
    case "memory_fuzzy":
      return "好，后面尽量只讲你现在还能核验的部分。";
    case "chaotic_integrity_risk":
      return "这个解释目前对不上，我会留意诚信风险，我们先换个角度继续。";
    case "admits_fabricate":
      return "那你先把简历改扎实了再来面试，今天就先到这里。";
    default:
      return "行，那我们继续。";
  }
}

/** 启发式结果 → 统一分析结果 */
export function heuristicToAnalysis(
  hit: ResumeConflictHit | null,
  alreadyChallenged: boolean,
): ResumeConsistencyAnalysis {
  if (!hit) {
    return { conflict: false, severity: "none", source: "heuristic" };
  }
  // Level 4 默认只记风险，不立刻 integrity；Level 1 二次可 integrity
  let severity: ResumeConsistencyAnalysis["severity"] = "challenge";
  if (alreadyChallenged && (hit.level === 1 || hit.level === 3)) {
    severity = "integrity";
  }
  if (hit.level === 4 && !alreadyChallenged) {
    severity = "challenge";
  }
  return {
    conflict: true,
    severity,
    level: hit.level,
    kind: hit.kind,
    resumeSide: hit.resumeSide,
    answerSide: hit.answerSide,
    utterance: craftResumeConflictUtterance(hit),
    resumeExcerpt: hit.resumeExcerpt,
    source: "heuristic",
  };
}

export function analysisToRecord(
  analysis: ResumeConsistencyAnalysis,
  questionId?: string,
): ResumeConflictRecord | null {
  if (!analysis.conflict || analysis.severity === "none") return null;
  const level = analysis.level || levelForKind(analysis.kind || "other");
  return {
    level,
    kind: analysis.kind || "other",
    resumeSide: analysis.resumeSide || "",
    answerSide: analysis.answerSide || "",
    questionId,
    utterance: analysis.utterance,
    resumeExcerpt: analysis.resumeExcerpt,
    source: analysis.source,
  };
}

/** 供润色 / LLM 用的简历摘要（短） */
export function resumeContextForPolish(resume?: ResumeProfile): string {
  if (!resume) return "";
  const projects = (resume.projects || [])
    .slice(0, 3)
    .map((p) => {
      const stack = (p.stack || []).slice(0, 4).join("/");
      const hi = (p.highlights || []).slice(0, 2).join("；");
      return `${p.name}${p.role ? `(${p.role})` : ""}${stack ? `[${stack}]` : ""}${hi ? `: ${hi}` : ""}`;
    })
    .join(" | ");
  const skills = (resume.skills || []).slice(0, 8).join("、");
  return `技能:${skills || "—"}; 项目:${projects || "—"}`.slice(0, 500);
}

/** 供一致性 Agent：结构化 + rawText 摘录（永不丢原文） */
export function resumeJsonForConsistency(resume?: ResumeProfile): Record<string, unknown> | null {
  if (!resume) return null;
  return {
    name: resume.name,
    summary: (resume.summary || "").slice(0, 400),
    rawTextExcerpt: (resume.rawText || "").slice(0, 2500),
    skills: (resume.skills || []).slice(0, 16),
    experiences: (resume.experiences || []).slice(0, 4).map((e) => ({
      org: e.org,
      title: e.title,
      period: e.period,
      highlights: (e.highlights || []).slice(0, 4),
    })),
    projects: (resume.projects || []).slice(0, 4).map((p) => ({
      name: p.name,
      role: p.role,
      stack: (p.stack || []).slice(0, 8),
      highlights: (p.highlights || []).slice(0, 5),
    })),
  };
}

/** 是否值得跑简历一致性分析 */
export function shouldAnalyzeResumeConsistency(
  answer: string,
  question?: Question,
): boolean {
  const text = answer.trim();
  if (text.length < 12) return false;
  if (
    /乱写|瞎写|编的|编造|杜撰|假的|造假|注水|假经历|挂名|其实不是我做的/.test(
      text,
    )
  ) {
    return false;
  }
  if (question?.isCoding) return false;
  // 自我介绍也要对照简历（项目/公司/技术栈口径）
  if (question?.phase === "self_intro" || question?.isSelfIntro) return true;
  if (question?.fromResume) return true;
  if (
    /项目|简历|负责|经历|实习|公司|模块|接口|优化|指标|技术栈|我做了|主导|参与/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /项目|简历|经历|负责|技术|协作|动机/.test(question?.prompt || "")
  ) {
    return true;
  }
  return false;
}

/**
 * 简历已写明的技能，不要再问「用了什么框架」这类事实题；
 * 深挖 WHY / 规模 / 虚拟列表 / 状态 / 所有权。
 */
export function resumeKnownStacks(resume?: ResumeProfile): string[] {
  if (!resume) return [];
  return resumeTechList(resume);
}

export function shouldAvoidFactQuestion(prompt: string, resume?: ResumeProfile): boolean {
  const known = resumeKnownStacks(resume);
  if (!known.length) return false;
  if (!/用了什么|什么框架|什么技术栈|用的什么语言|你会什么/.test(prompt)) return false;
  return known.some((t) => /react|vue|angular|typescript|node|java|python/i.test(t));
}
