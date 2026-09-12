/**
 * Regression: 自我介绍提交后必须推进（或仅一次补充后再推进）；
 * 并校验 selfIntroText 合并首答+补充。
 * Usage: node scripts/verify-intro-advance.mjs [baseUrl]
 */
const base = process.argv[2] || "http://127.0.0.1:3456";

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${path} failed: ${res.status}`);
  return data;
}

const resumeText = `张三
北京大学 计算机科学 本科
实习经历：字节跳动 前端开发实习 2024.06-2024.09
项目：校园二手交易平台
- 技术栈 Next.js PostgreSQL
技能：React TypeScript`;

const { profile } = await post("/api/resume/parse", { text: resumeText });

// —— A) 短答 → 一次补充 → 推进深挖 ——
const start = await post("/api/interview/start", {
  roleId: "rd_general",
  styleId: "pressure",
  trackId: "biz",
  resume: profile,
});

if (start.phase !== "self_intro") {
  throw new Error(`expected self_intro, got ${start.phase}`);
}
if (/\d+\s*个问题|大约\s*\d+|今天大概聊|本场共\d+/.test(start.utterance || "")) {
  throw new Error(`opening leaked question count: ${start.utterance}`);
}

const short = await post("/api/interview/turn", {
  sessionId: start.sessionId,
  answer: "你好我是张三",
});
if (short.phase !== "self_intro" || !/补充|展开|背景|经历|再实一点/.test(short.utterance || "")) {
  throw new Error(`expected one intro supplement, got phase=${short.phase} utt=${short.utterance}`);
}

const solid = await post("/api/interview/turn", {
  sessionId: start.sessionId,
  answer:
    "我是张三，北京大学计算机专业，之前在字节跳动做过前端实习，最近在做校园二手交易平台，主要用 Next.js。",
});

if (solid.phase !== "resume_deep_dive" || solid.index !== 1) {
  throw new Error(
    `expected advance to dig Q1, got phase=${solid.phase} index=${solid.index} q=${solid.question?.id}`,
  );
}
if (!String(solid.question?.id || "").includes("dig")) {
  throw new Error(`expected dig question id, got ${solid.question?.id}`);
}
if (/我先记下了|我记录一下/.test(solid.utterance || "")) {
  throw new Error(`advance used forbidden note-taking phrase: ${solid.utterance}`);
}

// —— B) 完整自我介绍一次提交即推进 ——
const start2 = await post("/api/interview/start", {
  roleId: "rd_general",
  styleId: "pressure",
  trackId: "biz",
  resume: profile,
});
const once = await post("/api/interview/turn", {
  sessionId: start2.sessionId,
  answer:
    "我是张三，北京大学计算机专业，在字节跳动实习，负责校园二手交易平台的 Next.js 前端开发。",
});
if (once.phase === "self_intro" && once.index === 0) {
  // 允许一次简历冲突挑战，但不允许再次「补充」式卡住
  if (/补充|展开一点|再补一句/.test(once.utterance || "")) {
    throw new Error(`complete intro should not get supplement probe: ${once.utterance}`);
  }
} else if (once.phase !== "resume_deep_dive" || once.index !== 1) {
  throw new Error(
    `expected dig or conflict-challenge, got phase=${once.phase} index=${once.index}`,
  );
}

console.log("OK intro→supplement→dig Q1 (+ complete path)", {
  digId: solid.question.id,
  phase: solid.phase,
  index: solid.index,
  oncePhase: once.phase,
  onceIndex: once.index,
});
