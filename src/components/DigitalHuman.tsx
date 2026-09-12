"use client";

type AvatarState = "idle" | "speaking" | "listening";

export function DigitalHuman({
  state,
  progress,
}: {
  state: AvatarState;
  progress: string;
}) {
  const label =
    state === "speaking" ? "面试官正在提问" : state === "listening" ? "正在倾听你的回答" : "待命";

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center">
      <div
        className={`dh-stage relative flex aspect-[3/4] w-full max-w-[320px] items-end justify-center overflow-hidden rounded-[2rem] border ${
          state === "speaking"
            ? "border-[var(--accent)] dh-glow-speak"
            : state === "listening"
              ? "border-[var(--accent-2)] dh-glow-listen"
              : "border-[var(--line)]"
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,#243552_0%,#121a2b_62%,#0b1220_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0b1220]/90 to-transparent" />

        <div className={`dh-figure relative z-10 mb-6 ${state}`}>
          <div className="dh-head">
            <div className="dh-hair" />
            <div className="dh-face">
              <div className="dh-eyes">
                <span />
                <span />
              </div>
              <div className={`dh-mouth ${state === "speaking" ? "talk" : ""}`} />
            </div>
          </div>
          <div className="dh-torso">
            <div className="dh-collar" />
          </div>
        </div>

        {state === "speaking" && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-1">
            <i className="dh-bar" />
            <i className="dh-bar delay-1" />
            <i className="dh-bar delay-2" />
            <i className="dh-bar delay-3" />
          </div>
        )}
      </div>

      <p className="mt-4 text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xs tracking-wide text-[var(--muted)]/80">进度 {progress}</p>
    </div>
  );
}
