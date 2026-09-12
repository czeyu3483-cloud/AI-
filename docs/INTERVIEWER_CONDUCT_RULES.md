# 面试官控场规则 · MVP 产品化映射

> 来源：真实面试官提问/控场/边界准则。  
> 原则：**写成规则引擎动作 + 固定话术模板 + 评估标签**，不全靠自由 Prompt。  
> 本文只定义 MVP 必须编码的行为；表情微动作等 Out of Scope 项不实现。  
> **风格**：UI 可展示压力/平和/随机；Demo **仅压力面可选**，只改变参数与追问密度（见 [`DEMO_ROLE_AND_STYLE.md`](./DEMO_ROLE_AND_STYLE.md)），不改变本章红线。

---

## 0. 总原则（全场生效）

| # | 规则 | MVP 实现方式 |
| --- | --- | --- |
| 5 | 一次只问一个问题 | FSM 每次 `ASKING`/`FOLLOW_UP`/`NUDGE` 只允许输出 **1 句问句**；LLM schema 校验 `questionCount===1`，违规重生成 |
| 6 | 追问追「取舍/边界」，不停留「是什么」 | 追问类型枚举：`tradeoff` \| `boundary` \| `pitfall` \| `ownership`；禁止 `definition_only` |
| 7 | 保持中立白板，不暗示答案 | 话术禁词表：禁止「很好/对的/没错/真棒」及点头式肯定；数字人仅倾听/说话/等待三态，无点头鼓励动画 |
| 8 | 给「翻身」机会 | 答砸后允许 **1 次** `REFRAME`（换角度）或 **1 次** `HINT_DIRECTION`（给方向不给答案），计入有限深度 |
| 9 | 区分不会/没学过、紧张/不会 | 复盘强制标签（见 §3），不可只给一个笼统分数 |
| 10 | 不妥协标准、不道歉 | 候选人要求换题/降难度 → `HOLD_STANDARD` 公式化回应，不换核心考察点 |
| 11 | 不当场宣判 | 全程禁止输出「通过/不通过/录用」；结果只在结束后的评估报告 |

---

## 1. 动作目录（Rule Engine 可下发的 `action`）

LLM **不得**自行选择动作；只在引擎指定的 `action` 下生成符合模板的单句话术。

| action | 含义 | 触发条件（摘要） | 话术约束 |
| --- | --- | --- | --- |
| `ASK` | 出下一主问题 | 开场后 / 上一题结束 | 单问；来自题库 |
| `FOLLOW_UP_TRADEOFF` | 追问取舍 | 回答提到多方案/多点但未比较 | 「如果只能选一个…为什么」 |
| `FOLLOW_UP_BOUNDARY` | 追问边界/失效场景 | 方案陈述完整或过度自信 | 「什么场景下会失效」 |
| `FOLLOW_UP_PITFALL` | 追问坑与失败方案 | 过于流畅/疑似背题 | 「失败方案？为何放弃？改了哪处」 |
| `FOLLOW_UP_OWNERSHIP` | 追问「我」的细节 | 只说「我们」、无个人动作 | 「你具体负责哪一段」 |
| `REFRAME` | 换角度翻身 | 本題答砸且尚未 reframe | 换表述重问同一考察点，不换新考点 |
| `HINT_DIRECTION` | 给方向不给答案 | 卡壳/明确不会但可培养；每题最多 1 次 | 提示思考路径，禁止直接答案 |
| `TRIM_LONG` | 长答收口 | 有效信息仍在但啰嗦 | 取舍式追问收口 |
| `TIMEBOX` | 超时温和收束 | 单题超时或明显注水 | 「时间关系，这个点后面再展开」 |
| `REDIRECT` | 跑题拉回 | 离题 | 「先回到刚才那个问题」；**禁止**「你停一下」 |
| `SKIP_SOFT` | 卡壳换题 | 提示后仍卡 / 同题追问达上限 | 「没关系，这题先过，换个方向聊聊」 |
| `FORMULA_DEFLECT` | 公式化挡回 | 反问控场、要答案（第2次+）、薪资/加班等 | 客气疏离，不正面展开 |
| `CONTINUE_LISTEN` | 继续听 | 长答仍在提供匹配信息 | 无话术 / 不打断 |
| `WRAP_NEUTRAL` | 中性收尾 | 流程结束 | 不宣判结果 |
| `SHORTEN_PROBE` | 缩短深挖 | 明显不匹配但仍走完 | 减少追问，保持尊重，不羞辱 |

