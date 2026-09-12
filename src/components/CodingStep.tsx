"use client";

import { useMemo, useState } from "react";
import type { CodingProblem, CodingRunResult } from "@/lib/types";

type Props = {
  problem: CodingProblem;
  sessionId: string;
  disabled?: boolean;
  onSubmitted: (payload: {
    codingResult: CodingRunResult;
    utterance?: string;
    done?: boolean;
    feedback?: unknown;
    index?: number;
    total?: number;
    question?: unknown;
    phase?: string;
  }) => void;
};

export function CodingStep({ problem, sessionId, disabled, onSubmitted }: Props) {
  const [code, setCode] = useState(problem.starterCode);
  const [notes, setNotes] = useState(problem.complexityHint || "");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => problem.title, [problem.title]);

  async function submit(opts?: { skip?: boolean }) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/interview/coding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          problemId: problem.id,
          code: opts?.skip ? "" : code,
          notes: opts?.skip ? "" : notes,
          skip: Boolean(opts?.skip),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      const result = data.codingResult as CodingRunResult;
      setSubmitted(true);
      onSubmitted({
        codingResult: result,
        utterance: data.utterance,
        done: data.done,
        feedback: data.feedback,
        index: data.index,
        total: data.total,
        question: data.question,
        phase: data.phase,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 w-full max-w-2xl space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)]/90 p-4">
      <header className="space-y-1">
        <p className="text-xs tracking-[0.16em] text-[var(--accent)]">CODING</p>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm leading-6 text-[var(--muted)]">{problem.prompt}</p>
        <p className="text-xs text-[var(--muted)]">
          提交后进入下一环节；用例对错仅在终局复盘中展示。
        </p>
      </header>

      <label className="block text-xs text-[var(--muted)]">
        在此手写代码（JS）
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={busy || disabled || submitted}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0d1524] p-3 font-mono text-sm leading-5 outline-none focus:border-[var(--accent)]"
        />
      </label>

      <label className="block text-xs text-[var(--muted)]">
        复杂度 / 思路备注（写入复盘）
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy || disabled || submitted}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0d1524] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="例如：哈希表 O(n) 时间 / O(n) 空间"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled || submitted || !code.trim()}
          onClick={() => void submit()}
          className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#042a26] disabled:opacity-50"
        >
          {busy ? "提交中…" : submitted ? "已提交" : "提交代码"}
        </button>
        {submitted ? (
          <span className="text-sm text-[var(--muted)]">已收到，评价见终局复盘</span>
        ) : null}
      </div>

      {/* 非广告化：仅极弱出口，不出现在开场/主文案 */}
      {!submitted ? (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void submit({ skip: true })}
          className="text-[11px] text-[var(--muted)]/70 underline-offset-2 hover:underline disabled:opacity-50"
        >
          继续下一环节
        </button>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
