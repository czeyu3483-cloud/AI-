# 仿真 AI 模拟面试官 · MVP 架构与可执行开发方案

> 范围约束：只覆盖需求中的 In Scope。账号、简历深度解析、表情情绪、PDF/看板、付费等一律不进入本方案实现清单。

---

## 1. 产品一句话与成功标准

**产品**：浏览器内可用的仿真面试官——数字人视频形象 + 双向实时语音，按岗位题库与可配置状态机完成「出题 → 作答 → 有限追问/引导 → 复盘反馈」。

**MVP 成功标准（缺一不可）**

1. 用户选岗位即可开面（无需简历/登录）
2. 面试官以视频数字人 + TTS 语音提问
3. 用户麦克风作答（ASR → 文本）
4. 状态机按规则处理：正常答 / 思考中 / 卡壳，并决定追问、温和提示或下一题
5. 结束后输出结构化复盘；全程有基础日志

**相对通用 ChatGPT 的硬差异（开发不可绕过）**

- 题库 + 评分标准来自可校验知识底座，不全靠自由 Prompt
- 面试官行为是**参数化状态机**，不是模型自由发挥
- 有停顿阈值、追问深度上限、终止条件
- **控场规则产品化**（一次一问、追问取舍/边界、中立白板、翻身机会、反应场景话术、不当场宣判）——详见 [`INTERVIEWER_CONDUCT_RULES.md`](./INTERVIEWER_CONDUCT_RULES.md)

---

## 2. 推荐技术选型（MVP 务实）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| Web | Next.js (App Router) + TypeScript + Tailwind | 单仓前后端、部署快（Vercel 等） |
| UI 原语 | shadcn/ui | 表单/按钮/对话框够用，不花时间造轮子 |
| 会话状态 | 前端状态机（XState 或自研有限状态机）+ 服务端校验同一套规则参数 | 「交互规则」是业务核心，必须显式建模 |
| LLM | 任一稳定 Chat API（Claude / GPT / 国产均可） | 只负责：在规则约束下生成追问话术、评分与反馈文案 |
| ASR | 浏览器优先 Web Speech API；预留云 ASR（如 Whisper/阿里/腾讯）降级开关 | MVP 先跑通；云 ASR 作质量升级 |
| TTS | 流式 TTS API（OpenAI / Azure / 火山等） | 面试官说话；与数字人口型尽量对齐 |
| 数字人 | **MVP 推荐路径 A（见下）** | 控制成本与工期，避免数字人拖垮闭环 |
| 存储 | 本地/服务端 JSON 日志文件或轻量 DB（SQLite/Postgres 任选其一）；会话不要求登录持久化 | 满足「基础日志」即可 |
| 部署 | Vercel（前端+Route Handlers）+ 环境变量管 Key | 公网可访问；无 Key 时 mock 可演示 |

### 数字人方案选择（关键取舍）

| 方案 | 做法 | 工期/风险 | 建议 |
| --- | --- | --- | --- |
| **A. 预渲染口型视频 + TTS 驱动状态** | 准备数字人「倾听 / 说话 / 等待」循环视频或精灵；TTS 播放时切到说话态 | 低，易控 | **MVP 默认** |
| B. 实时数字人 API（HeyGen / D-ID / 腾讯智影等） | TTS 文本驱动生成说话视频流 | 贵、延迟、联调重 | 时间与预算够再替换，接口预留 |
| C. 纯音频 + 静态头像 | 无视频 | 过弱，偏离需求 | 不作主方案 |

**结论**：MVP 用方案 A 兑现「视频数字人形象 + 流式 TTS」；抽象 `AvatarDriver` 接口，二期可换 B。

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Web)                        │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 岗位选择  │→ │ Interview UI│←→│ Avatar   │  │ Mic/ASR  │ │
│  └──────────┘  │ (会话面板)  │  │ Driver   │  └────┬─────┘ │
│                └──────┬──────┘  └────▲─────┘       │       │
│                       │              │ TTS audio   │ text  │
│                       ▼              │             ▼       │
│              ┌────────────────┐      │      ┌────────────┐ │
│              │ Interview FSM  │──────┘      │  Answer    │ │
│              │ (本地状态机)   │◄────────────│  Buffer    │ │
│              └───────┬────────┘             └────────────┘ │
└──────────────────────┼─────────────────────────────────────┘
                       │ HTTPS (出题/追问/评分/日志)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Next.js Route Handlers / API                │
│  /api/interview/start | turn | silence | finish | config    │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │ Rule Engine  │  │ Knowledge   │  │ LLM Adapter        │  │
│  │ (同构规则)   │  │ Base (JSON) │  │ (constrained call) │  │
│  └──────────────┘  └─────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌─────────────┐                          │
│  │ TTS Proxy    │  │ Session Log │                          │
│  └──────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 模块职责（开发按此拆分）

