<template>
  <div class="page-container">
    <LegalDisclaimer />
    <t-card title="投研报告中心" subtitle="导出 Markdown / HTML / PDF，含合规声明" :bordered="false">
      <t-space>
        <t-button theme="primary" :loading="exportingPortfolio" @click="exportPortfolio">
          导出组合诊断报告
        </t-button>
        <t-button variant="outline" @click="loadList">刷新列表</t-button>
      </t-space>

      <t-table
        style="margin-top: 16px"
        row-key="id"
        :data="list"
        :columns="columns"
        :loading="loading"
        empty="暂无报告，可在个股分析或回测页勾选导出"
      >
        <template #report_type="{ row }">
          {{ typeMap[row.report_type] || row.report_type }}
        </template>
        <template #created_at="{ row }">
          {{ String(row.created_at).replace('T', ' ').slice(0, 19) }}
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-link theme="primary" @click="preview(row.id)">预览</t-link>
            <t-link @click="download(row.id, 'md')">MD</t-link>
            <t-link @click="download(row.id, 'html')">HTML</t-link>
            <t-link theme="success" @click="download(row.id, 'pdf')">PDF</t-link>
          </t-space>
        </template>
      </t-table>
    </t-card>

    <t-drawer v-model:visible="previewVisible" size="560px" header="报告预览">
      <pre class="md-preview">{{ previewMd }}</pre>
      <template #footer>
        <t-space>
          <t-button v-if="activeId" @click="download(activeId, 'md')">MD</t-button>
          <t-button v-if="activeId" @click="download(activeId, 'html')">HTML</t-button>
          <t-button v-if="activeId" theme="primary" @click="download(activeId, 'pdf')">PDF</t-button>
        </t-space>
      </template>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import { reportsApi, portfolioApi } from '@/api';
import type { ReportRow } from '@shared/types/report';

const list = ref<ReportRow[]>([]);
const loading = ref(false);
const exportingPortfolio = ref(false);
const previewVisible = ref(false);
const previewMd = ref('');
const activeId = ref<number | null>(null);

const typeMap: Record<string, string> = {
  stock_analysis: '个股分析',
  backtest: '策略回测',
  portfolio: '组合诊断',
};

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'report_type', title: '类型', width: 100 },
  { colKey: 'title', title: '标题', ellipsis: true },
  { colKey: 'stock_code', title: '标的', width: 90 },
  { colKey: 'status', title: '状态', width: 80 },
  { colKey: 'created_at', title: '时间', width: 170 },
  { colKey: 'op', title: '操作', width: 240 },
];

async function loadList() {
  loading.value = true;
  try {
    const res = await reportsApi.list();
    list.value = (res.data as ReportRow[]) || [];
  } finally {
    loading.value = false;
  }
}

async function preview(id: number) {
  const res = await reportsApi.get(id);
  const data = res.data as { markdown_body: string };
  previewMd.value = data.markdown_body;
  activeId.value = id;
  previewVisible.value = true;
}

function download(id: number, format: 'md' | 'html' | 'pdf') {
  const token = localStorage.getItem('token');
  fetch(`/api/reports/${id}/download/${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('download failed');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `finsight_report_${id}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => MessagePlugin.error('下载失败'));
}

async function exportPortfolio() {
  exportingPortfolio.value = true;
  try {
    await portfolioApi.exportDiagnose();
    MessagePlugin.success('组合诊断报告已生成');
    await loadList();
  } catch {
    MessagePlugin.error('导出失败');
  } finally {
    exportingPortfolio.value = false;
  }
}

onMounted(loadList);
</script>

<style scoped>
.md-preview {
  white-space: pre-wrap;
  font-family: Consolas, 'Microsoft YaHei', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}
</style>
