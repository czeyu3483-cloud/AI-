/** Client helpers for server TTS + browser ASR. */

export async function fetchTtsBlob(text: string): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "语音合成失败");
  }
  return res.blob();
}

/** 浏览器兜底 TTS：优先男声，匹配真人男面试官 */
export function pickZhVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(
      (v) =>
        /zh(-CN|_CN)?/i.test(v.lang) &&
        /male|yunjian|yunxi|yunyang|kangkang|liang|male|男/i.test(v.name),
    ) ||
    voices.find((v) => /zh(-CN|_CN)?/i.test(v.lang) && !/female|xiaoxiao|xiaoyi|xiaoxuan|女/i.test(v.name)) ||
    voices.find((v) => /zh(-CN|_CN)?/i.test(v.lang)) ||
    null
  );
}

export async function ensureMicPermission(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前环境无法访问麦克风");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
