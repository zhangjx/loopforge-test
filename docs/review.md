# 独立评审（review）

- **工作项**：issue-1794465040488647759
- **节点角色**：独立评审（independent review）
- **仓库**：loopforge-test（github:zhangjx/loopforge-test），基线 `main`，工作分支 `feature/requirement-2-20261112-0631`
- **上游产物**：`requirement.md` / `design.md` / `implementation.md`（工作区根目录及 `.agentflow/inputs/`）
- **评审对象**：`loopforge-test/index.html`、`loopforge-test/style.css`、`loopforge-test/game.js`
- **评审范围**：前端页面、交互、可访问性与响应式；改动及测试证据的独立审查

> 约束遵守：本节点仅产出 `review.md`（工作区根目录）；不修改仓库代码；不推送、不开 MR；无凭据泄露、无伪造结论。

---

## 1. 评审结论

**终态：pass**

实现完整覆盖需求 12 条验收标准（AC-1~AC-12）的设计落点；交付三个静态文件，`file://` 直接打开即可运行，无后端、无网络请求、无安全风险。核心算法（180° 反向禁止、尾随判定、自动加速、撞墙、初始构造）经独立复现冒烟测试全部通过。未发现阻断（blocker/critical）缺陷。

发现缺陷共 5 项，均为**低**或**信息**级，不阻塞交付；其中部分为体验优化建议，建议后续迭代处理。浏览器交互感知类 AC（AC-2 节奏、AC-8 刷新持久化、AC-9 真机触屏、AC-10 多视口）的静态与逻辑落点已验证，交互感知部分留待人工执行 `design.md` §7.2 清单确认——此为实现节点已声明的合理边界，不影响逻辑正确性判定。

---

## 2. 评审方法与证据

### 2.1 静态与语法验证（已执行）

| 项 | 命令/方法 | 结果 |
|----|----------|------|
| JS 语法 | `node --check game.js` | 通过（`===SYNTAX_OK===`，exit 0） |
| DOM id 一致性 | 比对 HTML `id` 定义与 JS `getElementById` 引用 | 一致；JS 引用的 8 个 id（board/difficulty/high-score/hint/overlay/overlay-text/restart/score）均在 HTML 定义；`high-label`/`score-label` 由 `aria-labelledby` 消费 |
| 无网络请求 | 检索 `fetch/XHR/WebSocket/cdn/https?:///<script src=https>` 等 | 仅 `LICENSE` 文本含 http 链接与本地 `game.js` 引用；运行时无任何外部请求（AC-12） |
| 无安全风险 | 检索 `eval/new Function/document.write/innerHTML/outerHTML/insertAdjacentHTML/setAttribute(on...)` | 无（NFR 安全项） |
| git 状态 | `git status --short` / `git diff --stat main` | 工作分支 `feature/requirement-2-20261112-0631`，仅新增 3 文件（+1087/-0），基线 `main` 未改动 |

### 2.2 核心逻辑冒烟测试（独立复现，已执行）

从 `game.js` 提取纯逻辑（不依赖 DOM/Canvas）复刻关键算法并以 Node 断言，6 组共 13 项断言全部通过：

| 测试组 | 断言内容 | 结果 |
|--------|----------|------|
| 尾随判定 | 未增长时移入蛇尾格不判撞自身；增长时移入蛇尾格判撞 | PASS |
| 180° 反向禁止 | 反向输入被丢弃；非反向入队；同 tick 多次保留最后一个 | PASS |
| 提交二次校验 | `pendingDirection` 为 `direction` 的反向时不生效 | PASS |
| 自动加速公式 | score 0/49→base、50→-10、100→-20、500+/1000→下限 60ms | PASS |
| 撞墙判定 | 边界 -1/20 判撞；0/19 不撞；19/19 不撞 | PASS |
| 初始蛇构造 | 居中头 col=9、长度 3、朝右、同行 | PASS |

### 2.3 深度边界审查（已执行）

额外验证 8 项边界场景，均无阻断问题：

