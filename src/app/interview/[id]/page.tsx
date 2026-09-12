"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CodingStep } from "@/components/CodingStep";
import { DigitalHuman } from "@/components/DigitalHuman";
import { getCodingProblem } from "@/lib/codingProblems";
import { phaseLabel } from "@/lib/phases";
import { BARGE_IN_LINE, shouldBargeIn } from "@/lib/persona";
import {
  ensureMicPermission,
  fetchTtsBlob,
  getSpeechRecognitionCtor,
  pickZhVoice,
} from "@/lib/speech";
import type {
  BehaviorConfig,
  CodingProblem,
  FeedbackReport,
  InterviewPhase,
  Question,
} from "@/lib/types";

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
  answerSoftLimitSec?: number;
  answerHardLimitSec?: number;
  phase?: InterviewPhase;
  codingProblem?: CodingProblem | null;
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
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [answerRemainSec, setAnswerRemainSec] = useState<number | null>(null);
  const [answerSoftHit, setAnswerSoftHit] = useState(false);
  const [phase, setPhase] = useState<InterviewPhase | null>(null);
  const [codingProblem, setCodingProblem] = useState<CodingProblem | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);


  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const answerBuf = useRef("");
  const lastUtteranceRef = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const bargedRef = useRef(false);
  const wantListenRef = useRef(false);
  const audioReadyRef = useRef(false);
  /** Bumped on intentional stop / new session so stale onend/onerror cannot surface errors or restart. */
  const recogGenRef = useRef(0);
  const interviewEndedRef = useRef(false);
  /** True after final transcript was handed to submitTurn. */
  const submittedRef = useRef(false);
  const softLimitRef = useRef<number | null>(null);
  const hardLimitRef = useRef<number | null>(null);
  const listenStartedAtRef = useRef<number | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const softNudgeSpokenRef = useRef(false);
  const submitTurnRef = useRef<(text: string, silenceStuck?: boolean) => Promise<void>>(
    async () => undefined,
  );

  const progress = useMemo(() => `${Math.min(index + 1, total)} / ${total}`, [index, total]);
  const inCoding = Boolean(codingProblem || currentQuestion?.isCoding || phase === "coding");

  function syncCodingFromQuestion(q: Question | null | undefined, explicit?: CodingProblem | null) {
    setCurrentQuestion(q || null);
    if (explicit) {
      setCodingProblem(explicit);
      setPhase("coding");
      return;
    }
    if (q?.isCoding && q.codingProblemId) {
      setCodingProblem(getCodingProblem(q.codingProblemId) || null);
      setPhase("coding");
      return;
    }
    setCodingProblem(null);
    if (q?.phase) setPhase(q.phase);
  }

  function clearAnswerTimer() {
    if (answerTimerRef.current) {
      clearInterval(answerTimerRef.current);
      answerTimerRef.current = null;
    }
    listenStartedAtRef.current = null;
    setAnswerRemainSec(null);
    setAnswerSoftHit(false);
    softNudgeSpokenRef.current = false;
  }

  function applyAnswerLimits(soft?: number | null, hard?: number | null) {
    softLimitRef.current =
      typeof soft === "number" && soft > 0 ? soft : null;
    hardLimitRef.current =
      typeof hard === "number" && hard > 0 ? hard : null;
  }

  function startAnswerTimer() {
    clearAnswerTimer();
    const hard = hardLimitRef.current;
    const soft = softLimitRef.current;
    if (!hard && !soft) return;
    listenStartedAtRef.current = Date.now();
    const limit = hard || soft || 0;
    setAnswerRemainSec(limit);
    setAnswerSoftHit(false);
    softNudgeSpokenRef.current = false;

    answerTimerRef.current = setInterval(() => {
      if (!listenStartedAtRef.current) return;
      if (busyRef.current || interviewEndedRef.current || submittedRef.current) {
        clearAnswerTimer();
        return;
      }
      const elapsed = (Date.now() - listenStartedAtRef.current) / 1000;
      const softSec = softLimitRef.current;
      const hardSec = hardLimitRef.current;
      const remain = Math.max(0, Math.ceil((hardSec || softSec || 0) - elapsed));
      setAnswerRemainSec(remain);

      if (softSec && elapsed >= softSec && !softNudgeSpokenRef.current) {
        softNudgeSpokenRef.current = true;
        setAnswerSoftHit(true);
        setStatus("时间差不多了，请收束；到点会自动提交");
      }

      if (hardSec && elapsed >= hardSec) {
        clearAnswerTimer();
        wantListenRef.current = false;
        const text = answerBuf.current.trim() || "（时间到，作答截止）";
        stopRecognition();
        setStatus("时间到，正在提交…");
        void submitTurnRef.current(text, true);
      }
    }, 250);
  }

  function stopRecognition() {
    wantListenRef.current = false;
    recogGenRef.current += 1;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    listeningRef.current = false;
    setListening(false);
    clearAnswerTimer();
  }

  function markInterviewEnded(message?: string) {
    interviewEndedRef.current = true;
    setInterviewEnded(true);
    wantListenRef.current = false;
    stopRecognition();
    if (message) setStatus(message);
  }

  function isInterviewOverPayload(data: {
    done?: boolean;
    action?: string;
    signals?: { integrityBreach?: boolean; replyBankId?: number };
  }) {
    return Boolean(
      data.done ||
        data.action === "FINISH" ||
        data.signals?.integrityBreach,
    );
  }

  async function speakRaw(text: string): Promise<void> {
    if (!text.trim()) return;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();

    // 防止 TTS 挂起导致 busy 永不解除（自我介绍后无法点麦）
    const budgetMs = Math.min(90_000, Math.max(12_000, text.length * 350));

    try {
      const blob = await Promise.race([
        fetchTtsBlob(text),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TTS 超时")), Math.min(budgetMs, 25_000)),
        ),
      ]);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            audio.pause();
          } catch {
            // ignore
          }
          URL.revokeObjectURL(url);
          resolve();
        }, budgetMs);
        audio.onended = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          reject(new Error("音频播放失败"));
        };
        void audio.play().catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
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
      const timer = setTimeout(() => {
        window.speechSynthesis?.cancel();
        resolve();
      }, budgetMs);
      utterance.onend = () => {
        clearTimeout(timer);
        resolve();
      };
      utterance.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  /** 播报面试官话术：期间停 ASR，结束后不自动开麦 */
  async function playUtterance(text: string, opts?: { ended?: boolean }) {
    lastUtteranceRef.current = text;
    speakingRef.current = true;
    setAvatar("speaking");
    setStatus(
      opts?.ended
        ? "面试官正在收尾…"
        : "面试官正在说…听完后再点麦克风回答",
    );
    stopRecognition();
    answerBuf.current = "";
    bargedRef.current = false;
    setInterim("");

    await speakRaw(text);

    speakingRef.current = false;
    if (opts?.ended || interviewEndedRef.current) {
      setAvatar("idle");
      setStatus("本场已结束，正在整理复盘…");
      return;
    }
    setAvatar("idle");
    setStatus(
      codingProblem
        ? "编程环节：在下方编辑器手写并跑测"
        : "说完了。点麦克风开始说，再说一次结束并提交",
    );
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
            answerSoftLimitSec: json.answerSoftLimitSec,
            answerHardLimitSec: json.answerHardLimitSec,
            phase: json.phase,
            codingProblem: json.codingProblem || null,
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
      lastUtteranceRef.current = data.utterance;
      syncCodingFromQuestion(data.question, data.codingProblem);
      if (data.phase) setPhase(data.phase);
      applyAnswerLimits(
        data.answerSoftLimitSec ?? data.config?.answerSoftLimitSec,
        data.answerHardLimitSec ?? data.config?.answerHardLimitSec,
      );
      // 仅当开场话术/题目暗示限时时启用（answerLimitsForAction 已过滤）
      if (data.answerSoftLimitSec == null && data.answerHardLimitSec == null) {
        applyAnswerLimits(null, null);
      }
      setStatus("点一下下方按钮，开启语音（浏览器要手动授权声音）");
    }

    void bootSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    };
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
    if (busyRef.current || !sessionId || interviewEndedRef.current) return;
    if (codingProblem || currentQuestion?.isCoding || phase === "coding") {
      setError("编程环节请在编辑器中提交代码");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInterim("");
    setFallbackText("");
    answerBuf.current = "";
    bargedRef.current = false;
    submittedRef.current = true;
    wantListenRef.current = false;
    stopRecognition();
    setStatus("思考中…");
    setAvatar("idle");

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
      if (data.phase) setPhase(data.phase as InterviewPhase);
      syncCodingFromQuestion(data.question, data.codingProblem);

      if (data.answerSoftLimitSec != null || data.answerHardLimitSec != null) {
        applyAnswerLimits(data.answerSoftLimitSec, data.answerHardLimitSec);
      } else {
        applyAnswerLimits(null, null);
      }

      const over = isInterviewOverPayload(data);
      const nextLine = String(data.utterance || "");

      if (over) {
        clearAnswerTimer();
        markInterviewEnded("面试官正在收尾…");
        if (nextLine) {
          try {
            await playUtterance(nextLine, { ended: true });
          } catch {
            // 收尾播报失败也要进复盘，不能继续答题
          }
        }
        markInterviewEnded("先到这儿，我帮你整理复盘…");
        if (data.feedback) {
          sessionStorage.setItem(
            `feedback:${sessionId}`,
            JSON.stringify(data.feedback as FeedbackReport),
          );
        }
        setTimeout(() => router.push(`/feedback/${sessionId}`), 700);
        return;
      }

      if (nextLine) {
        await playUtterance(nextLine);
      }
      if (data.question?.isCoding || data.codingProblem) {
        setStatus("编程环节：在下方编辑器手写并跑测");
      } else if (data.phase === "self_intro") {
        // 补充追问后主动露出文字通道，避免 ASR 过短反复卡死
        setShowTextFallback(true);
        setStatus("介绍可以再展开一点；说完点麦克风提交，或用文字作答");
      } else if (data.phase && data.phase !== "coding") {
        setStatus("说完了。点麦克风开始说，再说一次结束并提交");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "回合失败");
      setStatus("出了点小状况，点麦克风再说一次也行");
      setAvatar("idle");
    } finally {
      submittedRef.current = false;
      if (!interviewEndedRef.current) {
        busyRef.current = false;
        setBusy(false);
      } else {
        // Keep controls disabled after intentional end.
        busyRef.current = true;
        setBusy(true);
      }
    }
  }

  submitTurnRef.current = submitTurn;

  async function handleCodingSubmitted(payload: {
    codingResult: import("@/lib/types").CodingRunResult;
    utterance?: string;
    done?: boolean;
    feedback?: unknown;
    index?: number;
    total?: number;
    question?: unknown;
    phase?: string;
  }) {
    if (typeof payload.index === "number") setIndex(payload.index);
    if (typeof payload.total === "number") setTotal(payload.total);
    if (payload.phase) setPhase(payload.phase as InterviewPhase);
    syncCodingFromQuestion(payload.question as Question | null);

    const nextLine = String(payload.utterance || "");
    if (payload.done) {
      markInterviewEnded("面试官正在收尾…");
      if (nextLine) {
        try {
          await playUtterance(nextLine, { ended: true });
        } catch {
          // ignore
        }
      }
      if (payload.feedback) {
        sessionStorage.setItem(
          `feedback:${sessionId}`,
          JSON.stringify(payload.feedback as FeedbackReport),
        );
      }
      setTimeout(() => router.push(`/feedback/${sessionId}`), 700);
      return;
    }
    if (nextLine) await playUtterance(nextLine);
  }

  async function maybeBargeIn(partial: string) {
    if (
      bargedRef.current ||
      busyRef.current ||
      speakingRef.current ||
      interviewEndedRef.current ||
      codingProblem
    ) {
      return;
    }
    if (!shouldBargeIn(partial)) return;
    bargedRef.current = true;
    stopRecognition();
    speakingRef.current = true;
    setAvatar("speaking");
    setStatus("这块有点笼统，我插一句");
    try {
      await speakRaw(BARGE_IN_LINE);
    } finally {
      speakingRef.current = false;
      setAvatar("idle");
      setStatus("接着说细一点就行——再点麦克风继续");
      // 保留已说内容；需用户再次点麦继续，不自动开麦
    }
  }

  async function startListening(opts?: { keepBuffer?: boolean }) {
    if (!audioReadyRef.current || busyRef.current || interviewEndedRef.current) return;
    if (codingProblem || phase === "coding") {
      setError("编程环节请用编辑器作答");
      return;
    }
    if (speakingRef.current) {
      setError("等我说完再开口就行");
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setAsrSupported(false);
      setShowTextFallback(true);
      setError("这个浏览器不好识别语音，换 Chrome，或用文字答也行");
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

    if (listeningRef.current && recognitionRef.current) {
      wantListenRef.current = true;
      setStatus("正在听你说…再说一次麦克风结束并提交");
      setAvatar("listening");
      return;
    }

    // Invalidate any in-flight handlers from a prior instance before starting a new one.
    recogGenRef.current += 1;
    const myGen = recogGenRef.current;
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
    submittedRef.current = false;
    if (!opts?.keepBuffer) {
      answerBuf.current = "";
      bargedRef.current = false;
      setInterim("");
    }
    setStatus("正在听你说…再说一次麦克风结束并提交");
    setAvatar("listening");
    setError("");
    if (!opts?.keepBuffer || !answerTimerRef.current) {
      startAnswerTimer();
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (myGen !== recogGenRef.current) return;
      if (speakingRef.current || busyRef.current || interviewEndedRef.current) return;

      let finalChunk = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]![0]!.transcript;
        if (event.results[i]!.isFinal) finalChunk += piece;
        else live += piece;
      }
      if (finalChunk || live) {
        // Successful ASR must clear prior false errors (e.g. aborted after stop).
        setError("");
      }
      if (finalChunk) {
        answerBuf.current += finalChunk;
        void maybeBargeIn(answerBuf.current);
      }
      setInterim(`${answerBuf.current}${live}`.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (myGen !== recogGenRef.current) return;
      listeningRef.current = false;
      setListening(false);
      const code = event.error || "unknown";

      // Intentional stop / already submitted / interview over: never surface as failure.
      if (
        !wantListenRef.current ||
        busyRef.current ||
        submittedRef.current ||
        interviewEndedRef.current
      ) {
        return;
      }
      if (code === "aborted" || code === "no-speech") {
        // no-speech while still holding the mic: quietly continue listening
        if (
          code === "no-speech" &&
          wantListenRef.current &&
          !busyRef.current &&
          !speakingRef.current &&
          !interviewEndedRef.current
        ) {
          setTimeout(() => {
            if (
              myGen === recogGenRef.current &&
              wantListenRef.current &&
              !busyRef.current &&
              !speakingRef.current &&
              !interviewEndedRef.current
            ) {
              void startListening({ keepBuffer: true });
            }
          }, 200);
        }
        return;
      }
      if (code === "not-allowed") {
        wantListenRef.current = false;
        setShowTextFallback(true);
        setError("麦克风权限被拒了，改用文字答也行");
      } else {
        setShowTextFallback(true);
        setError(`语音识别有点问题（${code}）。可以先文字答。`);
      }
    };

    recognition.onend = () => {
      if (myGen !== recogGenRef.current) return;
      listeningRef.current = false;
      setListening(false);
      // 浏览器会周期性停掉 continuous；用户仍想说时重启，绝不因静默自动提交
      if (
        wantListenRef.current &&
        !busyRef.current &&
        !speakingRef.current &&
        !submittedRef.current &&
        !interviewEndedRef.current &&
        audioReadyRef.current
      ) {
        setTimeout(() => {
          if (
            myGen === recogGenRef.current &&
            wantListenRef.current &&
            !busyRef.current &&
            !speakingRef.current &&
            !submittedRef.current &&
            !interviewEndedRef.current &&
            !listeningRef.current
          ) {
            void startListening({ keepBuffer: true });
          }
        }, 180);
      }
    };

    try {
      recognition.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      if (myGen !== recogGenRef.current) return;
      setShowTextFallback(true);
      setError("语音识别起不来，先用文字答吧");
    }
  }

  async function toggleMic() {
    if (!audioReady) {
      setError("先点「开启语音面试」");
      return;
    }
    if (interviewEndedRef.current || interviewEnded) return;
    if (codingProblem || phase === "coding") {
      setError("编程环节请用编辑器作答");
      return;
    }
    if (busyRef.current) return;
    if (speakingRef.current) {
      setError("等我说完再开口就行");
      return;
    }
    if (listeningRef.current || wantListenRef.current) {
      // 第二次点击：停止并提交
      wantListenRef.current = false;
      const text = answerBuf.current.trim();
      stopRecognition();
      if (text) void submitTurn(text);
      else {
        setStatus("我还没听清，再点麦克风说一遍？");
        setAvatar("idle");
      }
      return;
    }
    void startListening();
  }

  async function finishNow() {
    if (interviewEndedRef.current) return;
    markInterviewEnded("正在结束并生成复盘…");
    busyRef.current = true;
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
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">语音面试</p>
        <h1 className="mt-2 text-2xl font-semibold">和{interviewerName}聊聊</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {interviewEnded
            ? "本场面试已结束"
            : codingProblem
              ? "编程环节：手写代码并跑测"
              : "听完后点麦克风开始说，再说一次结束并提交"}
        </p>
        {phase ? (
          <p className="mt-1 text-xs text-[var(--accent-2)]">阶段 · {phaseLabel(phase)}</p>
        ) : null}
      </header>

      <DigitalHuman state={avatar} progress={progress} interviewerName={interviewerName} />

      <p className="mt-6 max-w-md text-center text-sm leading-6 text-[var(--text)]">{status}</p>
      {listening && answerRemainSec != null ? (
        <p
          className={`mt-2 text-center text-sm ${
            answerSoftHit ? "text-[var(--danger)]" : "text-[var(--accent-2)]"
          }`}
        >
          {answerSoftHit ? "请收束 · " : "作答剩余 "}
          {answerRemainSec}s
          {hardLimitRef.current ? "（到点自动提交）" : ""}
        </p>
      ) : null}
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
          {codingProblem && !interviewEnded ? (
            <CodingStep
              problem={codingProblem}
              sessionId={sessionId}
              disabled={busy || avatar === "speaking"}
              onSubmitted={(p) => void handleCodingSubmitted(p)}
            />
          ) : (
            <div className="relative mt-10">
              {listening ? <span className="voice-ring" /> : null}
              <button
                type="button"
                disabled={busy || interviewEnded || avatar === "speaking" || Boolean(codingProblem)}
                onClick={() => void toggleMic()}
                className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                  listening
                    ? "border-[var(--accent-2)] bg-[var(--accent-2)]/20 text-[var(--accent-2)]"
                    : "border-[var(--accent)] bg-[var(--accent)] text-[#042a26]"
                } disabled:opacity-50`}
              >
                {interviewEnded ? "已结束" : listening ? "说完了" : busy ? "…" : "麦克风"}
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={busy || interviewEnded || avatar === "speaking" || !lastUtteranceRef.current}
              onClick={() => void playUtterance(lastUtteranceRef.current)}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
            >
              重播上一句
            </button>
            {!codingProblem ? (
              <button
                type="button"
                disabled={busy || interviewEnded || avatar === "speaking"}
                onClick={() => void submitTurn("我不会")}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
              >
                模拟卡壳
              </button>
            ) : null}
            {!codingProblem ? (
              <button
                type="button"
                disabled={interviewEnded}
                onClick={() => setShowTextFallback((value) => !value)}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
              >
                {showTextFallback ? "收起文字作答" : "文字作答（备用）"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={interviewEnded}
              onClick={() => void finishNow()}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
            >
              提前结束并生成复盘
            </button>
          </div>

          {showTextFallback && !interviewEnded && !codingProblem ? (
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
