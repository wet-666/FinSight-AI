<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';

interface Props {
  className?: string;
  count?: number;
  maxVelocity?: number;
  repulsionRadius?: number;
  scrollStrength?: number;
  minSize?: number;
  maxSize?: number;
  gap?: number;
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
  count: 45,
  maxVelocity: 0.8,
  repulsionRadius: 100,
  scrollStrength: 0.12,
  minSize: 16,
  maxSize: 26,
  gap: 6,
});

type MoneyType = 'gold' | 'silver' | 'note' | 'ingot';

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  wanderAngle: number;
  wanderTarget: number;
  wanderTimer: number;
  wobblePhase: number;
  type: MoneyType;
}

const SOLVER_ITERATIONS = 6;
const DAMPING = 0.988;
const WANDER_FORCE_RATIO = 0.85;

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
const containerRef = useTemplateRef<HTMLDivElement>('containerRef');

let coins: Coin[] = [];
let animationId = 0;
let width = 0;
let height = 0;
let dpr = 1;
let isVisible = false;

const pointer = { x: -9999, y: -9999 };
const scrollImpulse = { x: 0, y: 0 };

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

/** 移动力度随 maxVelocity 联动，保证自主运动与鼠标推开速度一致 */
function moveForce() {
  return props.maxVelocity * 0.065;
}

function pickType(): MoneyType {
  const roll = Math.random();
  if (roll < 0.4) return 'gold';
  if (roll < 0.65) return 'silver';
  if (roll < 0.85) return 'note';
  return 'ingot';
}

function canPlace(x: number, y: number, radius: number, existing: Coin[]) {
  for (const c of existing) {
    const minDist = radius + c.radius + props.gap;
    if ((x - c.x) ** 2 + (y - c.y) ** 2 < minDist ** 2) return false;
  }
  return true;
}

function initCoins() {
  coins = [];
  const margin = props.maxSize + props.gap;
  const initSpeed = props.maxVelocity * 0.65;

  for (let i = 0; i < props.count; i++) {
    const type = pickType();
    const radius =
      type === 'note'
        ? rand(props.minSize * 1.1, props.maxSize * 1.15)
        : type === 'ingot'
          ? rand(props.minSize * 0.9, props.maxSize * 0.95)
          : rand(props.minSize, props.maxSize);

    let placed = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = rand(margin, Math.max(margin + 1, width - margin));
      const y = rand(margin, Math.max(margin + 1, height - margin));
      if (canPlace(x, y, radius, coins)) {
        const angle = rand(0, Math.PI * 2);
        coins.push({
          x,
          y,
          vx: Math.cos(angle) * initSpeed,
          vy: Math.sin(angle) * initSpeed,
          radius,
          rotation: rand(0, Math.PI * 2),
          rotationSpeed: rand(-0.015, 0.015),
          wanderAngle: angle,
          wanderTarget: rand(0, Math.PI * 2),
          wanderTimer: rand(40, 100),
          wobblePhase: rand(0, Math.PI * 2),
          type,
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      const angle = rand(0, Math.PI * 2);
      coins.push({
        x: rand(radius, width - radius),
        y: rand(radius, height - radius),
        vx: Math.cos(angle) * initSpeed,
        vy: Math.sin(angle) * initSpeed,
        radius,
        rotation: rand(0, Math.PI * 2),
        rotationSpeed: rand(-0.015, 0.015),
        wanderAngle: angle,
        wanderTarget: rand(0, Math.PI * 2),
        wanderTimer: rand(40, 100),
        wobblePhase: rand(0, Math.PI * 2),
        type,
      });
    }
  }
}

function resize() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  width = container.clientWidth;
  height = container.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (coins.length === 0) {
    initCoins();
  } else {
    for (const coin of coins) {
      coin.x = clamp(coin.x, coin.radius, width - coin.radius);
      coin.y = clamp(coin.y, coin.radius, height - coin.radius);
    }
    for (let i = 0; i < SOLVER_ITERATIONS; i++) resolveAllOverlaps();
  }
}

function separatePair(a: Coin, b: Coin) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const minDist = a.radius + b.radius + props.gap;

  if (distSq === 0) {
    const angle = Math.random() * Math.PI * 2;
    const push = minDist * 0.5;
    a.x -= Math.cos(angle) * push;
    a.y -= Math.sin(angle) * push;
    b.x += Math.cos(angle) * push;
    b.y += Math.sin(angle) * push;
    return;
  }

  if (distSq >= minDist * minDist) return;

  const dist = Math.sqrt(distSq);
  const overlap = (minDist - dist) / dist;
  const half = overlap * 0.5;
  a.x -= dx * half;
  a.y -= dy * half;
  b.x += dx * half;
  b.y += dy * half;
}

