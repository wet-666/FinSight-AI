<template>
  <div class="page-container">
    <t-row :gutter="16">
      <t-col :span="12">
        <t-card title="个人信息" :bordered="false">
          <t-form :data="profileForm" label-width="80px" @submit="updateProfile">
            <t-form-item label="昵称">
              <t-input v-model="profileForm.nickname" />
            </t-form-item>
            <t-form-item label="头像URL">
              <t-input v-model="profileForm.avatar" placeholder="头像图片链接" />
            </t-form-item>
            <t-form-item>
              <t-button theme="primary" type="submit">保存</t-button>
            </t-form-item>
          </t-form>
        </t-card>
      </t-col>

      <t-col :span="12">
        <t-card title="修改密码" :bordered="false">
          <t-form :data="pwdForm" label-width="80px" @submit="changePassword">
            <t-form-item label="原密码">
              <t-input v-model="pwdForm.oldPassword" type="password" />
            </t-form-item>
            <t-form-item label="新密码">
              <t-input v-model="pwdForm.newPassword" type="password" />
            </t-form-item>
            <t-form-item>
              <t-button theme="primary" type="submit">修改密码</t-button>
            </t-form-item>
          </t-form>
        </t-card>
      </t-col>
    </t-row>

    <t-card title="自选股管理" :bordered="false" style="margin-top: 16px">
      <template #actions>
        <t-button size="small" @click="showAdd = true">添加自选股</t-button>
      </template>
      <t-table :data="watchlist" :columns="columns" row-key="stock_code">
        <template #op="{ row }">
          <t-button theme="danger" variant="text" size="small" @click="removeStock(row.stock_code)">
            移除
          </t-button>
        </template>
      </t-table>
    </t-card>

    <t-dialog v-model:visible="showAdd" header="添加自选股" @confirm="addStock">
      <t-form :data="addForm">
        <t-form-item label="代码"><t-input v-model="addForm.stockCode" /></t-form-item>
        <t-form-item label="名称"><t-input v-model="addForm.stockName" /></t-form-item>
        <t-form-item label="市场">
          <t-select v-model="addForm.market">
            <t-option value="SH" label="上海" />
            <t-option value="SZ" label="深圳" />
          </t-select>
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { authApi } from '@/api';
import { useUserStore } from '@/stores/userStore';

const userStore = useUserStore();
const watchlist = ref<{ stock_code: string; stock_name: string; market: string }[]>([]);
const showAdd = ref(false);
const addForm = reactive({ stockCode: '', stockName: '', market: 'SH' });

const profileForm = reactive({
  nickname: '',
  avatar: '',
});

const pwdForm = reactive({ oldPassword: '', newPassword: '' });

const columns = [
  { colKey: 'stock_code', title: '代码' },
  { colKey: 'stock_name', title: '名称' },
  { colKey: 'market', title: '市场' },
  { colKey: 'op', title: '操作' },
];

async function loadWatchlist() {
  const res = await authApi.getWatchlist();
  watchlist.value = res.data as typeof watchlist.value;
}

async function updateProfile() {
  await authApi.updateProfile(profileForm);
  MessagePlugin.success('已保存');
  userStore.fetchProfile();
}

async function changePassword() {
  await authApi.changePassword(pwdForm);
  MessagePlugin.success('密码已修改');
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
}

async function addStock() {
  await authApi.addWatchlist(addForm);
  MessagePlugin.success('已添加');
  showAdd.value = false;
  loadWatchlist();
}

async function removeStock(code: string) {
  await authApi.removeWatchlist(code);
  MessagePlugin.success('已移除');
  loadWatchlist();
}

onMounted(async () => {
  await userStore.fetchProfile();
  if (userStore.user) {
    profileForm.nickname = userStore.user.nickname;
    profileForm.avatar = userStore.user.avatar;
  }
  loadWatchlist();
});
</script>
