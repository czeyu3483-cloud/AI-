import type { Question, ResumeProfile } from "./types";

export type ResumeConflictHit = {
  kind: "stack" | "metric" | "ownership" | "project_claim" | "role";
  resumeSide: string;
  answerSide: string;
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

/**
 * 轻量启发式：口述 vs 简历冲突。
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

  // 明确造假/挂名交给诚信路径
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

  // 1) 栈冲突：口述强调族内另一技术，简历已写同族另一项
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
            kind: "stack",
            resumeSide: onResume[0]!,
            answerSide: conflictAnswer[0]!,
          };
        }
      }
    }
  }

  // 2) 指标冲突：口述出现简历未记载、且与简历同单位数字偏差大的指标
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
      // 优先选相对偏差中等、数值更接近的一对（避免拿「优化前」去对「优化后」）
      cands.sort((a, b) => a.rel - b.rel);
      const best = cands[0]!;
      return { kind: "metric", resumeSide: best.rm, answerSide: best.am };
    }
  }

  // 3) 所有权弱否认（未到「其实不是我做的」红线）：简历写负责，口述推给别人
  const onResumeProject =
    Boolean(question?.fromResume) ||
    names.some((n) => nameMentioned(question?.prompt || "", n));
  if (
    onResumeProject &&
    /不是我(主)?做的|我没怎么做|主要是(别人|同学|同事|学长)|我只是打杂|我参与不多|我只是旁边|基本上别人做/.test(
      text,
    )
  ) {
    const proj =
      names.find((n) => nameMentioned(question?.prompt || "", n)) ||
      names[0] ||
      "该项目";
    const role =
      (resume.projects || []).find((p) => p.name === proj)?.role || "负责/核心参与";
    return {
      kind: "ownership",
      resumeSide: `${proj}（${role}）`,
      answerSide: text.replace(/\s+/g, "").slice(0, 24),
    };
  }

  // 4) 宣称主导一个简历上没有的项目名（动词长短优先：做过 > 负责）
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
        resumeSide: names.slice(0, 2).join("、"),
        answerSide: /项目|系统|平台|中台/.test(claimed) ? claimed : `${claimed}项目`,
      };
    }
  }

  // 5) 角色冲突：简历写负责人/核心，口述说实习打杂且否认职责
  const resumeOwner = /负责人|核心开发|独立负责|owner|tech lead/i.test(resumeBlob);
  if (
    resumeOwner &&
    /我只是实习打杂|我没什么话语权|决策都是别人|我定不了/.test(text)
  ) {
    return {
      kind: "role",
      resumeSide: "负责人/核心职责",
      answerSide: text.replace(/\s+/g, "").slice(0, 24),
    };
  }

  return null;
}

/** 固定挑战话术：优先点名两侧差异 */
export function craftResumeConflictUtterance(hit: ResumeConflictHit): string {
  const r = hit.resumeSide.slice(0, 40);
  const a = hit.answerSide.slice(0, 40);
  if (r && a) {
    return `简历上写的是「${r}」，你刚才说的是「${a}」，哪边为准？`;
  }
  return "这个点和简历写法有点不一致，你解释一下。";
}

/** 供润色用的简历摘要（短） */
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
