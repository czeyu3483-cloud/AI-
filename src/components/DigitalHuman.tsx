"use client";

type AvatarState = "idle" | "speaking" | "listening";

export function DigitalHuman({
  state,
  progress,
  interviewerName,
}: {
  state: AvatarState;
  progress: string;
  interviewerName?: string;
}) {
  const label =
    state === "speaking" ? "面试官正在说话" : state === "listening" ? "正在听你说" : "待命";

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center">
      <div
        className={`dh-stage relative flex aspect-[3/4] w-full max-w-[320px] items-end justify-center overflow-hidden rounded-[1.5rem] border ${
          state === "speaking"
            ? "border-[var(--accent)] dh-glow-speak"
            : state === "listening"
              ? "border-[var(--accent-2)] dh-glow-listen"
              : "border-[var(--line)]"
        }`}
      >
        {/* 办公室虚化背景：铺满，避免与人像硬切 */}
        <div
          className="dh-bg absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/interview/office.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220]/75 via-[#0b1220]/20 to-transparent" />

        {/* 真人面试官：边缘羽化融入背景，不做上下晃动 */}
        <div className={`dh-photo-wrap absolute inset-0 z-10 ${state}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/interview/interviewer.jpg"
            alt={interviewerName || "面试官"}
            className={`dh-photo ${state === "speaking" ? "dh-photo-speak" : ""}`}
          />
        </div>

        {state === "speaking" ? (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full bg-black/35 px-3 py-1.5">
            <i className="dh-bar" />
            <i className="dh-bar delay-1" />
            <i className="dh-bar delay-2" />
            <i className="dh-bar delay-3" />
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-[var(--muted)]">
        {interviewerName ? `${interviewerName} · ${label}` : label}
      </p>
      <p className="mt-1 text-xs tracking-wide text-[var(--muted)]/80">进度 {progress}</p>
    </div>
  );
}
