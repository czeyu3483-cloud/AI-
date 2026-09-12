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
          研发岗 ·{" "}
          {feedback?.trackId === "hr_final" ? "HR终面" : "业务面"} ·{" "}
          {feedback?.candidateLevel === "social" ? "社招深度" : "校招/实习深度"} ·
          仅供练习参考，不代表录用结论
        </p>
      </header>

      {error && <p className="text-[var(--danger)]">{error}</p>}
      {!feedback && !error && <p className="text-[var(--muted)]">正在生成复盘…</p>}

      {feedback && (
        <>
          {feedback.integrityBreach ? (
            <section className="rounded-2xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-5">
              <h2 className="mb-2 text-lg font-medium text-[var(--danger)]">诚信红线</h2>
              <p className="leading-7 text-[var(--muted)]">
                本场因简历/经历真实性问题结束。诚信缺口属于严重问题，不应给出高分评价。
              </p>
            </section>
          ) : null}

          {feedback.vagueInsufficientDetail ? (
            <section className="rounded-2xl border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 p-5">
              <h2 className="mb-2 text-lg font-medium">回答不够细致</h2>
              <p className="leading-7 text-[var(--muted)]">
                本场多次回答偏空泛/笼统，整体回答不够细致。请用具体动作、场景与可验证结果把经历讲扎实。
              </p>
            </section>
          ) : null}

          {feedback.authenticityRisk ? (
            <section className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-5">
              <h2 className="mb-2 text-lg font-medium">真实性风险</h2>
              <p className="leading-7 text-[var(--muted)]">
                本场存在口述与简历不一致之处。请对齐指标、技术栈与职责表述，只保留可复盘的亲历细节。
              </p>
            </section>
          ) : null}

          {feedback.dimensions?.length ? (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
              <h2 className="mb-3 text-lg font-medium">能力维度</h2>
              <ul className="space-y-2 text-sm">
                {feedback.dimensions.map((d) => (
                  <li key={d.dimension} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{d.dimension}</span>
                    <span className="text-[var(--muted)]">
                      {d.score}/5 · {d.band}
                      {typeof d.weight === "number"
                        ? ` · 权重 ${(d.weight * 100).toFixed(0)}%`
                        : ""}
                    </span>
                    {d.evidence ? (
                      <span className="w-full text-[var(--muted)]">— {d.evidence}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
