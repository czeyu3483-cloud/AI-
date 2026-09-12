"use client";

import { useMemo, useState } from "react";
import { DEMO_ROLES, DEMO_STYLES, DEMO_TRACKS, SAMPLE_RESUME } from "@/lib/config";
import type { ResumeProfile, RoleId, StyleId, TrackId } from "@/lib/types";

export default function HomePage() {
  const [roleId, setRoleId] = useState<RoleId>("rd_general");
  const [styleId, setStyleId] = useState<StyleId>("pressure");
  const [trackId, setTrackId] = useState<TrackId>("biz");
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const canStart = useMemo(
    () =>
      roleId === "rd_general" &&
      styleId === "pressure" &&
      (trackId === "biz" || trackId === "hr_final") &&
      Boolean(resumeText.trim()),
    [roleId, styleId, trackId, resumeText],
  );

  async function extractFileText(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "读取文件失败");
      // 只取文本，不展示 AI 预览
      if (data.profile?.rawText) setResumeText(data.profile.rawText);
      else throw new Error("未能从文件提取文本");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取文件失败");
    } finally {
      setBusy(false);
    }
  }

  async function startInterview() {
    setBusy(true);
    setError("");
    try {
      const parsedRes = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: resumeText }),
      });
      const parsed = await parsedRes.json();
      if (!parsedRes.ok || parsed.error) {
        throw new Error(parsed.error || "简历分析失败");
      }
      const current = parsed.profile as ResumeProfile;

      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, styleId, trackId, resume: current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "开场失败");
      if (!data.sessionId) throw new Error("未返回 sessionId");

      const boot = {
        sessionId: data.sessionId as string,
        utterance: data.utterance as string,
        question: data.question,
        index: data.index as number,
        total: data.total as number,
        config: data.config,
        trackId: (data.trackId as TrackId) || trackId,
        candidateLevel: data.candidateLevel as string | undefined,
        mockedLlm: Boolean(data.mockedLlm),
        interviewerName: (data.interviewerName as string) || "王老师",
        candidateName: (data.candidateName as string) || current.name || "",
        answerSoftLimitSec: data.answerSoftLimitSec as number | undefined,
        answerHardLimitSec: data.answerHardLimitSec as number | undefined,
        phase: data.phase as string | undefined,
        codingProblem: data.question?.isCoding ? data.question : undefined,
      };
      try {
        sessionStorage.setItem(`interview:${boot.sessionId}`, JSON.stringify(boot));
      } catch {
        // ignore
      }
      window.location.assign(`/interview/${boot.sessionId}`);
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
          面向校招/实习研发面试演练（默认按校招深度预期）。选轨道后粘贴简历开始；面试官口语开场，全程语音交流。
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
            面试中会追问细节与边界；卡壳时换角度，再不行就换题。开场不会提「压力面」字样。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
        <h2 className="mb-4 text-lg font-medium">面试轨道</h2>
        <div className="flex flex-wrap gap-2">
          {DEMO_TRACKS.map((track) => (
            <button
              key={track.id}
              type="button"
              disabled={!track.enabled || roleId !== "rd_general"}
              onClick={() => setTrackId(track.id)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                trackId === track.id && track.enabled
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--line)] text-[var(--muted)]"
              }`}
            >
              {track.enabled ? track.label : `${track.label}（暂不可选）`}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {DEMO_TRACKS.find((t) => t.id === trackId)?.hint ||
            "业务面偏技术深挖；HR终面偏适配与动机。"}
        </p>
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
                  void extractFileText(f);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
              onClick={() => {
                setResumeText(SAMPLE_RESUME);
                setFileName("");
              }}
            >
              填入脱敏样例
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-[var(--muted)]">
          请使用脱敏简历。{fileName ? `已选文件：${fileName}` : "也可直接粘贴文本。"}
          开始面试时会在后台分析简历，不展示 AI 预览。
        </p>
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={12}
          className="w-full rounded-xl border border-[var(--line)] bg-[#0d1524] p-4 text-sm leading-6 outline-none focus:border-[var(--accent)]"
        />
      </section>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!canStart || busy}
          onClick={() => void startInterview()}
          className="cursor-pointer rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#042a26] disabled:cursor-not-allowed"
        >
          {busy ? "正在准备面试…" : "开始面试"}
        </button>
        <p className="text-xs text-[var(--muted)]">进入后请授权麦克风与声音，全程可语音作答</p>
      </div>
    </main>
  );
}