1. **Knowledge Base**：岗位 → 题库条目（题干、考察点、参考要点、建议追问方向、评分维度）
2. **Rule Engine / FSM**：唯一「行为大脑」；决定下一动作，LLM 不得越权改流程
3. **LLM Adapter**：在规则给定的动作类型下生成话术/评分 JSON；带 schema 校验
4. **Speech I/O**：ASR 输入、流式 TTS 输出
5. **Avatar Driver**：根据 FSM 状态切换视频态 + 同步 TTS
6. **Session Logger**：记录岗位、题目、用户文本、状态迁移、动作决策、最终反馈

---

## 4. 核心：面试状态机（业务硬约束）

### 4.1 状态

| 状态 | 含义 |
| --- | --- |
| `IDLE` | 未开始 |
| `INTRO` | 面试官开场 |
| `ASKING` | 出题 / 播报问题（TTS + 数字人说话） |
| `LISTENING` | 等待用户开口（允许留白） |
| `USER_SPEAKING` | 检测到语音输入中 |
| `THINKING_WAIT` | 用户曾开口后沉默，但未超「卡壳阈值」——视为思考，不打断 |
| `STUCK` | 沉默超过 `silenceStuckMs`，判定卡壳 |
| `FOLLOW_UP` | 在深度上限内发起追问 |
| `NUDGE` | 温和提示（鼓励继续 / 换个角度），非新题 |
| `NEXT_QUESTION` | 结束本题，进入下一题 |
| `WRAP_UP` | 收尾话术 |
| `FEEDBACK` | 生成并展示结构化复盘 |
| `ENDED` | 结束 |

### 4.2 可配置参数（必须可调，预留配置入口）

```ts
type InterviewBehaviorConfig = {
  silenceThinkingMs: number;   // 例如 2500：短沉默仍算思考
  silenceStuckMs: number;      // 例如 8000：超过则卡壳
  maxFollowUpsPerQuestion: number; // 例如 2：追问深度上限
  minAnswerChars: number;      // 例如 20：过短回答可触发追问/提示
  questionsPerSession: number; // 例如 3–5
  nudgeBeforeSkip: boolean;    // 卡壳时先提示一次再跳题
  // 控场增量（详见 INTERVIEWER_CONDUCT_RULES.md）
  maxPressurePerQuestion: number;   // 追问+提示+翻身总上限，建议 3
  maxHintsPerQuestion: number;      // 建议 1
  maxReframesPerQuestion: number;   // 建议 1
  answerSoftLimitSec: number;       // 建议 90
  answerHardLimitSec: number;       // 建议 150
  allowFirstHintOnRequest: boolean;
  shortenProbeIfMismatch: boolean;
  singleQuestionOnly: true;
  followUpStyles: Array<"tradeoff" | "boundary" | "pitfall" | "ownership">;
};
```

默认值写进 `config/interview-behavior.json`，UI 可提供简易调试面板（面试页隐藏入口或 `/debug`），方便调参。

### 4.3 关键转移规则（伪逻辑，实现必须对齐）

```
LISTENING:
  - 检测到语音开始 → USER_SPEAKING
  - 沉默 < silenceStuckMs → 继续 LISTENING（允许自然留白）
  - 沉默 ≥ silenceStuckMs 且本题未 hint → STUCK → HINT_DIRECTION
  - 沉默 ≥ silenceStuckMs 且已 hint → SKIP_SOFT → NEXT_QUESTION

USER_SPEAKING:
  - 仍在提供匹配信息 → CONTINUE_LISTEN（不打断）
  - 超时注水 → TIMEBOX；跑题 → REDIRECT（禁说「你停一下」）
  - 语音结束 → 提交 ASR 文本 → 服务端 turn 决策

turn 决策（服务端 Rule Engine，LLM 只辅助分类/生成）:
  - 强制：输出有且仅有 1 个问题（singleQuestionOnly）
  - 追问只允许 tradeoff / boundary / pitfall / ownership
  - 答砸且未翻身 → 可 REFRAME 一次
  - 压力次数达 maxPressurePerQuestion → SKIP_SOFT，不连续死磕
  - 疑似背题 → 优先 PITFALL / OWNERSHIP 细节追问
  - 要答案：第1次可 HINT_DIRECTION，之后 FORMULA_DEFLECT
  - 反问控场 / 薪资加班 → FORMULA_DEFLECT，拿回控场
  - 过度自信 → BOUNDARY，不正面否定
  - 明显不匹配 → SHORTEN_PROBE，仍走完流程
  - 全程禁止当场宣判通过/不通过

THINKING_WAIT:
  - 用于「答了一半停顿」：silenceThinkingMs 内再开口 → 回到 USER_SPEAKING
  - 超过 silenceStuckMs → 按 STUCK 流程

禁止：
  - 一口气多问；无限追问；同题死磕超过压力上限
  - TTS 播报中抢麦；用鼓励/否定话术泄漏标准答案信号
  - 仅靠 Prompt「你自己决定要不要追问」而无状态计数
```

