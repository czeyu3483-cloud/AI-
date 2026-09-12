# 仿真 AI 模拟面试官（本地 Demo）

研发岗 · 压力面模拟面试。浏览器可用，本地启动，DeepSeek 负责简历总结、话术润色与复盘。

## 功能

- 首页：岗位/风格选择（仅研发岗+压力面可选，其余展示为「暂不可选」）
- 简历：粘贴/上传后点「开始面试」会**自动 AI 分析**（不必先点总结）
- 面试：**无字幕纯语音** + 简单数字人；进页后先点「开启语音面试」授权声音与麦克风
- 播报：服务端 Edge TTS（听不清时可点「重播上一题」）；识别失败可用「文字作答（备用）」
- 控场：状态机（追问/换角度/卡壳软跳题）+ DeepSeek 润色
- 复盘：结构化反馈 + PDF 下载

## 本地运行

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

npm install
npm run dev -- --port 3456 --hostname 127.0.0.1
```

打开 [http://127.0.0.1:3456](http://127.0.0.1:3456)

请用 **本机 Chrome** 打开，并允许麦克风。云端远程桌面里常听不到系统声、也收不到麦克风，这是环境限制，不是功能缺失。

## 环境变量

见 `.env.example`：

- `DEEPSEEK_API_KEY`（必填才能走真实 LLM；缺失时自动 mock）
- `DEEPSEEK_BASE_URL` 默认 `https://api.deepseek.com`
- `DEEPSEEK_MODEL` 默认 `deepseek-flash`
- `DEEPSEEK_THINKING=disabled`（建议关闭，否则简历总结可能拿不到正文）

**不要把 `.env.local` 提交到 git。**

## 技术栈

Next.js 15 · TypeScript · Tailwind · DeepSeek · Edge TTS · 浏览器 SpeechRecognition · mammoth / pdf-parse · jsPDF

## 文档与 Skills

- `docs/` 产品与架构说明
- `.cursor/skills/` 开发约束（DeepSeek / FSM / 简历 PDF）
