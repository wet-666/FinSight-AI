<script setup lang="ts">
import { ref, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next';
import { DesktopIcon, LockOnIcon, LoginIcon, RefreshIcon, UserAddIcon, ArrowLeftIcon } from 'tdesign-icons-vue-next';
import type { FormProps, FormRules, DialogProps } from 'tdesign-vue-next';

import LoginBackground from '@/components/LoginBackground.vue'
import LoginLeftPanel from '@/components/LoginLeftPanel.vue'
import { useWindowSize } from '@vueuse/core'
import declare from '@/views/declare.json'
import { authApi } from '@/api/index'
import { useUserStore } from '@/stores/userStore'
import { useRouter } from 'vue-router'
import type { ApiResponse, LoginResponse, RegisterResponse } from '@shared/types/login'

type Form = {
  username: string
  password: string
}

type FormValidateResult = boolean | Record<string, { message: string; result: boolean }[]>

const userStore = useUserStore()
const router = useRouter()
const isRegister = ref(true)
const isloading = ref(false)
const loginData = ref<Form>({
  username: '',
  password: ''
})
const registerData = ref({
  username: '',
  email: '',
  password: '',
  confirmPwd: '',
  code: '',
  agreed: false
})
const rules: FormRules = {
  username: [
    { required: true, message: '请输入账户名', trigger: 'blur' },
    { min: 3, max: 20, message: '账户名长度应为 3-20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' }
  ]
};

//重置表单
const onReset: FormProps['onReset'] = () => {
  loginData.value = {
    username: '',
    password: ''
  };
  MessagePlugin.success('重置成功');
};

//登录
const onSubmit: FormProps['onSubmit'] = async ({ validateResult, firstError }) => {
  //判断表单是否验证通过
  if (validateResult !== true) return MessagePlugin.warning(String(firstError));
  isloading.value = true
  try {
    const res: ApiResponse<LoginResponse> = await authApi.login(loginData.value)
    userStore.setToken(res.data.token);
    userStore.user = {
      id: res.data.user.id,
      username: res.data.user.username,
      email: res.data.user.email,
      nickname: res.data.user.nickname || res.data.user.username,
      avatar: res.data.user.avatar || '',
    };
    MessagePlugin.success('登录成功');
    const redirect = typeof router.currentRoute.value.query.redirect === 'string'
      ? router.currentRoute.value.query.redirect
      : '/dashboard'
    router.push(redirect)
  } catch (error) {
    MessagePlugin.error(String(error));
  } finally {
    isloading.value = false
  }
};

//注册
const onRegister = async ({ validateResult, firstError }: {
  validateResult: FormValidateResult;
  firstError?: string;
}) => {
  console.log('validateResult', validateResult);
  if (validateResult !== true) return MessagePlugin.warning(String(firstError));
  isloading.value = true
  try {
    const res: ApiResponse<RegisterResponse> = await authApi.register(registerData.value)
    userStore.setToken(res.data.token)
    userStore.user = {
      id: res.data.user.id,
      username: res.data.user.username,
      email: res.data.user.email,
      nickname: res.data.user.nickname || res.data.user.username,
      avatar: '',
    }
    MessagePlugin.success('注册成功');
    router.push('/dashboard')
  } catch (error) {
    MessagePlugin.error(String(error));
  } finally {
    isloading.value = false
  }
}

const visibleTop = ref(true);
const placement: DialogProps['placement'] = 'top';
const top: DialogProps['top'] = '10vh';
const close: DialogProps['onClose'] = () => {
  MessagePlugin.info('请先同意声明后操作');
};
const confirm: DialogProps['onConfirm'] = () => {
  visibleTop.value = false;
  MessagePlugin.success('感谢您的同意！欢迎━(*｀∀´*)ノ亻!进入登录页面');
  registerData.value.agreed = true
};
const declareText = declare.declare

const { width } = useWindowSize()
const showComponent = computed(() => width.value > 768)

const registerRules: FormRules = {
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { max: 20, message: '姓名不能超过20个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度应为6-20位', trigger: 'blur' }
  ],
  confirmPwd: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (val: string) => val === registerData.value.password,
      message: '两次密码输入不一致',
      trigger: 'blur'
    }
  ],
  //  code: [
  //    { required: true, message: '请输入验证码', trigger: 'blur' },
  //    { pattern: /^\d{6}$/, message: '验证码为6位数字', trigger: 'blur' }
  //  ],
  agreed: [
    { required: true, message: '请阅读并同意用户协议', trigger: 'change' },
    { validator: (val: boolean) => val === true, message: '请勾选同意协议' }
  ]
}

