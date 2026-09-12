export type RoleId = "rd_general" | "pm" | "ops" | "algo";
export type StyleId = "pressure" | "calm" | "random";

export type AbilityTag =
  | "can_reason_trainable"
  | "knowledge_gap_not_learned"
  | "nervous_but_capable"
  | "cannot_solve_after_hint"
  | "surface_knowledge_no_practice"
  | "confident_and_solid"
  | "self_awareness_gap"
  | "weak_independent_problem_solving"
  | "role_mismatch_suspected";

export type InterviewAction =
  | "ASK"
  | "FOLLOW_UP_TRADEOFF"
  | "FOLLOW_UP_BOUNDARY"
  | "FOLLOW_UP_PITFALL"
  | "FOLLOW_UP_OWNERSHIP"
  | "REFRAME"
  | "TIMEBOX"
  | "SKIP_SOFT"
  | "FORMULA_DEFLECT"
  | "CONTINUE_LISTEN"
  | "FINISH";

export type ResumeProfile = {
  rawText: string;
  name?: string;
  /** AI 用自然语言总结的基本信息 */
  summary?: string;
  education: Array<{ school?: string; degree?: string; major?: string }>;
  skills: string[];
  /** 工作/实习等过往经历（由 AI 归纳，不依赖固定关键词） */
  experiences: Array<{
    org?: string;
    title?: string;
    period?: string;
    highlights: string[];
  }>;
  projects: Array<{ name: string; role?: string; stack?: string[]; highlights: string[] }>;
  parseMeta: { source: "paste" | "txt" | "docx" | "pdf"; warnings: string[] };
};

export type Question = {
  id: string;
  roleId: RoleId;
  prompt: string;
  intent: string;
  followUpHints: string[];
  rubrics: Array<{ dimension: string; weight: number; good: string; poor: string }>;
  referencePoints: string[];
  fromResume?: boolean;
};

export type BehaviorConfig = {
  silenceThinkingMs: number;
  silenceNudgeMs: number;
  silenceStuckMs: number;
  maxFollowUpsPerQuestion: number;
  maxPressurePerQuestion: number;
  maxHintsPerQuestion: number;
  maxReframesPerQuestion: number;
  minAnswerChars: number;
  questionsPerSession: number;
  allowFirstHintOnRequest: boolean;
  answerSoftLimitSec: number;
  answerHardLimitSec: number;
  styleChosen: StyleId;
  styleResolved: "pressure" | "calm";
  tone: "steady_firm" | "steady_warm";
};

export type TurnSignals = {
  tooLong?: "timeout";
  /** 答太长且重复啰嗦（与 tooLong 可同时出现） */
  rambling?: boolean;
  /** 候选人明确要思考时间：只回「好的」，不换题 */
  needsTimeToThink?: boolean;
  stuckSubtype?: "not_learned" | "cannot_solve" | "nervous";
  scriptedAnswerSuspicion?: boolean;
  answerRequestCount?: number;
  /** salary/hr → HR 挡回；process/challenge → 领导/面试环节不好说 */
  metaQuestionType?: "salary" | "process" | "challenge_interviewer";
  askedForHint?: boolean;
  explicitGiveUp?: boolean;
  tooShort?: boolean;
  /** 主动承认简历/项目造假或乱写 */
  integrityBreach?: boolean;
  /** 命中 replyBank 条目 id（生产仅 1–30；31–100 待用户提供后再补） */
  replyBankId?: number;
};

export type QuestionRuntime = {
  question: Question;
  followUpCount: number;
  hintCount: number;
  reframeCount: number;
  answerRequestCount: number;
  userAnswers: string[];
  tags: AbilityTag[];
};

export type SessionEvent = { t: string; type: string; payload: unknown };

export type FeedbackReport = {
  overallSummary: string;
  perQuestion: Array<{
    questionId: string;
    prompt: string;
    userAnswer: string;
    scores: Array<{ dimension: string; score: number; evidence: string }>;
    tags: AbilityTag[];
    improvements: string[];
  }>;
  topActions: string[];
  roleId: RoleId;
  styleResolved: "pressure" | "calm";
  /** 因简历/经历诚信问题结束本场时为 true；与软跳过「不会」不同 */
  integrityBreach?: boolean;
};

export type InterviewSession = {
  id: string;
  roleId: RoleId;
  config: BehaviorConfig;
  resume?: ResumeProfile;
  queue: Question[];
  currentIndex: number;
  runtimes: QuestionRuntime[];
  lastUtterance: string;
  lastAction: InterviewAction;
  status: "active" | "finished";
  events: SessionEvent[];
  feedback?: FeedbackReport;
  createdAt: string;
  /** 本场随机面试官称呼，如「王老师」 */
  interviewerName?: string;
};

export type TurnDecision = {
  action: InterviewAction;
  utterance: string;
  questionId?: string;
  followUpCount: number;
  hintCount: number;
  reframeCount: number;
  signals: TurnSignals;
  pendingTags?: AbilityTag[];
  done?: boolean;
  /** replyBank 命中：下游跳过润色，原样播报 */
  verbatim?: boolean;
};
