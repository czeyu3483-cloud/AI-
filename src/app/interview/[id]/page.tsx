"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BehaviorConfig, FeedbackReport, Question } from "@/lib/types";

type BootState = {
  sessionId: string;
  utterance: string;
  question: Question;
  index: number;
  total: number;
  config: BehaviorConfig;
  mockedLlm?: boolean;
};

type ChatItem = { role: "interviewer" | "user" | "system"; text: string };

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [boot, setBoot] = useState<BootState | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [avatar, setAvatar] = useState<"idle" | "speaking" | "listening">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(4);
  const [question, setQuestion] = useState<Question | null>(null);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const stuckMs = boot?.config.silenceStuckMs ?? 6000;
  const progress = useMemo(() => `${Math.min(index + 1, total)} / ${total}`, [index, total]);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.02;
    setAvatar("speaking");
    u.onend = () => setAvatar("listening");
    window.speechSynthesis.speak(u);
  }

  useEffect(() => {
    const raw = sessionStorage.getItem(`interview:${sessionId}`);
    if (!raw) {
      setError("未找到会话，请从首页重新开始");
      return;
    }
    const data = JSON.parse(raw) as BootState;
    setBoot(data);
    setQuestion(data.question);
    setIndex(data.index);
    setTotal(data.total);
    setChat([{ role: "interviewer", text: data.utterance }]);
    speak(data.utterance);
    setAvatar("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (stuckTimer.current) clearTimeout(stuckTimer.current);
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  function resetStuckTimer() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    stuckTimer.current = setTimeout(() => {
      void submitTurn("", true);
    }, stuckMs);
  }

  async function submitTurn(text: string, silenceStuck = false) {
    if (busy || !sessionId) return;
    setBusy(true);
    setError("");
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (text.trim()) setChat((c) => [...c, { role: "user", text }]);
    else if (silenceStuck) {
      setChat((c) => [...c, { role: "system", text: "（检测到长时间沉默，系统判定卡壳）" }]);
    }

    try {
      const res = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answer: text, silenceStuck }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "回合失败");

      setChat((c) => [...c, { role: "interviewer", text: data.utterance }]);
      speak(data.utterance);
      if (typeof data.index === "number") setIndex(data.index);
      if (typeof data.total === "number") setTotal(data.total);
      if (data.question) setQuestion(data.question as Question);
      setAnswer("");

      if (data.done) {
        sessionStorage.setItem(`feedback:${sessionId}`, JSON.stringify(data.feedback as FeedbackReport));
        setTimeout(() => router.push(`/feedback/${sessionId}`), 600);
      } else {
        setAvatar("listening");
        resetStuckTimer();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "回合失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      setError("当前浏览器不支持语音识别，请用文本框作答");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    recognition.onresult = (event: {
      resultIndex: number;
      results: Array<{ 0: { transcript: string }; isFinal: boolean }>;
    }) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]![0]!.transcript;
        if (event.results[i]!.isFinal) finalText += piece;
      }
      if (finalText) {
        setAnswer((prev) => `${prev}${finalText}`);
        resetStuckTimer();
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError("语音识别出错，请改用文本输入");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
    setAvatar("listening");
    resetStuckTimer();
  }

  async function finishNow() {
    setBusy(true);
    const res = await fetch("/api/interview/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (data.feedback) {
      sessionStorage.setItem(`feedback:${sessionId}`, JSON.stringify(data.feedback));
    }
    router.push(`/feedback/${sessionId}`);
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-5">
        <p className="text-xs tracking-[0.18em] text-[var(--muted)]">INTERVIEWER</p>
        <div
          className={`mx-auto mt-6 flex h-40 w-40 items-center justify-center rounded-full border-2 ${
            avatar === "speaking"
              ? "animate-pulse border-[var(--accent)] bg-[var(--accent)]/20"
              : avatar === "listening"
                ? "border-[var(--accent-2)] bg-[var(--accent-2)]/10"
                : "border-[var(--line)] bg-[#0d1524]"
          }`}
        >
          <div className="text-center">
            <div className="text-4xl">🎧</div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {avatar === "speaking" ? "提问中" : avatar === "listening" ? "倾听中" : "待命"}
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-2 text-sm text-[var(--muted)]">
          <p>岗位：研发岗</p>
          <p>风格：压力面</p>
          <p>进度：{progress}</p>
          {boot?.mockedLlm && <p className="text-[var(--accent-2)]">LLM：mock 降级</p>}
        </div>
        <button
          type="button"
          onClick={() => void finishNow()}
          className="mt-6 w-full rounded-full border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
        >
          提前结束并生成复盘
        </button>
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)]/80">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h1 className="text-lg font-medium">压力面进行中</h1>
          <p className="text-sm text-[var(--muted)]">当前题：{question?.prompt || "加载中…"}</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {chat.map((item, i) => (
            <div
              key={`${item.role}-${i}`}
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                item.role === "interviewer"
                  ? "bg-[#0d1524]"
                  : item.role === "user"
                    ? "ml-auto bg-[var(--accent)]/20"
                    : "text-[var(--accent-2)]"
              }`}
            >
              {item.text}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--line)] p-4">
          {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
          <textarea
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              resetStuckTimer();
            }}
            rows={3}
            placeholder="可语音或打字作答。沉默过久将按卡壳处理。"
            className="w-full rounded-xl border border-[var(--line)] bg-[#0d1524] p-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleMic}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm"
            >
              {listening ? "停止说话" : "开始说话"}
            </button>
            <button
              type="button"
              disabled={busy || !answer.trim()}
              onClick={() => void submitTurn(answer)}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#042a26]"
            >
              {busy ? "提交中…" : "提交回答"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitTurn("我不会")}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              模拟卡壳
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
