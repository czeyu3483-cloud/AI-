---
name: resume-pdf-report
description: >-
  Implement resume ingest (paste/txt/docx/pdf) and PDF feedback report download
  for the mock interviewer MVP. Use when editing parse APIs, ResumeProfile, or
  report rendering.
---

# 简历输入 + PDF 报告 Skill

细则：`docs/RESUME_AND_PDF_REPORT.md`。

## 简历

- 支持：粘贴、`.txt`、`.docx`（mammoth）、`.pdf`（文本抽取）
- 不做：扫描件 OCR、长期云端简历库、ATS 改简历
- 流程：解析 → `ResumeProfile` 预览可编辑 → 再 `start`
- 组卷：岗位基础题 + **1–2 道简历项目深挖题**
- 提示用户使用**脱敏**数据
- 结构化优先 DeepSeek + Zod；失败则 rawText 仍可开面

## PDF

- `@react-pdf/renderer`，与 `FeedbackReport` 同源
- 含：研发岗、压力面、能力标签、逐题复盘、改进建议
- **不当场宣判**通过/不通过
- 复盘页主按钮：「下载 PDF 报告」
- 中文需嵌入可用字体子集

## API

- `POST /api/resume/parse`
- `GET /api/report/:sessionId` → `application/pdf`
