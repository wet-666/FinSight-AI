<template>
  <div class="page-container">
    <t-row :gutter="16">
      <t-col :span="4">
        <t-card title="笔记列表" :bordered="false">
          <template #actions>
            <t-button size="small" @click="createNote">
              <t-icon name="add" /> 新建
            </t-button>
          </template>
          <t-list :split="true">
            <t-list-item
              v-for="note in notes"
              :key="note.id"
              :class="{ active: currentNote?.id === note.id }"
              @click="loadNote(note.id)"
            >
              <div>
                <div class="note-title">{{ note.title }}</div>
                <div class="note-meta">{{ note.stock_code }} · {{ formatDate(note.updated_at) }}</div>
              </div>
            </t-list-item>
            <t-empty v-if="notes.length === 0" description="暂无笔记" />
          </t-list>
        </t-card>
      </t-col>

      <t-col :span="8">
        <t-card v-if="currentNote" :bordered="false">
          <template #title>
            <t-input v-model="currentNote.title" borderless @blur="saveNote" />
          </template>
          <template #actions>
            <div class="stock-picker">
              <StockSuggestInput
                v-model:stock-code="currentStock"
                v-model:stock-name="currentStockName"
                :show-hot="true"
                :hot-limit="4"
                code-width="120px"
                name-width="120px"
                @select="onStockPick"
              />
            </div>
            <t-button size="small" @click="insertVariable('price')">插入股价</t-button>
            <t-button size="small" @click="insertVariable('sentiment')">插入情绪</t-button>
            <t-button size="small" theme="primary" variant="outline" :loading="saving" @click="saveNote">
              保存
            </t-button>
            <t-button size="small" theme="danger" variant="text" @click="deleteNote">删除</t-button>
          </template>

          <t-alert
            theme="info"
            :close="false"
            style="margin-bottom: 8px"
            message="AI 续写 / 润色 / 风险提示会调用大模型（无 Key 时返回模板文案）。可从个股分析页一键带入报告草稿。"
          />

          <div class="editor-toolbar">
            <t-button size="small" variant="outline" :loading="aiLoading" @click="aiAssist('continue')">
              AI 续写
            </t-button>
            <t-button size="small" variant="outline" :loading="aiLoading" @click="aiAssist('polish')">
              AI 润色
            </t-button>
            <t-button size="small" variant="outline" :loading="aiLoading" @click="aiAssist('risk')">
              风险提示
            </t-button>
          </div>

          <editor-content :editor="editor" class="note-editor" />

          <div v-if="variables" class="variables-panel">
            <t-tag theme="primary" variant="light">动态数据（自动刷新）</t-tag>
            股价: {{ variables.price }} | 涨跌幅: {{ variables.changePercent }}% | 情绪: {{ variables.sentiment }}
          </div>
        </t-card>
        <t-empty v-else description="选择或创建一篇笔记" />
      </t-col>
    </t-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { MessagePlugin } from 'tdesign-vue-next';
import { notesApi } from '@/api';
import StockSuggestInput from '@/components/StockSuggestInput.vue';
import type { NoteItem, NoteDetail } from '@shared/types/notes';
import type { StockOption } from '@/data/stockCatalog';

const route = useRoute();
const notes = ref<NoteItem[]>([]);
const currentNote = ref<NoteDetail | null>(null);
const currentStock = ref('600519');
const currentStockName = ref('贵州茅台');
const saving = ref(false);
const aiLoading = ref(false);
const variables = ref<{ price: number; changePercent: number; sentiment: number } | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: '在此记录您的投资思考...' }),
  ],
  content: '',
});

function formatDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('zh-CN');
}

function textToDoc(text: string) {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    }));
  return {
    type: 'doc',
    content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }],
  };
}

async function loadNotes() {
  const res = await notesApi.list();
  notes.value = res.data as NoteItem[];
}

async function loadNote(id: number) {
  const res = await notesApi.get(id);
  currentNote.value = res.data as NoteDetail;
  currentStock.value = currentNote.value.stock_code;
  const content = currentNote.value.content;
  editor.value?.commands.setContent(content as Parameters<typeof editor.value.commands.setContent>[0]);
  refreshVariables();
}

