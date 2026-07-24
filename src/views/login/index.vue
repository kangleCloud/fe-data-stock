<script setup lang="ts">
import {
  DataAnalysis,
  Lock,
  Refresh,
  TrendCharts,
  User,
} from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { getCaptcha } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import type { CaptchaResponse } from "@/types/api";
import {
  buildLoginRequest,
  normalizeCaptchaImage,
} from "@/utils/captcha";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const captchaLoading = ref(false);
const captcha = ref<CaptchaResponse | null>(null);
const form = reactive({
  userName: "",
  password: "",
  captchaCode: "",
});

const rules: FormRules = {
  userName: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 4, max: 32, message: "用户名长度为 4–32 位", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 8, max: 64, message: "密码长度为 8–64 位", trigger: "blur" },
  ],
  captchaCode: [
    { required: true, message: "请输入图片验证码", trigger: "blur" },
  ],
};

const captchaImage = computed(() =>
  normalizeCaptchaImage(captcha.value?.captchaImg ?? ""),
);

async function refreshCaptcha(): Promise<void> {
  captchaLoading.value = true;
  form.captchaCode = "";
  try {
    captcha.value = await getCaptcha();
  } catch {
    captcha.value = null;
  } finally {
    captchaLoading.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  if (!captcha.value) {
    ElMessage.warning("验证码尚未加载，请刷新后重试");
    await refreshCaptcha();
    return;
  }

  submitting.value = true;
  try {
    await authStore.authenticate(
      buildLoginRequest(
        form.userName,
        form.password,
        form.captchaCode,
        captcha.value,
      ),
    );
    await permissionStore.initialize(router);
    const redirect =
      typeof route.query.redirect === "string" &&
      route.query.redirect.startsWith("/") &&
      route.query.redirect !== "/login"
        ? route.query.redirect
        : permissionStore.firstPath;
    ElMessage.success("登录成功");
    await router.replace(redirect);
  } catch {
    await refreshCaptcha();
  } finally {
    submitting.value = false;
  }
}

onMounted(refreshCaptcha);
</script>

<template>
  <main class="login-page">
    <section class="login-visual" aria-labelledby="product-title">
      <div class="login-visual__content">
        <div class="login-brand">
          <span class="login-brand__mark"><TrendCharts /></span>
          <span>Vita Stock</span>
        </div>
        <p class="login-kicker">SECURITIES DATA OPERATIONS</p>
        <h1 id="product-title">让每一条证券数据<br />都清晰、可信、可追踪</h1>
        <p class="login-intro">
          统一管理数据源、用户权限和服务状态，为后续行情与研究数据工作流提供可靠入口。
        </p>

        <div class="data-preview" aria-hidden="true">
          <div class="data-preview__header">
            <span>数据服务概览</span>
            <span class="status-dot">服务正常</span>
          </div>
          <div class="metric-grid">
            <div>
              <small>数据源</small>
              <strong>AKTools</strong>
            </div>
            <div>
              <small>管理服务</small>
              <strong>be-vita</strong>
            </div>
            <div>
              <small>权限模式</small>
              <strong>RBAC</strong>
            </div>
          </div>
          <div class="sparkline">
            <i v-for="height in [28, 43, 35, 58, 48, 72, 64, 82, 76, 94]" :key="height" :style="{ height: `${height}%` }" />
          </div>
        </div>
      </div>
    </section>

    <section class="login-form-section">
      <div class="login-card">
        <div class="login-card__icon"><DataAnalysis /></div>
        <header>
          <p>管理端登录</p>
          <h2>欢迎回来</h2>
          <span>请输入账号信息完成身份验证</span>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="用户名" prop="userName">
            <el-input
              v-model.trim="form.userName"
              :prefix-icon="User"
              autocomplete="username"
              maxlength="32"
              placeholder="请输入用户名"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              show-password
              autocomplete="current-password"
              maxlength="64"
              placeholder="请输入密码"
              @keyup.enter="handleSubmit"
            />
          </el-form-item>
          <el-form-item label="图形验证码" prop="captchaCode">
            <div class="captcha-field">
              <el-input
                v-model.trim="form.captchaCode"
                maxlength="8"
                autocomplete="off"
                placeholder="输入图片字符"
                @keyup.enter="handleSubmit"
              />
              <button
                class="captcha-image"
                type="button"
                aria-label="刷新图形验证码"
                :disabled="captchaLoading"
                @click="refreshCaptcha"
              >
                <img
                  v-if="captchaImage"
                  :src="captchaImage"
                  alt="图形验证码，点击刷新"
                />
                <el-icon v-else :class="{ 'is-loading': captchaLoading }">
                  <Refresh />
                </el-icon>
              </button>
            </div>
          </el-form-item>

          <el-button
            class="login-submit"
            type="primary"
            native-type="submit"
            :loading="submitting"
          >
            {{ submitting ? "正在验证…" : "进入管理端" }}
          </el-button>
        </el-form>

        <p class="login-security">
          登录行为将记录用于安全审计，请勿共享管理账号。
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  background: var(--color-surface);
}

