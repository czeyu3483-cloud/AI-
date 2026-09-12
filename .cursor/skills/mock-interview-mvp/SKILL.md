---
name: mock-interview-mvp
description: >-
  Build and change the AI mock interviewer MVP. Use when scaffolding, coding,
  refactoring, or reviewing this repo's interview product, FSM, demo scope,
  or delivery checklist.
---

# 仿真 AI 模拟面试官 · 开发 Skill

## 何时使用

实现/修改本项目任何功能前先读本 skill，并按需打开：

| 主题 | 文档 |
| --- | --- |
| 总架构与排期 | `docs/MVP_ARCHITECTURE_AND_PLAN.md` |
| Demo 岗位/风格可选态 | `docs/DEMO_ROLE_AND_STYLE.md` |
| 控场规则 | `docs/INTERVIEWER_CONDUCT_RULES.md` |
| 简历 + PDF | `docs/RESUME_AND_PDF_REPORT.md` |
| DeepSeek 接入 | `.cursor/skills/deepseek-llm/SKILL.md` |
| 状态机实现细则 | `.cursor/skills/interviewer-fsm/SKILL.md` |
| 简历/报告实现细则 | `.cursor/skills/resume-pdf-report/SKILL.md` |

## 技术栈（锁定）

- **Next.js App Router + TypeScript + Tailwind + shadcn/ui**
- **LLM：DeepSeek**（OpenAI 兼容 SDK，`baseURL=https://api.deepseek.com`）
- ASR：浏览器 Web Speech，失败则文本兜底
- TTS：可接第三方；无 Key 时 mock / 浏览器朗读降级
- 数字人：预渲染倾听/说话/等待三态（非实时数字人 API）
- PDF：`@react-pdf/renderer`
- 无登录；session 级存储

## Demo 产品边界（硬约束）

1. UI **展示**多岗位、多风格；**仅** `rd_general` + `pressure` 可选，其它文案带「（暂不可选）」且 disabled
2. `POST /api/interview/start` 只接受上述组合，否则 400
3. 不做：账号、OCR 扫描件、表情情绪、看板、付费、实时数字人云 API（第一版）

## 开发顺序（禁止跳步）

1. Phase A：题库 + Rule Engine + 文字闭环（含简历组卷、压力面）
2. Phase B：ASR + TTS
3. Phase C：数字人三态
4. Phase D：PDF 报告 + 部署 README

**文字闭环未通，不准先做数字人联调。**

## LLM 职责边界

- Rule Engine **决定** action（追问/换题/收束等）
- DeepSeek **只**在给定 action + schema 下生成单句话术或评分 JSON
- 无 `DEEPSEEK_API_KEY` 时必须可走 **mock**，Demo 不能全挂

## 提交习惯

- 小步 commit；核心规则变更与 UI 变更分开更佳
- 勿把真实 API Key 写入仓库；只用 `.env.local` / 环境变量
- README 写清：如何配置 DeepSeek、如何本地跑、mock 模式说明

## 验收速查

见 `docs/MVP_ARCHITECTURE_AND_PLAN.md` §12；压力面卡壳话术默认：

> 没关系，这题先过，换个方向聊聊。