// 验证码发送（示例）
const codeLoading = ref(false)
const codeText = ref('发送验证码')
const sendCode = () => {
  if (!registerData.value.email) {
    MessagePlugin.warning('请先输入邮箱')
    return
  }
  codeLoading.value = true
  let count = 60
  codeText.value = `${count}s后重发`
  const timer = setInterval(() => {
    count--
    if (count <= 0) {
      clearInterval(timer)
      codeLoading.value = false
      codeText.value = '发送验证码'
    } else {
      codeText.value = `${count}s后重发`
    }
  }, 1000)
  // 模拟发送请求
  MessagePlugin.success('验证码已发送')
}
</script>

<template>
  <div class="login-view">
    <LoginBackground :count="55" :gravity="0.35" :repulsion-radius="120" :repulsion-strength="2.5" class="my-bg" />
    <t-row class="login-form">
      <t-col :span="12" class="left-item" v-show="showComponent">
        <div class="left-item">
          <LoginLeftPanel :is-register="isRegister" />
        </div>
      </t-col>
      <t-col :span="12" class="right-item">
        <template v-if="isRegister">
          <t-form ref="registerForm" :data="registerData" :rules="registerRules" :colon="true" label-width="100px"
            @submit="onRegister" class="registForm">
            <t-form-item label="姓名" name="username">
              <t-input v-model="registerData.username" placeholder="请输入姓名" />
            </t-form-item>
            <t-form-item label="邮箱" name="email">
              <t-input v-model="registerData.email" placeholder="请输入邮箱" />
            </t-form-item>
            <t-form-item label="密码" name="password">
              <t-input v-model="registerData.password" type="password" placeholder="请设置密码（6-20位）" />
            </t-form-item>
            <t-form-item label="确认密码" name="confirmPwd">
              <t-input v-model="registerData.confirmPwd" type="password" placeholder="请再次输入密码" />
            </t-form-item>
            <t-form-item label="验证码" name="code">
              <t-space style="width:100%;">
                <t-input v-model="registerData.code" placeholder="请输入6位验证码" style="flex:1;" />
                <t-button theme="primary" variant="outline" :loading="codeLoading"
                  :disabled="codeLoading || !registerData.email" @click="sendCode">
                  {{ codeText }}
                </t-button>
              </t-space>
            </t-form-item>
            <!-- 用户协议：添加 :label-width="0" -->
            <t-form-item name="agreed" :label-width="0">
              <t-checkbox v-model="registerData.agreed">我已阅读并同意《<t-link
                  @click.stop.prevent="visibleTop = true">用户协议</t-link>》</t-checkbox>
            </t-form-item>
            <t-form-item :label-width="0">
              <t-button theme="primary" type="submit" block style="margin-right: 10px;">
                <template #icon>
                  <UserAddIcon />
                </template>
                注册
              </t-button>
              <t-button variant="text" block @click="isRegister = false">
                <template #icon>
                  <LoginIcon />
                </template>
                已有账号？去登录
              </t-button>
            </t-form-item>
          </t-form>
        </template>
        <template v-else>
          <t-form ref="form" :rules="rules" :data="loginData" :colon="true" :label-width="0" @reset="onReset"
            @submit="onSubmit" class="registForm">
            <t-button theme="default" style="width: 150px; margin-bottom: 10px;" variant="outline" block
              @click="isRegister = true">
              <template #icon>
                <ArrowLeftIcon size="15" :fill-color='"transparent"' :stroke-color='"currentColor"' :stroke-width="2" />
              </template>
              返回注册
            </t-button>
            <t-form-item name="username">
              <t-input v-model="loginData.username" clearable placeholder="请输入账户名">
                <template #prefix-icon>
                  <desktop-icon />
                </template>
              </t-input>
            </t-form-item>
            <t-form-item name="password">
              <t-input v-model="loginData.password" type="password" clearable placeholder="请输入密码">
                <template #prefix-icon>
                  <lock-on-icon />
                </template>
              </t-input>
            </t-form-item>
            <t-form-item>
              <t-button theme="primary" type="submit" block :loading="isloading" style="margin-right: 10px;">
                <template #icon>
                  <LoginIcon />
                </template>
                登录
              </t-button>

              <t-button theme="default" variant="outline" type="reset" block :loading="isloading"
                :disabled="loginData.username === '' && loginData.password === ''">
                <template #icon>
                  <RefreshIcon />
                </template>
                重置
              </t-button>
            </t-form-item>
          </t-form>
        </template>
      </t-col>
    </t-row>
    <t-dialog :placement="placement" header="项目声明：" :body="declareText" :top="top" :visible="visibleTop"
      :on-confirm="confirm" :on-close="close" style="z-index: 1000;" />
  </div>