- 蛇长度 1 时尾随判定（`end=length-1=0`，循环不执行，不误判）；
- 快速双输入（上→下同 tick）不导致反向自杀（基准为 `direction`，设计正确）；
- `localStorage` 解析对负值/0/NaN/`null` 键均回退 0（`parseInt` + `> 0` 校验）；
- 状态机与 `Loop` 生命周期一致（`start` 先 `stop` 旧 rAF，无重复帧；`paused` 不停 rAF 仅停止逻辑推进；恢复重置时间累积）；
- 胜利边界（`Food.spawn` 返回 `null` → `win`，覆盖层提示，可重开）；
- 失焦暂停不影响 `gameover/win` 结束态（仅 `running` 转 `paused`）；
- `idle` 时空格开始游戏合法（沿用 `right` 方向，符合需求场景提示）；
- 难度进行中切换被还原（`change` handler 将 `select.value` 还原为 `s.difficulty`）。

---

## 3. 缺陷清单（按严重程度）

### 严重程度定义
- **Critical/Blocker**：阻断核心功能或违反硬性 AC，必须修复方可交付。
- **Major**：功能缺陷或违反 AC，影响用户体验，应修复。
- **Low**：边界或次要问题，不阻塞交付，建议修复。
- **Info**：信息性建议或风格问题，不影响验收。

> 本评审未发现 Critical/Blocker 或 Major 缺陷。以下均为 Low/Info。

---

### D-1 [Low] Canvas 单元格下限 12px 在极窄视口可能溢出容器产生横向滚动

- **位置**：`game.js` `Render.resize()`（第 485-486 行）
- **现象**：`cell = Math.min(maxCellW, maxCellH); if (cell < 12) cell = 12;`。当容器可用宽度 < 240px 时（如 `floor(availW/20) < 12`），`cell` 被强制提升到 12，导致 `cssW = 12*20 = 240px` 超过容器可用宽度，Canvas 的 `style.width=240px` 溢出 `.board-wrap`，可能触发横向滚动条。
- **影响**：违反 AC-10"无横向滚动条"的边界情况。仅在可用宽度 < 240px 的极窄视口触发（移动端主流视口 360px 减 padding 后约 320px，`floor(320/20)=16` 不受影响），实际触发概率极低。
- **修复建议**：下限保护改为同时约束 Canvas 不超过容器：`cell = Math.min(maxCellW, maxCellH); if (cell < 12) cell = Math.min(12, maxCellW);`，或在 CSS 增加 `#board { max-width: 100%; }` 使 Canvas 在溢出时被容器裁剪而非撑开。优先级：低。

---

### D-2 [Low] 可用高度估算 `innerHeight - 280` 为固定值，横屏短屏或 HUD 换行时偏差

- **位置**：`game.js` `Render.resize()`（第 480 行）
- **现象**：`const availH = Math.max(220, window.innerHeight - 280);` 用固定 280px 估算头部+控件高度。横屏短屏（`innerHeight` 小）或极窄屏 HUD 强制换行变高时，估算的 `availH` 偏大，可能导致棋盘高度超出视口底部，控件被推到视口外。
- **影响**：AC-10"分数与重开按钮始终在视口内可见"的边界情况。已由 `orientationchange` 自动暂停缓解（游戏不会在不可见状态下空跑），但布局仍可能不理想。
- **修复建议**：改为基于实际 DOM 测量：`const headerH = document.querySelector('.game-header').offsetHeight; const ctrlH = document.querySelector('.controls').offsetHeight; const availH = window.innerHeight - headerH - ctrlH - 32;`；或在 `.game-app` 使用 `min-height: 100dvh` 配合 flex 让棋盘自适应剩余空间。优先级：低。

---

### D-3 [Info] 覆盖层多行文案 `\n` 因 CSS 缺少 `white-space: pre` 被合并为一行

- **位置**：`game.js` `Render.drawOverlay()`（第 576-583 行）设置 `msg` 含 `\n`；`style.css` `.overlay p`（第 158-167 行）未设 `white-space`
- **现象**：结束/胜利文案如 `'游戏结束 · 本局 30 分\n空格或按钮重开'` 通过 `textContent` 设置，但 `.overlay p` 默认 `white-space: normal`，浏览器将 `\n` 渲染为空格，两行文案合并为一行显示。
- **影响**：视觉上仍可读（窄屏会自然换行），但非预期的两行排版。不影响功能与 AC 验收。
- **修复建议**：在 `.overlay p` 增加 `white-space: pre-line;`（保留显式换行并合并多余空白），或将文案改为两段 `<span>`。优先级：信息性。

---

### D-4 [Info] `maximum-scale=1.0, user-scalable=no` 禁止用户缩放，对低视力用户可访问性略不利

