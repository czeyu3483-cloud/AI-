# 仿真 AI 模拟面试官（本地 Demo）

研发岗模拟面试。浏览器可用，本地启动；DeepSeek 负责简历总结、话术润色与复盘。

## 功能

- 首页：岗位/风格选择（仅研发岗+压力面可选，其余展示为「暂不可选」）
- 简历：粘贴/上传后点「开始面试」会在后台自动分析（**不展示 AI 预览**）
- 开场：口语化称呼（三字名取后两字如「小明你好」；两字名加「同学」）+ 随机面试官名
- 面试：真人感面试官画面（办公室虚化背景）+ **边说边存**；说完约 0.9s 短停顿自动接话
- 互动：思考时先「嗯/好」；你抢话会提醒；答得太笼统可能中途插问
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
