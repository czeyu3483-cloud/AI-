/**
 * Verify name consistency challenges:
 *  - resume 张三 + intro 李四 → immediate challenge (not advance)
 *  - matching 张三 → advance to dig
 * Usage: node scripts/verify-consistency-challenge.mjs [baseUrl]
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

function forceName(profile, name) {
  profile.name = name;
  if (!profile.rawText || !profile.rawText.includes(name)) {
    profile.rawText = `姓名：${name}\n${profile.rawText || ""}`;
  }
  return profile;
}

const resumeText = `姓名：张三
北京大学 计算机科学 本科
实习经历：字节跳动 前端开发实习 2024.06-2024.09
项目：校园二手交易平台
- 技术栈 Next.js PostgreSQL
技能：React TypeScript`;

const { profile: parsed } = await post("/api/resume/parse", { text: resumeText });
const profile = forceName({ ...parsed }, "张三");
if (profile.name !== "张三") {
  throw new Error(`expected resume.name 张三, got ${profile.name}`);
}

// —— A) 姓名不一致：必须立刻挑战，不得推进 ——
const start = await post("/api/interview/start", {
  roleId: "rd_general",
  styleId: "pressure",
  trackId: "biz",
  resume: profile,
});

if (/可以不编程|先不练|不想练也可以/.test(start.utterance || "")) {
  throw new Error(`opening advertised skip-coding: ${start.utterance}`);
}

const mismatch = await post("/api/interview/turn", {
  sessionId: start.sessionId,
  answer:
    "我是李四，毕业于北京大学，之前在字节跳动做过前端实习，最近在做校园二手交易平台。",
});

const utt = mismatch.utterance || "";
const nameChallenge =
  /张三/.test(utt) &&
  /李四/.test(utt) &&
  (/等一下|打断|稍等|哪个是对的|矛盾|澄清/.test(utt) ||
    mismatch.signals?.resumeConflict);

if (!nameChallenge) {
  throw new Error(
    `expected immediate 张三/李四 name challenge, got action=${mismatch.action} phase=${mismatch.phase} index=${mismatch.index} utt=${utt}`,
  );
}
if (mismatch.phase === "resume_deep_dive" || mismatch.index === 1) {
  throw new Error(`advanced past intro without challenge: phase=${mismatch.phase} index=${mismatch.index} utt=${utt}`);
}
if (!mismatch.signals?.resumeConflict) {
  throw new Error(`expected resumeConflict signal on name mismatch, got ${JSON.stringify(mismatch.signals)}`);
}

// After explaining, should continue
const explained = await post("/api/interview/turn", {
  sessionId: start.sessionId,
  answer:
    "抱歉口误，我是张三，北京大学计算机，在字节跳动实习，简历写的是对的。",
});

const digPrompt = explained.question?.prompt || explained.utterance || "";
if (/我结合你的自我介绍/.test(digPrompt)) {
  throw new Error(`dig used long intro preamble: ${digPrompt}`);
}

// —— B) 姓名一致：应推进深挖（不挑战） ——
const startMatch = await post("/api/interview/start", {
  roleId: "rd_general",
  styleId: "pressure",
  trackId: "biz",
  resume: forceName({ ...parsed }, "张三"),
});
const match = await post("/api/interview/turn", {
  sessionId: startMatch.sessionId,
  answer:
    "我是张三，毕业于北京大学，之前在字节跳动做过前端实习，最近在做校园二手交易平台，主要用 Next.js。",
});
if (match.phase !== "resume_deep_dive" || match.index !== 1) {
  throw new Error(
    `expected matching names to advance, got phase=${match.phase} index=${match.index} action=${match.action} utt=${match.utterance}`,
  );
}
if (match.signals?.resumeConflict) {
  throw new Error(`matching names should not set resumeConflict: ${match.utterance}`);
}

// —— C) 无标点「我是李四来自…」也应抽出姓名并挑战 ——
const startC = await post("/api/interview/start", {
  roleId: "rd_general",
  styleId: "pressure",
  trackId: "biz",
  resume: forceName({ ...parsed }, "张三"),
});
const glued = await post("/api/interview/turn", {
  sessionId: startC.sessionId,
  answer:
    "大家好我是李四来自北京大学，之前在字节跳动做过前端实习，最近在做校园二手交易平台。",
});
if (!(/张三/.test(glued.utterance || "") && /李四/.test(glued.utterance || ""))) {
  throw new Error(
    `expected name challenge for glued intro, got action=${glued.action} phase=${glued.phase} utt=${glued.utterance}`,
  );
}
if (glued.phase === "resume_deep_dive") {
  throw new Error(`glued name mismatch advanced without challenge: ${glued.utterance}`);
}

console.log("OK consistency challenge on name mismatch + match advances", {
  challengeUtt: utt.slice(0, 120),
  afterPhase: explained.phase,
  afterIndex: explained.index,
  matchPhase: match.phase,
  gluedUtt: (glued.utterance || "").slice(0, 100),
});