---

## 2. 候选人反应场景 → 规则映射

### 场景 1：回答太长

**判断**：这段话是否还在为「是否匹配岗位」提供有效信息。

| 子类 | 判定信号（MVP 可实现） | action |
| --- | --- | --- |
| 正常的长 | 仍命中考察点/rubric 关键词，时长未超 `answerSoftLimitSec` | `CONTINUE_LISTEN`；结束后可用 `TRIM_LONG` |
| 明显超时 | 超过 `answerHardLimitSec`，或重复率高、信息增益下降 | `TIMEBOX` |
| 跑题 | 与本题 `intent` 相关度低（规则+LLM 二分类，以规则阈值为主） | `REDIRECT` |

**红线**：话术库不得出现「你停一下」。

### 场景 2：答不出来 / 卡壳

1. 先分类：`not_learned`（没学过） vs `cannot_solve`（不会但可能推理） vs `nervous_expression`（表达乱但有内容）
2. 给方向不给答案：`HINT_DIRECTION`（每题 ≤1）
3. **不连续死磕**：同题 `followUpCount + hintCount + reframeCount` 达 `maxPressurePerQuestion`（建议 2–3）→ `SKIP_SOFT`
4. 固定话术：「没关系，这题先过，换个方向聊聊。」

### 场景 3：明显在背题

**识别信号（MVP 启发式，写入日志供复盘）**

- 流畅度异常高 + 术语密集 + 缺少数字/配置/个人动作
- 首轮完整，一追问细节即崩
- 主语多为「我们」，少「我」

**应对**：优先 `FOLLOW_UP_PITFALL` / `FOLLOW_UP_OWNERSHIP` / 具体配置级追问。

**评估**：追问后仍能给真实细节 → 可合格；完全崩 → 标签 `surface_knowledge_no_practice`（知识面有但无实践）。  
背题 ≠ 直接判不合格。

### 场景 4：被反问面试（抢控场）

- action：`FORMULA_DEFLECT`
- 客气疏离、公式化、不正面展开、立刻回到下一问或原问
- 红线：面试官拿回控场，不被带节奏

### 场景 6：过度自信 / 轻视问题

- 不否定；用 `FOLLOW_UP_BOUNDARY`：「这个方案在什么场景下会失效？」
- 评估：`confident_and_solid` vs `self_awareness_gap`（自信无料）

### 场景 8：要求提示 / 要答案

| 次数 | 行为 |
| --- | --- |
| 第 1 次 | 可 `HINT_DIRECTION`（方向不给答案） |
| 第 2 次及以后 | `FORMULA_DEFLECT`，不再给提示 |
| 反复要答案 | 评估标签 `weak_independent_problem_solving` |

### 场景 9：反问薪资 / 转正 / 加班

- `FORMULA_DEFLECT` 固定句：
  - 「薪资由 HR 统一沟通。」
  - 「转正与绩效相关，模拟面试环节不讨论具体标准。」
- 不承诺、不展开，然后回到流程

### 场景 10：明显不匹配岗位

- 仍走完主流程；`SHORTEN_PROBE` 减少深挖
- 语气保持尊重；禁止敷衍羞辱式话术
- 评估写明 mismatch 维度，不当场宣判

---

## 3. 评估报告强制标签（复盘页）

每题 / 全局需能落到下列区分（可多选，但「不会 vs 没学过」「紧张 vs 不会」必须尝试标注）：

```ts
type AbilityTag =
  | "can_reason_trainable"          // 不会但能推理 = 可培养
  | "knowledge_gap_not_learned"     // 完全没概念 = 没学过/盲区
  | "nervous_but_capable"           // 紧张导致表达乱 ≠ 能力差
  | "cannot_solve_after_hint"       // 给方向后仍无法推进
  | "surface_knowledge_no_practice" // 背题崩：有面无实践
  | "confident_and_solid"
  | "self_awareness_gap"            // 自信 + 无料
  | "weak_independent_problem_solving"
  | "role_mismatch_suspected";
```

报告文案模板必须写清「是哪种」，禁止只写「回答一般」。

---

## 4. 话术红线词表（TTS/生成后过滤）

**禁止输出（命中则重写）**

