<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { DesktopIcon, LockOnIcon, LoginIcon, RefreshIcon, UserAddIcon } from 'tdesign-icons-vue-next'
import type { FormProps, FormRules, DialogProps } from 'tdesign-vue-next'
import LoginBackground from '@/components/LoginBackground.vue'
import LoginLeftPanel from '@/components/LoginLeftPanel.vue'
import { useWindowSize } from '@vueuse/core'
import declare from '@/views/declare.json'
import { authApi } from '@/api/index'
import { useUserStore } from '@/stores/userStore'
import { useThemeStore } from '@/stores/themeStore'
import { useRouter } from 'vue-router'
import type { ApiResponse, LoginResponse, RegisterResponse } from '@shared/types/login'

type Form = {
  username: string
  password: string
}

type FormValidateResult = boolean | Record<string, { message: string; result: boolean }[]>

const userStore = useUserStore()
const themeStore = useThemeStore()
const router = useRouter()
const isRegister = ref(false)

function relogin() {
  userStore.logout()
  MessagePlugin.info('已退出，可重新登录')
}
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
  captcha: '',
  agreed: false
})

/** 简单数学验证码（前端校验，避免假“邮箱验证码”） */
const captchaA = ref(0)
const captchaB = ref(0)
const captchaAnswer = computed(() => captchaA.value + captchaB.value)

function refreshCaptcha() {
  captchaA.value = 1 + Math.floor(Math.random() * 9)
  captchaB.value = 1 + Math.floor(Math.random() * 9)
  registerData.value.captcha = ''
}

refreshCaptcha()

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{6,20}$/

const rules: FormRules = {
  username: [
    { required: true, message: '请输入账户名', trigger: 'blur' },
    { min: 3, max: 20, message: '账户名长度应为 3-20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' }
  ]
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; response?: { data?: { message?: string } } }
    return e.response?.data?.message || e.message || fallback
  }
  return fallback
}

const onReset: FormProps['onReset'] = () => {
  loginData.value = { username: '', password: '' }
  MessagePlugin.success('已清空')
}

const onSubmit: FormProps['onSubmit'] = async ({ validateResult, firstError }) => {
  if (validateResult !== true) return MessagePlugin.warning(String(firstError))
  isloading.value = true
  try {
    const payload = {
      username: loginData.value.username.trim(),
      password: loginData.value.password
    }
    const res: ApiResponse<LoginResponse> = await authApi.login(payload)
    userStore.setToken(res.data.token)
    userStore.user = {
      id: res.data.user.id,
      username: res.data.user.username,
      email: res.data.user.email,
      nickname: res.data.user.nickname || res.data.user.username,
      avatar: res.data.user.avatar || '',
    }
    MessagePlugin.success('登录成功')
    const redirect = typeof router.currentRoute.value.query.redirect === 'string'
      ? router.currentRoute.value.query.redirect
      : '/dashboard'
    router.push(redirect)
  } catch (error) {
    MessagePlugin.error(apiErrorMessage(error, '登录失败，请检查账户名和密码'))
  } finally {
    isloading.value = false
  }
}

const onRegister = async ({ validateResult, firstError }: {
  validateResult: FormValidateResult
  firstError?: string
}) => {
  if (validateResult !== true) return MessagePlugin.warning(String(firstError))
  if (Number(registerData.value.captcha) !== captchaAnswer.value) {
    MessagePlugin.warning('验证码计算错误')
    refreshCaptcha()
    return
  }
  isloading.value = true
  try {
    const res: ApiResponse<RegisterResponse> = await authApi.register({
      username: registerData.value.username.trim(),
      email: registerData.value.email.trim(),
      password: registerData.value.password,
    })
    userStore.setToken(res.data.token)
    userStore.user = {
      id: res.data.user.id,
      username: res.data.user.username,
      email: res.data.user.email,
      nickname: res.data.user.nickname || res.data.user.username,
      avatar: '',
    }
    MessagePlugin.success('注册成功')
    router.push('/dashboard')
  } catch (error) {
    MessagePlugin.error(apiErrorMessage(error, '注册失败'))
    refreshCaptcha()
  } finally {
    isloading.value = false
  }
}

