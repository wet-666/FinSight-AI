<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  isRegister?: boolean
}>(), {
  isRegister: false
})

/** 装饰用确定性 K 线（非真实行情） */
const candles = computed(() => {
  const list: { x: number; open: number; close: number; high: number; low: number; up: boolean }[] = []
  let price = 52
  for (let i = 0; i < 24; i++) {
    const open = price
    const wave = Math.sin(i / 3.2) * 5 + ((i * 17) % 7) - 3
    const close = Math.max(22, Math.min(78, open + wave * 0.45))
    const high = Math.max(open, close) + 2.2
    const low = Math.min(open, close) - 2.2
    list.push({
      x: 20 + i * 14,
      open,
      close,
      high,
      low,
      up: close >= open
    })
    price = close
  }
  return list
})

const title = computed(() => (props.isRegister ? '开启投研之旅' : '欢迎回来'))
const subtitle = computed(() =>
  props.isRegister ? '注册账户，用 Agent 读懂市场与舆情' : '登录后继续你的 A 股研究与模拟'
)
</script>

<template>
  <div class="left-panel">
    <div class="brand">
      <div class="logo-mark">FS</div>
      <h2>{{ title }}</h2>
      <p>{{ subtitle }}</p>
    </div>

    <div class="chart-wrap">
      <svg viewBox="0 0 360 120" class="kline-chart" aria-hidden="true">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(96,165,250,0.35)" />
            <stop offset="100%" stop-color="rgba(96,165,250,0)" />
          </linearGradient>
        </defs>

        <g class="grid" opacity="0.12">
          <line v-for="i in 5" :key="'h'+i" x1="10" :y1="i*24" x2="350" :y2="i*24" stroke="#fff" />
          <line v-for="i in 12" :key="'v'+i" :x1="i*28" y1="8" :x2="i*28" y2="112" stroke="#fff" />
        </g>

        <path
          class="trend-area"
          :d="`M20,${100 - candles[0].close} ` +
              candles.map((c) => `L${c.x},${100 - c.close}`).join(' ') +
              ` L${candles[candles.length-1].x},120 L20,120 Z`"
          fill="url(#areaGrad)"
        />

        <g v-for="(c, i) in candles" :key="i" class="candle" :class="{ up: c.up, down: !c.up }">
          <line
            :x1="c.x" :y1="100 - c.high"
            :x2="c.x" :y2="100 - c.low"
            stroke-width="1.5"
          />
          <rect
            :x="c.x - 4"
            :y="100 - Math.max(c.open, c.close)"
            width="8"
            :height="Math.max(6, Math.abs(c.close - c.open))"
            rx="1"
          />
        </g>

        <polyline
          class="trend-line"
          :points="candles.map(c => `${c.x},${100 - c.close}`).join(' ')"
          fill="none"
          stroke-width="1.8"
        />
      </svg>

      <div class="ticker">
        <span class="label">INDEX</span>
        <span class="price">3,842.56</span>
        <span class="up">+0.48%</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.left-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  color: #fff;
  background: linear-gradient(160deg, #1e3a5f 0%, #0f172a 55%, #111827 100%);
  position: relative;
  overflow: hidden;
}

.brand {
  position: relative;
  z-index: 1;
  padding: 40px 36px 20px;
  flex-shrink: 0;

  .logo-mark {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #eff6ff;
    background: linear-gradient(145deg, #3b82f6, #1d4ed8);
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.6;
  }
}

/* 贴齐左侧栏四边，不再悬浮出一圈空隙 */
.chart-wrap {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 16px 20px 20px;
  border-radius: 0;
  border: none;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.kline-chart {
  width: 100%;
  height: auto;
  display: block;

  .candle {
    &.up line,
    &.up rect {
      stroke: #f87171;
      fill: #f87171;
    }
    &.down line,
    &.down rect {
      stroke: #34d399;
      fill: #34d399;
    }
  }

  .trend-line {
    stroke: #93c5fd;
    opacity: 0.85;
  }
}

.ticker {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;

  .label {
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: 0.08em;
  }
  .up {
    color: #f87171;
    font-weight: 600;
  }
  .price {
    color: #e2e8f0;
    font-weight: 600;
  }
}
</style>
