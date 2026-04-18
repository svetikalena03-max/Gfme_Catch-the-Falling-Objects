(function () {
  "use strict";

  const GOOD = [
    { emoji: "🍎", good: true },
    { emoji: "⭐", good: true },
    { emoji: "💎", good: true },
  ];
  const BAD = [
    { emoji: "💣", good: false },
    { emoji: "🧱", good: false },
  ];
  const ALL = GOOD.concat(BAD);

  const GAME_DURATION = 30;
  const START_LIVES = 3;
  const SPAWN_MS_MIN = 520;
  const SPAWN_MS_MAX = 980;
  const SPEED_MIN = 140;
  const SPEED_MAX = 260;

  const BASKET_W = 88;
  const BASKET_H = 52;
  const BASKET_BOTTOM = 10;
  const ITEM_SIZE = 44;

  const playfield = document.getElementById("playfield");
  const basket = document.getElementById("basket");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const timerEl = document.getElementById("timer");
  const overlayStart = document.getElementById("overlay-start");
  const overlayEnd = document.getElementById("overlay-end");
  const finalScoreEl = document.getElementById("final-score");
  const btnStart = document.getElementById("btn-start");
  const btnReplay = document.getElementById("btn-replay");

  let isRunning = false;
  let score = 0;
  let lives = START_LIVES;
  let timeLeft = GAME_DURATION;
  let rafId = 0;
  let lastTs = 0;
  let nextSpawnAt = 0;
  let basketX = 0;

  /** @type {{ el: HTMLDivElement, y: number, speed: number, good: boolean }[]} */
  const items = [];

  function setHud() {
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
    timerEl.textContent = String(Math.ceil(timeLeft));
  }

  function playfieldWidth() {
    return playfield.clientWidth;
  }

  function playfieldHeight() {
    return playfield.clientHeight;
  }

  function clampBasketX(x) {
    const w = playfieldWidth();
    const max = Math.max(0, w - BASKET_W);
    return Math.min(max, Math.max(0, x));
  }

  function setBasketPosition(x) {
    basketX = clampBasketX(x);
    basket.style.left = basketX + "px";
  }

  function onPointerMove(ev) {
    if (!isRunning) return;
    const rect = playfield.getBoundingClientRect();
    const cx = (ev.clientX ?? 0) - rect.left;
    setBasketPosition(cx - BASKET_W / 2);
  }

  function clearItems() {
    for (const it of items) {
      it.el.remove();
    }
    items.length = 0;
  }

  function pickType() {
    const roll = Math.random();
    const pool = roll < 0.58 ? GOOD : BAD;
    return pool[(Math.random() * pool.length) | 0];
  }

  function spawnItem() {
    const w = playfieldWidth();
    const h = playfieldHeight();
    if (w < ITEM_SIZE || h < 80) return;

    const type = pickType();
    const el = document.createElement("div");
    el.className = "falling-item";
    el.textContent = type.emoji;
    el.setAttribute("aria-hidden", "true");

    const maxX = w - ITEM_SIZE;
    const x = Math.random() * maxX;
    el.style.left = x + "px";
    el.style.top = "-" + ITEM_SIZE + "px";

    playfield.appendChild(el);

    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    items.push({ el, y: -ITEM_SIZE, speed, good: type.good });
  }

  function scheduleNextSpawn(ts) {
    nextSpawnAt = ts + SPAWN_MS_MIN + Math.random() * (SPAWN_MS_MAX - SPAWN_MS_MIN);
  }

  function collide(it) {
    const w = playfieldWidth();
    const h = playfieldHeight();
    const floorY = h - BASKET_BOTTOM - BASKET_H;
    const itemBottom = it.y + ITEM_SIZE;

    if (itemBottom < floorY - 6) return false;
    if (it.y > h) return false;

    const ix = parseFloat(it.el.style.left) || 0;
    const bx = basketX;
    const overlap = ix < bx + BASKET_W - 8 && ix + ITEM_SIZE > bx + 8;
    return overlap;
  }

  function removeItemAt(index) {
    const [it] = items.splice(index, 1);
    it.el.remove();
  }

  function endGame() {
    if (!isRunning) return;
    isRunning = false;
    cancelAnimationFrame(rafId);
    playfield.removeEventListener("pointermove", onPointerMove);
    playfield.removeEventListener("pointerdown", onPointerMove);

    finalScoreEl.textContent = String(score);
    overlayEnd.classList.add("overlay--visible");
    overlayEnd.setAttribute("aria-hidden", "false");

    const card = overlayEnd.querySelector(".overlay-card");
    if (card) {
      card.classList.remove("overlay-card--entrance");
      void card.offsetWidth;
      card.classList.add("overlay-card--entrance");
    }
  }

  function tick(ts) {
    if (!isRunning) return;

    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      setHud();
      endGame();
      return;
    }

    if (ts >= nextSpawnAt) {
      spawnItem();
      scheduleNextSpawn(ts);
    }

    const h = playfieldHeight();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.speed * dt;
      it.el.style.top = it.y + "px";

      if (collide(it)) {
        if (it.good) {
          score += 1;
        } else {
          lives -= 1;
          if (lives <= 0) {
            lives = 0;
            setHud();
            removeItemAt(i);
            endGame();
            return;
          }
        }
        removeItemAt(i);
        setHud();
        continue;
      }

      if (it.y > h + ITEM_SIZE) {
        removeItemAt(i);
      }
    }

    setHud();
    rafId = requestAnimationFrame(tick);
  }

  function startGame() {
    overlayStart.classList.remove("overlay--visible");
    overlayStart.setAttribute("aria-hidden", "true");
    overlayEnd.classList.remove("overlay--visible");
    overlayEnd.setAttribute("aria-hidden", "true");

    clearItems();
    score = 0;
    lives = START_LIVES;
    timeLeft = GAME_DURATION;
    lastTs = 0;
    setHud();

    const w = playfieldWidth();
    setBasketPosition((w - BASKET_W) / 2);

    isRunning = true;
    playfield.addEventListener("pointermove", onPointerMove);
    playfield.addEventListener("pointerdown", onPointerMove);

    scheduleNextSpawn(performance.now());
    rafId = requestAnimationFrame(tick);
  }

  btnStart.addEventListener("click", startGame);
  btnReplay.addEventListener("click", startGame);

  window.addEventListener("resize", () => {
    if (isRunning) setBasketPosition(basketX);
  });

  setHud();
  setBasketPosition((playfieldWidth() - BASKET_W) / 2);
})();