async function createNote(seedText?: string, title?: string) {
  const content = seedText ? textToDoc(seedText) : { type: 'doc', content: [{ type: 'paragraph' }] };
  const res = await notesApi.create({
    stockCode: currentStock.value,
    title: title || `${currentStockName.value || currentStock.value} 笔记`,
    content,
  });
  await loadNotes();
  const id = (res.data as { id: number }).id;
  await loadNote(id);
  MessagePlugin.success(seedText ? '已从分析报告创建笔记草稿' : '笔记已创建');
}

async function saveNote() {
  if (!currentNote.value || !editor.value) return;
  saving.value = true;
  try {
    await notesApi.update(currentNote.value.id, {
      title: currentNote.value.title,
      content: editor.value.getJSON(),
      stockCode: currentStock.value,
    });
    currentNote.value.stock_code = currentStock.value;
    MessagePlugin.success('已保存');
    loadNotes();
  } finally {
    saving.value = false;
  }
}

async function deleteNote() {
  if (!currentNote.value) return;
  await notesApi.remove(currentNote.value.id);
  currentNote.value = null;
  editor.value?.commands.clearContent();
  loadNotes();
}

function onStockPick(s: StockOption) {
  currentStock.value = s.code;
  currentStockName.value = s.name;
  if (currentNote.value) {
    currentNote.value.stock_code = s.code;
  }
  refreshVariables();
}

async function refreshVariables() {
  if (!currentStock.value) return;
  try {
    const res = await notesApi.getVariables(currentStock.value);
    variables.value = res.data as typeof variables.value;
  } catch {
    variables.value = null;
  }
}

function insertVariable(type: 'price' | 'sentiment') {
  if (!editor.value || !variables.value) return;
  const text =
    type === 'price'
      ? `[股价: ${variables.value.price}]`
      : `[情绪: ${variables.value.sentiment}]`;
  editor.value.chain().focus().insertContent(text).run();
}

async function aiAssist(action: 'continue' | 'polish' | 'risk') {
  const text = editor.value?.getText() || '';
  if (!text) {
    MessagePlugin.warning('请先输入一些内容');
    return;
  }
  aiLoading.value = true;
  try {
    const res = await notesApi.aiAssist({
      action,
      text,
      stockCode: currentStock.value,
    });
    const result = (res.data as { result: string }).result;
    editor.value?.chain().focus().insertContent('\n' + result).run();
  } finally {
    aiLoading.value = false;
  }
}

async function bootstrapFromQuery() {
  const qCode = typeof route.query.stockCode === 'string' ? route.query.stockCode : '';
  const qName = typeof route.query.stockName === 'string' ? route.query.stockName : '';

  if (qCode) {
    currentStock.value = qCode;
    currentStockName.value = qName || qCode;
  }

  const raw = sessionStorage.getItem('finsight:note-draft');
  if (raw) {
    try {
      const draft = JSON.parse(raw) as {
        stockCode?: string;
        stockName?: string;
        title?: string;
        seed?: string;
      };
      if (draft.stockCode) {
        currentStock.value = draft.stockCode;
        currentStockName.value = draft.stockName || draft.stockCode;
      }
      if (draft.seed) {
        await createNote(draft.seed, draft.title);
      }
    } catch {
      /* ignore bad draft */
    } finally {
      sessionStorage.removeItem('finsight:note-draft');
    }
  }
}

onMounted(async () => {
  await loadNotes();
  await bootstrapFromQuery();
  refreshTimer = setInterval(refreshVariables, 30000);
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped>
.note-title {
  font-weight: 500;
}

.note-meta {
  font-size: 12px;
  color: #999;
}

.t-list-item.active {
  background: #ecf2fe;
}

.editor-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.variables-panel {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
}

.stock-picker {
  display: inline-flex;
  margin-right: 8px;
  vertical-align: middle;
}

.note-editor {
  min-height: 280px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px;
}
</style>
