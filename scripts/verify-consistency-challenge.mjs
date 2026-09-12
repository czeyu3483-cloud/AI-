/**
 * Verify: resume 张三 vs intro 李四 → immediate consistency challenge.
 * Also sanity-check dig preamble style + opening has no「可以不编程」.
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

const resumeText = `张三
北京大学 计算机科学 本科
实习经历：字节跳动 前端开发实习 2024.06-2024.09
项目：校园二手交易平台
- 技术栈 Next.js PostgreSQL
技能：React TypeScript`;

const { profile } = await post("/api/resume/parse", { text: resumeText });
if (profile.name && profile.name !== "张三") {
  // parser may or may not set name; force for deterministic check
  profile.name = "张三";
} else if (!profile.name) {
  profile.name = "张三";
}

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
    "我是李四，毕业于清华大学，之前在阿里巴巴做过前端实习，最近在做校园二手交易平台。",
});

const utt = mismatch.utterance || "";
const challenged =
  /等一下|打断一下|稍等|矛盾|澄清|张三|李四|清华|北京|阿里|字节/.test(utt) &&
  (mismatch.signals?.resumeConflict ||
    /张三|李四|北京|清华|字节|阿里/.test(utt) ||
    mismatch.action === "FOLLOW_UP_PITFALL" ||
    mismatch.action === "FOLLOW_UP_OWNERSHIP");

if (!challenged) {
  throw new Error(
    `expected immediate name/school/company challenge, got action=${mismatch.action} phase=${mismatch.phase} utt=${utt}`,
  );
}
if (mismatch.phase === "resume_deep_dive" && mismatch.index === 1 && !mismatch.signals?.resumeConflict) {
  throw new Error(`advanced past intro without challenge: ${utt}`);
}

// After explaining, should be able to continue
const explained = await post("/api/interview/turn", {
  sessionId: start.sessionId,
  answer:
    "抱歉口误，我是张三，北京大学计算机，在字节跳动实习，简历写的是对的。",
});

const digPrompt = explained.question?.prompt || explained.utterance || "";
if (/我结合你的自我介绍/.test(digPrompt)) {
  throw new Error(`dig used long intro preamble: ${digPrompt}`);
}

console.log("OK consistency challenge on name mismatch", {
  challengeUtt: utt.slice(0, 120),
  afterPhase: explained.phase,
  afterIndex: explained.index,
  digHint: (explained.question?.prompt || "").slice(0, 80),
});
