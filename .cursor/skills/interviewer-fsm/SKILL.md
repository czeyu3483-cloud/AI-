---
name: interviewer-fsm
description: >-
  Implement or change the mock interview finite-state machine, pressure-style
  parameters, stuck handling, and conduct actions. Use when editing FSM, turn
  decision, silence timers, or interviewer utterances.
---

# 面试状态机 / 控场 Skill

完整条文见 `docs/INTERVIEWER_CONDUCT_RULES.md` 与 `docs/DEMO_ROLE_AND_STYLE.md`。

## Demo 运行时固定

```ts
roleId = "rd_general"
styleChosen = "pressure"
styleResolved = "pressure"
```

## 压力面参数（默认）

| 参数 | 值 |
| --- | --- |
| `silenceThinkingMs` | 2000 |
| `silenceStuckMs` | 6000 |
| `maxFollowUpsPerQuestion` | 3 |
| `maxPressurePerQuestion` | 3 |
| `maxHintsPerQuestion` | **0**（不给方向提示） |
| `maxReframesPerQuestion` | 1 |
| `allowFirstHintOnRequest` | **false** |
| `answerSoftLimitSec` | 70 |
| `answerHardLimitSec` | 110 |
| 追问权重 | boundary / pitfall / ownership ↑ |
| `tone` | `steady_firm` |

## 核心状态

`IDLE → INTRO → ASKING → LISTENING ↔ USER_SPEAKING → (THINKING_WAIT) → … → WRAP_UP → FEEDBACK → ENDED`

另有决策动作：`FOLLOW_UP_*` / `REFRAME` / `SKIP_SOFT` / `TIMEBOX` / `REDIRECT` / `FORMULA_DEFLECT` 等。

## 卡壳（压力面）——必须一致

1. 沉默 ≥ `silenceStuckMs` → 卡壳  
2. 若本轮还有 `REFRAME` 次数 → 换角度重问同一考察点  
3. 否则 → **`SKIP_SOFT`**，固定话术：

> 没关系，这题先过，换个方向聊聊。

**不要**在压力面走「先 HINT_DIRECTION 再换题」的平和路径。

## 红线（生成后过滤）

禁止：`你停一下` / 直接给标准答案 / `通过了`/`挂了` / 嘲讽 / 道歉降难度 / 一次多问。

## 实现要求

- Rule Engine 为纯函数，**可单测**（卡壳、追问计数、红线、一次一问）
- 前后端共用同一套 config 类型
- turn API 返回：`action` + `utterance` + 计数器 + `signals` + `pendingTags`
