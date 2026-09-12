"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DigitalHuman } from "@/components/DigitalHuman";
import {
  BARGE_IN_LINE,
  DONT_INTERRUPT_LINE,
  pickFiller,
  shouldBargeIn,
} from "@/lib/persona";
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
  interviewerName?: string;
  candidateName?: string;
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
  const [interviewerName, setInterviewerName] = useState("王老师");

  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const answerBuf = useRef("");
  const lastUtteranceRef = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const bargedRef = useRef(false);
  const interruptCooldownRef = useRef(false);
  const wantListenRef = useRef(false);
  const audioReadyRef = useRef(false);
  const speakStartedAtRef = useRef(0);
  const doneMsRef = useRef(900);
  const stuckMsRef = useRef(4500);

  const progress = useMemo(() => `${Math.min(index + 1, total)} / ${total}`, [index, total]);

  function clearTimers() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);
    stuckTimer.current = null;
    doneTimer.current = null;
  }

  function stopRecognition() {
    wantListenRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    listeningRef.current = false;
    setListening(false);
  }

  function resetStuckTimer() {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (speakingRef.current || busyRef.current || listeningRef.current) return;
    stuckTimer.current = setTimeout(() => {
      void submitTurn("", true);
    }, stuckMsRef.current);
  }

  async function speakRaw(text: string): Promise<void> {
    if (!text.trim()) return;
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
      return;
    } catch {
      // browser TTS fallback
    }

    if (!window.speechSynthesis) return;

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
  }

  async function playUtterance(text: string, opts?: { autoListen?: boolean }) {
    const autoListen = opts?.autoListen !== false;
    lastUtteranceRef.current = text;
    speakingRef.current = true;
    speakStartedAtRef.current = Date.now();
    setAvatar("speaking");
    setStatus("面试官正在说…你听完再答");
    clearTimers();
    // 不清掉识别：播报期间继续听，方便提醒别抢话（依赖回声消除）
    answerBuf.current = "";
    bargedRef.current = false;
    setInterim("");
    wantListenRef.current = true;
    if (audioReadyRef.current) {
      void startListening({ continuous: true, keepBuffer: true, allowWhileSpeaking: true });
    }

    await speakRaw(text);

    speakingRef.current = false;
    setAvatar("listening");
    setStatus("轮到你了，直接说就行；说完稍停我会接话");
    if (autoListen && audioReadyRef.current) {
      void startListening({ continuous: true });
    } else {
      resetStuckTimer();
    }
  }

  async function handleCandidateInterrupt() {
    if (!speakingRef.current || interruptCooldownRef.current || busyRef.current) return;
    interruptCooldownRef.current = true;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    speakingRef.current = true;
    speakStartedAtRef.current = Date.now();
    setAvatar("speaking");
    setStatus("先听完我说哦");
    setError("");
    answerBuf.current = "";
    setInterim("");
    try {
      await speakRaw(DONT_INTERRUPT_LINE);
    } finally {
      speakingRef.current = false;
      interruptCooldownRef.current = false;
      setAvatar("listening");
      setStatus("好，继续说你的回答");
      void startListening({ continuous: true });
    }
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
            interviewerName: json.interviewerName,
            candidateName: json.candidateName || "",
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
      setInterviewerName(data.interviewerName || "王老师");
      doneMsRef.current = data.config.silenceThinkingMs ?? 900;
      stuckMsRef.current = data.config.silenceStuckMs ?? 4500;
      lastUtteranceRef.current = data.utterance;
      setStatus("点一下下方按钮，开启语音（浏览器要手动授权声音）");
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
    audioReadyRef.current = true;
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
      setError("没法开麦克风。可以先用文字答，或检查浏览器权限。");
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
    bargedRef.current = false;
    clearTimers();
    stopRecognition();

    if (silenceStuck) {
      setStatus("好像卡住了，我换个角度…");
    } else {
      setStatus("嗯，我听一下…");
      setAvatar("speaking");
      speakingRef.current = true;
      try {
        await speakRaw(pickFiller());
      } catch {
        // ignore filler failure
      }
      speakingRef.current = false;
      setAvatar("idle");
    }

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
        setStatus("先到这儿，我帮你整理复盘…");
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
      setStatus("出了点小状况，你再说一次也行");
      setAvatar("listening");
      void startListening({ continuous: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function scheduleDoneSubmit() {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => {
      const text = answerBuf.current.trim();
      if (!text || busyRef.current || speakingRef.current) return;
      void submitTurn(text);
    }, doneMsRef.current);
  }

  async function maybeBargeIn(partial: string) {
    if (bargedRef.current || busyRef.current || speakingRef.current) return;
    if (!shouldBargeIn(partial)) return;
    bargedRef.current = true;
    if (doneTimer.current) clearTimeout(doneTimer.current);
    stopRecognition();
    speakingRef.current = true;
    setAvatar("speaking");
    setStatus("这块有点笼统，我插一句");
    try {
      await speakRaw(BARGE_IN_LINE);
    } finally {
      speakingRef.current = false;
      setAvatar("listening");
      setStatus("接着说细一点就行");
      // 保留已说内容，让对方补细节后再提交
      void startListening({ continuous: true, keepBuffer: true });
    }
  }

  async function startListening(opts?: {
    continuous?: boolean;
    keepBuffer?: boolean;
    allowWhileSpeaking?: boolean;
  }) {
    if (!audioReadyRef.current || busyRef.current) return;
    if (speakingRef.current && !opts?.allowWhileSpeaking) return;

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setAsrSupported(false);
      setShowTextFallback(true);
      setError("这个浏览器不好识别语音，换 Chrome，或用文字答也行");
      resetStuckTimer();
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
      setError("麦克风没开。地址栏允许一下，或改用文字答。");
      return;
    }

    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);

    // 已在听就别重复起
    if (listeningRef.current && recognitionRef.current) {
      wantListenRef.current = true;
      if (!speakingRef.current) {
        setStatus("我在听，你边说边组织就行；说完稍停我会接");
        setAvatar("listening");
      }
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    wantListenRef.current = true;
    if (!opts?.keepBuffer) {
      answerBuf.current = "";
      bargedRef.current = false;
      setInterim("");
    }
    if (!speakingRef.current) {
      setStatus("我在听，你边说边组织就行；说完稍停我会接");
      setAvatar("listening");
    }
    setError("");

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // 面试官说话时你开口 → 提醒别抢话（播报开头 0.8s 忽略，减轻回声误触）
      if (speakingRef.current) {
        if (Date.now() - speakStartedAtRef.current < 800) return;
        let heard = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          heard += event.results[i]![0]!.transcript;
        }
        if (heard.replace(/\s+/g, "").length >= 4) {
          void handleCandidateInterrupt();
        }
        return;
      }
      if (busyRef.current) return;

      let finalChunk = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]![0]!.transcript;
        if (event.results[i]!.isFinal) finalChunk += piece;
        else live += piece;
      }
      if (finalChunk) {
        answerBuf.current += finalChunk;
        // 一句一句先存下；短停顿后判定说完
        scheduleDoneSubmit();
        void maybeBargeIn(answerBuf.current);
      } else if (live) {
        // 还在说：取消「说完」计时
        if (doneTimer.current) clearTimeout(doneTimer.current);
      }
      setInterim(`${answerBuf.current}${live}`.trim());
      if (stuckTimer.current) clearTimeout(stuckTimer.current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      listeningRef.current = false;
      setListening(false);
      const code = event.error || "unknown";
      if (code === "aborted") return;
      if (code === "not-allowed") {
        setShowTextFallback(true);
        setError("麦克风权限被拒了，改用文字答也行");
      } else if (code === "no-speech") {
        // 静默结束很常见，继续听
        if (wantListenRef.current && !busyRef.current && !speakingRef.current) {
          setTimeout(() => void startListening({ continuous: true, keepBuffer: true }), 200);
        }
      } else {
        setShowTextFallback(true);
        setError(`语音识别有点问题（${code}）。可以先文字答。`);
      }
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
      // 浏览器会周期性停掉 continuous；还在等回答就自动重启
      if (
        wantListenRef.current &&
        !busyRef.current &&
        !speakingRef.current &&
        audioReadyRef.current
      ) {
        const text = answerBuf.current.trim();
        if (text && !doneTimer.current) {
          // 已经有内容且没有待提交计时，稍等后提交
          scheduleDoneSubmit();
        }
        setTimeout(() => {
          if (
            wantListenRef.current &&
            !busyRef.current &&
            !speakingRef.current &&
            !listeningRef.current
          ) {
            void startListening({ continuous: true, keepBuffer: true });
          }
        }, 180);
        return;
      }

      const text = answerBuf.current.trim();
      if (text && !busyRef.current && !speakingRef.current && !doneTimer.current) {
        void submitTurn(text);
      }
    };

    try {
      recognition.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      setShowTextFallback(true);
      setError("语音识别起不来，先用文字答吧");
      resetStuckTimer();
    }
  }

  async function toggleMic() {
    if (!audioReady) {
      setError("先点「开启语音面试」");
      return;
    }
    if (speakingRef.current) {
      setError("等我说完再开口就行");
      return;
    }
    if (listeningRef.current) {
      // 手动说完
      if (doneTimer.current) clearTimeout(doneTimer.current);
      wantListenRef.current = false;
      stopRecognition();
      const text = answerBuf.current.trim();
      if (text) void submitTurn(text);
      else setStatus("我还没听清，再说一遍？");
      return;
    }
    void startListening({ continuous: true });
  }

  async function finishNow() {
    setBusy(true);
    stopRecognition();
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
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">语音面试</p>
        <h1 className="mt-2 text-2xl font-semibold">和{interviewerName}聊聊</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          听完再答 · 说完稍停会自动接话 · 讲得太笼统时可能会插一句
        </p>
      </header>

      <DigitalHuman state={avatar} progress={progress} interviewerName={interviewerName} />

      <p className="mt-6 max-w-md text-center text-sm leading-6 text-[var(--text)]">{status}</p>
      {interim ? (
        <p className="mt-2 max-w-lg text-center text-sm text-[var(--accent-2)]">刚听到：{interim}</p>
      ) : null}
      {error ? <p className="mt-3 max-w-lg text-center text-sm text-[var(--danger)]">{error}</p> : null}
      {boot?.mockedLlm ? (
        <p className="mt-2 text-xs text-[var(--accent-2)]">当前走本地话术（未连上大模型）</p>
      ) : null}
      {!asrSupported ? (
        <p className="mt-2 text-xs text-[var(--muted)]">当前浏览器不支持语音识别，请用文字或换 Chrome。</p>
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
              重播上一句
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
                没麦克风时可用文字；本机请尽量用 Chrome 并允许麦克风。
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
