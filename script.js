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

  /**
   * Тур: подпись, цель очков, скорость падения (px/с), интервал спавна (мс),
   * доля плохих предметов (0–1).
   */
  const LEVELS = [
    {
      num: 1,
      diffLabel: "Лёгкий",
      targetScore: 50,
      speedMin: 88,
      speedMax: 155,
      spawnMin: 640,
      spawnMax: 1080,
      badChance: 0.32,
    },
    {
      num: 2,
      diffLabel: "Средний",
      targetScore: 50,
      speedMin: 155,
      speedMax: 248,
      spawnMin: 400,
      spawnMax: 760,
      badChance: 0.44,
    },
    {
      num: 3,
      diffLabel: "Сложный",
      targetScore: 50,
      speedMin: 218,
      speedMax: 335,
      spawnMin: 280,
      spawnMax: 520,
      badChance: 0.58,
    },
  ];

  const START_LIVES = 3;
  const mobileApp = document.documentElement.classList.contains("mobile-app");
  const BASKET_FOLLOW = mobileApp ? 26 : 22;
  const KEYBOARD_PX_PER_S = 380;

  const BASKET_W = 88;
  const BASKET_H = 52;
  const BASKET_BOTTOM = 10;
  const ITEM_SIZE = 44;

  const playfield = document.getElementById("playfield");
  const basket = document.getElementById("basket");
  const tourNumEl = document.getElementById("tour-num");
  const tourDiffEl = document.getElementById("tour-diff");
  const scoreEl = document.getElementById("score");
  const targetScoreEl = document.getElementById("target-score");
  const livesEl = document.getElementById("lives");
  const overlayIntro = document.getElementById("overlay-intro");
  const overlayRound = document.getElementById("overlay-round");
  const overlayVictory = document.getElementById("overlay-victory");
  const roundTitleEl = document.getElementById("round-title");
  const roundTextEl = document.getElementById("round-text");
  const btnStart = document.getElementById("btn-start");
  const btnNextTour = document.getElementById("btn-next-tour");
  const btnRetryRound = document.getElementById("btn-retry-round");
  const btnVictoryReplay = document.getElementById("btn-victory-replay");

  let currentTourIndex = 0;
  let isRunning = false;
  let score = 0;
  let lives = START_LIVES;
  let rafId = 0;
  let lastTs = 0;
  let nextSpawnAt = 0;
  let basketX = 0;
  let targetBasketX = 0;
  let keyLeft = false;
  let keyRight = false;
  let touchSteerLeft = false;
  let touchSteerRight = false;

  /** @type {{ el: HTMLDivElement, y: number, speed: number, good: boolean }[]} */
  const items = [];

  function currentLevel() {
    return LEVELS[currentTourIndex];
  }

  function setHud() {
    const lv = currentLevel();
    tourNumEl.textContent = String(lv.num);
    tourDiffEl.textContent = lv.diffLabel;
    scoreEl.textContent = String(score);
    targetScoreEl.textContent = String(lv.targetScore);
    livesEl.textContent = String(lives);
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

  function applyBasketVisual(x) {
    basketX = x;
    basket.style.left = basketX + "px";
  }

  function setTargetFromClientX(clientX) {
    const rect = playfield.getBoundingClientRect();
    const centerLocal = clientX - rect.left;
    targetBasketX = clampBasketX(centerLocal - BASKET_W / 2);
  }

  function smoothBasket(dt) {
    const alpha = 1 - Math.exp(-BASKET_FOLLOW * dt);
    const next = basketX + (targetBasketX - basketX) * alpha;
    if (Math.abs(targetBasketX - next) < 0.08) {
      applyBasketVisual(targetBasketX);
    } else {
      applyBasketVisual(next);
    }
  }

  function resetSteer() {
    touchSteerLeft = false;
    touchSteerRight = false;
  }

  function updateTargetFromKeyboard(dt) {
    let dir = 0;
    if (keyLeft || touchSteerLeft) dir -= 1;
    if (keyRight || touchSteerRight) dir += 1;
    if (dir === 0) return;
    targetBasketX = clampBasketX(targetBasketX + dir * KEYBOARD_PX_PER_S * dt);
  }

  const touchBlockOpts = { passive: false };

  function onTouchMoveBlockScroll(ev) {
    if (isRunning && ev.cancelable) ev.preventDefault();
  }

  function bindTouchSteerButtons() {
    const tl = document.getElementById("touch-left");
    const tr = document.getElementById("touch-right");
    if (!tl || !tr) return;

    function armLeft() {
      touchSteerLeft = true;
    }
    function armRight() {
      touchSteerRight = true;
    }
    function disarmLeft() {
      touchSteerLeft = false;
    }
    function disarmRight() {
      touchSteerRight = false;
    }

    tl.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try {
        tl.setPointerCapture(e.pointerId);
      } catch (_) {}
      armLeft();
    });
    tl.addEventListener("pointerup", disarmLeft);
    tl.addEventListener("pointercancel", disarmLeft);
    tl.addEventListener("lostpointercapture", disarmLeft);

    tr.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try {
        tr.setPointerCapture(e.pointerId);
      } catch (_) {}
      armRight();
    });
    tr.addEventListener("pointerup", disarmRight);
    tr.addEventListener("pointercancel", disarmRight);
    tr.addEventListener("lostpointercapture", disarmRight);
  }

  function onWindowPointerMove(ev) {
    if (!isRunning) return;
    setTargetFromClientX(ev.clientX ?? 0);
  }

  function onPlayfieldPointerDown(ev) {
    if (!isRunning) return;
    setTargetFromClientX(ev.clientX ?? 0);
  }

  function onKeyDown(ev) {
    if (!isRunning) return;
    if (ev.key === "ArrowLeft") {
      keyLeft = true;
      ev.preventDefault();
    } else if (ev.key === "ArrowRight") {
      keyRight = true;
      ev.preventDefault();
    }
  }

  function onKeyUp(ev) {
    if (ev.key === "ArrowLeft") keyLeft = false;
    else if (ev.key === "ArrowRight") keyRight = false;
  }

  function onWindowBlur() {
    keyLeft = false;
    keyRight = false;
    resetSteer();
  }

  function attachControls() {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    playfield.addEventListener("pointerdown", onPlayfieldPointerDown);
    if (mobileApp) {
      window.addEventListener("touchmove", onTouchMoveBlockScroll, touchBlockOpts);
    }
  }

  function detachControls() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    playfield.removeEventListener("pointerdown", onPlayfieldPointerDown);
    if (mobileApp) {
      window.removeEventListener("touchmove", onTouchMoveBlockScroll, touchBlockOpts);
    }
  }

  function clearItems() {
    for (const it of items) {
      it.el.remove();
    }
    items.length = 0;
  }

  function pickType() {
    const lv = currentLevel();
    const roll = Math.random();
    const pool = roll < lv.badChance ? BAD : GOOD;
    return pool[(Math.random() * pool.length) | 0];
  }

  function spawnItem() {
    const w = playfieldWidth();
    const h = playfieldHeight();
    if (w < ITEM_SIZE || h < 80) return;

    const lv = currentLevel();
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

    const speed = lv.speedMin + Math.random() * (lv.speedMax - lv.speedMin);
    items.push({ el, y: -ITEM_SIZE, speed, good: type.good });
  }

  function scheduleNextSpawn(ts) {
    const lv = currentLevel();
    nextSpawnAt = ts + lv.spawnMin + Math.random() * (lv.spawnMax - lv.spawnMin);
  }

  function collide(it) {
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

  function stopPlay() {
    if (!isRunning) return;
    isRunning = false;
    cancelAnimationFrame(rafId);
    detachControls();
    onWindowBlur();
  }

  function replayCardAnimation(card) {
    if (!card) return;
    card.classList.remove("overlay-card--entrance");
    void card.offsetWidth;
    card.classList.add("overlay-card--entrance");
  }

  function hideOverlay(el) {
    el.classList.remove("overlay--visible");
    el.setAttribute("aria-hidden", "true");
  }

  function showOverlay(el) {
    el.classList.add("overlay--visible");
    el.setAttribute("aria-hidden", "false");
    replayCardAnimation(el.querySelector(".overlay-card"));
  }

  function endTourWin() {
    stopPlay();
    clearItems();

    const lv = currentLevel();
    if (currentTourIndex >= LEVELS.length - 1) {
      hideOverlay(overlayRound);
      showOverlay(overlayVictory);
      return;
    }

    roundTitleEl.textContent = "Тур " + lv.num + " пройден!";
    roundTextEl.textContent =
      "Вы набрали " +
      score +
      " из " +
      lv.targetScore +
      " очков. Цель выполнена.";
    btnNextTour.hidden = false;
    btnRetryRound.hidden = true;

    hideOverlay(overlayIntro);
    hideOverlay(overlayVictory);
    showOverlay(overlayRound);
  }

  function endTourLose() {
    stopPlay();
    clearItems();

    const lv = currentLevel();
    roundTitleEl.textContent = "Тур не пройден";
    roundTextEl.textContent =
      "У вас не осталось жизней. Счёт: " +
      score +
      " из " +
      lv.targetScore +
      " очков. Попробуйте этот тур снова.";
    btnNextTour.hidden = true;
    btnRetryRound.hidden = false;

    hideOverlay(overlayIntro);
    hideOverlay(overlayVictory);
    showOverlay(overlayRound);
  }

  function tick(ts) {
    if (!isRunning) return;

    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (ts >= nextSpawnAt) {
      spawnItem();
      scheduleNextSpawn(ts);
    }

    updateTargetFromKeyboard(dt);
    smoothBasket(dt);

    const lv = currentLevel();
    const h = playfieldHeight();

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.speed * dt;
      it.el.style.top = it.y + "px";

      if (collide(it)) {
        if (it.good) {
          score += 1;
          removeItemAt(i);
          setHud();
          if (score >= lv.targetScore) {
            endTourWin();
            return;
          }
        } else {
          lives -= 1;
          removeItemAt(i);
          setHud();
          if (lives <= 0) {
            lives = 0;
            endTourLose();
            return;
          }
        }
        continue;
      }

      if (it.y > h + ITEM_SIZE) {
        removeItemAt(i);
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function beginTour() {
    hideOverlay(overlayIntro);
    hideOverlay(overlayRound);
    hideOverlay(overlayVictory);

    clearItems();
    score = 0;
    lives = START_LIVES;
    lastTs = 0;
    setHud();

    const w = playfieldWidth();
    const startX = clampBasketX((w - BASKET_W) / 2);
    targetBasketX = startX;
    applyBasketVisual(startX);

    isRunning = true;
    attachControls();
    scheduleNextSpawn(performance.now());
    rafId = requestAnimationFrame(tick);
  }

  function onIntroStart() {
    currentTourIndex = 0;
    beginTour();
  }

  function onNextTour() {
    hideOverlay(overlayRound);
    currentTourIndex += 1;
    beginTour();
  }

  function onRetryRound() {
    hideOverlay(overlayRound);
    beginTour();
  }

  function onVictoryReplay() {
    hideOverlay(overlayVictory);
    currentTourIndex = 0;
    setHud();
    showOverlay(overlayIntro);
  }

  btnStart.addEventListener("click", onIntroStart);
  btnNextTour.addEventListener("click", onNextTour);
  btnRetryRound.addEventListener("click", onRetryRound);
  btnVictoryReplay.addEventListener("click", onVictoryReplay);

  bindTouchSteerButtons();

  window.addEventListener("resize", () => {
    targetBasketX = clampBasketX(targetBasketX);
    applyBasketVisual(clampBasketX(basketX));
  });

  currentTourIndex = 0;
  setHud();
  const initialX = clampBasketX((playfieldWidth() - BASKET_W) / 2);
  targetBasketX = initialX;
  applyBasketVisual(initialX);
})();
