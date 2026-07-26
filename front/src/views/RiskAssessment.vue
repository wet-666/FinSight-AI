<template>
  <div class="page-container">
    <LegalDisclaimer />

    <t-card title="投资风险测评" subtitle="了解您的风险偏好，获得更合适的模拟策略建议" :bordered="false">
      <div v-if="!finished">
        <h3 class="q-title">{{ questions[step].title }}</h3>
        <t-radio-group v-model="answers[step]" class="q-options">
          <t-radio v-for="(opt, i) in questions[step].options" :key="i" :value="opt.score">
            {{ opt.label }}
          </t-radio>
        </t-radio-group>
        <div class="q-actions">
          <t-button v-if="step > 0" variant="outline" @click="step--">上一题</t-button>
          <t-button theme="primary" @click="next">{{ step < questions.length - 1 ? '下一题' : '查看结果' }}</t-button>
        </div>
      </div>

      <div v-else class="result">
        <t-result
          :theme="resultTheme"
          :title="resultTitle"
          :description="resultDesc"
        />
        <t-space style="margin-top: 16px">
          <t-button theme="primary" @click="$router.push('/sim-trading')">进入模拟投资</t-button>
          <t-button variant="outline" @click="restart">重新测评</t-button>
        </t-space>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';

const step = ref(0);
const finished = ref(false);
const answers = ref<number[]>([]);

const questions = [
  {
    title: '1. 您的投资经验如何？',
    options: [
      { label: '几乎没有', score: 1 },
      { label: '1-3年', score: 2 },
      { label: '3年以上', score: 3 },
    ],
  },
  {
    title: '2. 若模拟账户亏损10%，您会？',
    options: [
      { label: '立即全部卖出', score: 1 },
      { label: '观望等待', score: 2 },
      { label: '考虑加仓', score: 3 },
    ],
  },
  {
    title: '3. 您期望的模拟投资风格？',
    options: [
      { label: '稳健保值', score: 1 },
      { label: '均衡增长', score: 2 },
      { label: '积极进取', score: 3 },
    ],
  },
  {
    title: '4. 您对AI分析结果的态度？',
    options: [
      { label: '仅作参考，自己判断', score: 3 },
      { label: '比较依赖', score: 2 },
      { label: '希望AI给明确买卖信号', score: 1 },
    ],
  },
  {
    title: '5. 您计划持有模拟仓位的时间？',
    options: [
      { label: '少于1个月', score: 1 },
      { label: '1-6个月', score: 2 },
      { label: '6个月以上', score: 3 },
    ],
  },
];

const totalScore = computed(() => answers.value.reduce((a, b) => a + b, 0));

const resultTitle = computed(() => {
  const s = totalScore.value;
  if (s <= 8) return '保守型投资者';
  if (s <= 12) return '稳健型投资者';
  return '积极型投资者';
});

const resultDesc = computed(() => {
  const s = totalScore.value;
  if (s <= 8) return '建议模拟体验以大盘蓝筹为主，关注低波动策略，AI展望仅供参考。';
  if (s <= 12) return '适合均衡配置模拟组合，可结合舆情与回测功能学习投资逻辑。';
  return '可尝试更多策略回测与模拟交易，但仍需注意风险控制，切勿将模拟结果等同于实盘。';
});

const resultTheme = computed(() => {
  const s = totalScore.value;
  if (s <= 8) return 'success';
  if (s <= 12) return 'primary';
  return 'warning';
});

function next() {
  if (answers.value[step.value] === undefined) return;
  if (step.value < questions.length - 1) {
    step.value++;
  } else {
    finished.value = true;
  }
}

function restart() {
  step.value = 0;
  finished.value = false;
  answers.value = [];
}
</script>

<style scoped>
.q-title {
  margin-bottom: 16px;
  font-size: 16px;
}

.q-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.q-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.result {
  text-align: center;
  padding: 24px 0;
}
</style>