</template>

<style scoped lang="scss">
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background: radial-gradient(ellipse at 20% 50%, #1a1a2e 0%, #0d0d0d 70%);
  overflow: hidden;
  position: relative;

  .my-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .login-form {
    position: relative;
    z-index: 1;
    display: flex;
    width: min(920px, 92vw);
    height: 520px;
    border-radius: 24px;
    overflow: hidden;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(2px);

    .left-item {
      height: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 48px 40px;
      background: linear-gradient(145deg, rgba(208, 168, 106, 0.25) 0%, rgba(30, 30, 40, 0.85) 100%);
      color: #fff;
      position: relative;
      overflow: hidden;

    }

    .right-item {
      height: 100%;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 36px;
      background: $glass-bg;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      margin: 0;

      .registForm {
        width: 100%;
        max-width: 380px;
        margin: 0;
        padding: 28px 24px;
        border-radius: 20px;
        border: 1px solid rgba($gold, 0.35);
        background: rgba(255, 255, 255, 0.6);
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.8);
      }
    }
  }
}

:deep(.t-row) {
  height: 100%;
  margin: 0;
}

:deep(.t-col) {
  height: 100%;
  padding: 0;
  margin: 0;
}

:deep(.t-form__item) {
  margin-bottom: 20px !important;

  &:last-child {
    margin-bottom: 0 !important;
  }
}

:deep(.t-form__label) {
  color: $text-primary !important;
  font-weight: 500;
}

:deep(.t-input) {
  border-radius: 12px !important;
  transition: all 0.25s ease;
  background-color: #fafafa !important;
  border-color: #e5e5e5 !important;

  &:hover {
    border-color: $gold-light !important;
    background-color: #fff !important;
    box-shadow: 0 2px 8px rgba($gold, 0.08);
  }

  &.t-is-focused,
  &:focus-within {
    border-color: $gold !important;
    background-color: #fff !important;
    box-shadow: 0 0 0 3px rgba($gold, 0.15);
  }
}

:deep(.t-input__inner) {
  font-size: 14px;
  color: $text-primary;
}

:deep(.t-input__prefix) {
  color: $gold-dark;
}

// 主按钮
:deep(.t-button--theme-primary) {
  border-radius: 12px !important;
  height: 44px;
  font-weight: 500;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, $gold 0%, $gold-dark 100%) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba($gold, 0.35);
  transition: all 0.25s ease;

  &:hover:not(.t-is-disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba($gold, 0.45);
  }

  &:active:not(.t-is-disabled) {
    transform: translateY(0);
  }
}

:deep(.t-button--variant-outline) {
  border-radius: 12px !important;
  border-color: $gold !important;
  color: $gold-dark !important;

  &:hover:not(.t-is-disabled) {
    background: rgba($gold, 0.08) !important;
  }
}

:deep(.t-button--variant-text) {
  color: $text-secondary !important;
  margin-top: 8px;

  &:hover {
    color: $gold-dark !important;
    background: rgba($gold, 0.06) !important;
  }
}

:deep(.t-space) {
  .t-input {
    flex: 1;
  }

  .t-button {
    flex-shrink: 0;
    min-width: 110px;
    height: 40px;
    border-radius: 12px !important;
  }
}

:deep(.t-checkbox) {
  font-size: 13px;
  color: $text-secondary;

  .t-link {
    color: $gold-dark !important;
    font-weight: 500;
  }
}

@media (max-width: 768px) {
  .login-view .login-form {
    flex-direction: column;
    min-height: auto;

    .right-item {
      width: 100%;
    }
  }
}
</style>