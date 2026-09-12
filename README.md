# 仿真 AI 模拟面试官（本地 Demo）

研发岗 · 压力面模拟面试。浏览器可用，本地启动，DeepSeek 负责话术润色与复盘。

## 功能

- 首页：岗位/风格选择（仅研发岗+压力面可选，其余展示为「暂不可选」）
- 简历：粘贴文本 / 上传 txt、docx、pdf → 解析预览
- 面试：状态机控场（追问/换角度/卡壳软跳题）+ DeepSeek 润色
- 语音：浏览器 SpeechRecognition / speechSynthesis（不支持则文本兜底）
- 复盘：结构化反馈 + PDF 下载

## 本地运行

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

npm install
npm run dev -- --port 3456 --hostname 127.0.0.1
```

打开 [http://127.0.0.1:3456](http://127.0.0.1:3456)

## 环境变量

见 `.env.example`：

- `DEEPSEEK_API_KEY`（必填才能走真实 LLM；缺失时自动 mock）
- `DEEPSEEK_BASE_URL` 默认 `https://api.deepseek.com`
- `DEEPSEEK_MODEL` 默认 `deepseek-flash`

**不要把 `.env.local` 提交到 git。**

## 技术栈

Next.js 15 · TypeScript · Tailwind · DeepSeek（OpenAI 兼容 SDK）· mammoth / pdf-parse · jsPDF

## 文档与 Skills

- `docs/` 产品与架构说明
- `.cursor/skills/` 开发约束（DeepSeek / FSM / 简历 PDF）
