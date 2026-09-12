# 简历输入 + PDF 报告 · MVP 增补方案

> 范围修订：原「简历/精美长 PDF」从 Out of Scope 回调为 **MVP 必做**，但做**够用闭环版**，不做 ATS 级深析、不做可视化大数据看板。

---

## 1. 产品流增量

```
选岗位（Demo：仅研发岗）→ 选风格（压力/平和/随机）→ 输入简历（粘贴文本 / 上传 .txt .docx .pdf）
      → 解析为 ResumeProfile（可预览、可改）
      → 开面（题库 + 简历项目定制追问；风格参数已合并）
      → …既有语音/控场闭环…
      → 复盘页（结构化反馈，含本场风格）
      → 一键下载 PDF 报告
```

**硬约束**

- 无登录；简历与报告仅绑定本场 `sessionId`，服务端短时保存或内存/临时文件，不建用户档案库
- UI 明确提示：请使用**脱敏简历**（挑战诚信要求）
- 解析失败时：允许改用纯文本粘贴，不阻断开面
- PDF **不当场宣判通过/不通过**（与控场规则一致）

---

## 2. 简历输入

### 2.1 支持格式

| 输入 | 处理 |
| --- | --- |
| 粘贴纯文本 | 直接进入结构化抽取 |
| `.txt` / `.md` | UTF-8 读文本 |
| `.docx` | `mammoth`（或等价）抽纯文本 |
| `.pdf` | `pdf-parse` / `unpdf` 等抽文本；扫描件 OCR **不做**（提示用户改粘贴） |

体积上限建议：≤ 5MB；页数提示：PDF 建议 ≤ 3 页。

### 2.2 结构化结果 `ResumeProfile`（人工可校验）

```ts
type ResumeProfile = {
  rawText: string;              // 原始抽取文本（截断保存，如 12k chars）
  name?: string;                // 可空；演示可用化名
  targetRoleHint?: string;
  education: Array<{ school?: string; degree?: string; major?: string }>;
  skills: string[];
  projects: Array<{
    name: string;
    role?: string;
    stack?: string[];
    highlights: string[];       // 简历声称的亮点，供追问「取舍/边界」
  }>;
  parseMeta: {
    source: "paste" | "txt" | "docx" | "pdf";
    warnings: string[];         // 如「疑似双栏PDF抽取乱序」
  };
};
```

抽取策略：

1. 规则/启发式切分（项目/技能/教育标题）
2. LLM **只做 JSON 结构化**，schema 校验；失败则退回「整段 rawText + 空 projects」仍可开面
3. 开面前展示「简历解读预览」，用户可编辑项目名/亮点（防抽错）

### 2.3 简历如何影响面试（不做无限定制）

| 用途 | MVP 做法 |
| --- | --- |
| 抽题 | 岗位基础题库仍为主；从 `projects` 生成 **1–2 道项目深挖题**（考察点绑定 ownership/tradeoff/boundary） |
| 追问 | `FOLLOW_UP_OWNERSHIP` / `PITFALL` 优先引用简历中的项目名与技术栈 |
| 评估 | 对比「简历声称 vs 口述细节」；不一致记 `surface_knowledge_no_practice` 等标签 |
| 不做 | 全文胜任力雷达、海量岗位匹配分、自动改简历 |

---

## 3. PDF 报告

### 3.1 内容结构（简洁专业，非长篇精美画册）

1. 封面：岗位（研发岗）、面试风格（选择+实际）、场次时间、sessionId（无通过/不通过）
2. 简历摘要：技能 / 深挖的项目名
3. 能力画像：AbilityTag 汇总 + 简短说明
4. 逐题复盘：题干、作答摘要、维度分、证据、改进建议
5. 控场过程摘要（可选一小节）：卡壳次数、追问次数、是否疑似背题
6. 下一步 3 条行动建议
7. 页脚免责：模拟练习报告，不代表任何公司录用结论

### 3.2 技术选型

| 方案 | 说明 | 建议 |
| --- | --- | --- |
| **`@react-pdf/renderer`** | Node 端生成 ArrayBuffer；适 Vercel | **MVP 默认** |
| Puppeteer 打 HTML | 排版强但 Serverless 重 | 不做 |
| 浏览器 `window.print` | 不稳定、难统一下载 | 仅作降级 |

API：`GET /api/report/:sessionId.pdf` → `Content-Type: application/pdf` + `Content-Disposition: attachment`。

### 3.3 复盘页交互

- 在线阅读结构化反馈（已有）
- 按钮：**下载 PDF 报告**
- 无账号：刷新后 session 可能失效 → 提示「请及时下载」

---

## 4. API 增量

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/resume/parse` | multipart 或 JSON 文本 → `ResumeProfile` |
| `POST` | `/api/interview/start` | body 增加可选 `resumeProfile`；用于组卷 |
| `GET` | `/api/report/:sessionId` | 返回 PDF 二进制 |

`finish` 仍生成 JSON 反馈；PDF 由同一 `FeedbackReport` + `ResumeProfile` 渲染，避免两套文案。

---

## 5. 前端页面调整

1. **选岗页** → 增加步骤「简历」：Tab「粘贴文本 | 上传文件」→ 解析预览 → 确认开面  
2. **复盘页** → 「下载 PDF 报告」主按钮  
3. 解析中 / 失败 / 超限：明确空态与错误态

---

## 6. 开发排期插入点

| 阶段 | 增量 |
| --- | --- |
| **Phase A+**（文字闭环同期） | `resume/parse` + 开面带简历组卷；无 PDF 也可先看 JSON 反馈 |
| **Phase D** | `@react-pdf/renderer` 出报告；下载按钮；脱敏提示与体积校验 |

顺序仍遵守：先通文字闭环（含简历定制题），再语音/数字人，最后 PDF 封装——**PDF 不得阻塞 A/B/C**。

---

## 7. 验收补项

- [ ] 支持粘贴文本、`.txt`、`.docx`、`.pdf` 四种输入
- [ ] 解析结果可预览编辑；失败可回退粘贴
- [ ] 开面后至少 1 题明确锚定简历项目
- [ ] 追问能点名简历中的项目/技术（日志可证）
- [ ] 结束后可下载 PDF；含画像、逐题、改进建议；**无录用宣判**
- [ ] 扫描件 PDF 有友好失败提示
- [ ] 页面提示使用脱敏数据；无长期云端简历库

---

## 8. 风险

| 风险 | 缓解 |
| --- | --- |
| 双栏/设计型 PDF 抽乱 | warnings + 强制预览确认；引导改 docx/粘贴 |
| 简历含隐私 | 脱敏提示；session 级存储；README 声明 |
| LLM 抽错项目 | 用户可编辑 ResumeProfile 再开面 |
| PDF 中文排版 | react-pdf 嵌入中文字体子集（注意包体） |