.login-visual {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 64px;
  color: #fff;
  overflow: hidden;
  background:
    radial-gradient(circle at 15% 20%, rgb(59 130 246 / 40%), transparent 34%),
    radial-gradient(circle at 86% 75%, rgb(15 159 130 / 30%), transparent 38%),
    linear-gradient(145deg, #0f2354 0%, #153b82 52%, #112e65 100%);
}

.login-visual::before {
  position: absolute;
  inset: 0;
  content: "";
  opacity: 0.12;
  background-image:
    linear-gradient(rgb(255 255 255 / 30%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 30%) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000, transparent 82%);
}

.login-visual__content {
  position: relative;
  z-index: 1;
  width: min(620px, 100%);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 72px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.login-brand__mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 8px;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 11px;
  background: rgb(255 255 255 / 12%);
}

.login-kicker {
  margin: 0 0 14px;
  color: #93c5fd;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.login-visual h1 {
  margin: 0;
  font-size: clamp(34px, 4vw, 56px);
  line-height: 1.14;
  letter-spacing: -0.045em;
}

.login-intro {
  max-width: 550px;
  margin: 24px 0 42px;
  color: #dbeafe;
  line-height: 1.8;
}

.data-preview {
  max-width: 520px;
  padding: 20px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 18px;
  background: rgb(255 255 255 / 10%);
  box-shadow: 0 24px 70px rgb(4 16 44 / 22%);
  backdrop-filter: blur(14px);
}

.data-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  font-size: 13px;
  font-weight: 600;
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #a7f3d0;
  font-size: 12px;
}

.status-dot::before {
  width: 7px;
  height: 7px;
  content: "";
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgb(52 211 153 / 14%);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.metric-grid div {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-radius: 10px;
  background: rgb(255 255 255 / 8%);
}

.metric-grid small {
  color: #bfdbfe;
  font-size: 11px;
}

.metric-grid strong {
  font-size: 14px;
}

.sparkline {
  height: 66px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.sparkline i {
  flex: 1;
  min-width: 5px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(to top, #34d399, #93c5fd);
}

.login-form-section {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 48px;
  background: #fbfdff;
}

.login-card {
  width: min(430px, 100%);
}

.login-card__icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-bottom: 24px;
  padding: 12px;
  color: var(--color-primary);
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  background: var(--color-primary-soft);
}

.login-card header {
  margin-bottom: 30px;
}

.login-card header p {
  margin: 0 0 6px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
}

.login-card h2 {
  margin: 0 0 8px;
  font-size: 30px;
  letter-spacing: -0.035em;
}

.login-card header span {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.captcha-field {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 10px;
}

.captcha-image {
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
  color: var(--color-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-surface-subtle);
  cursor: pointer;
}

.captcha-image:hover {
  border-color: var(--color-primary);
}

.captcha-image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.login-submit {
  width: 100%;
  min-height: 46px;
  margin-top: 4px;
  font-weight: 600;
  box-shadow: var(--shadow-primary);
}

.login-security {
  margin: 24px 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 991px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-visual {
    min-height: auto;
    padding: 30px 24px 42px;
  }

  .login-brand {
    margin-bottom: 34px;
  }

  .login-visual h1 {
    font-size: 34px;
  }

  .login-intro {
    margin-bottom: 0;
  }

  .data-preview {
    display: none;
  }

  .login-form-section {
    min-height: auto;
    padding: 42px 24px 56px;
  }
}

@media (max-width: 480px) {
  .login-visual {
    padding-inline: 18px;
  }

  .login-form-section {
    padding-inline: 18px;
  }

  .captcha-field {
    grid-template-columns: minmax(0, 1fr) 116px;
  }
}
</style>
