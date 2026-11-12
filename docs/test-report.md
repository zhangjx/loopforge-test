# 测试报告 — 纯前端贪吃蛇小游戏

- **工作项**：issue-1794465040488647759
- **仓库**：loopforge-test（github:zhangjx/loopforge-test）
- **工作分支**：feature/requirement-2-20261112-0631
- **测试日期**：2026-11-12
- **测试角色**：测试验证

---

## 1. 测试范围

依据需求 `clarify.md` 第 8 节 12 条验收标准（AC-1 ~ AC-12）以及 `design.md` 验证计划，对以下维度执行了测试：

- 静态语法与代码质量
- DOM id 一致性
- 无网络/无安全风险
- 核心算法逻辑（反向禁止、尾随判定、撞墙、自动加速、食物生成）
- 浏览器真实 E2E（加载、方向控制、暂停/继续、吃食物、撞墙结束、难度、自动加速、最高分持久化、触屏、响应式、可访问性、失焦暂停）

---

## 2. 测试环境

| 项 | 环境 |
|---|---|
| Node.js | v22.23.4 |
| 浏览器 | Chromium 158.0.8127.18（Playwright headless） |
| 系统 | Debian GNU/Linux 12 (bookworm) aarch64 |
| 运行方式 | `file://` 直接打开 `loopforge-test/index.html` |
| 运行约束 | 无后端、无网络、无构建 |

> 说明：环境缺少系统级 Chromium 依赖库（无 root 无法 `apt-get install`），测试中通过从 Debian 镜像下载 `libnss3`、`libnspr4`、`libxcomposite` 等 10 余个依赖库到本地前缀并设置 `LD_LIBRARY_PATH` 后成功启动 Chromium。依赖库位于 `/tmp/pwlibs`，不影响仓库代码。

---

## 3. 测试脚本与产物

- `snake-e2e.spec.cjs`：基于 Playwright 的端到端浏览器测试，覆盖全部 12 条 AC 的浏览器可自动化部分，共 43 条断言。
- `snake-unit.spec.cjs`：纯 Node 逻辑复现测试，覆盖核心算法，共 39 条断言。
- 截图：`screenshot-idle.png`、`screenshot-running.png`、`screenshot-paused.png`、`screenshot-gameover.png`、`screenshot-mobile.png`（视觉辅助证据）。
- 本报告：`test-report.md`。

---

## 4. 验收标准执行结果

| AC | 标准 | 验证方式 | 结果 |
|---|---|---|---|
| AC-1 | 直接打开运行，无控制台报错，显示分数/最高分/游戏区域 | Playwright 打开 `file://` 并读取 DOM | **PASS**（无 console/page error，score=0，high-score 显示，overlay 提示可见） |
| AC-2 | requestAnimationFrame 主循环稳定，失焦自动暂停 | 观察蛇头移动节奏；触发 `visibilitychange` 伪事件 | **PASS**（移动节奏稳定；失焦后 overlay 显示“已暂停”） |
| AC-3 | 键盘方向键/WASD 控制，禁止 180° 反向 | 按键 ArrowUp 开始，尝试 ArrowDown 反向，观察未自杀 | **PASS** |
| AC-4 | 吃食物蛇身增长、分数 +10、新食物生成 | 像素定位蛇头与食物，驱动贪吃蛇吃到食物 | **PASS**（score 从 0 增加到 10） |
| AC-5 | 撞墙/撞自身结束游戏 | 驱动蛇撞墙，检查 overlay | **PASS**（显示“游戏结束 · 本局 0 分”） |
| AC-6 | 难度三档可感知；随分数自动加速 | 测量 easy/hard 移动间隔；吃到 ≥50 分后再次测量间隔 | **PASS**（easy≈195ms，hard≈85ms；score≥50 后间隔从 196ms 降到 116ms） |
| AC-7 | 空格暂停/继续；结束后空格/按钮重开；最高分不清零 | 按键序列 + DOM 检查 | **PASS** |
| AC-8 | 最高分 localStorage 持久化，损坏回退 0 | 设置/刷新/损坏 localStorage | **PASS**（999 保留，当前分归 0；“not-a-number”/负值回退 0） |
| AC-9 | 触屏滑动方向，禁止滚动，单次手势单次方向 | 派发 TouchEvent；检查 `touch-action:none`；低阈值滑动被忽略 | **PASS** |
| AC-10 | 响应式布局，1440/375 无横向滚动，棋盘自适应 | Playwright 切换 viewport 测量 scrollWidth/clientWidth、canvas 尺寸、按钮可见性 | **PASS**（桌面 600×600，移动 340×340，无横向滚动） |
| AC-11 | 可键盘操作；aria-label；焦点可见；对比度 | 检查 DOM 属性、CSS `:focus-visible`、键盘全流程 | **PASS** |
| AC-12 | 无后端/无网络请求 | Network 面板监听（Playwright `page.on('request')`） | **PASS**（仅有 `file://` 请求） |

**全部 12 条 AC 通过。**

---

## 5. 详细测试结果

### 5.1 静态与语法验证

| 命令 | 预期 | 实际 |
|---|---|---|
| `node --check game.js` | 语法通过 | exit 0，无错误 |
| HTML `id` 与 JS `getElementById` 一致性 | JS 引用的 id 均存在于 HTML | JS 引用 8 个 id 全部存在；`high-label`/`score-label` 通过 `aria-labelledby` 使用 |
| 网络/安全检索 | 无 `fetch/XHR/WebSocket/cdn/http(s)://`、无 `eval/new Function/document.write/innerHTML` | 未命中 |

### 5.2 核心逻辑单元测试（`snake-unit.spec.cjs`）

