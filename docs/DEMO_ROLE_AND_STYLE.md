# Demo 范围：岗位与面试风格（可选态）

> UI **展示完整选项**（占位扩容），但 Demo 运行时：  
> - 岗位：**仅「研发岗」可选**；其它岗位展示为「暂不可选」  
> - 风格：**仅「压力面」可选**；平和 / 随机展示为「暂不可选」

---

## 1. 岗位 UI

页面上保留多个行业/岗位选项（示意未来扩容），交互规则：

| 选项 | 状态 | 展示文案示例 |
| --- | --- | --- |
| 研发岗 | **可选**（默认选中） | 研发岗 |
| 产品岗 | disabled | 产品岗（暂不可选） |
| 运营岗 | disabled | 运营岗（暂不可选） |
| 算法岗 | disabled | 算法岗（暂不可选） |
| … | disabled | …（暂不可选） |

```ts
type RoleOption = {
  id: string;
  label: string;
  enabled: boolean; // Demo 仅 rd_general === true
};

const DEMO_ROLES: RoleOption[] = [
  { id: "rd_general", label: "研发岗", enabled: true },
  { id: "pm", label: "产品岗", enabled: false },
  { id: "ops", label: "运营岗", enabled: false },
  { id: "algo", label: "算法岗", enabled: false },
];
```

- 点击 disabled 项：无跳转；可用 toast/tooltip：「该岗位即将开放」
- `start` API **只接受** `roleId: "rd_general"`；其它 id 返回 400
- 题库本阶段只实现研发岗

---

## 2. 面试风格 UI

| 选项 | 状态 | 展示文案示例 |
| --- | --- | --- |
| 压力面 | **可选**（默认选中） | 压力面 |
| 平和面 | disabled | 平和面（暂不可选） |
| 随机 | disabled | 随机（暂不可选） |

```ts
type StyleOption = {
  id: "pressure" | "calm" | "random";
  label: string;
  enabled: boolean;
};

const DEMO_STYLES: StyleOption[] = [
  { id: "pressure", label: "压力面", enabled: true },
  { id: "calm", label: "平和面", enabled: false },
  { id: "random", label: "随机", enabled: false },
];
```

- 默认且唯一可提交：`style: "pressure"`
- `start` 若收到 `calm` / `random`：返回 400（或忽略并强制 pressure，推荐 **400 + 明确错误**，避免静默改写）
- 平和 / 随机的参数预设文件 **仍可保留在仓库**（`config/styles/calm.json`），方便二期解开 `enabled: true`，但 Demo 运行路径不读它们

---

## 3. 本阶段实际行为（仅压力面 × 研发岗）

运行时固定：

```ts
roleId = "rd_general"
styleChosen = "pressure"
styleResolved = "pressure"
```

压力面参数（写入 session config）：

| 参数 | 值 |
| --- | --- |
| `silenceThinkingMs` | 2000 |
| `silenceStuckMs` | 6000 |
| `maxFollowUpsPerQuestion` | 3 |
| `maxPressurePerQuestion` | 3 |
| `maxHintsPerQuestion` | 0（卡壳偏 SKIP_SOFT；翻身用 REFRAME） |
| `maxReframesPerQuestion` | 1 |
| `allowFirstHintOnRequest` | false |
| `answerSoftLimitSec` | 70 |
| `answerHardLimitSec` | 110 |
| `followUpStyles` 权重 | boundary / pitfall / ownership 提高 |
| `tone` | `steady_firm` |

**红线不变**：一次一问；不暗示答案；不当场宣判；压力 ≠ 嘲讽羞辱。

---

## 4. UI 流程

```
首页
  → 岗位：研发岗 ✓｜产品岗（暂不可选）｜运营岗（暂不可选）｜…
  → 风格：压力面 ✓｜平和面（暂不可选）｜随机（暂不可选）
  → 简历输入
  → 开始面试
```

视觉建议：

- 可选：正常高亮/选中态
- 暂不可选：降低透明度 + 文案带「（暂不可选）」+ `cursor-not-allowed` + `aria-disabled`
- 不要用 `display:none` 藏掉其它选项（产品要求「存在在页面上」）

面试页 / PDF / 复盘：写明「研发岗 · 压力面」即可（无需再展示用户未生效的选择）。

---

## 5. API

```ts
// POST /api/interview/start
{
  roleId: "rd_general",          // 仅此合法
  style: "pressure",             // 仅此合法
  resumeProfile?: ResumeProfile
}
```

`GET /api/roles` 建议返回完整列表（含 `enabled`），供前端渲染，避免前后端口径漂移。

---

## 6. 二期解开方式（不在本 Demo 做）

1. 将对应 `RoleOption.enabled` / `StyleOption.enabled` 改为 `true`
2. 补题库或挂上 `calm` 参数合并逻辑
3. `random`：start 时 50/50 解析为 pressure|calm 并落库

---

## 7. 验收补项

- [ ] 页面可见多个岗位；仅研发岗可点选并开面
- [ ] 页面可见压力面 / 平和面（暂不可选）/ 随机（暂不可选）；仅压力面可提交
- [ ] disabled 项文案含「（暂不可选）」；点击不进入流程
- [ ] 服务端拒绝非 `rd_general` / 非 `pressure` 的 start
- [ ] 本场日志与 PDF 标明：研发岗 · 压力面
- [ ] 压力风格无侮辱/嘲讽；遵守一次一问与不当场宣判