const visibleTop = ref(false)
const placement: DialogProps['placement'] = 'top'
const top: DialogProps['top'] = '10vh'
const close: DialogProps['onClose'] = () => {
  visibleTop.value = false
}
const confirm: DialogProps['onConfirm'] = () => {
  visibleTop.value = false
  registerData.value.agreed = true
  MessagePlugin.success('已同意项目声明')
}
const declareText = declare.declare

const { width } = useWindowSize()
const showComponent = computed(() => width.value > 768)

const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      validator: (val: string) => USERNAME_PATTERN.test(String(val || '').trim()),
      message: '用户名需 3-20 位字母/数字/下划线',
      trigger: 'blur'
    }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    {
      validator: (val: string) => PASSWORD_PATTERN.test(String(val || '')),
      message: '密码需 6-20 位，且同时包含字母和数字',
      trigger: 'blur'
    }
  ],
  confirmPwd: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (val: string) => val === registerData.value.password,
      message: '两次密码输入不一致',
      trigger: 'blur'
    }
  ],
  captcha: [
    { required: true, message: '请填写验证码', trigger: 'blur' },
    {
      validator: (val: string) => Number(val) === captchaAnswer.value,
      message: '验证码不正确',
      trigger: 'blur'
    }
  ],
  agreed: [
    {
      validator: (val: boolean) => val === true,
      message: '请勾选同意项目声明',
      trigger: 'change'
    }
  ]
}

watch(isRegister, (v) => {
  if (v) refreshCaptcha()
})
</script>

<template>
  <div class="login-view">
    <LoginBackground class="my-bg" />
    <t-button
      class="theme-toggle"
      theme="default"
      variant="outline"
      shape="round"
      size="small"
      :title="themeStore.isDark ? '切换浅色模式' : '切换暗黑模式'"
      @click="themeStore.toggle()"
    >
      <template #icon>
        <t-icon :name="themeStore.isDark ? 'sunny' : 'moon'" />
      </template>
      {{ themeStore.isDark ? '浅色' : '暗黑' }}
    </t-button>
    <t-row class="login-form">
      <t-col v-show="showComponent" :span="12" class="left-item">
        <LoginLeftPanel :is-register="isRegister" />
      </t-col>
      <t-col :span="12" class="right-item">
        <div v-if="userStore.isLoggedIn" class="session-tip">
          <span>当前浏览器仍保持登录状态</span>
          <t-space size="small">
            <t-link theme="primary" @click="router.push('/dashboard')">进入系统</t-link>
            <t-link theme="danger" @click="relogin">退出后重登</t-link>
          </t-space>
        </div>
        <template v-if="isRegister">
          <t-form
            ref="registerForm"
            :data="registerData"
            :rules="registerRules"
            :colon="true"
            label-width="100px"
            @submit="onRegister"
            class="registForm"
          >
            <t-form-item label="用户名" name="username">
              <t-input v-model="registerData.username" maxlength="20" placeholder="3-20 位字母/数字/下划线" />
            </t-form-item>
            <t-form-item label="邮箱" name="email">
              <t-input v-model="registerData.email" placeholder="请输入邮箱" />
            </t-form-item>
            <t-form-item label="密码" name="password">
              <t-input
                v-model="registerData.password"
                type="password"
                maxlength="20"
                placeholder="6-20 位，需含字母和数字"
              />
            </t-form-item>
            <t-form-item label="确认密码" name="confirmPwd">
              <t-input v-model="registerData.confirmPwd" type="password" placeholder="请再次输入密码" />
            </t-form-item>
            <t-form-item label="验证码" name="captcha">
              <t-space style="width:100%;">
                <t-input v-model="registerData.captcha" placeholder="请输入计算结果" style="flex:1;" />
                <t-button theme="default" variant="outline" @click="refreshCaptcha">
                  {{ captchaA }} + {{ captchaB }} = ?
                </t-button>
              </t-space>
            </t-form-item>
            <t-form-item name="agreed" :label-width="0">
              <t-checkbox v-model="registerData.agreed">
                我已阅读并同意
                <t-link @click.stop.prevent="visibleTop = true">《项目声明》</t-link>
              </t-checkbox>
            </t-form-item>
            <t-form-item :label-width="0">
              <t-button theme="primary" type="submit" block :loading="isloading" style="margin-right: 10px;">
                <template #icon>
                  <UserAddIcon />
                </template>
                注册
              </t-button>
              <t-button variant="text" block :disabled="isloading" @click="isRegister = false">
                <template #icon>
                  <LoginIcon />
                </template>
                已有账号？去登录
              </t-button>
            </t-form-item>
          </t-form>
        </template>
        <template v-else>
          <t-form
            ref="form"
            :rules="rules"
            :data="loginData"
            :colon="true"
            :label-width="0"
            @reset="onReset"
            @submit="onSubmit"
            class="registForm"
          >
            <t-button
              theme="default"
              style="width: 150px; margin-bottom: 10px;"
              variant="outline"
              block
              @click="isRegister = true"
            >
              没有账号？去注册
            </t-button>
            <t-form-item name="username">
              <t-input v-model="loginData.username" clearable placeholder="请输入账户名或邮箱">
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

              <t-button
                theme="default"
                variant="outline"
                type="reset"
                block
                :loading="isloading"
                :disabled="loginData.username === '' && loginData.password === ''"
              >
                <template #icon>
                  <RefreshIcon />
                </template>
                重置
              </t-button>
            </t-form-item>
            <p class="demo-hint">测试账号：demo / demo123456</p>
          </t-form>
        </template>
      </t-col>
    </t-row>
    <t-dialog
      :placement="placement"
      header="项目声明"
      :body="declareText"
      :top="top"
      :visible="visibleTop"
      :on-confirm="confirm"
      :on-close="close"
      confirm-btn="同意并继续"
      cancel-btn="关闭"
      style="z-index: 1000;"
    />
  </div>