- **位置**：`index.html` 第 5 行 viewport meta
- **现象**：`<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />` 禁止用户手动缩放页面。
- **影响**：AC-11 可访问性基线要求键盘可达与对比度，未明确要求允许缩放；但 WCAG 1.4.4（Resize text）建议不应完全禁止缩放。对低视力用户略有不利。游戏类应用为防止触屏缩放破坏 Canvas 坐标系，此为常见做法。
- **修复建议**：移除 `maximum-scale=1.0, user-scalable=no`，仅保留 `width=device-width, initial-scale=1.0`；触屏缩放与游戏交互的冲突已由 `touch-action: none`（仅作用于 Canvas）缓解。优先级：信息性（可作为可访问性增强）。

---

### D-5 [Info] `touchstart` 监听器声明 `passive: true` 但注释表述与 `touchmove` 阻滚策略的关系

- **位置**：`game.js` `Input.bindTouch()`（第 350-357 行）
- **现象**：`touchstart` 设为 `{ passive: true }`，注释说明"不 preventDefault start，避免部分浏览器忽略后续；滚动由 touch-action:none + move/end 阻止"。`touchmove` 设为 `{ passive: false }` 并 `preventDefault`。
- **影响**：无功能缺陷。`touch-action: none`（CSS）+ `touchmove` `preventDefault` 已双保险阻止滚动；`touchstart` 不 preventDefault 不影响滚动抑制（滚动由 move 触发）。注释表述清晰，实现正确。
- **修复建议**：无需修改；记录为信息项以示已审查。优先级：信息性。

---

## 4. AC 覆盖核验（逐条）

| AC | 验证方式 | 实现落点核验 | 评审结论 |
|----|----------|--------------|----------|
| AC-1 直接打开运行 | 静态：3 文件 + 相对路径引入 + 无网络请求 | `index.html` 用 `<link href="style.css">` 与 `<script src="game.js" defer>` 相对路径引入；无 CDN/外部请求 | **通过**（静态） |
| AC-2 主循环与失焦暂停 | `requestAnimationFrame`+时间累积；`visibilitychange`/`blur` 自动暂停 | `Loop.tick` 箭头函数绑定 this，accumulator 累积，防切后台追赶（`>currentInterval*4` 截断）；`bindVisibility`+`blur` 仅 running→paused | **通过**（逻辑） |
| AC-3 键盘方向+禁止反向 | 方向键/WASD；`enqueueDirection` 反向过滤+提交校验 | `Input.bindKeyboard` 映射 8 键；`enqueueDirection` 基准为 `direction`，反向丢弃；`update` 提交时二次校验 | **通过**（冒烟测试） |
| AC-4 食物与得分 | `Food.spawn` 空格随机；`SCORE_PER_FOOD=10` | `Food.spawn` 收集空格列表 `Math.random` 取一，无空位返回 null；吃到 `grow` 增长 1 节 +10 分 | **通过**（逻辑） |
| AC-5 碰撞（墙/自身/尾随） | `hitWall`/`hitSelf(grow)` 排除蛇尾 | `hitWall` 边界判定；`hitSelf` 未增长时 `end=length-1` 排除蛇尾格 | **通过**（冒烟测试） |
| AC-6 难度与速度 | 三档 200/140/90 + 自动加速 + 下限 60 | `Config.DIFFICULTY` 三档；`currentInterval=max(60, base-floor(score/50)*10)`；难度进行中不可改 | **通过**（公式测试） |
| AC-7 暂停/继续/重开 | 空格切换；`State.reset` 不清最高分 | `handleSpace` 状态机分支；`reset`→`init` 不碰 `highScore`；结束时空格/按钮/回车重开 | **通过**（逻辑） |
| AC-8 最高分持久化 | `try/catch` 读写；损坏回退 0 | `Storage.load/saveHighScore` 全程 try/catch；`parseInt`+`>0`+`isFinite` 校验回退 0 | **通过**（逻辑；刷新持久化待人工） |
| AC-9 触屏控制 | 主轴判定+阈值 20+防抖+`touch-action:none` | `bindTouch` touchstart/end 记录位移取主轴，`<20px` 忽略误触，`touchActive` 防抖；`touchmove` preventDefault + CSS `touch-action:none` | **通过**（逻辑；真机待人工） |
| AC-10 响应式 | dpr 自适应+整数像素+切屏自动暂停+无横向滚动 | `Render.resize` `cell=floor(min(availW/20,availH/20))`，物理尺寸×dpr + `setTransform`；resize/orientationchange 防抖+自动暂停 | **通过**（静态；多视口待人工；D-1/D-2 边界） |
| AC-11 可访问性 | `aria-label`、`:focus-visible`、WCAG AA 配色、纯键盘 | `select`/`button`/`canvas` 有 `aria-label`；`:focus-visible` 焦点环；配色对比度注释≥4.5:1；键盘全流程（方向/空格/回车） | **通过**（静态；D-4 信息项） |
| AC-12 无后端/无网络 | 无 fetch/XHR/CDN | 全文件检索无运行时网络请求 | **通过**（静态检索） |

