# 设计方案（design）

- **工作项**：issue-1794465040488647759
- **节点角色**：方案设计（design）
- **仓库**：loopforge-test（github:zhangjx/loopforge-test），基线 `main`，工作分支 `feature/requirement-2-20261112-0631`
- **上游产物**：`requirement.md`（工作区根目录）/ `.agentflow/inputs/clarify/clarify.md`
- **本文档定位**：在已确认需求基础上，给出**最小可实现的纯前端贪吃蛇**技术方案、模块与接口、风险与验证计划。不含最终代码（由下游实现节点落地），但提供足够细节使实现可直接据此编码。

> 约束遵守：本节点仅产出 `design.md`（工作区根目录）；不修改 `loopforge-test` 仓库内文件；不推送、不开 MR；不泄露凭据。

---

## 1. 方案总览（Overview）

### 1.1 技术选型

| 维度 | 选型 | 理由 |
|------|------|------|
| 技术栈 | 原生 HTML5 + CSS3 + ES6+ JavaScript（无框架、无构建） | 满足 F10"直接打开 `index.html` 即跑"，无依赖、无网络请求、体积最小 |
| 渲染目标 | `<canvas>` 2D Context | 离散网格渲染简单、性能稳定（60 FPS），相比 CSS 网格在长蛇场景下重绘开销低 |
| 主循环 | `requestAnimationFrame` + 时间累积 | 渲染每帧、逻辑按 tick 推进，解耦渲染与逻辑节奏，满足 F1/NFR 性能 |
| 持久化 | `localStorage`（键 `snake.highScore`） | 满足 F7 跨刷新保留；`file://` 下可用 |
| 输入 | 键盘（keydown）+ 触屏（touchstart/touchend） | 覆盖桌面 F2 与移动 F8 |
| 布局 | CSS Flexbox + 媒体查询 + `dpr` 自适应 Canvas 尺寸 | 满足 F9 响应式，单元格正方形且整数像素 |

### 1.2 交付文件结构（写入 `./loopforge-test`）

```
loopforge-test/
├── index.html      # 单页结构：游戏区 + HUD（分数/最高分/难度/状态）+ 控件
├── style.css       # 布局、响应式、可访问性样式（焦点、对比度）
└── game.js         # 游戏逻辑（主循环、状态机、输入、渲染、存储）
```

- 三个文件均为静态资源，浏览器直接打开 `index.html` 即可运行；无外部 CDN、无字体加载、无网络请求。
- `index.html` 通过 `<link rel="stylesheet" href="style.css">` 与 `<script src="game.js" defer></script>` 引入（相对路径，`file://` 可用）。
- 可选：在 `README.md` 追加运行说明与键位（实现节点决定，非阻塞）。

### 1.3 运行口径

- 桌面：双击 `index.html` → `file://` 加载 → 即可游玩。
- 托管：放置于任意静态服务器（含 GitHub Pages）亦可运行。
- 不需要 Node、不需要 `npm install`、不需要构建。

---

## 2. 核心数据结构（Data Model）

### 2.1 网格与坐标系

- 棋盘逻辑网格：`COLS × ROWS`，默认 `20 × 20`（桌面）；移动端保持相同网格数，仅单元格像素尺寸缩放（保证逻辑一致、可玩性一致）。
- 单元格坐标以 `(col, row)` 整数对表示，`col ∈ [0, COLS-1]`，`row ∈ [0, ROWS-1]`。
- 蛇头/蛇身/食物均对齐到单元格。

### 2.2 蛇（Snake）

```js
// 蛇身：数组，索引 0 为蛇头，末尾为蛇尾；每节为 {col, row}
snake = [{col, row}, ...]
// 当前实际移动方向（tick 推进时使用）
direction = 'up' | 'down' | 'left' | 'right'
// 待执行方向队列（同一 tick 内多次输入只保留最后一个有效方向）
pendingDirection = 'up' | 'down' | 'left' | 'right' | null
```

### 2.3 食物（Food）

```js
food = {col, row}   // 单个食物；无空位时视为胜利
```

### 2.4 游戏状态机（GameState）

```
IDLE ──(方向键/开始)──▶ RUNNING ──(空格)──▶ PAUSED ──(空格)──▶ RUNNING
                              │
                              ├──(撞墙/撞自身)──▶ GAME_OVER ──(重开)──▶ RUNNING(重置)
                              └──(填满棋盘)─────▶ WIN ──(重开)──▶ RUNNING(重置)
```

```js
state = 'idle' | 'running' | 'paused' | 'gameover' | 'win'
```

