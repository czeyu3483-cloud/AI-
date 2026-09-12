"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ROLES, DEMO_STYLES, SAMPLE_RESUME } from "@/lib/config";
import type { ResumeProfile, RoleId, StyleId } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [roleId, setRoleId] = useState<RoleId>("rd_general");
  const [styleId, setStyleId] = useState<StyleId>("pressure");
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const canStart = useMemo(
    () => roleId === "rd_general" && styleId === "pressure" && Boolean(resumeText.trim()),
    [roleId, styleId, resumeText],
  );

  async function parseResume(file?: File) {
    setBusy(true);
    setError("");
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/resume/parse", { method: "POST", body: form });
      } else {
        res = await fetch("/api/resume/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: resumeText }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "解析失败");
      setProfile(data.profile);
      if (data.profile?.rawText) setResumeText(data.profile.rawText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function startInterview() {
    setBusy(true);
    setError("");
    try {
      let current = profile;
      if (!current) {
        const parsed = await fetch("/api/resume/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: resumeText }),
        }).then((r) => r.json());
        if (parsed.error) throw new Error(parsed.error);
        current = parsed.profile as ResumeProfile;
        setProfile(current);
      }

      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, styleId, resume: current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "开场失败");

      sessionStorage.setItem(
        `interview:${data.sessionId}`,
        JSON.stringify({
          sessionId: data.sessionId,
          utterance: data.utterance,
          question: data.question,
          index: data.index,
          total: data.total,
          config: data.config,
          mockedLlm: data.mockedLlm,
        }),
      );
      router.push(`/interview/${data.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "开场失败");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-5 py-10">
      <header className="space-y-3">
        <p className="text-sm tracking-[0.2em] text-[var(--accent)]">LOCAL DEMO</p>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">仿真 AI 模拟面试官</h1>
        <p className="max-w-2xl text-[var(--muted)]">
          面向校招/实习研发面试演练。本 Demo 仅开放「研发岗 · 压力面」；控场由状态机驱动，DeepSeek
          负责话术润色与复盘。
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
          <h2 className="mb-4 text-lg font-medium">岗位</h2>
          <div className="flex flex-wrap gap-2">
            {DEMO_ROLES.map((role) => (
              <button
                key={role.id}
                type="button"
                disabled={!role.enabled}
                onClick={() => setRoleId(role.id)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  roleId === role.id && role.enabled
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {role.enabled ? role.label : `${role.label}（暂不可选）`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
          <h2 className="mb-4 text-lg font-medium">面试风格</h2>
          <div className="flex flex-wrap gap-2">
            {DEMO_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                disabled={!style.enabled}
                onClick={() => setStyleId(style.id)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  styleId === style.id && style.enabled
                    ? "border-[var(--accent-2)] bg-[var(--accent-2)]/15 text-[var(--accent-2)]"
                    : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {style.enabled ? style.label : `${style.label}（暂不可选）`}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            压力面：短留白、深追问、默认不给思路提示；卡壳先换角度，再软跳题。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">简历输入</h2>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--accent)]">
              上传 txt/docx/pdf
              <input
                type="file"
                accept=".txt,.md,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFileName(f.name);
                  void parseResume(f);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
              onClick={() => {
                setResumeText(SAMPLE_RESUME);
                setProfile(null);
                setFileName("");
              }}
            >
              填入脱敏样例
            </button>
            <button
              type="button"
              disabled={busy || !resumeText.trim()}
              onClick={() => void parseResume()}
              className="rounded-full border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)]"
            >
              解析简历
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-[var(--muted)]">
          请使用脱敏简历。{fileName ? `已选文件：${fileName}` : "也可直接粘贴文本。"}
        </p>
        <textarea
          value={resumeText}
          onChange={(e) => {
            setResumeText(e.target.value);
            setProfile(null);
          }}
          rows={10}
          className="w-full rounded-xl border border-[var(--line)] bg-[#0d1524] p-4 text-sm leading-6 outline-none focus:border-[var(--accent)]"
        />
        {profile && (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[#0d1524] p-4 text-sm">
            <p className="mb-2 text-[var(--accent)]">解析预览</p>
            <p>姓名：{profile.name || "未识别"}</p>
            <p>技能：{(profile.skills || []).join("、") || "未识别"}</p>
            <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">
              {(profile.projects || []).map((p) => (
                <li key={p.name}>
                  {p.name}
                  {p.role ? ` · ${p.role}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!canStart || busy}
          onClick={() => void startInterview()}
          className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#042a26]"
        >
          {busy ? "处理中…" : "开始压力面面试"}
        </button>
        <p className="text-xs text-[var(--muted)]">本地运行 · DeepSeek · 结束后可下载 PDF 报告</p>
      </div>
    </main>
  );
}