### 4.4 与 LLM 的边界（防幻觉、防自由发挥）

| 决策 | 谁说了算 |
| --- | --- |
| 下一题从哪来 | 题库顺序/抽题策略（规则） |
| 是否追问、是否跳题、用哪类控场动作 | Rule Engine + 计数器 + 场景信号 |
| 追问问什么 | LLM 在 **指定 action + 考察点 + 追问风格** 下生成单句，schema 校验 |
| 是否卡壳 | **仅计时器 + 语音活动检测**，不用模型猜情绪 |
| 最终评分 | 按题库评分维度；强制区分可培养/没学过/紧张等标签；LLM 填证据与改进建议 |

---

## 5. 数据模型（MVP）

### 5.1 知识库（JSON，可人工校验）

```ts
type Question = {
  id: string;
  roleId: string;            // 如 frontend / backend / pm
  level: "basic" | "mid";  // MVP 可只用 basic
  prompt: string;            // 题干
  intent: string;            // 考察点
  followUpHints: string[];   // 建议追问方向（人工写）
  rubrics: { dimension: string; weight: number; good: string; poor: string }[];
  referencePoints: string[]; // 参考要点，抑制胡评
};

type Role = {
  id: string;
  title: string;             // 如「大厂前端实习一面」
  intro: string;
  questionIds: string[];
};
```

MVP 先做 **2 个岗位 × 每岗 5–8 题**（人工写好），够演示与练习；后台扩充 = 改 JSON / 简单管理页（管理页可极简，甚至先手改文件）。

### 5.2 会话日志

```ts
type SessionLog = {
  sessionId: string;
  roleId: string;
  config: InterviewBehaviorConfig;
  startedAt: string;
  events: Array<{
    t: string;
    type: "state" | "question" | "asr" | "decision" | "tts" | "feedback";
    payload: unknown;
  }>;
  feedback?: FeedbackReport;
};
```

### 5.3 复盘反馈结构

```ts
type AbilityTag =
  | "can_reason_trainable"
  | "knowledge_gap_not_learned"
  | "nervous_but_capable"
  | "cannot_solve_after_hint"
  | "surface_knowledge_no_practice"
  | "confident_and_solid"
  | "self_awareness_gap"
  | "weak_independent_problem_solving"
  | "role_mismatch_suspected";

type FeedbackReport = {
  overallSummary: string;
  perQuestion: Array<{
    questionId: string;
    userAnswer: string;
    scores: Array<{ dimension: string; score: number; evidence: string }>;
    tags: AbilityTag[]; // 必须区分：不会/没学过、紧张/不会等
    improvements: string[]; // 可执行，最多 3 条/题
  }>;
  topActions: string[]; // 全局 3 条下一步练习建议
  // 不当场宣判：此处也不输出通过/不通过结论，只给能力画像与改进
};
```

---

## 6. API 草图（Route Handlers）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/roles` | 岗位列表 |
| `POST` | `/api/interview/start` | 创建 session，返回开场稿 + 第一题 + config |
| `POST` | `/api/interview/turn` | 上报 ASR 文本与当前题上下文 → 返回 decision + 话术 |
| `POST` | `/api/interview/silence` | 上报沉默超时事件 → 返回 nudge / skip |
| `POST` | `/api/interview/finish` | 生成结构化反馈 |
| `POST` | `/api/tts` | 文本 → 音频流（或 URL） |
| `GET` | `/api/config/behavior` | 读行为参数 |
| `PUT` | `/api/config/behavior` | 调参（调试用，可不做鉴权但勿暴露到生产公网乱改） |
| `GET` | `/api/logs/:sessionId` | 拉取本场日志 |

ASR：MVP 默认浏览器端完成，文本经 `turn` 上传；若切云 ASR，另加 `/api/asr` 但不阻塞主路径。

---

## 7. 前端页面（只做必要页）

1. **首页 / 选岗**：岗位卡片 →「开始面试」
2. **面试页（主界面）**
   - 左侧/全幅：数字人视频区
   - 下方或侧栏：字幕（面试官话术 + 用户 ASR 实时文本）
   - 状态指示：倾听中 / 请作答 / 思考中（弱提示，不打扰）
   - 控制：静音、结束面试（无登录）
3. **复盘页**：结构化反馈；可「再面一场」
4. **（可选）调试页**：行为参数滑杆

不做：仪表盘、历史列表、账号墙、复杂设置中心。

---

## 8. MVP 可执行开发方案（按依赖排序）

### Phase A · 骨架与知识底座（先于花活）