### 2.5 难度与速度（Difficulty/Speed）

```js
// 难度档 → tick 间隔（ms）
DIFFICULTY = {
  easy:   { interval: 200, label: '慢' },
  normal: { interval: 140, label: '中' },
  hard:   { interval: 90,  label: '快' },
}
// 自动加速：每 +50 分，tick 间隔减少一档量；下限 60ms
MIN_INTERVAL = 60
ACCEL_STEP   = 10   // 每档减少 10ms（与需求假设一致，可在 UI/注释说明）
```

- 难度**仅在开始前可选**；进行中切换难度下一局生效（满足 FR-5"开始前选择，进行中不变"）。
- 自动加速：当前 `interval = max(MIN_INTERVAL, baseInterval - floor(score / 50) * ACCEL_STEP)`。

### 2.6 分数与存储（Score/Storage）

```js
score = 0                    // 当前分数
highScore = 0                // 最高分（从 localStorage 读取，失败回退 0）
localStorage key = 'snake.highScore'
```

---

## 3. 模块划分与接口（Modules & Interfaces）

`game.js` 内部按职责划分为以下逻辑模块（可用对象/闭包组织，无需引入模块系统以保持单文件直接运行）：

### 3.1 Config（配置常量）

| 名称 | 值 | 说明 |
|------|----|------|
| `COLS` / `ROWS` | 20 / 20 | 网格规模 |
| `DIFFICULTY` | 见 2.5 | 难度档与间隔 |
| `MIN_INTERVAL` | 60 ms | 速度下限 |
| `ACCEL_STEP` | 10 ms | 自动加速步长 |
| `SCORE_PER_FOOD` | 10 | 每食物得分 |
| `ACCEL_THRESHOLD` | 50 | 每 50 分加速一次 |
| `HIGH_SCORE_KEY` | `'snake.highScore'` | 存储键 |
| `TOUCH_THRESHOLD` | 20 px | 触屏方向判定阈值 |

### 3.2 State（状态管理）

**接口**：
- `State.init()` — 初始化/重置一局：蛇居中、方向右、分数 0、生成首个食物、状态 `idle`。
- `State.reset()` — 重开：调用 `init()` 后状态置 `running`。
- `State.get()` / `State.set(partial)` — 读写当前状态快照。

### 3.3 Snake（蛇逻辑）

**接口**：
- `Snake.create()` — 返回初始蛇身（居中，长度 3，方向右）。
- `Snake.nextHead(direction)` — 计算下一蛇头坐标（不修改状态）。
- `Snake.move(grow)` — 推进一格：`unshift(nextHead)`；若未增长则 `pop()` 尾部。
- `Snake.hitWall(nextHead)` — 是否超出边界。
- `Snake.hitSelf(nextHead)` — 是否撞自身（**尾随判定**：若本 tick 未增长，蛇尾将移出，故判定时排除当前蛇尾格）。
- `Snake.occupies(col, row)` — 某格是否被蛇身占据（用于食物生成）。

### 3.4 Food（食物）

**接口**：
- `Food.spawn(snake)` — 在所有未占据格中随机选一格；无空位返回 `null`（触发 WIN）。
- 随机算法：收集空格列表 → `Math.random()` 取一；空格多时 O(n) 可接受（≤400 格）。

### 3.5 Loop（主循环）

**接口**：
- `Loop.start()` — 启动 `requestAnimationFrame` 循环。
- `Loop.stop()` — 取消帧。
- `Loop.tick(now)` — 每帧回调：累积时间，达到 `currentInterval` 时推进一次逻辑（`update()`），随后 `render()`。
- **失焦暂停**：监听 `visibilitychange`/`blur`，页面隐藏时自动置 `paused` 并 `Loop.stop()`（满足 FR-1/AC-2）。

### 3.6 Input（输入处理）

**接口**：
- `Input.bindKeyboard()` — 监听 `keydown`：
  - 方向键 / WASD → 入队 `pendingDirection`（经 180° 反向过滤）。
  - `Space` → 暂停/继续（`running`↔`paused`）；游戏结束时空格重开。
  - `preventDefault` 阻止方向键/空格的页面滚动。
- `Input.bindTouch()` — 监听 `touchstart`/`touchend`：
  - 记录起点，结束时算位移，取主轴（`|dx|` vs `|dy|`），超阈值判定方向。
  - 同方向队列入队逻辑与键盘一致（含 180° 禁止）。
  - `touch-action: none`（CSS）+ `preventDefault` 阻止滚动。
  - 防抖：`touchend` 后置标记，单次手势只产生一次方向变更。
