---
name: deepseek-llm
description: >-
  Integrate or debug DeepSeek as the LLM provider for this mock interviewer.
  Use when adding chat completions, prompts, schema validation, mock fallback,
  or env vars for DeepSeek.
---

# DeepSeek LLM 接入 Skill

## 官方约定（以 api-docs.deepseek.com 为准）

| 项 | 值 |
| --- | --- |
| OpenAI 兼容 `baseURL` | `https://api.deepseek.com`（也可用 `/v1` 别名） |
| Auth | `Authorization: Bearer $DEEPSEEK_API_KEY` |
| 推荐模型（MVP） | `deepseek-flash`（快、够用）；质量不够再试 `deepseek-v4-pro` |
| SDK | 官方 `openai` Node SDK，改 `baseURL` + `apiKey` 即可 |

## 环境变量

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
# 可选：面试话术场景关闭深度思考以降低延迟
DEEPSEEK_THINKING=disabled   # disabled | enabled
```

- Key **只**放在 `.env.local` / 部署环境密钥，禁止提交 git
- 仓库提供 `.env.example` 占位

## 代码落点（实现时）

```
lib/llm/
  client.ts          # OpenAI SDK 指向 DeepSeek
  schemas.ts         # Zod：单问校验、TurnDecision、FeedbackReport、ResumeProfile
  prompts.ts         # 按 action 的 system/user 模板
  generateUtterance.ts
  structureResume.ts
  generateFeedback.ts
  mock.ts            # 无 Key 或超时的剧本回复
```

### client 示例形态

```ts
import OpenAI from "openai";

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  });
}
```

调用时：

- `model`: `process.env.DEEPSEEK_MODEL ?? "deepseek-flash"`
- 面试 **实时话术**：优先低延迟——`thinking: { type: "disabled" }`（若 SDK 需 `extra_body` 则按官方传）
- 简历结构化 / 终场复盘：可按需开启 thinking，但要设超时与 mock 降级

## 强制约束

1. **一次只生成一个问句**；输出后用 schema/正则校验问号数量，违规重试 ≤2 次后走模板话术
2. 必须带 **红线词过滤**（见控场 skill）：命中则重写或换模板
3. 禁止让模型自行选择是否追问/换题——只接收 Rule Engine 下发的 `action`
4. 所有 LLM 输出优先 **JSON mode / 严格 schema**；解析失败 → mock/模板
5. 日志可记 model、latency、是否 mock；**不要**记完整 API Key

## Mock 策略

无 Key、超时、4xx/5xx、JSON 解析失败时：

- `ASK` / `FOLLOW_UP_*` / `REFRAME`：用题库 `followUpHints` + 固定句式
- `SKIP_SOFT`：固定「没关系，这题先过，换个方向聊聊。」
- `FORMULA_DEFLECT`：固定 HR/控场挡回话术
- `finish` 反馈：基于规则分数的模板复盘

保证 **Demo 零 Key 也能走完闭环**。

## 安全与成本

- 服务端 Route Handler 调 DeepSeek，**禁止**把 Key 暴露给浏览器
- 截断简历原文（如 12k chars）再送模型
- 控制 `max_tokens`：话术短（≤120 tokens 级），复盘可更大
- 不要把整场 ASR 原文无限拼进 context；按题窗口滑动

## 自测清单

- [ ] 有 Key：start → turn 返回非空单问
- [ ] 无 Key：同一路径走 mock，前端不白屏
- [ ] 故意让模型输出两问 → 被拦截/重试
- [ ] 红线词「你停一下」「你通过了」不会进 TTS