1. Next.js 脚手架、基础布局、环境变量模板
2. 写入 2 岗位题库 JSON + 评分维度（人工校验）
3. 实现 Rule Engine 纯函数 + 单元测试（状态迁移、追问计数、停顿阈值、**控场动作与红线词**）
4. 固化话术模板库：`TIMEBOX` / `REDIRECT` / `SKIP_SOFT` / `FORMULA_DEFLECT` 等
5. `start / turn / silence / finish` API 打通（TTS/数字人先返回纯文本）
6. 反馈强制输出 AbilityTag（可培养 / 没学过 / 紧张 等）

**阶段出口**：纯文字模式下完整跑通「选岗 → 一次一问 → 取舍/边界追问 → 卡壳提示后换题 → 长答收束/跑题拉回 → 结构化标签反馈 + 日志」

### Phase B · 语音双向

1. 麦克风权限 + ASR（Web Speech，失败时降级「按住说话/文本输入」兜底，避免演示翻车）
2. 流式 TTS 播放队列；与 FSM 的 `ASKING`/`FOLLOW_UP`/`NUDGE` 绑定
3. VAD/静音检测对接 `silenceThinkingMs` / `silenceStuckMs`
4. 播报中锁定提交，避免抢话

**阶段出口**：戴耳机可完成一场语音面试（允许偶发 ASR 误差）

### Phase C · 数字人视频形象

1. 准备倾听/说话/等待素材；实现 `AvatarDriver`
2. TTS `playing` ↔ 说话态；结束回倾听态
3. 弱网/加载失败时降级静态图 + 音频（不阻断闭环）

**阶段出口**：观感接近线上面试；链路仍受 FSM 约束

### Phase D · 复盘、日志、调参、交付

1. 反馈页 UI + `finish` 质量打磨（建议可执行、有证据）
2. Session 日志落盘/可下载
3. 行为参数配置入口
4. README、公网部署、无 Key 时的 mock 演示路径
5. Demo 脚本按闭环录制

---

## 9. 建议目录结构

```
/app
  /page.tsx                 # 选岗
  /interview/[id]/page.tsx
  /feedback/[id]/page.tsx
  /api/...
/components
  avatar/, interview/, feedback/
/lib
  fsm/                      # 状态机与规则（核心）
  knowledge/                # 题库加载
  llm/                      # 约束调用 + schema
  speech/                   # tts client helpers
  logging/
/content
  roles/*.json
  questions/*.json
/config
  interview-behavior.json
```

---

## 10. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 数字人/实时视频拖垮工期 | 方案 A 预渲染；接口抽象可替换 |
| ASR 不准导致误判卡壳 | 沉默规则只看「无有效语音活动」；提供文本兜底 |
| LLM 乱追问/胡评 | 决策在 Rule Engine；题库 rubrics + JSON schema |
| TTS 延迟像抢话 | 播放队列 + ASKING 锁听写；留白参数偏保守默认 |
| API 额度/Key | mock 剧本模式保证 Demo 可演 |

---

## 11. 明确不做（防 scope creep）

- 注册登录、云端历史
- 简历上传与深度解析
- 表情/眼神/情绪
- 多人面试、PDF 长报告、数据看板、付费
- 压力面/温和面风格切换（可把 `style` 留字段，UI 不做）
- 海量岗位；MVP 2 岗即可

---

## 12. 验收清单（开发完成自检）

- [ ] 选岗 → 开面，无登录
- [ ] 数字人视频态 + TTS 提问可感知
- [ ] 麦克风作答进入流程
- [ ] 沉默未超阈值不被打断；超阈值触发提示或下一题
- [ ] 追问次数有上限，达上限进下一题
- [ ] **一次只问一个问题**；追问聚焦取舍/边界/坑/ownership
- [ ] 长答可收束、跑题可拉回；无「你停一下」
- [ ] 卡壳有翻身/方向提示，不连续死磕；要答案有次数限制
- [ ] 反问控场/薪资等公式化挡回；全程不当场宣判
- [ ] 复盘区分可培养 / 没学过 / 紧张等标签
- [ ] 结束有结构化复盘
- [ ] 本场日志可查（题目/回答/状态决策）
- [ ] 停顿阈值、追问深度可配置
- [ ] 题库内容可打开人工校验（非纯模型生成题）

---

## 13. 推荐默认参数（可开箱演示）

```json
{
  "silenceThinkingMs": 2500,
  "silenceStuckMs": 8000,
  "maxFollowUpsPerQuestion": 2,
  "minAnswerChars": 30,
  "questionsPerSession": 4,
  "nudgeBeforeSkip": true
}
```

---

**方案结论**：以 **「知识库 + 同构面试状态机」为中枢**，LLM/TTS/ASR/数字人皆为受控外设；开发顺序必须是 **文字闭环 → 语音 → 数字人 → 复盘交付**，避免一上来陷进数字人与多媒体联调而闭环未通。