function resolveAllOverlaps() {
  for (let i = 0; i < coins.length; i++) {
    for (let j = i + 1; j < coins.length; j++) {
      separatePair(coins[i], coins[j]);
    }
  }
}

function constrainToBounds(coin: Coin) {
  const pad = 2;
  if (coin.x - coin.radius < pad) {
    coin.x = coin.radius + pad;
    coin.vx = Math.abs(coin.vx) * 0.4;
  } else if (coin.x + coin.radius > width - pad) {
    coin.x = width - coin.radius - pad;
    coin.vx = -Math.abs(coin.vx) * 0.4;
  }
  if (coin.y - coin.radius < pad) {
    coin.y = coin.radius + pad;
    coin.vy = Math.abs(coin.vy) * 0.4;
  } else if (coin.y + coin.radius > height - pad) {
    coin.y = height - coin.radius - pad;
    coin.vy = -Math.abs(coin.vy) * 0.4;
  }
}

/** 始终运行：鼠标在页面上也不停止自主游动 */
function applyAutonomousWander(coin: Coin, dt: number) {
  coin.wanderTimer -= dt;
  if (coin.wanderTimer <= 0) {
    coin.wanderTarget = rand(0, Math.PI * 2);
    coin.wanderTimer = rand(45, 120);
  }

  let diff = coin.wanderTarget - coin.wanderAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  coin.wanderAngle += diff * 0.04 * dt;

  const force = moveForce() * WANDER_FORCE_RATIO;
  coin.vx += Math.cos(coin.wanderAngle) * force * dt;
  coin.vy += Math.sin(coin.wanderAngle) * force * dt;
}

/** 仅鼠标靠近时叠加斥力，与自主游动同时生效 */
function applyPointerRepulsion(coin: Coin, dt: number) {
  const dx = coin.x - pointer.x;
  const dy = coin.y - pointer.y;
  const dist = Math.hypot(dx, dy);
  const influence = props.repulsionRadius + coin.radius;

  if (dist > influence || dist < 0.001) return;

  const ratio = 1 - dist / influence;
  const force = ratio * ratio * moveForce();
  coin.vx += (dx / dist) * force * dt;
  coin.vy += (dy / dist) * force * dt;
}

/** 防止阻尼把速度衰减到 0，保证一直缓慢运动 */
function maintainMinSpeed(coin: Coin) {
  const speed = Math.hypot(coin.vx, coin.vy);
  const minSpeed = props.maxVelocity * 0.3;
  if (speed < minSpeed) {
    const angle = speed < 0.001 ? coin.wanderAngle : Math.atan2(coin.vy, coin.vx);
    coin.vx = Math.cos(angle) * minSpeed;
    coin.vy = Math.sin(angle) * minSpeed;
  }
}

function limitSpeed(coin: Coin) {
  const speed = Math.hypot(coin.vx, coin.vy);
  if (speed > props.maxVelocity) {
    coin.vx = (coin.vx / speed) * props.maxVelocity;
    coin.vy = (coin.vy / speed) * props.maxVelocity;
  }
}