- `Input.enqueueDirection(dir)` — 公共入队：与当前 `direction` 比较，反向则丢弃；同 tick 多次输入只保留最后一次（覆盖 `pendingDirection`）。

**180° 反向判定**：基准为 `direction`（蛇当前实际移动方向），非 `pendingDirection`。在 `update()` 开头将 `pendingDirection` 提交为新的 `direction`（此时再次校验反向，防止边界情况）。

### 3.7 Render（渲染）

**接口**：
- `Render.resize()` — 根据视口与 `dpr` 计算 Canvas 物理尺寸，单元格取整数像素，保证正方形不糊。
- `Render.draw()` — 清屏 → 绘制网格背景（可选淡线）→ 绘制食物 → 绘制蛇（蛇头可加深色区分）→ 状态覆盖层（暂停/结束/胜利文案）。
- 颜色对比度满足 WCAG AA（文本 ≥4.5:1）：HUD 文本使用深色文本 + 浅色背景，或反之；状态覆盖层文案同样满足。

### 3.8 Storage（存储）

**接口**：
- `Storage.loadHighScore()` — 读取 `localStorage['snake.highScore']`，`parseInt` 失败或非数字回退 0；try/catch 防止隐私模式/`file://` 限制抛错。
- `Storage.saveHighScore(v)` — 写入（try/catch 容错；写入失败不阻塞游戏）。

### 3.9 UI（HUD 与控件）

- 元素：当前分数、最高分、难度选择（`<select>`）、状态提示（"已暂停"/"游戏结束"/"新纪录"/"按方向键开始"）、"重新开始"按钮。
- `UI.update()` — 每次状态/分数变化时刷新文本与提示。
- 可访问性：`<select>` 与按钮含 `aria-label`、可见 `:focus` / `:focus-visible` 样式；纯键盘可操作（AC-11）。

---

## 4. 核心算法流程（Algorithms）

### 4.1 单个 tick 的 update()（逻辑推进）

```
1. 若 pendingDirection 非 null 且不与 direction 反向 → direction = pendingDirection
2. nextHead = Snake.nextHead(direction)
3. grow = (nextHead == food)            // 吃到食物则增长
4. if Snake.hitWall(nextHead) → state=gameover; end()
5. if Snake.hitSelf(nextHead, grow) → state=gameover; end()
   // hitSelf 判定：若 grow=false，排除当前蛇尾格（尾随判定）
6. Snake.move(grow)                      // unshift(nextHead); if !grow pop()
7. if grow:
     score += SCORE_PER_FOOD
     UI.update()
     food = Food.spawn(snake)
     if food == null → state=win; end()
     // 自动加速：currentInterval = max(MIN_INTERVAL, base - floor(score/50)*ACCEL_STEP)
8. render()
```

### 4.2 180° 反向禁止

- 方向对：`up↔down`、`left↔right`。
- `enqueueDirection(dir)`：若 `dir` 是 `direction` 的反向 → 直接丢弃（不入队）。
- 边界保护：`update()` 提交 `pendingDirection` 时再校验一次，防止"当前方向"在两次输入间已变化导致的极端反向。

### 4.3 撞自身与尾随判定

- 未增长时，蛇尾在本 tick 后会移出，故蛇头移到"当前蛇尾格"不算撞自身。
- 实现：`hitSelf(nextHead, grow)` 时，若 `grow === false`，则判定集合 = `snake.slice(0, length-1)`（去掉蛇尾）；若 `grow === true`，判定集合 = 整条蛇。

### 4.4 触屏方向判定

```
dx = endX - startX; dy = endY - startY
if max(|dx|,|dy|) < TOUCH_THRESHOLD → 忽略（误触）
else if |dx| > |dy| → dir = dx>0 ? 'right' : 'left'
else → dir = dy>0 ? 'down' : 'up'
enqueueDirection(dir)
```

### 4.5 响应式 Canvas 尺寸

- `resize()`：取容器可用宽高（受 `max-width: 600px` 约束），`cell = floor(min(availW / COLS, availH / ROWS))`，保证整数像素。
- Canvas CSS 尺寸 = `cell * COLS` × `cell * ROWS`；物理尺寸 = CSS 尺寸 × `dpr`，`ctx.scale(dpr, dpr)` 防糊。
- 监听 `resize` 与 `orientationchange`：进行中切屏 → 自动暂停（满足 FR-9）。

### 4.6 localStorage 读写