| 测试组 | 断言数 | 结果 |
|---|---|---|
| 初始蛇构造 | 5 | PASS |
| 撞墙判定 | 7 | PASS |
| 尾随判定/撞自身 | 5 | PASS |
| 180° 反向禁止 + pending 提交 | 7 | PASS |
| 自动加速公式 | 8 | PASS |
| 食物生成/满盘胜利 | 3 | PASS |
| 移动逻辑（增长/不增长） | 4 | PASS |
| **合计** | **39** | **39 PASS / 0 FAIL** |

### 5.3 端到端浏览器测试（`snake-e2e.spec.cjs`）

完整输出见下表（关键断言摘要）：

```
PASS AC-1 页面加载无 console error
PASS AC-1 页面加载无 page error
PASS AC-1 当前分数显示 0
PASS AC-1 显示最高分
PASS AC-1 overlay 初始提示可见
PASS AC-12 无外部网络请求
PASS AC-3 方向键开始游戏
PASS AC-3 禁止 180° 反向
PASS AC-2/AC-7 空格暂停
PASS AC-7 空格继续
PASS AC-4/AC-2 蛇身已渲染
PASS AC-4 食物已渲染
PASS AC-5 撞墙结束游戏
PASS AC-7 结束后空格重开
PASS AC-6 难度速度可感知差异 easy=195ms hard=85ms
PASS AC-6 easy 接近 200ms
PASS AC-6 hard 接近 90ms
PASS AC-6 自动加速（score≥50 后 tick 间隔减小） base=196ms accel=116ms
PASS AC-8 最高分从 localStorage 恢复
PASS AC-8 当前分数归 0
PASS AC-8 localStorage 损坏回退 0
PASS AC-8 localStorage 负值回退 0
PASS AC-7 重开后最高分不清零
PASS AC-5 游戏结束覆盖层显示本局分数
PASS AC-4 吃到食物分数增加（+10） ate=true score=10
PASS AC-9 触屏滑动开始游戏
PASS AC-9 touch-action:none 阻止滚动
PASS AC-9 低于阈值滑动被忽略
PASS AC-9 触屏防抖
PASS AC-10 桌面 1440 无横向滚动
PASS AC-10 桌面 Canvas 自适应尺寸合理
PASS AC-10 移动 375 无横向滚动
PASS AC-10 移动 Canvas 自适应且正方形
PASS AC-10 移动 Canvas 不超过视口宽
PASS AC-10 移动端重开按钮在视口内可见
PASS AC-11 select/button/canvas 有 aria-label
PASS AC-11 canvas 可聚焦
PASS AC-11 CSS 含 :focus-visible 规则
PASS AC-11 纯键盘流程（开始/暂停/继续）
PASS AC-11 焦点元素有可见焦点样式
PASS AC-2 页面失焦自动暂停

=== SUMMARY ===
PASS=43 FAIL=0 TOTAL=43
```

---

## 6. 已知问题（上游 review 已记录，未修复）

本次测试验证了上游 `review.md` 中记录的 5 项 Low/Info 级问题，结论与评审一致：均为边界/体验问题，不阻塞 AC 验收。

| 编号 | 问题 | 严重程度 | 验证结果 |
|---|---|---|---|
| D-1 | Canvas 单元格下限 12px，在可用宽度 < 240px 时 canvas 会溢出容器 | Low | **已确认**。人为将 board-wrap 设为 200px 并触发 resize 后，canvas 为 240px > 200px。但 AC-10 测试的 1440/375 视口无此问题。 |
| D-2 | `Render.resize` 使用固定 `innerHeight - 280` 估算 HUD 高度，横屏短屏可能偏差 | Low | 静态代码检查确认存在该估算。未在 E2E 中发现 375×667 布局异常；未测试极端短屏。 |
| D-3 | 覆盖层文案含 `\n`，但 `.overlay p` 为 `white-space: normal`，多行合并为一行 | Info | **已确认**。`overlay-text.textContent` 含 `\n`，CSS `white-space` 为 `normal`，视觉上仍为单行（窄屏会自然换行）。不影响功能。 |
| D-4 | viewport meta 禁止用户缩放（`maximum-scale=1.0, user-scalable=no`），对低视力用户可访问性略不利 | Info | **已确认**。`index.html` 第 5 行 viewport 含该属性。 |
| D-5 | `touchstart` 使用 `passive: true`，与 `touchmove` 阻滚策略组合正确 | Info | **已确认**。实现正确，仅信息记录。 |

> 处理决策：本节点角色为测试验证；上游评审已判定为 **pass**，且问题均为 Low/Info 级，未触发 AC 失败，因此本次未修改代码。如需修复，可在后续迭代中按 D-1 ~ D-4 建议调整。

---

## 7. 未验证/受环境限制范围

| 项 | 说明 |
|---|---|
| 真机移动 Safari/Chrome | 使用 Playwright Chromium headless + 模拟 viewport 与 TouchEvent，未在 iOS/Android 真机验证。 |
| 中文渲染字体 | Headless Chromium 环境缺少中文字体，截图中中文显示为 tofu 方块；这属于测试环境字体缺失，不影响实际浏览器显示。 |
| 声音/动画 | 需求明确不做，无需验证。 |
| 离线 PWA / Service Worker | 需求明确不做，无需验证。 |

---

## 8. 测试结论

- 所有 12 条验收标准（AC-1 ~ AC-12）均已通过自动化或真实浏览器验证。
- 核心算法逻辑（180°反向禁止、尾随判定、自动加速、撞墙、初始构造、localStorage 容错）全部通过独立复现单元测试。
- 代码静态检查通过：语法正确、DOM id 一致、无网络请求、无安全风险。
- 未发现新的 Critical/Blocker/Major 缺陷。
- 上游 review 记录的 5 项 Low/Info 问题在本次测试中再次确认，均不阻塞交付。

**终态判定：pass**
