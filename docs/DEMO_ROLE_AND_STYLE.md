# Demo 范围：单研发岗 + 面试风格

> 演示收敛：**仅 1 个岗位（研发岗）**；开面前必选面试风格 **压力 / 平和 / 随机**。

---

## 1. 岗位

| 字段 | Demo 取值 |
| --- | --- |
| `roleId` | `rd_general` |
| 展示名 | 研发岗（软件开发实习/校招一面） |
| 题库 | 5–8 道基础+项目深挖模板；再叠加简历项目题 1–2 道 |
| 选岗 UI | **可隐藏多岗选择**；首页直接展示「研发岗模拟面试」或单卡片确认 |

不做：产品/运营/多研发细分（前端/后端/算法拆成多岗）——二期再扩。

---

## 2. 面试风格 `InterviewStyle`

```ts
type InterviewStyleChoice = "pressure" | "calm" | "random";
type InterviewStyleResolved = "pressure" | "calm"; // 开场后落库的实际风格
```

| 用户选项 | 含义 |
| --- | --- |
| **压力** | 更短留白、更深追问、更少提示、边界题更密；语气更紧（仍中立白板，不辱骂、不人身攻击） |
| **平和** | 更长思考留白、追问偏引导、卡壳更易给方向、收束更柔 |
| **随机** | `start` 时 50/50 解析为 pressure 或 calm，复盘与 PDF 标明「本场实际风格」 |

**红线（两种风格共通，来自控场规则）**

- 一次一问；不暗示答案；不当场宣判；不道歉妥协标准
- 压力 ≠ 嘲讽/打断羞辱；平和 ≠ 泄题/狂夸

---

## 3. 风格 → 行为参数映射

`start` 时：`choice` → `resolved` → merge 进 `InterviewBehaviorConfig`。

| 参数 | 平和 `calm` | 压力 `pressure` |
| --- | --- | --- |
| `silenceThinkingMs` | 3000 | 2000 |
| `silenceStuckMs` | 10000 | 6000 |
| `maxFollowUpsPerQuestion` | 2 | 3 |
| `maxPressurePerQuestion` | 2 | 3 |
| `maxHintsPerQuestion` | 1 | 0（卡壳直接 SKIP_SOFT，或仅 REFRAME） |
| `maxReframesPerQuestion` | 1 | 1 |
| `nudgeBeforeSkip` / 允许首问要提示 | true | false（要答案直接 FORMULA_DEFLECT） |
| `answerSoftLimitSec` | 100 | 70 |
| `answerHardLimitSec` | 160 | 110 |
| `followUpStyles` 权重 | tradeoff ≥ boundary；少 pitfall | boundary / pitfall / ownership 提高 |
| TTS/话术语气标签 | `tone: "steady_warm"` | `tone: "steady_firm"` |
| 开场白 | 说明可思考、会给方向提示 | 说明节奏偏紧、少提示、侧重边界与细节 |

实现：`config/styles/calm.json` + `config/styles/pressure.json`，禁止在 Prompt 里写死两套互相打架的规则。

---

## 4. 对 FSM / LLM 的影响

| 模块 | 平和 | 压力 |
| --- | --- | --- |
| 卡壳 | HINT_DIRECTION → 再 SKIP_SOFT | 倾向更快 SKIP_SOFT；翻身用 REFRAME 换角度而非给思路 |
| 追问 | 取舍为主，语气探索 | 边界/坑/具体配置更密 |
| 长答 | 偏 CONTINUE_LISTEN | 更快 TIMEBOX |
| 背题嫌疑 | 仍追细节，话术更缓 | 同动作，话术更短、更直接 |
| 数字人 | 仍仅倾听/说话/等待 | 同左（不靠表情施压） |

LLM 系统提示增加：`style: calm|pressure` + 对应语气约束；**动作仍由 Rule Engine 决定**。

---

## 5. UI 流程

```
首页（研发岗）→ 选择风格：压力 | 平和 | 随机
            → 简历输入
            → 开始面试
```

- 风格用三段清晰选项（非花哨），默认建议 **平和**（降低首用挫败）
- 面试页弱展示当前风格徽章（如「本场：压力」）；随机解析后显示实际风格
- PDF / 复盘封面写明：`用户选择` + `实际风格`

---

## 6. API

`POST /api/interview/start` body 增加：

```ts
{
  roleId: "rd_general",
  style: "pressure" | "calm" | "random",
  resumeProfile?: ResumeProfile
}
```

响应：

```ts
{
  sessionId: string,
  styleChosen: InterviewStyleChoice,
  styleResolved: InterviewStyleResolved,
  config: InterviewBehaviorConfig,
  introUtterance: string,
  firstQuestion: ...
}
```

`/api/roles` Demo 可只返回一个研发岗，或前端写死。

---

## 7. 验收补项

- [ ] Demo 仅研发岗可开面（无其它岗位入口，或入口禁用）
- [ ] 可选压力 / 平和 / 随机；随机场次实际风格写入日志与 PDF
- [ ] 同简历同题库下，压力场沉默阈值更短、提示更少（可用 debug 面板对照 config）
- [ ] 压力风格无侮辱/嘲讽话术；平和风格无泄题
- [ ] 两种风格均遵守一次一问与不当场宣判