```
loadHighScore():
  try { v = parseInt(localStorage.getItem(KEY), 10); return Number.isFinite(v) ? v : 0 }
  catch { return 0 }

saveHighScore(v):
  try { localStorage.setItem(KEY, String(v)) } catch { /* 忽略 */ }
```

- 游戏结束时：若 `score > highScore` → 更新并提示"新纪录"，写入存储。

---

## 5. 接口影响（Interface Impact）

### 5.1 对外接口

- 本项目为纯前端静态站点，**无后端 API、无网络接口**。
- 对外暴露的唯一"接口"为浏览器入口：`index.html`（`file://` 或静态托管）。
- 与浏览器的交互面：
  - DOM 事件：`keydown`、`touchstart/touchend`、`visibilitychange`、`resize`、`orientationchange`、控件 `change/click`。
  - Web API：`CanvasRenderingContext2D`、`requestAnimationFrame`、`localStorage`。
  - 无 `fetch`/`XHR`/`WebSocket`，无任何外部请求（AC-12）。

### 5.2 对仓库的影响

- 新增文件：`loopforge-test/index.html`、`loopforge-test/style.css`、`loopforge-test/game.js`（实现节点落地）。
- 不改动既有 `LICENSE`/`README.md`/`.gitignore`（除非实现节点选择在 README 补充运行说明）。
- 不引入依赖文件、不引入构建配置。
- 本设计阶段不写入仓库任何文件。

### 5.3 兼容性边界

- 目标：Chrome / Edge / Firefox / Safari 最新版（桌面 + 移动 Safari）。
- `file://` 下 `localStorage`：主流浏览器可用；若个别浏览器（如极旧 Safari）限制，则在 README/注释说明，且 `try/catch` 保证不崩溃、回退 0。
- 不支持 IE（与需求一致）。

---

## 6. 风险与缓解（Risks & Mitigations）

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | `file://` 下 `localStorage` 被某些浏览器隔离/限制 | 最高分不持久化（AC-8 部分） | `try/catch` 容错；失败回退 0 且不报错；README 注明；主玩法不受影响 |
| R2 | 同 tick 多次方向输入导致瞬时反向自杀 | 蛇非预期死亡，体验差 | `pendingDirection` 单值覆盖 + 提交时再校验反向（4.2） |
| R3 | 蛇尾随判定错误，误判撞自身 | 正常追尾时误结束（AC-5B） | `hitSelf` 按 `grow` 排除蛇尾格（4.3） |
| R4 | 触屏滑动触发页面滚动/多次方向跳变 | 移动端体验差（AC-9） | `touch-action:none` + `preventDefault`；单次手势单次方向（防抖） |
| R5 | Canvas 在高 `dpr` 屏幕糊化 | 视觉差（AC-10） | 物理尺寸 × `dpr` + `ctx.scale`；单元格整数像素（4.5） |
| R6 | 失焦后主循环后台空跑 | 性能/电量、AC-2 失败 | `visibilitychange` 自动暂停（3.5） |
| R7 | 蛇填满棋盘的胜利边界未处理 | 极端情况无提示 | `Food.spawn` 返回 null → `win` 状态 + 提示 + 可重开（4.1 步骤 7） |
| R8 | 横竖屏切换状态丢失 | 移动端体验（AC-10） | `orientationchange` 自动暂停，状态保留；用户恢复继续 |
| R9 | 自动加速过快不可玩 | 难度过高（AC-6） | `MIN_INTERVAL=60ms` 下限保护 |
| R10 | 可访问性不足（焦点/对比度） | AC-11 失败 | 控件 `aria-label`、`:focus-visible` 样式、文本对比度 ≥4.5:1 |

> 无 R 级风险需要阻塞交付；所有风险均有明确缓解手段，落在实现节点落实。

---

## 7. 验证计划（Verification Plan）

逐条映射需求 AC，给出验证方式与设计对应的实现要点。