- 否定打断：「你停一下」「别说了」「你错了」
- 暗示答案：「正确答案是」「你应该说」「标准答案」
- 当场宣判：「你通过了」「你挂了」「我们不会录用」
- 过度鼓励泄漏：「太棒了」「完全正确」「就是这个」
- 道歉妥协：「对不起这题太难了」「那我们换简单的」

**允许的中性承接**

- 「嗯，我记一下。」（中性，不评价对错）
- 「时间关系，这个点后面再展开。」
- 「这个点后面再聊，先回到刚才那个问题。」
- 「没关系，这题先过，换个方向聊聊。」
- 「我更想了解当时的取舍。」

---

## 5. 配置项增量（并入 `InterviewBehaviorConfig`）

```ts
type InterviewBehaviorConfig = {
  // 原有停顿/追问
  silenceThinkingMs: number;
  silenceStuckMs: number;
  maxFollowUpsPerQuestion: number;
  minAnswerChars: number;
  questionsPerSession: number;
  nudgeBeforeSkip: boolean;

  // 控场增量
  maxPressurePerQuestion: number;   // 追问+提示+翻身总压测上限，建议 3
  maxHintsPerQuestion: number;      // 建议 1
  maxReframesPerQuestion: number;   // 建议 1
  answerSoftLimitSec: number;       // 建议 90
  answerHardLimitSec: number;       // 建议 150
  allowFirstHintOnRequest: boolean; // 场景8：第一次要提示可给方向
  shortenProbeIfMismatch: boolean;  // 场景10
  singleQuestionOnly: true;         // 恒 true：一次一问
  followUpStyles: Array<"tradeoff" | "boundary" | "pitfall" | "ownership">;
};
```

---

## 6. turn API 决策输出扩展

```ts
type TurnDecision = {
  action: /* 见 §1 */;
  utterance: string;          // 必须单问或单句控场话术
  questionId: string;
  followUpCount: number;
  hintCount: number;
  reframeCount: number;
  signals: {
    tooLong?: "productive" | "timeout" | "off_topic";
    stuckSubtype?: "not_learned" | "cannot_solve" | "nervous";
    scriptedAnswerSuspicion?: boolean;
    answerRequestCount?: number;
    metaQuestionType?: "salary" | "offer" | "process" | "challenge_interviewer" | "other";
    mismatchSuspected?: boolean;
  };
  // 本回合不评分宣判；标签累积到 finish
  pendingTags?: AbilityTag[];
};
```

---

## 7. 与数字人/语音的约束

- 中立白板：无点头、无微笑鼓励、无摇头否定动画（仅倾听/说话/等待）
- TTS 语气：平稳、少感叹；禁止夸张鼓励韵律（能配音色则选「沉稳面试官」）
- `ASKING`/`FOLLOW_UP` 播报期间不抢麦；长答 `CONTINUE_LISTEN` 时数字人保持倾听态

---

## 8. MVP 实现优先级

| 优先级 | 内容 |
| --- | --- |
| P0 | 一次一问校验；追问类型限 tradeoff/boundary/pitfall/ownership；卡壳 hint→skip；红线词过滤；不当场宣判 |
| P0 | 长答：软/硬时限 + REDIRECT/TIMEBOX/TRIM_LONG；禁止「你停一下」 |
| P0 | 翻身：每题 1 次 REFRAME 或 HINT_DIRECTION |
| P1 | 背题启发式信号 + 细节追问树；评估标签写入反馈 |
| P1 | 要提示次数、反问控场、薪资等 `FORMULA_DEFLECT` |
| P1 | 不匹配时 SHORTEN_PROBE |
| P2（可后期） | 更精细的「紧张 vs 不会」分类准确率；背题检测模型化 |

---

## 9. 验收用例（控场专项）

1. 引擎生成话术若含两个「？」→ 拒绝并重试  
2. 用户连续讲 3 分钟注水 → 出现 TIMEBOX，且无「你停一下」  
3. 跑题聊兴趣 → REDIRECT 拉回原题  
4. 卡壳 → 至多 1 次方向提示 → 再卡则 SKIP_SOFT  
5. 流畅背题后追问配置细节 → 走 PITFALL/OWNERSHIP  
6. 「你觉得我表现怎么样，过了吗？」→ 公式化挡回，不宣判  
7. 「直接告诉我答案」第二次 → 拒绝给答案并记标签  
8. 问薪资 → HR 公式句，继续面试  
9. 复盘中能看到「可培养 / 没学过 / 紧张」等区分，而非单句「一般」
