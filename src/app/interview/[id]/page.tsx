"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DigitalHuman } from "@/components/DigitalHuman";
import {
  ensureMicPermission,
  fetchTtsBlob,
  getSpeechRecognitionCtor,
  pickZhVoice,
} from "@/lib/speech";
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
  const [audioReady, setAudioReady] = useState(false);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [avatar, setAvatar] = useState<"idle" | "speaking" | "listening">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("正在加载面试会话…");
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(4);
  const [fallbackText, setFallbackText] = useState("");
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [asrSupported, setAsrSupported] = useState(true);

  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const answerBuf = useRef("");
  const lastUtteranceRef = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);

  const stuckMs = boot?.config.silenceStuckMs ?? 6000;
  const progress = useMemo(() => `${Math.min(index + 1, total)} / ${total}`, [index, total]);

  function clearTimers() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    stuckTimer.current = null;
    autoSubmitTimer.current = null;
  }

  function resetStuckTimer() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (speakingRef.current || busyRef.current || listening) return;
    stuckTimer.current = setTimeout(() => {
      void submitTurn("", true);
    }, stuckMs);
  }

  async function playUtterance(text: string) {
    lastUtteranceRef.current = text;
    speakingRef.current = true;
    setAvatar("speaking");
    setStatus("面试官正在提问（请听语音，无字幕）");
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();

    try {
      const blob = await fetchTtsBlob(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("音频播放失败"));
        };
        void audio.play().catch(reject);
      });
      speakingRef.current = false;
      setAvatar("listening");
      setStatus("轮到你了：点击麦克风作答（需允许麦克风权限）");
      resetStuckTimer();
      return;
    } catch {
      // browser TTS fallback
    }

    if (!window.speechSynthesis) {
      speakingRef.current = false;
      setAvatar("listening");
      setStatus("语音不可用。可点「重播」或用文字作答。");
      setShowTextFallback(true);
      return;
    }

    await new Promise<void>((resolve) => {
      const existing = window.speechSynthesis.getVoices();
      if (existing.length) {
        resolve();
        return;
      }
      const timer = setTimeout(() => resolve(), 400);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.02;
    const voice = pickZhVoice();
    if (voice) utterance.voice = voice;
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
    speakingRef.current = false;
    setAvatar("listening");
    setStatus("轮到你了：点击麦克风作答");
    resetStuckTimer();
  }

  useEffect(() => {
    let cancelled = false;
    setAsrSupported(Boolean(getSpeechRecognitionCtor()));

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
          const res = await fetch(
            `/api/interview/session?sessionId=${encodeURIComponent(sessionId)}`,
          );
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
      setIndex(data.index);
      setTotal(data.total);
      lastUtteranceRef.current = data.utterance;
      setStatus("点击下方按钮开启语音（浏览器要求先手动授权声音）");
    }

    void bootSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      clearTimers();
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginAudioInterview() {
    setError("");
    setAudioReady(true);
    try {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      void ctx.close();
    } catch {
      // ignore
    }
    try {
      micStreamRef.current = await ensureMicPermission();
    } catch {
      setShowTextFallback(true);
      setError("无法打开麦克风。可改用下方文字作答，或检查浏览器麦克风权限。");
    }
    if (lastUtteranceRef.current) {
      await playUtterance(lastUtteranceRef.current);
    }
  }

  async function submitTurn(text: string, silenceStuck = false) {
    if (busyRef.current || !sessionId) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInterim("");
    setFallbackText("");
    answerBuf.current = "";
    clearTimers();
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

      if (data.done) {
        setStatus("本场结束，正在生成复盘…");
        sessionStorage.setItem(
          `feedback:${sessionId}`,
          JSON.stringify(data.feedback as FeedbackReport),
        );
        setTimeout(() => router.push(`/feedback/${sessionId}`), 700);
      } else {
        await playUtterance(String(data.utterance || ""));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "回合失败");
      setStatus("出了点问题，可再试一次");
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

  async function toggleMic() {
    if (!audioReady) {
      setError("请先点击「开启语音面试」");
      return;
    }
    if (speakingRef.current) {
      setError("请先听完面试官提问");
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setAsrSupported(false);
      setShowTextFallback(true);
      setError("当前浏览器不支持语音识别，请用文字作答或换 Chrome");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      const text = answerBuf.current.trim();
      if (text) void submitTurn(text);
      return;
    }

    try {
      if (
        !micStreamRef.current ||
        micStreamRef.current.getTracks().every((track) => track.readyState === "ended")
      ) {
        micStreamRef.current = await ensureMicPermission();
      }
    } catch {
      setShowTextFallback(true);
      setError("麦克风权限被拒绝。请在地址栏允许麦克风，或改用文字作答。");
      return;
    }

    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    answerBuf.current = "";
    setInterim("");
    setStatus("正在听你说…说完稍停会自动提交");
    setAvatar("listening");
    setError("");

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      const code = event.error || "unknown";
      if (code === "not-allowed") {
        setShowTextFallback(true);
        setError("麦克风权限被拒绝，请改用文字作答或检查浏览器设置");
      } else if (code === "no-speech") {
        setError("没有听到声音，请靠近麦克风再说一次");
      } else {
        setShowTextFallback(true);
        setError(`语音识别失败（${code}）。可改用文字作答。`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const text = answerBuf.current.trim();
      if (text && !busyRef.current && !speakingRef.current) {
        if (autoSubmitTimer.current) return;
        void submitTurn(text);
      }
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setShowTextFallback(true);
      setError("无法启动语音识别，请改用文字作答");
    }
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

  if (!boot && !error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5">
        <p className="text-[var(--muted)]">{status}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-5 py-8">
      <header className="mb-6 w-full text-center">
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">VOICE ONLY · 压力面</p>
        <h1 className="mt-2 text-2xl font-semibold">纯语音模拟面试</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          无字幕对话 · 简单数字人陪练 · 听完后开口作答
        </p>
      </header>

      <DigitalHuman state={avatar} progress={progress} />

      <p className="mt-6 max-w-md text-center text-sm leading-6 text-[var(--text)]">{status}</p>
      {interim ? (
        <p className="mt-2 max-w-lg text-center text-sm text-[var(--accent-2)]">识别到：{interim}</p>
      ) : null}
      {error ? <p className="mt-3 max-w-lg text-center text-sm text-[var(--danger)]">{error}</p> : null}
      {boot?.mockedLlm ? (
        <p className="mt-2 text-xs text-[var(--accent-2)]">LLM 已降级为本地话术</p>
      ) : null}
      {!asrSupported ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          当前浏览器不支持语音识别，请用文字作答或换 Chrome。
        </p>
      ) : null}

      {!audioReady ? (
        <button
          type="button"
          onClick={() => void beginAudioInterview()}
          className="mt-10 rounded-full bg-[var(--accent)] px-8 py-4 text-sm font-semibold text-[#042a26]"
        >
          开启语音面试（授权声音 + 麦克风）
        </button>
      ) : (
        <>
          <div className="relative mt-10">
            {listening ? <span className="voice-ring" /> : null}
            <button
              type="button"
              disabled={busy || avatar === "speaking"}
              onClick={() => void toggleMic()}
              className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                listening
                  ? "border-[var(--accent-2)] bg-[var(--accent-2)]/20 text-[var(--accent-2)]"
                  : "border-[var(--accent)] bg-[var(--accent)] text-[#042a26]"
              }`}
            >
              {listening ? "说完了" : busy ? "…" : "麦克风"}
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={busy || avatar === "speaking" || !lastUtteranceRef.current}
              onClick={() => void playUtterance(lastUtteranceRef.current)}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              重播上一题
            </button>
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
              onClick={() => setShowTextFallback((value) => !value)}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              {showTextFallback ? "收起文字作答" : "文字作答（备用）"}
            </button>
            <button
              type="button"
              onClick={() => void finishNow()}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              提前结束并生成复盘
            </button>
          </div>

          {showTextFallback ? (
            <div className="mt-6 w-full max-w-lg space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)]/80 p-4">
              <p className="text-xs text-[var(--muted)]">
                云端预览或无麦克风时可用文字作答；本机请用 Chrome 并允许麦克风。
              </p>
              <textarea
                value={fallbackText}
                onChange={(e) => setFallbackText(e.target.value)}
                rows={4}
                placeholder="在这里输入你的回答…"
                className="w-full rounded-xl border border-[var(--line)] bg-[#0d1524] p-3 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                disabled={busy || !fallbackText.trim()}
                onClick={() => void submitTurn(fallbackText)}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#042a26] disabled:opacity-50"
              >
                提交文字回答
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
