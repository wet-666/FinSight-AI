<template>
  <div class="page-container">
    <LegalDisclaimer />

    <t-card title="投资风险测评" subtitle="结果会写入账户，并约束模拟交易单票仓位、推荐回测参数" :bordered="false">
      <t-alert
        v-if="savedProfile && !finished"
        theme="info"
        :close="false"
        style="margin-bottom: 16px"
        :message="`当前档案：${savedProfile.levelLabel}（得分 ${savedProfile.score}）。单票上限 ${(savedProfile.maxPositionWeight * 100).toFixed(0)}%。可重新测评覆盖。`"
      />

      <div v-if="!finished">
        <h3 class="q-title">{{ questions[step].title }}</h3>
        <t-radio-group v-model="answers[step]" class="q-options">
          <t-radio v-for="(opt, i) in questions[step].options" :key="i" :value="opt.score">
            {{ opt.label }}
          </t-radio>
        </t-radio-group>
        <div class="q-actions">
          <t-button v-if="step > 0" variant="outline" @click="step--">上一题</t-button>
          <t-button theme="primary" :loading="saving" @click="next">
            {{ step < questions.length - 1 ? '下一题' : '保存结果' }}
          </t-button>
        </div>
      </div>

      <div v-else class="result">
        <t-result :theme="resultTheme" :title="resultTitle" :description="resultDesc" />
        <t-alert
          v-if="savedProfile"
          theme="success"
          :close="false"
          style="margin: 16px auto; max-width: 520px; text-align: left"
          :message="savedProfile.hint"
        />
        <ul v-if="savedProfile" class="result-bullets">
          <li>单票仓位上限：总资产的 {{ (savedProfile.maxPositionWeight * 100).toFixed(0) }}%</li>
          <li>
            回测推荐：情绪阈值 {{ savedProfile.backtestDefaults.sentimentThreshold }}，MA20
            {{ savedProfile.backtestDefaults.useMa20 ? '开启' : '关闭' }}
          </li>
        </ul>
        <t-space style="margin-top: 16px">
          <t-button theme="primary" @click="$router.push('/sim-trading')">进入模拟投资</t-button>
          <t-button variant="outline" @click="$router.push('/backtest')">去策略回测</t-button>
          <t-button variant="outline" @click="restart">重新测评</t-button>
        </t-space>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import { riskApi } from '@/api';
import type { RiskProfile } from '@shared/types/risk';

const step = ref(0);
const finished = ref(false);
const saving = ref(false);
const answers = ref<number[]>([]);
const savedProfile = ref<RiskProfile | null>(null);

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

const resultTitle = computed(() =>
  savedProfile.value ? `${savedProfile.value.levelLabel}投资者` : '测评完成'
);

const resultDesc = computed(() => {
  if (!savedProfile.value) return '';
  return `得分 ${savedProfile.value.score}。结果已保存到账户，将作用于模拟交易仓位上限与回测推荐参数。`;
});

const resultTheme = computed(() => {
  const level = savedProfile.value?.level;
  if (level === 'conservative') return 'success';
  if (level === 'moderate') return 'primary';
  return 'warning';
});

async function loadProfile() {
  try {
    const res = await riskApi.getProfile();
    savedProfile.value = (res.data as RiskProfile | null) || null;
  } catch {
    savedProfile.value = null;
  }
}

async function next() {
  if (answers.value[step.value] === undefined) {
    MessagePlugin.warning('请先选择一项');
    return;
  }
  if (step.value < questions.length - 1) {
    step.value++;
    return;
  }

  saving.value = true;
  try {
    const res = await riskApi.saveProfile(answers.value.slice(0, questions.length));
    savedProfile.value = res.data as RiskProfile;
    finished.value = true;
    MessagePlugin.success('风险测评已保存');
  } catch {
    // interceptor
  } finally {
    saving.value = false;
  }
}

function restart() {
  step.value = 0;
  finished.value = false;
  answers.value = [];
}

onMounted(loadProfile);
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

.result-bullets {
  display: inline-block;
  text-align: left;
  margin: 8px 0 0;
  color: var(--fs-text-secondary);
  font-size: 14px;
  line-height: 1.8;
}
</style>