</template>

<style scoped lang="scss">
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: var(--fs-market-bg);

  .my-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .theme-toggle {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 2;
    background: var(--fs-bg-surface) !important;
    border-color: var(--fs-border) !important;
    color: var(--fs-text-primary) !important;
  }

  .login-form {
    position: relative;
    z-index: 1;
    display: flex;
    width: min(920px, 92vw);
    height: 520px;
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid var(--fs-border);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
    background: var(--fs-bg-surface);

    .left-item {
      height: 100%;
      flex: 1;
      padding: 0 !important;
      margin: 0;
      color: #fff;
      position: relative;
      overflow: hidden;
    }

    .right-item {
      height: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 36px;
      background: var(--fs-bg-surface);
      margin: 0;

      .registForm {
        width: 100%;
        max-width: 380px;
        margin: 0;
        padding: 8px 4px;
        border-radius: 0;
        border: none;
        background: transparent;
        box-shadow: none;
        max-height: 100%;
        overflow: auto;
      }
    }
  }
}

.session-tip {
  width: 100%;
  max-width: 380px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--fs-text-secondary);
  background: var(--fs-bg-page);
  border: 1px solid var(--fs-border);
}

.demo-hint {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--fs-text-secondary);
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
  color: var(--fs-text-primary) !important;
  font-weight: 500;
}

:deep(.t-input) {
  border-radius: 10px !important;
  transition: all 0.2s ease;
}

:deep(.t-input__inner) {
  font-size: 14px;
}

:deep(.t-button--theme-primary) {
  border-radius: 10px !important;
  height: 44px;
  font-weight: 500;
}

:deep(.t-button--variant-outline) {
  border-radius: 10px !important;
}

:deep(.t-button--variant-text) {
  color: var(--fs-text-secondary) !important;
  margin-top: 8px;
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
  color: var(--fs-text-secondary);
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