| AC | 验证方式 | 设计落点 |
|----|----------|----------|
| AC-1 直接打开运行 | 桌面 Chrome 双击 `index.html`，看加载与控制台 | 3 文件结构、相对路径引入、无网络请求（1.2/5.1） |
| AC-2 主循环与失焦暂停 | 开始游戏观察节奏；切后台看是否暂停 | `requestAnimationFrame` + 时间累积（3.5）、`visibilitychange` 自动暂停 |
| AC-3 键盘方向 + 禁止反向 | 方向键/WASD 改向；尝试 180° 反向 | `Input.bindKeyboard` + `enqueueDirection` 反向过滤（3.6/4.2） |
| AC-4 食物与得分 | 吃食物看增长、加分、新食物 | `Food.spawn` 空格随机、`SCORE_PER_FOOD=10`（3.4/4.1） |
| AC-5 碰撞（墙/自身/尾随） | 撞墙结束；追尾不误判 | `hitWall`/`hitSelf(grow)` 排除蛇尾（4.3） |
| AC-6 难度与速度 | 切难度开局；观察随分数加速 | `DIFFICULTY` 三档 + 自动加速公式 + 下限（2.5/4.1） |
| AC-7 暂停/继续/重开 | 空格暂停→继续→结束重开 | 状态机（2.4）、`State.reset` 不清最高分（3.2） |
| AC-8 最高分持久化 | 打出分数→刷新；查 localStorage；损坏回退 | `Storage.load/saveHighScore` try/catch 回退 0（3.8/4.6） |
| AC-9 触屏控制 | 移动端/模拟器滑动；看是否滚动 | `Input.bindTouch` 阈值判定 + `touch-action:none` + 防抖（3.6/4.4） |
| AC-10 响应式 | 1440 / 375 / 横竖屏 | `Render.resize` 整数像素 + `dpr`；切屏自动暂停（4.5） |
| AC-11 可访问性 | 纯键盘全流程；aria-label/对比度 | 控件 `aria-label`、`:focus-visible`、WCAG AA 配色（3.9/3.7） |
| AC-12 无后端/无网络 | 断网游玩；Network 面板 | 无 fetch/XHR/CDN，仅本地资源（5.1） |

### 7.1 自动化验证（可选，非阻塞）

- 可用 Playwright/Puppeteer 模拟键盘/触屏与 localStorage，覆盖 AC-2/3/4/7/8。
- 本设计不强制自动化测试；实现节点可自行决定。

### 7.2 人工验证清单（实现交付后执行）

1. [ ] 双击 `index.html`，无控制台报错，显示分数 0 / 最高分。
2. [ ] 方向键与 WASD 四向生效，反向被忽略。
3. [ ] 吃食物增长 1 节、+10、新食物即时出现。
4. [ ] 撞墙/撞自身结束；追尾不误判。
5. [ ] 三档难度节奏可感知；分数达 50/100… 速度提升且不过快。
6. [ ] 空格暂停（提示"已暂停"）/继续；结束空格或按钮重开；最高分不清零。
7. [ ] 刷新后最高分保留；改坏 localStorage 值后回退 0 不崩。
8. [ ] 移动端滑动改向、不滚动、单次不跳变。
9. [ ] 桌面 1440 / 移动 375 / 横竖屏：棋盘自适应不糊、无横向滚动、控件可见。
10. [ ] 纯键盘完成开始/方向/暂停/重开；焦点可见、对比达标。
11. [ ] 断网打开可完整游玩，Network 无请求。

---

## 8. 实现优先级（给下游实现节点的最小切片）

1. **MVP**：`index.html` + `game.js` 骨架 → 主循环 + 蛇移动 + 键盘方向（含反向禁止）+ 食物得分 + 撞墙/撞自身 + 分数显示。（覆盖 AC-1~5）
2. **难度/暂停/存储**：难度选择 + 自动加速 + 空格暂停/重开 + localStorage 最高分。（覆盖 AC-6~8）
3. **触屏/响应式**：touch 输入 + Canvas 自适应 + 失焦/切屏暂停。（覆盖 AC-9~10、AC-2）
4. **可访问性/收尾**：aria-label、焦点样式、对比度、胜利边界、控制台零警告。（覆盖 AC-11~12、R7）

每个切片完成后均可独立人工验证，逐步收敛到全部 AC。

---

## 9. 假设与确认

延续 `requirement.md` 第 10 节假设，本设计进一步明确：

1. 网格固定 20×20（桌面与移动端一致，仅像素缩放）。
2. 分数 +10/食物；难度 200/140/90ms；自动加速每 50 分减 10ms，下限 60ms。
3. 失焦、切屏自动暂停（不自动继续，需手动空格）。
4. 难度进行中不可改，下一局生效。
5. 默认中文 UI。
6. 蛇填满棋盘 = 胜利，可重开。

以上假设不阻塞本节点交付；若与预期不符，需在实现前确认。

---

## 10. 交付物

- `design.md`（本文件，工作区根目录）。
- 本节点不修改 `loopforge-test` 仓库内任何文件；不推送、不开 MR；不泄露凭据。
