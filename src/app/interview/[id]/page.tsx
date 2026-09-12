"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DigitalHuman } from "@/components/DigitalHuman";
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

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [boot, setBoot] = useState<BootState | null>(null);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [avatar, setAvatar] = useState<"idle" | "speaking" | "listening">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("正在连接面试官…");
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(4);
  const [question, setQuestion] = useState<Question | null>(null);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const answerBuf = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);

  const stuckMs = boot?.config.silenceStuckMs ?? 6000;
  const progress = useMemo(() => `${Math.min(index + 1, total)} / ${total}`, [index, total]);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setAvatar("listening");
      setStatus("请点击麦克风开始作答");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.02;
    speakingRef.current = true;
    setAvatar("speaking");
    setStatus("面试官正在提问（无字幕，请听语音）");
    u.onend = () => {
      speakingRef.current = false;
      setAvatar("listening");
      setStatus("轮到你了：按住或点击麦克风作答");
      resetStuckTimer();
    };
    u.onerror = () => {
      speakingRef.current = false;
      setAvatar("listening");
      setStatus("语音播放失败，请点击麦克风作答");
    };
    window.speechSynthesis.speak(u);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootSession() {
      let data: BootState | null = null;
      try {
        const raw = sessionStorage.getItem(`interview:${sessionId}`);
        if (raw) data = JSON.parse(raw) as BootState;
      } catch {
        data = null;
      }

      if (!data) {
        try {
          const res = await fetch(`/api/interview/session?sessionId=${encodeURIComponent(sessionId)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "会话加载失败");
          data = {
            sessionId: json.sessionId,
            utterance: json.utterance,
            question: json.question,
            index: json.index,
            total: json.total,
            config: json.config,
          };
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "未找到会话，请从首页重新开始");
          }
          return;
        }
      }

      if (cancelled || !data) return;
      setBoot(data);
      setQuestion(data.question);
      setIndex(data.index);
      setTotal(data.total);
      speak(data.utterance);
    }

    void bootSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (stuckTimer.current) clearTimeout(stuckTimer.current);
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  function resetStuckTimer() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (speakingRef.current || busyRef.current || listening) return;
    stuckTimer.current = setTimeout(() => {
      void submitTurn("", true);
    }, stuckMs);
  }

  async function submitTurn(text: string, silenceStuck = false) {
    if (busyRef.current || !sessionId) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInterim("");
    answerBuf.current = "";
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    recognitionRef.current?.stop();
    setListening(false);

    if (silenceStuck) setStatus("检测到长时间沉默，正在换角度…");
    else setStatus("正在理解你的回答…");

    try {
      const res = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answer: text, silenceStuck }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "回合失败");

      if (typeof data.index === "number") setIndex(data.index);
      if (typeof data.total === "number") setTotal(data.total);
      if (data.question) setQuestion(data.question as Question);

      if (data.done) {
        setStatus("本场结束，正在生成复盘…");
        sessionStorage.setItem(`feedback:${sessionId}`, JSON.stringify(data.feedback as FeedbackReport));
        setTimeout(() => router.push(`/feedback/${sessionId}`), 700);
      } else {
        speak(data.utterance);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "回合失败");
      setStatus("出了点问题，可再试一次麦克风");
      setAvatar("listening");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function scheduleAutoSubmit() {
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    autoSubmitTimer.current = setTimeout(() => {
      const text = answerBuf.current.trim();
      if (!text) return;
      recognitionRef.current?.stop();
      setListening(false);
      void submitTurn(text);
    }, 1600);
  }

  function toggleMic() {
    if (speakingRef.current) {
      setError("请先听完面试官提问");
      return;
    }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      setError("当前浏览器不支持语音识别，请换 Chrome 再试");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      const text = answerBuf.current.trim();
      if (text) void submitTurn(text);
      return;
    }

    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    answerBuf.current = "";
    setInterim("");
    setStatus("正在听你说…说完稍停会自动提交");
    setAvatar("listening");

    recognition.onresult = (event: {
      resultIndex: number;
      results: Array<{ 0: { transcript: string }; isFinal: boolean; length: number }>;
    }) => {
      let finalChunk = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]![0]!.transcript;
        if (event.results[i]!.isFinal) finalChunk += piece;
        else live += piece;
      }
      if (finalChunk) {
        answerBuf.current += finalChunk;
        scheduleAutoSubmit();
      }
      setInterim(`${answerBuf.current}${live}`.trim());
      if (stuckTimer.current) clearTimeout(stuckTimer.current);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("语音识别出错，请再点一次麦克风");
    };
    recognition.onend = () => {
      setListening(false);
      const text = answerBuf.current.trim();
      if (text && !busyRef.current && !speakingRef.current) {
        // 用户手动停麦时若缓冲区仍有内容且未触发自动提交
        if (autoSubmitTimer.current) return;
        void submitTurn(text);
      }
    };
    recognition.start();
    setListening(true);
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

  // silence unused question var warning in production build - keep for potential a11y
  void question;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-5 py-8">
      <header className="mb-6 w-full text-center">
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">VOICE ONLY · 压力面</p>
        <h1 className="mt-2 text-2xl font-semibold">纯语音模拟面试</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">无字幕对话 · 简单数字人陪练 · 听完后开口作答</p>
      </header>

      <DigitalHuman state={avatar} progress={progress} />

      <p className="mt-6 max-w-md text-center text-sm leading-6 text-[var(--text)]">{status}</p>
      {interim && (
        <p className="mt-2 max-w-md text-center text-xs text-[var(--muted)]">
          （识别中，仅供确认，面试界面不展示题面）
        </p>
      )}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {boot?.mockedLlm && (
        <p className="mt-2 text-xs text-[var(--accent-2)]">LLM 已降级为本地话术</p>
      )}

      <div className="relative mt-10">
        {listening && <span className="voice-ring" />}
        <button
          type="button"
          disabled={busy || avatar === "speaking"}
          onClick={toggleMic}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
            listening
              ? "border-[var(--accent-2)] bg-[var(--accent-2)]/20 text-[var(--accent-2)]"
              : "border-[var(--accent)] bg-[var(--accent)] text-[#042a26]"
          }`}
        >
          {listening ? "说完了" : busy ? "…" : "麦克风"}
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={busy || avatar === "speaking"}
          onClick={() => void submitTurn("我不会")}
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
        >
          模拟卡壳
        </button>
        <button
          type="button"
          onClick={() => void finishNow()}
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
        >
          提前结束并生成复盘
        </button>
      </div>
    </main>
  );
}
