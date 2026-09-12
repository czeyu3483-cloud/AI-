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
  | "transfer_experience_shown"
  /** 口述与简历冲突：真实性风险（未到诚信结束红线） */
  | "authenticity_risk";

export type InterviewAction =
  | "ASK"
  | "FOLLOW_UP_TRADEOFF"
  | "FOLLOW_UP_BOUNDARY"
  | "FOLLOW_UP_PITFALL"
  | "FOLLOW_UP_OWNERSHIP"
  | "REFRAME"
  /** 候选人要求复述：原样重播上一句/当前题，禁止改写 */
  | "REPEAT"
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

/** 业务面显式阶段（约 30–40 分钟体感） */
export type InterviewPhase =
  | "resume_research"
  | "resume_deep_dive"
  | "professional_knowledge"
  | "coding"
  | "hr_fit";

/** 简历冲突等级 1–5（分析 + decideTurn + 复盘共用） */
export type ResumeConflictLevel = 1 | 2 | 3 | 4 | 5;

export type ResumeConflictKind =
  | "direct_contradiction"
  | "role_drift"
  | "contribution_inflation"
  | "fuzzy_detail"
  | "stack_mismatch"
  | "stack"
  | "metric"
  | "ownership"
  | "project_claim"
  | "role"
  | "timeline"
  | "other";

/** 候选人对冲突挑战的解释归类 */
export type ConflictExplainOutcome =
  | "ok_incomplete_resume"
  | "chaotic_integrity_risk"
  | "memory_fuzzy"
  | "admits_fabricate"
  | "pending";

export type Question = {
  id: string;
  roleId: RoleId;
  /** 所属轨道；缺省视为业务面 */
  trackId?: TrackId;
  /** 显式面试阶段 */
  phase?: InterviewPhase;
  prompt: string;
  intent: string;
  followUpHints: string[];
  rubrics: Array<{ dimension: string; weight: number; good: string; poor: string }>;
  referencePoints: string[];
  fromResume?: boolean;
  /** 编程题：跳过语音主路径，走编辑器提交 */
  isCoding?: boolean;
  codingProblemId?: string;
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
  /** 候选人要求把问题/上一句再说一遍 */
  repeatRequest?: boolean;
  /** 口述与简历存在可挑战的冲突 */
  resumeConflict?: boolean;
  /** 简历一致性分析：挑战 / 升级诚信结束 */
  resumeConflictSeverity?: "challenge" | "integrity";
  /** 冲突等级 1–5 */
  resumeConflictLevel?: ResumeConflictLevel;
  /** 冲突解释归类 */
  conflictExplainOutcome?: ConflictExplainOutcome;
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
  /** 本题「简历冲突」挑战次数（上限 1） */
  resumeConflictProbeCount: number;
  /** 当前分级提示档位 0=未提示 */
  hintLevel: 0 | 1 | 2 | 3;
  /** 本题作答独立性（复盘用） */
  answerIndependence?: "independent" | "after_hint" | "still_cant";
  userAnswers: string[];
  tags: AbilityTag[];
};

export type SessionEvent = { t: string; type: string; payload: unknown };

export type FeedbackBand = "强" | "中" | "弱" | "风险" | "严重";

export type FeedbackDimensionScore = {
  dimension: string;
  /** 1–5；诚信严重项可为 1 */
  score: number;
  /** 强 / 中 / 弱 / 风险 / 严重（诚信红线专用） */
  band: FeedbackBand;
  weight: number;
  evidence: string;
};

export type HireRecommendation = "推荐通过" | "保留待定" | "不推荐";

export type ResumeConflictRecord = {
  level: ResumeConflictLevel;
  kind: ResumeConflictKind;
  resumeSide: string;
  answerSide: string;
  questionId?: string;
  utterance?: string;
  /** 挑战后解释归类 */
  explainOutcome?: ConflictExplainOutcome;
  /** 简历原文摘录（证据） */
  resumeExcerpt?: string;
  source?: "llm" | "heuristic";
};

export type CodingTestCase = {
  name: string;
  args: unknown[];
  expected: unknown;
};

export type CodingProblem = {
  id: string;
  title: string;
  prompt: string;
  starterCode: string;
  language: "javascript" | "typescript";
  tests: CodingTestCase[];
  complexityHint?: string;
};

export type CodingRunResult = {
  problemId: string;
  title: string;
  code: string;
  passed: boolean;
  total: number;
  passedCount: number;
  failedTests: Array<{ name: string; expected: unknown; actual: unknown }>;
  complexityNotes?: string;
  error?: string;
  durationMs?: number;
  ranAt: string;
  /** 候选人主动跳过编程题（不记硬性失败） */
  skipped?: boolean;
};

export type TechCorrectnessNote = {
  questionId?: string;
  note: string;
  severity: "info" | "warn" | "error";
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
  /** 本场存在口述与简历冲突（真实性风险） */
  authenticityRisk?: boolean;
  /** 诚信维度已单独标为严重/风险 */
  integritySevere?: boolean;
  /** 推荐通过 / 保留待定 / 不推荐（练习建议，非录用） */
  recommendation?: HireRecommendation;
  /** 下一轮准备建议 */
  nextRoundAdvice?: string[];
  /** 诚信风险旗标（含未到红线的风险） */
  integrityRiskFlag?: boolean;
  /** 简历冲突清单（含等级与证据） */
  resumeConflicts?: ResumeConflictRecord[];
  /** 技术正确性备注 */
  techCorrectnessNotes?: TechCorrectnessNote[];
  /** 编程环节跑测结果 */
  codingResults?: CodingRunResult[];
  /** 简历原文摘录（端到端保留，供证据） */
  resumeRawExcerpt?: string;
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
  /** 本场已对「口述 vs 简历」做过专业挑战的次数（≥1 后再冲突可升级诚信结束） */
  authenticityChallengeCount?: number;
  /** 当前阶段（与 queue[current].phase 对齐） */
  currentPhase?: InterviewPhase;
  /** 本场累积的简历冲突记录（含等级） */
  resumeConflicts?: ResumeConflictRecord[];
  /** 编程题跑测记录 */
  codingResults?: CodingRunResult[];
  /** 待裁决的冲突挑战（等下一答解释） */
  pendingConflictChallenge?: ResumeConflictRecord | null;
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
  /** 本题作答软时限（秒）；客户端应展示倒计时 / 软收束 */
  answerSoftLimitSec?: number;
  /** 本题作答硬时限（秒）；到时自动停麦并提交 */
  answerHardLimitSec?: number;
};

/** 简历一致性 Agent 分析结果（LLM 优先，启发式兜底） */
export type ResumeConsistencyAnalysis = {
  conflict: boolean;
  /** challenge=专业质疑；integrity=反复/明显造假 → 结束 */
  severity: "none" | "challenge" | "integrity";
  /** 冲突等级 1–5；无冲突时可不设 */
  level?: ResumeConflictLevel;
  kind?: ResumeConflictKind;
  resumeSide?: string;
  answerSide?: string;
  /** 推荐挑战话术（可再润色） */
  utterance?: string;
  /** 简历原文摘录证据 */
  resumeExcerpt?: string;
  source: "llm" | "heuristic";
};
