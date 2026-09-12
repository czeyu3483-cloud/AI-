"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FeedbackReport } from "@/lib/types";

export default function FeedbackPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [feedback, setFeedback] = useState<FeedbackReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem(`feedback:${sessionId}`);
    if (raw) {
      setFeedback(JSON.parse(raw) as FeedbackReport);
      return;
    }
    void (async () => {
      const res = await fetch("/api/interview/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "无法加载复盘");
        return;
      }
      setFeedback(data.feedback);
      sessionStorage.setItem(`feedback:${sessionId}`, JSON.stringify(data.feedback));
    })();
  }, [sessionId]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-10">
      <header className="space-y-2">
        <p className="text-sm tracking-[0.18em] text-[var(--accent)]">FEEDBACK</p>
        <h1 className="text-3xl font-semibold">面试复盘报告</h1>
        <p className="text-sm text-[var(--muted)]">
          研发岗 · 压力面 · 仅供练习参考，不代表录用结论
        </p>
      </header>

      {error && <p className="text-[var(--danger)]">{error}</p>}
      {!feedback && !error && <p className="text-[var(--muted)]">正在生成复盘…</p>}

      {feedback && (
        <>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
            <h2 className="mb-2 text-lg font-medium">总体评价</h2>
            <p className="leading-7 text-[var(--muted)]">{feedback.overallSummary}</p>
          </section>

          <section className="space-y-4">
            {feedback.perQuestion.map((q) => (
              <article
                key={q.questionId}
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5"
              >
                <h3 className="font-medium">{q.prompt}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">作答：{q.userAnswer}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {(q.scores || []).map((s) => (
                    <li key={s.dimension}>
                      {s.dimension}: {s.score}/5 — {s.evidence}
                    </li>
                  ))}
                </ul>
                {q.improvements?.length > 0 && (
                  <p className="mt-2 text-sm text-[var(--accent-2)]">
                    改进：{q.improvements.join("；")}
                  </p>
                )}
              </article>
            ))}
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
            <h2 className="mb-2 text-lg font-medium">下一步行动</h2>
            <ul className="list-disc space-y-1 pl-5 text-[var(--muted)]">
              {(feedback.topActions || []).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/report/${sessionId}`}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#042a26]"
            >
              下载 PDF 报告
            </a>
            <Link
              href="/"
              className="rounded-full border border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)]"
            >
              再面一场
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
