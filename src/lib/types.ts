export type RoleId = "rd_general" | "pm" | "ops" | "algo";
export type StyleId = "pressure" | "calm" | "random";
/** 研发岗下面试轨道：业务面（技术深挖） / HR终面（适配与动机） */
export type TrackId = "biz" | "hr_final";
/** 校招/实习 vs 社招；影响深度预期（Demo 默认 campus） */
export type CandidateLevel = "campus" | "social";

export type AbilityTag =
  | "can_reason_trainable"
  | "knowledge_gap_not_learned"
  | "nervous_but_capable"
  | "cannot_solve_after_hint"
  | "surface_knowledge_no_practice"
  | "confident_and_solid"
  | "self_awareness_gap"
  | "weak_independent_problem_solving"
  | "role_mismatch_suspected"
  /** 反复空泛/笼统，细节不足 */
  | "vague_insufficient_detail"
  /** 提示后仍答出关键点 */
  | "answered_after_hint"
  /** 没做过本题域，但给出了可评估的相邻迁移 */
  | "transfer_experience_shown";

export type InterviewAction =
  | "ASK"
  | "FOLLOW_UP_TRADEOFF"
  | "FOLLOW_UP_BOUNDARY"
  | "FOLLOW_UP_PITFALL"
  | "FOLLOW_UP_OWNERSHIP"
  | "REFRAME"
  | "HINT_DIRECTION"
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
  /** 所属轨道；缺省视为业务面 */
  trackId?: TrackId;
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
  /** 空泛追问上限：至多 1 次短探，再软换题 */
  maxVagueFollowUpsPerQuestion: number;
};

export type TurnSignals = {
  tooLong?: "timeout";
  /** 答太长且重复啰嗦（与 tooLong 可同时出现） */
  rambling?: boolean;
  /** 表达乱但有内容 → 可教练结构化，不单独判挂 */
  needsCoach?: boolean;
  /** 候选人明确要思考时间：只回「好的」，不换题 */
  needsTimeToThink?: boolean;
  stuckSubtype?: "not_learned" | "cannot_solve" | "nervous";
  /** 「没做过」：问相邻迁移，不等于不会/造假 */
  notDoneBefore?: boolean;
  /** 细节含糊可疑，交叉核实（未承认造假前不结束） */
  fabricationSuspicion?: boolean;
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
  /** 回答空泛/笼统/不够细致 */
  vague?: boolean;
};

export type QuestionRuntime = {
  question: Question;
  followUpCount: number;
  hintCount: number;
  reframeCount: number;
  answerRequestCount: number;
  /** 本题已对空泛回答做过的短探次数（上限见 config） */
  vagueFollowUpCount: number;
  /** 本题已做过的结构化教练次数（上限 1） */
  coachCount: number;
  /** 本题「没做过」迁移追问次数（上限 1） */
  transferProbeCount: number;
  /** 当前分级提示档位 0=未提示 */
  hintLevel: 0 | 1 | 2 | 3;
  /** 本题作答独立性（复盘用） */
  answerIndependence?: "independent" | "after_hint" | "still_cant";
  userAnswers: string[];
  tags: AbilityTag[];
};

export type SessionEvent = { t: string; type: string; payload: unknown };

export type FeedbackDimensionScore = {
  dimension: string;
  /** 1–5 */
  score: number;
  /** 强 / 中 / 弱 / 风险 */
  band: "强" | "中" | "弱" | "风险";
  weight: number;
  evidence: string;
};

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
  /** 轨道加权的六维评价 */
  dimensions?: FeedbackDimensionScore[];
  topActions: string[];
  roleId: RoleId;
  trackId?: TrackId;
  candidateLevel?: CandidateLevel;
  styleResolved: "pressure" | "calm";
  /** 因简历/经历诚信问题结束本场时为 true；与软跳过「不会」不同 */
  integrityBreach?: boolean;
  /** 本场存在反复空泛、细节不足 */
  vagueInsufficientDetail?: boolean;
};

export type InterviewSession = {
  id: string;
  roleId: RoleId;
  /** 业务面 / HR终面 */
  trackId: TrackId;
  /** 校招/实习（默认）或社招 */
  candidateLevel: CandidateLevel;
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
  /** 会话级能力标签（跨题汇总，如 vague_insufficient_detail） */
  sessionTags?: AbilityTag[];
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