function updatePhysics(dt: number) {
  for (const coin of coins) {
    applyAutonomousWander(coin, dt);
    coin.vx += scrollImpulse.x;
    coin.vy += scrollImpulse.y;
    applyPointerRepulsion(coin, dt);
    coin.vx *= DAMPING;
    coin.vy *= DAMPING;
    maintainMinSpeed(coin);
    limitSpeed(coin);
    coin.x += coin.vx * dt;
    coin.y += coin.vy * dt;
    coin.rotation += (coin.rotationSpeed + coin.vx * 0.004) * dt;
  }

  scrollImpulse.x *= 0.88;
  scrollImpulse.y *= 0.88;

  for (let i = 0; i < SOLVER_ITERATIONS; i++) {
    resolveAllOverlaps();
    for (const coin of coins) constrainToBounds(coin);
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.ellipse(r * 0.06, r * 0.2, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fill();
}

function drawGoldCoin(ctx: CanvasRenderingContext2D, r: number) {
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
  grad.addColorStop(0, '#fff9e6');
  grad.addColorStop(0.3, '#ffe082');
  grad.addColorStop(0.65, '#ffb300');
  grad.addColorStop(1, '#c68400');

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#a66a00';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(166, 106, 0, 0.5)';
  ctx.lineWidth = r * 0.04;
  ctx.stroke();

  ctx.fillStyle = '#8a5500';
  ctx.font = `700 ${Math.floor(r * 0.9)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¥', 0, 1);
}

function drawSilverCoin(ctx: CanvasRenderingContext2D, r: number) {
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#e0e0e0');
  grad.addColorStop(0.7, '#bdbdbd');
  grad.addColorStop(1, '#757575');

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#616161';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.stroke();

  ctx.fillStyle = '#424242';
  ctx.font = `700 ${Math.floor(r * 0.75)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 0, 1);
}

function drawBanknote(ctx: CanvasRenderingContext2D, r: number) {
  const w = r * 1.55;
  const h = r * 0.95;
  const rad = r * 0.12;

  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, '#1b8a5a');
  grad.addColorStop(0.5, '#26a96c');
  grad.addColorStop(1, '#157a4e');

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, rad);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#0d5c38';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 ${Math.floor(r * 0.55)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('100', 0, 0);
}

function drawIngot(ctx: CanvasRenderingContext2D, r: number) {
  const w = r * 1.4;
  const h = r * 0.75;

  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, '#ffe082');
  grad.addColorStop(0.5, '#ffb300');
  grad.addColorStop(1, '#ff8f00');

  ctx.beginPath();
  ctx.moveTo(-w * 0.35, -h / 2);
  ctx.lineTo(w * 0.35, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#c68400';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#9a6208';
  ctx.font = `600 ${Math.floor(r * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Au', 0, 0);
}

function drawCoin(ctx: CanvasRenderingContext2D, coin: Coin, time: number) {
  const r = coin.radius;
  const wobble = 1 + Math.sin(time * 0.002 + coin.wobblePhase) * 0.03;
  const tilt = coin.vx * 0.015;

  ctx.save();
  ctx.translate(coin.x, coin.y);
  ctx.rotate(coin.rotation + tilt);
  ctx.scale(wobble, wobble);

  drawShadow(ctx, r);

  switch (coin.type) {
    case 'gold':
      drawGoldCoin(ctx, r);
      break;
    case 'silver':
      drawSilverCoin(ctx, r);
      break;
    case 'note':
      drawBanknote(ctx, r);
      break;
    case 'ingot':
      drawIngot(ctx, r);
      break;
  }

  // 统一高光
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.18, r * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();

  ctx.restore();
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (const coin of coins) {
    drawCoin(ctx, coin, lastTime);
  }
}

let lastTime = 0;

function tick(now: number) {
  const dt = lastTime ? Math.min((now - lastTime) / 16.67, 2) : 1;
  lastTime = now;
  updatePhysics(dt);
  render();
  animationId = requestAnimationFrame(tick);
}

function onPointerMove(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
}

function onWheel(e: WheelEvent) {
  scrollImpulse.x += e.deltaX * 0.0004 * props.scrollStrength;
  scrollImpulse.y += e.deltaY * 0.0004 * props.scrollStrength;
}

let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;

function start() {
  if (isVisible) return;
  isVisible = true;
  lastTime = 0;
  animationId = requestAnimationFrame(tick);
}

function stop() {
  isVisible = false;
  cancelAnimationFrame(animationId);
}

onMounted(() => {
  resize();

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerRef.value);
  }

  if (canvasRef.value) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) start();
        else stop();
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(canvasRef.value);
  }

  start();
});

onUnmounted(() => {
  stop();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('wheel', onWheel);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
});
</script>

<template>
  <div ref="containerRef" :class="['coin-ballpit', className]">
    <canvas ref="canvasRef" class="coin-ballpit__canvas" />
  </div>
</template>

<style scoped>
.coin-ballpit {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.coin-ballpit__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
