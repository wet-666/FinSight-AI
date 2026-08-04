<template>
  <div class="stock-suggest">
    <div v-if="showHot" class="hot-row">
      <span class="hot-label">热门</span>
      <button
        v-for="s in hotList"
        :key="s.code"
        type="button"
        class="hot-chip"
        @click="pick(s)"
      >
        {{ s.name }}
      </button>
    </div>
    <div class="input-row">
      <t-input
        v-model="code"
        :placeholder="codePlaceholder"
        :style="{ width: codeWidth }"
        clearable
        @focus="open = true"
        @blur="onBlur"
      />
      <t-input
        v-model="name"
        :placeholder="namePlaceholder"
        :style="{ width: nameWidth }"
        clearable
        @focus="open = true"
        @blur="onBlur"
      />
    </div>
    <ul v-if="open && suggestions.length" class="suggest-list">
      <li
        v-for="s in suggestions"
        :key="s.code"
        @mousedown.prevent="pick(s)"
      >
        <span class="s-code">{{ s.code }}</span>
        <span class="s-name">{{ s.name }}</span>
        <span v-if="s.industry" class="s-ind">{{ s.industry }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { HOT_STOCKS, suggestStocks, type StockOption } from '@/data/stockCatalog';

const props = withDefaults(
  defineProps<{
    stockCode: string;
    stockName: string;
    showHot?: boolean;
    codeWidth?: string;
    nameWidth?: string;
    codePlaceholder?: string;
    namePlaceholder?: string;
    hotLimit?: number;
  }>(),
  {
    showHot: true,
    codeWidth: '120px',
    nameWidth: '160px',
    codePlaceholder: '代码 如 600519',
    namePlaceholder: '名称 如 贵州茅台',
    hotLimit: 8,
  }
);

const emit = defineEmits<{
  'update:stockCode': [string];
  'update:stockName': [string];
  select: [StockOption];
}>();

const code = ref(props.stockCode);
const name = ref(props.stockName);
const open = ref(false);
const activeField = ref<'code' | 'name'>('code');

watch(
  () => props.stockCode,
  (v) => {
    if (v !== code.value) code.value = v;
  }
);
watch(
  () => props.stockName,
  (v) => {
    if (v !== name.value) name.value = v;
  }
);

watch(code, (val) => {
  emit('update:stockCode', val);
  activeField.value = 'code';
  open.value = true;
  if (/^\d{3,6}$/.test(val)) {
    const hit = suggestStocks(val, 1)[0];
    if (hit && hit.code.startsWith(val)) {
      name.value = hit.name;
      emit('update:stockName', hit.name);
    }
  }
});

watch(name, (val) => {
  emit('update:stockName', val);
  activeField.value = 'name';
  open.value = true;
  if (val.length >= 2) {
    const hit = suggestStocks(val, 1)[0];
    if (hit && hit.name.includes(val)) {
      code.value = hit.code;
      emit('update:stockCode', hit.code);
    }
  }
});

const hotList = computed(() => HOT_STOCKS.slice(0, props.hotLimit));
const suggestions = computed(() =>
  suggestStocks(activeField.value === 'code' ? code.value : name.value, 8)
);

function pick(s: StockOption) {
  code.value = s.code;
  name.value = s.name;
  open.value = false;
  emit('update:stockCode', s.code);
  emit('update:stockName', s.name);
  emit('select', s);
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
  }, 180);
}
</script>

<style scoped>
.stock-suggest {
  position: relative;
  width: 100%;
}
.hot-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.hot-label {
  font-size: 12px;
  color: #888;
}
.hot-chip {
  border: 1px solid #e7e7e7;
  background: #f7f8fa;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  color: #333;
}
.hot-chip:hover {
  border-color: #0052d9;
  color: #0052d9;
  background: #ecf2fe;
}
.input-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.suggest-list {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #e7e7e7;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 220px;
  overflow-y: auto;
}
.suggest-list li {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}
.suggest-list li:hover {
  background: #ecf2fe;
}
.s-code {
  color: #0052d9;
  font-family: ui-monospace, monospace;
  width: 64px;
}
.s-name {
  flex: 1;
}
.s-ind {
  color: #999;
  font-size: 12px;
}
</style>
