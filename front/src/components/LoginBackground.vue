<script setup lang="ts">
/** 轻量行情氛围：网格 + 淡趋势线，无金币物理 */
</script>

<template>
  <div class="market-bg" aria-hidden="true">
    <div class="market-bg__glow market-bg__glow--a" />
    <div class="market-bg__glow market-bg__glow--b" />
    <div class="market-bg__grid" />
    <svg class="market-bg__chart" viewBox="0 0 1200 600" preserveAspectRatio="none">
      <defs>
        <linearGradient id="fsMarketFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--fs-market-line)" stop-opacity="0.18" />
          <stop offset="100%" stop-color="var(--fs-market-line)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path
        class="market-bg__area"
        d="M0,420 C80,400 140,360 220,370 C320,384 380,300 470,310 C560,320 620,250 710,270 C800,290 860,210 950,230 C1040,250 1100,180 1200,200 L1200,600 L0,600 Z"
        fill="url(#fsMarketFill)"
      />
      <path
        class="market-bg__line"
        d="M0,420 C80,400 140,360 220,370 C320,384 380,300 470,310 C560,320 620,250 710,270 C800,290 860,210 950,230 C1040,250 1100,180 1200,200"
        fill="none"
        stroke="var(--fs-market-line)"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </div>
</template>

<style scoped>
.market-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--fs-market-bg);
}

.market-bg__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
}

.market-bg__glow--a {
  width: 42vw;
  height: 42vw;
  top: -12%;
  left: -8%;
  background: var(--fs-market-glow-a);
}

.market-bg__glow--b {
  width: 36vw;
  height: 36vw;
  right: -6%;
  bottom: -10%;
  background: var(--fs-market-glow-b);
}

.market-bg__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--fs-market-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--fs-market-grid) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 45%, #000 20%, transparent 75%);
}

.market-bg__chart {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 58%;
  opacity: 0.9;
}

.market-bg__line {
  stroke-dasharray: 1600;
  stroke-dashoffset: 1600;
  animation: fs-draw-line 4.5s ease forwards;
}

.market-bg__area {
  opacity: 0;
  animation: fs-fade-area 1.2s ease 1.2s forwards;
}

@keyframes fs-draw-line {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes fs-fade-area {
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .market-bg__line,
  .market-bg__area {
    animation: none;
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
</style>
