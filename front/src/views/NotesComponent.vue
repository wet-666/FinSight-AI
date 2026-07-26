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
            <t-select v-model="currentStock" style="width: 120px" @change="onStockChange">
              <t-option v-for="s in stockOptions" :key="s" :value="s" :label="s" />
            </t-select>
            <t-button size="small" @click="insertVariable('price')">插入股价</t-button>
            <t-button size="small" @click="insertVariable('sentiment')">插入情绪</t-button>
            <t-button size="small" theme="danger" variant="text" @click="deleteNote">删除</t-button>
          </template>

          <div class="editor-toolbar">
            <t-button size="small" variant="outline" @click="aiAssist('continue')">AI 续写</t-button>
            <t-button size="small" variant="outline" @click="aiAssist('polish')">AI 润色</t-button>
            <t-button size="small" variant="outline" @click="aiAssist('risk')">风险提示</t-button>
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
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { MessagePlugin } from 'tdesign-vue-next';
import { notesApi } from '@/api';
import type { NoteItem, NoteDetail } from '@shared/types/notes';

const notes = ref<NoteItem[]>([]);
const currentNote = ref<NoteDetail | null>(null);
const currentStock = ref('600519');
const stockOptions = ['600519', '000001', '300750', '002594'];
const variables = ref<{ price: number; changePercent: number; sentiment: number } | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: '在此记录您的投资思考...' }),
  ],
  content: '',
  onUpdate: () => {
    // debounced save could be added
  },
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('zh-CN');
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

async function createNote() {
  const res = await notesApi.create({
    stockCode: currentStock.value,
    title: '新笔记',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
  await loadNotes();
  const id = (res.data as { id: number }).id;
  await loadNote(id);
}

async function saveNote() {
  if (!currentNote.value || !editor.value) return;
  await notesApi.update(currentNote.value.id, {
    title: currentNote.value.title,
    content: editor.value.getJSON(),
  });
  MessagePlugin.success('已保存');
  loadNotes();
}

async function deleteNote() {
  if (!currentNote.value) return;
  await notesApi.remove(currentNote.value.id);
  currentNote.value = null;
  editor.value?.commands.clearContent();
  loadNotes();
}

function onStockChange() {
  if (currentNote.value) {
    currentNote.value.stock_code = currentStock.value;
    refreshVariables();
  }
}

async function refreshVariables() {
  const res = await notesApi.getVariables(currentStock.value);
  variables.value = res.data as typeof variables.value;
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
  const res = await notesApi.aiAssist({
    action,
    text,
    stockCode: currentStock.value,
  });
  const result = (res.data as { result: string }).result;
  editor.value?.chain().focus().insertContent('\n' + result).run();
}

onMounted(() => {
  loadNotes();
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
</style>
