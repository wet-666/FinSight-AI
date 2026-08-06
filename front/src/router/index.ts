import { createRouter, createWebHistory } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    auth?: boolean;
    guest?: boolean;
    title?: string;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true, title: '登录' },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/RegisterComponent.vue'),
      meta: { guest: true, title: '注册' },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { auth: true },
      children: [
        { path: '', redirect: { name: 'Dashboard' } },
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/DashboardComponent.vue'),
          meta: { auth: true, title: '智能仪表盘' },
        },
        {
          path: 'stock/:code',
          name: 'StockAnalysis',
          component: () => import('@/views/StockAnalysis.vue'),
          meta: { auth: true, title: '个股分析' },
        },
        {
          path: 'sim-trading',
          name: 'SimTrading',
          component: () => import('@/views/SimTrading.vue'),
          meta: { auth: true, title: '模拟投资' },
        },
        {
          path: 'agent-runs',
          name: 'AgentRuns',
          component: () => import('@/views/AgentRunsView.vue'),
          meta: { auth: true, title: 'Agent 历史' },
        },
        {
          path: 'risk-assessment',
          name: 'RiskAssessment',
          component: () => import('@/views/RiskAssessment.vue'),
          meta: { auth: true, title: '风险测评' },
        },
        {
          path: 'backtest',
          name: 'Backtest',
          component: () => import('@/views/BacktestComponent.vue'),
          meta: { auth: true, title: '策略回测' },
        },
        {
          path: 'portfolio',
          name: 'PortfolioDiagnose',
          component: () => import('@/views/PortfolioDiagnose.vue'),
          meta: { auth: true, title: '组合诊断' },
        },
        {
          path: 'reports',
          name: 'Reports',
          component: () => import('@/views/ReportComponent.vue'),
          meta: { auth: true, title: '报告中心' },
        },
        {
          path: 'notes',
          name: 'Notes',
          component: () => import('@/views/NotesComponent.vue'),
          meta: { auth: true, title: '投资笔记' },
        },
        {
          path: 'profile',
          name: 'Profile',
          component: () => import('@/views/ProfileComponent.vue'),
          meta: { auth: true, title: '个人设置' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      redirect: () => {
        const token = localStorage.getItem('token');
        return token ? { name: 'Dashboard' } : { name: 'Login' };
      },
    },
  ],
});

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token');
  const needAuth = to.matched.some((r) => r.meta.auth);

  // 未登录访问业务页 → 登录页
  if (needAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }
  // 已登录仍允许打开 /login（方便改 UI / 换号）；不再自动踢去仪表盘
  next();
});

router.afterEach((to) => {
  const title = to.meta.title ? `${to.meta.title} · FinSight-AI` : 'FinSight-AI';
  document.title = title;
});

export default router;
