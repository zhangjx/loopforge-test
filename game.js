/* ============================================================
 * 贪吃蛇 - game.js
 * 原生 ES6+，无框架、无构建、无网络请求。
 * 模块：Config / State / Snake / Food / Loop / Input / Render / Storage / UI
 *
 * 设计依据：design.md（工作区根目录）
 * 运行：浏览器直接打开 index.html 即可。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
   * 1. Config（配置常量）
   * ------------------------------------------------------- */
  const Config = Object.freeze({
    COLS: 20,
    ROWS: 20,
    SCORE_PER_FOOD: 10,
    ACCEL_THRESHOLD: 50,   // 每 50 分加速一次
    ACCEL_STEP: 10,        // 每次减少 10ms
    MIN_INTERVAL: 60,      // tick 间隔下限
    TOUCH_THRESHOLD: 20,   // 触屏方向判定阈值（px）
    HIGH_SCORE_KEY: 'snake.highScore',
    // 难度档：开始前可选，进行中不可改，下一局生效
    DIFFICULTY: {
      easy:   { interval: 200, label: '慢' },
      normal: { interval: 140, label: '中' },
      hard:   { interval: 90,  label: '快' },
    },
  });

  // 方向向量与反向映射
  const DIR_VEC = {
    up:    { dc: 0,  dr: -1 },
    down:  { dc: 0,  dr: 1 },
    left:  { dc: -1, dr: 0 },
    right: { dc: 1,  dr: 0 },
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  /* ---------------------------------------------------------
   * 2. State（游戏状态）
   * ------------------------------------------------------- */
  const State = {
    // 可变状态快照
    snap: {
      snake: [],            // [{col,row}]，索引 0 为蛇头
      direction: 'right',   // 当前实际移动方向（tick 推进用）
      pendingDirection: null, // 待执行方向（同 tick 多次输入只保留最后一个有效）
      food: null,           // {col,row}
      score: 0,
      highScore: 0,
      state: 'idle',        // idle | running | paused | gameover | win
      difficulty: 'normal', // 当前生效难度
      baseInterval: Config.DIFFICULTY.normal.interval,
      currentInterval: Config.DIFFICULTY.normal.interval,
      isNewRecord: false,
    },

    init(difficulty) {
      const s = this.snap;
      s.snake = Snake.create();
      s.direction = 'right';
      s.pendingDirection = null;
      s.score = 0;
      s.state = 'idle';
      s.isNewRecord = false;
      s.difficulty = difficulty || s.difficulty || 'normal';
      s.baseInterval = Config.DIFFICULTY[s.difficulty].interval;
      s.currentInterval = s.baseInterval;
      s.food = Food.spawn(s.snake);
      // food 为 null 仅当初始即无空位（20×20 不会发生），仍兜底处理
      if (!s.food) {
        s.state = 'win';
      }
    },

    reset() {
      // 重开：不清最高分；读取 select 当前选择作为新一局难度
      const diff = UI.getDifficulty();
      this.init(diff);
      this.snap.state = 'running';
    },

    get() { return this.snap; },

    set(partial) {
      Object.assign(this.snap, partial);
    },
  };

  /* ---------------------------------------------------------
   * 3. Snake（蛇逻辑）
   * ------------------------------------------------------- */
  const Snake = {
    create() {
      // 居中，长度 3，朝右
      const c = Math.floor(Config.COLS / 2) - 1;
      const r = Math.floor(Config.ROWS / 2);
      return [
        { col: c,     row: r },
        { col: c - 1, row: r },
        { col: c - 2, row: r },
      ];
    },

    nextHead(direction) {
      const head = State.snap.snake[0];
      const v = DIR_VEC[direction];
      return { col: head.col + v.dc, row: head.row + v.dr };
    },

    move(grow) {
      const head = State.snap.snake[0];
      const v = DIR_VEC[State.snap.direction];
      const next = { col: head.col + v.dc, row: head.row + v.dr };
      State.snap.snake.unshift(next);
      if (!grow) {
        State.snap.snake.pop();
      }
    },

    hitWall(nextHead) {
      return (
        nextHead.col < 0 ||
        nextHead.col >= Config.COLS ||
        nextHead.row < 0 ||
        nextHead.row >= Config.ROWS
      );
    },

    // 撞自身判定（含尾随判定）：
    // 未增长时，蛇尾本 tick 后会移出，故排除当前蛇尾格。
    hitSelf(nextHead, grow) {
      const body = State.snap.snake;
      const end = grow ? body.length : body.length - 1;
      for (let i = 0; i < end; i++) {
        if (body[i].col === nextHead.col && body[i].row === nextHead.row) {
          return true;
        }
      }
      return false;
    },

    occupies(col, row) {
      const body = State.snap.snake;
      for (let i = 0; i < body.length; i++) {
        if (body[i].col === col && body[i].row === row) return true;
      }
      return false;
    },
  };

  /* ---------------------------------------------------------
   * 4. Food（食物）
   * ------------------------------------------------------- */
  const Food = {
    spawn(snake) {
      // 收集所有未占据空格，随机取一；无空位返回 null（触发 win）
      const empty = [];
      for (let r = 0; r < Config.ROWS; r++) {
        for (let c = 0; c < Config.COLS; c++) {
          let occupied = false;
          for (let i = 0; i < snake.length; i++) {
            if (snake[i].col === c && snake[i].row === r) {
              occupied = true;
              break;
            }
          }
          if (!occupied) empty.push({ col: c, row: r });
        }
      }
      if (empty.length === 0) return null;
      return empty[Math.floor(Math.random() * empty.length)];
    },

    equals(a, b) {
      return !!a && !!b && a.col === b.col && a.row === b.row;
    },
  };

  /* ---------------------------------------------------------
   * 5. Loop（主循环：requestAnimationFrame + 时间累积）
   * ------------------------------------------------------- */
  const Loop = {
    rafId: null,
    lastTime: 0,
    accumulator: 0,

    start() {
      this.stop();
      this.lastTime = performance.now();
      this.accumulator = 0;
      this.rafId = requestAnimationFrame(this.tick);
    },

    stop() {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    },

    // 箭头函数绑定 this
    tick: (now) => {
      const loop = Loop;
      const s = State.snap;

      // 仅 running 时推进逻辑
      if (s.state === 'running') {
        const elapsed = now - loop.lastTime;
        loop.accumulator += elapsed;
        // 防止切后台累积过大导致一次性多步追赶
        if (loop.accumulator > s.currentInterval * 4) {
          loop.accumulator = s.currentInterval;
        }
        while (loop.accumulator >= s.currentInterval) {
          loop.accumulator -= s.currentInterval;
          update();
          // 推进后状态可能变为 gameover/win，停止后续步进
          if (State.snap.state !== 'running') break;
        }
      }

      loop.lastTime = now;
      Render.draw();
      loop.rafId = requestAnimationFrame(loop.tick);
    },
  };

  /* ---------------------------------------------------------
   * 单个 tick 的逻辑推进（update）
   * ------------------------------------------------------- */
  function update() {
    const s = State.snap;

    // 1. 提交 pendingDirection（含二次反向校验，防边界情况）
    if (s.pendingDirection && s.pendingDirection !== OPPOSITE[s.direction]) {
      s.direction = s.pendingDirection;
    }
    s.pendingDirection = null;

    // 2. 计算下一蛇头
    const nextHead = Snake.nextHead(s.direction);

    // 3. 是否吃到食物（增长）
    const grow = Food.equals(nextHead, s.food);

    // 4. 撞墙
    if (Snake.hitWall(nextHead)) {
      endGame('gameover');
      return;
    }

    // 5. 撞自身（含尾随判定）
    if (Snake.hitSelf(nextHead, grow)) {
      endGame('gameover');
      return;
    }

    // 6. 移动
    Snake.move(grow);

    // 7. 吃到食物：加分、刷新食物、自动加速
    if (grow) {
      s.score += Config.SCORE_PER_FOOD;
      UI.updateScore();
      s.food = Food.spawn(s.snake);
      if (!s.food) {
        endGame('win');
        return;
      }
      // 自动加速：每 ACCEL_THRESHOLD 分减 ACCEL_STEP ms，下限 MIN_INTERVAL
      const accel = Math.floor(s.score / Config.ACCEL_THRESHOLD) * Config.ACCEL_STEP;
      s.currentInterval = Math.max(Config.MIN_INTERVAL, s.baseInterval - accel);
    }
  }

  /* ---------------------------------------------------------
   * 结束一局：判定最高分、持久化、UI
   * ------------------------------------------------------- */
  function endGame(result) {
    const s = State.snap;
    s.state = result; // 'gameover' | 'win'
    s.pendingDirection = null;

    // 最高分更新
    if (s.score > s.highScore) {
      s.highScore = s.score;
      s.isNewRecord = true;
      Storage.saveHighScore(s.highScore);
    } else {
      s.isNewRecord = false;
    }

    UI.updateAll();
    // 停止逻辑推进；rAF 仍在跑以渲染结束态覆盖层
  }

  /* ---------------------------------------------------------
   * 6. Input（输入处理）
   * ------------------------------------------------------- */
  const Input = {
    // 触屏起点（用于 touchend 判定方向）
    touchStartX: 0,
    touchStartY: 0,
    touchActive: false, // 防抖：单次手势只产生一次方向变更

    bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        const code = e.code;

        // 方向键 / WASD
        let dir = null;
        switch (code) {
          case 'ArrowUp': case 'KeyW': dir = 'up'; break;
          case 'ArrowDown': case 'KeyS': dir = 'down'; break;
          case 'ArrowLeft': case 'KeyA': dir = 'left'; break;
          case 'ArrowRight': case 'KeyD': dir = 'right'; break;
          default: break;
        }

        if (dir) {
          e.preventDefault(); // 阻止方向键滚动
          handleDirectionInput(dir);
          return;
        }

        // 空格：暂停/继续；结束时重开
        if (code === 'Space' || code === 'Spacebar') {
          e.preventDefault();
          handleSpace();
          return;
        }

        // 回车：在 idle/gameover/win 时也可开始/重开（增强键盘可达性）
        if (code === 'Enter') {
          const s = State.snap.state;
          if (s === 'idle' || s === 'gameover' || s === 'win') {
            e.preventDefault();
            startOrRestart();
          }
        }
      }, { passive: false });
    },

    bindTouch() {
      const canvas = document.getElementById('board');

      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        this.touchStartX = t.clientX;
        this.touchStartY = t.clientY;
        this.touchActive = true;
        // 不 preventDefault start，避免部分浏览器忽略后续；滚动由 touch-action:none + move/end 阻止
      }, { passive: true });

      // touchmove 仅用于阻止滚动；方向在 touchend 判定
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
      }, { passive: false });

      canvas.addEventListener('touchend', (e) => {
        if (!this.touchActive) return;
        this.touchActive = false; // 防抖：一次手势只处理一次
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - this.touchStartX;
        const dy = t.clientY - this.touchStartY;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (Math.max(adx, ady) < Config.TOUCH_THRESHOLD) return; // 误触忽略

        let dir;
        if (adx > ady) {
          dir = dx > 0 ? 'right' : 'left';
        } else {
          dir = dy > 0 ? 'down' : 'up';
        }
        handleDirectionInput(dir);
      }, { passive: true });

      // touchcancel 也清状态
      canvas.addEventListener('touchcancel', () => {
        this.touchActive = false;
      }, { passive: true });
    },

    // 公共入队：与当前 direction 比较，反向则丢弃；同 tick 多次只保留最后一个
    enqueueDirection(dir) {
      const s = State.snap;
      if (dir === OPPOSITE[s.direction]) return; // 180° 反向禁止
      s.pendingDirection = dir;
    },
  };

  function handleDirectionInput(dir) {
    const s = State.snap;

    // idle：首次方向输入开始游戏
    if (s.state === 'idle') {
      // 起始方向为 right；若首输入是 left（反向）则忽略，其余直接生效
      if (dir === OPPOSITE[s.direction]) return;
      Input.enqueueDirection(dir);
      s.state = 'running';
      UI.updateAll();
      Loop.start();
      return;
    }

    if (s.state === 'running') {
      Input.enqueueDirection(dir);
      return;
    }

    // paused / gameover / win：方向输入不生效
  }

  function handleSpace() {
    const s = State.snap;
    switch (s.state) {
      case 'running':
        s.state = 'paused';
        UI.updateAll();
        // 不停 rAF（仍渲染覆盖层），但 tick 内不再推进逻辑
        break;
      case 'paused':
        s.state = 'running';
        UI.updateAll();
        // 重置时间累积，避免恢复后一次性追赶
        Loop.lastTime = performance.now();
        Loop.accumulator = 0;
        break;
      case 'gameover':
      case 'win':
        startOrRestart();
        break;
      case 'idle':
        // idle 时空格也可开始（沿用当前方向 right）
        s.state = 'running';
        UI.updateAll();
        Loop.start();
        break;
      default:
        break;
    }
  }

  function startOrRestart() {
    State.reset();
    UI.updateAll();
    Loop.lastTime = performance.now();
    Loop.accumulator = 0;
    Loop.start();
  }

  /* ---------------------------------------------------------
   * 7. Render（渲染）
   * ------------------------------------------------------- */
  const Render = {
    canvas: null,
    ctx: null,
    cell: 0,        // 单元格 CSS 像素尺寸
    dpr: 1,

    init() {
      this.canvas = document.getElementById('board');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
    },

    // 响应式：根据视口与 dpr 计算物理尺寸，单元格取整数像素
    resize() {
      const wrap = this.canvas.parentElement;
      // 容器可用宽度（受 max-width:600 约束）
      const availW = wrap.clientWidth;
      // 高度约束：视口高度减去头部与控件估算高度，保证移动端不溢出
      const availH = Math.max(220, window.innerHeight - 280);

      // 正方形单元格：取宽高较小者，按网格数整除
      const maxCellW = Math.floor(availW / Config.COLS);
      const maxCellH = Math.floor(availH / Config.ROWS);
      let cell = Math.min(maxCellW, maxCellH);
      if (cell < 12) cell = 12; // 下限：保证可玩

      this.cell = cell;
      this.dpr = window.devicePixelRatio || 1;

      const cssW = cell * Config.COLS;
      const cssH = cell * Config.ROWS;

      // CSS 尺寸
      this.canvas.style.width = cssW + 'px';
      this.canvas.style.height = cssH + 'px';
      // 物理尺寸 = CSS × dpr，防糊
      this.canvas.width = Math.round(cssW * this.dpr);
      this.canvas.height = Math.round(cssH * this.dpr);

      // 重设变换并按 dpr 缩放，使后续绘制以 CSS 像素为单位
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    draw() {
      const ctx = this.ctx;
      const cell = this.cell;
      const s = State.snap;
      const w = cell * Config.COLS;
      const h = cell * Config.ROWS;

      // 清屏 + 背景
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, w, h);

      // 网格淡线（可选，提升可读性）
      ctx.strokeStyle = '#e6e6e6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < Config.COLS; c++) {
        const x = Math.round(c * cell) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let r = 1; r < Config.ROWS; r++) {
        const y = Math.round(r * cell) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // 食物（圆形，对比明显）
      if (s.food) {
        const fx = s.food.col * cell + cell / 2;
        const fy = s.food.row * cell + cell / 2;
        const radius = Math.max(2, cell / 2 - 2);
        ctx.fillStyle = '#c53030';
        ctx.beginPath();
        ctx.arc(fx, fy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 蛇身
      const body = s.snake;
      for (let i = 0; i < body.length; i++) {
        const seg = body[i];
        const x = seg.col * cell;
        const y = seg.row * cell;
        // 蛇头深色区分
        ctx.fillStyle = i === 0 ? '#22543d' : '#2f855a';
        const pad = 1;
        ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      }

      // 状态覆盖层（暂停/结束/胜利/idle 提示）
      this.drawOverlay();
    },

    drawOverlay() {
      const s = State.snap;
      const overlay = document.getElementById('overlay');
      const text = document.getElementById('overlay-text');

      let msg = '';
      let show = false;
      switch (s.state) {
        case 'idle':
          msg = '按方向键 / WASD 开始';
          show = true;
          break;
        case 'paused':
          msg = '已暂停（空格继续）';
          show = true;
          break;
        case 'gameover':
          msg = s.isNewRecord
            ? '游戏结束 · 新纪录 ' + s.score + '！\n空格或按钮重开'
            : '游戏结束 · 本局 ' + s.score + ' 分\n空格或按钮重开';
          show = true;
          break;
        case 'win':
          msg = '通关胜利 · ' + s.score + ' 分\n空格或按钮重开';
          show = true;
          break;
        case 'running':
        default:
          show = false;
          break;
      }

      // 用 DOM 覆盖层而非 Canvas 文本，便于响应式与对比度
      text.textContent = msg;
      overlay.classList.toggle('show', show);
    },
  };

  /* ---------------------------------------------------------
   * 8. Storage（localStorage 容错读写）
   * ------------------------------------------------------- */
  const Storage = {
    loadHighScore() {
      try {
        const raw = localStorage.getItem(Config.HIGH_SCORE_KEY);
        const v = parseInt(raw, 10);
        return Number.isFinite(v) && v > 0 ? v : 0;
      } catch (e) {
        // file:// 限制 / 隐私模式 / 禁用 localStorage
        return 0;
      }
    },

    saveHighScore(v) {
      try {
        localStorage.setItem(Config.HIGH_SCORE_KEY, String(v));
      } catch (e) {
        // 写入失败不阻塞游戏
      }
    },
  };

  /* ---------------------------------------------------------
   * 9. UI（HUD 与控件）
   * ------------------------------------------------------- */
  const UI = {
    els: {},

    init() {
      this.els = {
        score: document.getElementById('score'),
        highScore: document.getElementById('high-score'),
        difficulty: document.getElementById('difficulty'),
        restart: document.getElementById('restart'),
        overlay: document.getElementById('overlay'),
        overlayText: document.getElementById('overlay-text'),
        hint: document.getElementById('hint'),
      };

      // 难度切换：仅 idle/gameover/win 时允许，进行中禁用以满足"进行中不变"
      this.els.difficulty.addEventListener('change', (e) => {
        const s = State.snap;
        if (s.state === 'running' || s.state === 'paused') {
          // 还原为当前生效难度
          e.target.value = s.difficulty;
          return;
        }
        // idle/gameover/win：更新选择，下一局生效
        // 若当前 idle，直接更新 baseInterval 使首局即生效
        s.difficulty = e.target.value;
        s.baseInterval = Config.DIFFICULTY[s.difficulty].interval;
        s.currentInterval = s.baseInterval;
      });

      // 重新开始按钮
      this.els.restart.addEventListener('click', () => {
        startOrRestart();
        // 重开后聚焦棋盘，便于键盘继续
        document.getElementById('board').focus();
      });
    },

    getDifficulty() {
      return this.els.difficulty.value;
    },

    updateScore() {
      this.els.score.textContent = String(State.snap.score);
    },

    updateAll() {
      const s = State.snap;
      this.els.score.textContent = String(s.score);
      this.els.highScore.textContent = String(s.highScore);
      // 同步难度 select 显示
      this.els.difficulty.value = s.difficulty;
      // 触发覆盖层重绘（由 Render.draw 调用 drawOverlay）
    },
  };

  /* ---------------------------------------------------------
   * 失焦 / 切屏自动暂停
   * ------------------------------------------------------- */
  function bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const s = State.snap;
        if (s.state === 'running') {
          s.state = 'paused';
          UI.updateAll();
        }
      }
    });

    window.addEventListener('blur', () => {
      const s = State.snap;
      if (s.state === 'running') {
        s.state = 'paused';
        UI.updateAll();
      }
    });
  }

  /* ---------------------------------------------------------
   * 响应式：resize / orientationchange → 重算尺寸；进行中自动暂停
   * ------------------------------------------------------- */
  function bindResize() {
    let resizeTimer = null;
    const onResize = () => {
      Render.resize();
      // 进行中切屏/缩放：自动暂停，状态保留
      const s = State.snap;
      if (s.state === 'running') {
        s.state = 'paused';
        UI.updateAll();
      }
      Render.draw();
    };

    window.addEventListener('resize', () => {
      // 简单防抖
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 120);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(onResize, 200);
    });
  }

  /* ---------------------------------------------------------
   * 启动
   * ------------------------------------------------------- */
  function boot() {
    UI.init();
    Render.init();

    // 读取持久化最高分
    State.snap.highScore = Storage.loadHighScore();

    // 初始化一局（idle 状态，等待首次方向输入）
    State.init(UI.getDifficulty());
    UI.updateAll();

    // 绑定输入与生命周期事件
    Input.bindKeyboard();
    Input.bindTouch();
    bindVisibility();
    bindResize();

    // 启动渲染循环（idle 时仅渲染，不推进逻辑）
    Loop.lastTime = performance.now();
    Loop.accumulator = 0;
    Loop.rafId = requestAnimationFrame(Loop.tick);

    // 聚焦棋盘，便于键盘操作
    document.getElementById('board').focus();
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