---

## 5. 设计符合性核验

对照 `design.md` §3 的 9 模块接口，实现均已落地且接口语义一致：

| 模块 | 设计接口 | 实现核验 |
|------|----------|----------|
| Config | 常量集合（COLS/ROWS/难度/MIN_INTERVAL 等） | `Object.freeze`，含全部设计常量 |
| State | `init`/`reset`/`get`/`set` | 均实现；`reset` 读 select 难度，不清最高分 |
| Snake | `create`/`nextHead`/`move`/`hitWall`/`hitSelf`/`occupies` | 全部实现；`hitSelf(grow)` 尾随判定正确 |
| Food | `spawn`/`equals` | 实现；空格随机，无空位返回 null |
| Loop | `start`/`stop`/`tick` | 实现；箭头函数绑定 this，accumulator 截断防追赶 |
| Input | `bindKeyboard`/`bindTouch`/`enqueueDirection` | 实现；反向过滤基准为 direction + 提交二次校验 |
| Render | `resize`/`draw`/`drawOverlay` | 实现；dpr 自适应 + 整数像素 + DOM 覆盖层 |
| Storage | `loadHighScore`/`saveHighScore` | 实现；全程 try/catch 回退 0 |
| UI | `init`/`updateScore`/`updateAll`/`getDifficulty` | 实现；难度进行中不可改，控件 aria-label |

`design.md` §4 核心算法（update 流程、反向禁止、尾随判定、触屏判定、响应式尺寸、localStorage 读写）均与实现一致。§6 风险 R1~R10 的缓解措施均已落实。

---

## 6. 约束遵守核验

- **代码改动位置**：3 个文件均写入 `./loopforge-test`，SOP 产物（本 `review.md`）置于工作区根目录。✓
- **基线保护**：`git diff --stat main` 显示仅新增 3 文件（+1087/-0），`main` 基线未被改动。✓
- **未推送/未开 MR/未合并**：工作树为本地新增文件状态（`A` staged），无 push/MR 操作。✓
- **无凭据泄露**：检索无 token/key/密钥；`localStorage` 仅存整数最高分。✓
- **无伪造证据**：所有验证命令真实执行并附输出；冒烟测试为独立复现而非照抄实现节点结论。✓

---

## 7. 人工验证待办（移交）

以下浏览器交互感知类 AC 的逻辑落点已通过本评审，但最终感知确认需人工在浏览器中执行 `design.md` §7.2 清单：

1. 桌面 Chrome 双击 `index.html` 实际加载与控制台零报错；
2. 蛇移动节奏稳定，切后台自动暂停、切回不狂跑；
3. 移动端真机/模拟器滑动改向、不滚动、单次不跳变；
4. 多视口（1440/375/横竖屏）棋盘自适应不糊、控件可见、无横向滚动；
5. 刷新后最高分保留、localStorage 损坏回退不崩。

以上不阻塞本节点终态判定（逻辑正确性已由静态分析与冒烟测试覆盖）。

---

## 8. 终态判断

- 交付文件完整（index.html/style.css/game.js），语法通过，DOM 引用一致，无网络请求与安全风险。
- 12 条 AC 实现落点全部核验通过；核心算法经独立复现冒烟测试 13 项断言全过。
- 未发现 Critical/Blocker/Major 缺陷；5 项缺陷均为 Low/Info，不阻塞交付，建议后续迭代处理。
- 约束遵守：基线未改、未推送、未开 MR、无凭据泄露、无伪造证据。
- 浏览器交互感知类 AC 留待人工确认（实现节点已声明此边界，逻辑正确性已有保证）。

**终态：pass**
