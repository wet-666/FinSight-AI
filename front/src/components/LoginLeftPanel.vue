<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  isRegister?: boolean
}>(), {
  isRegister: false
})

// 随机生成装饰用 K 线数据（非真实行情）
const candles = computed(() => {
  const list: { x: number; open: number; close: number; high: number; low: number; up: boolean }[] = []
  let price = 50
  for (let i = 0; i < 24; i++) {
    const open = price
    const change = (Math.random() - 0.45) * 8
    const close = Math.max(20, Math.min(80, open + change))
    const high = Math.max(open, close) + Math.random() * 4
    const low = Math.min(open, close) - Math.random() * 4
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

const title = computed(() => props.isRegister ? '开启交易之旅' : '欢迎回来')
const subtitle = computed(() => props.isRegister ? '注册账户，实时掌握市场动态' : '登录账户，继续您的投资计划')
</script>

<template>
  <div class="left-panel">
    <div class="brand">
      <div class="logo">📈</div>
      <h2>{{ title }}</h2>
      <p>{{ subtitle }}</p>
    </div>

    <div class="chart-wrap">
      <svg viewBox="0 0 360 120" class="kline-chart" aria-hidden="true">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(208,168,106,0.35)" />
            <stop offset="100%" stop-color="rgba(208,168,106,0)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- 网格线 -->
        <g class="grid" opacity="0.15">
          <line v-for="i in 5" :key="'h'+i" x1="10" :y1="i*24" x2="350" :y2="i*24" stroke="#fff" />
          <line v-for="i in 12" :key="'v'+i" :x1="i*28" y1="8" :x2="i*28" y2="112" stroke="#fff" />
        </g>

        <!-- 趋势线区域 -->
        <path
          class="trend-area"
          :d="`M20,${100 - candles[0].close} ` +
              candles.map((c, i) => `L${c.x},${100 - c.close}`).join(' ') +
              ` L${candles[candles.length-1].x},120 L20,120 Z`"
          fill="url(#areaGrad)"
        />

        <!-- K 线 -->
        <g v-for="(c, i) in candles" :key="i" class="candle" :class="{ up: c.up, down: !c.up }">
          <!-- 影线 -->
          <line
            :x1="c.x" :y1="100 - c.high"
            :x2="c.x" :y2="100 - c.low"
            stroke-width="1.5"
          />
          <!-- 实体 -->
          <rect
            :x="c.x - 4"
            :y="100 - Math.max(c.open, c.close)"
            width="8"
            :height="Math.max(8, Math.abs(c.close - c.open))"
            rx="1"
          />
        </g>

        <!-- 金色趋势线 -->
        <polyline
          class="trend-line"
          :points="candles.map(c => `${c.x},${100 - c.close}`).join(' ')"
          fill="none"
          stroke-width="2"
        />
      </svg>

      <!-- 浮动行情数字 -->
      <div class="ticker">
        <span class="up">+2.38%</span>
        <span class="price">3,842.56</span>
        <span class="vol">Vol 1.2M</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.left-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 48px 40px;
  color: #fff;
  background: linear-gradient(160deg, rgba($gold, 0.22) 0%, rgba(15, 15, 25, 0.92) 55%);
  position: relative;
  overflow: hidden;
}

.brand {
  position: relative;
  z-index: 1;
  margin-bottom: 32px;

  .logo {
    font-size: 36px;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 12px rgba($gold, 0.5));
  }

  h2 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 1px;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.65);
    line-height: 1.6;
  }
}

.chart-wrap {
  position: relative;
  z-index: 1;
  padding: 16px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba($gold, 0.25);
  backdrop-filter: blur(8px);
  margin-bottom: 28px;
}

.kline-chart {
  width: 100%;
  height: auto;
  display: block;

  .candle {
    animation: candleIn 0.6s ease backwards;
    animation-delay: calc(var(--i, 0) * 0.03s);

    &.up line, &.up rect { stroke: $up; fill: $up; }
    &.down line, &.down rect { stroke: $down; fill: $down; }
  }

  .trend-line {
    stroke: $gold;
    filter: url(#glow);
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
    animation: drawLine 2s ease forwards 0.5s;
  }

  .trend-area {
    opacity: 0;
    animation: fadeIn 1s ease forwards 1s;
  }
}

.ticker {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;

  .up { color: $up; font-weight: 600; }
  .price { color: $gold; font-weight: 600; }
  .vol { color: rgba(255,255,255,0.45); }
}


@keyframes drawLine {
  to { stroke-dashoffset: 0; }
}
@keyframes fadeIn {
  to { opacity: 1; }
}
@keyframes candleIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>