import http from '@/api/http';
import type { ApiResponse } from '@shared/types/common';
import type { LoginResponse, RegisterResponse, PublicUser } from '@shared/types/login';
import type { NoteContent } from '@shared/types/notes';
import type { ReportType } from '@shared/types/report';

export type { NoteContent };

export const authApi = {
  register: async (data: {
    username: string;
    email: string;
    password: string;
    nickname?: string;
  }): Promise<ApiResponse<RegisterResponse>> => {
    return http.post('/auth/register', data);
  },
  login: async (data: {
    username: string;
    password: string;
  }): Promise<ApiResponse<LoginResponse>> => {
    return http.post('/auth/login', data);
  },
  getProfile: async (): Promise<ApiResponse<PublicUser>> => {
    return http.get('/auth/profile');
  },
  updateProfile: (data: { nickname?: string; avatar?: string }) =>
    http.put('/auth/profile', data),
  uploadAvatar: (dataUrl: string) => http.post('/auth/avatar', { dataUrl }),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.put('/auth/password', data),
  getWatchlist: () => http.get('/auth/watchlist'),
  addWatchlist: (data: { stockCode: string; stockName: string; market?: string }) =>
    http.post('/auth/watchlist', data),
  removeWatchlist: (code: string) => http.delete(`/auth/watchlist/${code}`),
};

export const dashboardApi = {
  getOverview: () => http.get('/dashboard/overview'),
  getWatchlistRadar: () => http.get('/dashboard/watchlist-radar'),
  getSentimentThermometer: () => http.get('/dashboard/sentiment-thermometer'),
  getSentimentTrend: () => http.get('/dashboard/sentiment-trend'),
  getNewsFeed: () => http.get('/dashboard/news-feed'),
};

export const stockApi = {
  getDetail: (code: string) => http.get(`/stock/${code}`),
  getChart: (code: string, days?: number) =>
    http.get(`/stock/${code}/chart`, { params: { days } }),
  hot: () => http.get('/stock/meta/hot'),
  search: (q: string) => http.get('/stock/meta/search', { params: { q } }),
  analyze: (code: string, stockName: string, exportReport = false) =>
    http.post(`/stock/${code}/analyze`, { stockName, exportReport }),
};

export const backtestApi = {
  run: (data: {
    stockCode: string;
    sentimentThreshold: number;
    useMa20: boolean;
    initialCapital: number;
    exportReport?: boolean;
  }) => http.post('/backtest/run', data),
  history: () => http.get('/backtest/history'),
};

export const notesApi = {
  list: (stockCode?: string) => http.get('/notes', { params: { stockCode } }),
  get: (id: number) => http.get(`/notes/${id}`),
  create: (data: { stockCode: string; title: string; content: NoteContent }) =>
    http.post('/notes', data),
  update: (
    id: number,
    data: { title: string; content: NoteContent; stockCode?: string }
  ) => http.put(`/notes/${id}`, data),
  remove: (id: number) => http.delete(`/notes/${id}`),
  getVariables: (stockCode: string) => http.get(`/notes/variables/${stockCode}`),
  aiAssist: (data: { action: string; text: string; stockCode?: string }) =>
    http.post('/notes/ai-assist', data),
};

export const sentimentApi = {
  triggerAnalyze: () => http.post('/sentiment/analyze'),
  status: () => http.get('/sentiment/status'),
};

export const tradingApi = {
  getPortfolio: () => http.get('/trading/portfolio'),
  placeOrder: (data: {
    stockCode: string;
    stockName: string;
    side: 'buy' | 'sell';
    shares: number;
  }) => http.post('/trading/order', data),
  getOrders: () => http.get('/trading/orders'),
  updatePortfolioOrder: (
    items: { stockCode: string; sortOrder: number; weight?: number }[]
  ) => http.put('/trading/portfolio/order', { items }),
  reset: () => http.post('/trading/reset'),
};

export const outlookApi = {
  generate: (data: { stockCode: string; stockName?: string; horizonDays: number }) =>
    http.post('/outlook/generate', data),
  history: () => http.get('/outlook/history'),
  disclaimer: () => http.get('/outlook/disclaimer'),
};

export const agentsApi = {
  research: (data: { stockCode: string; stockName?: string }) =>
    http.post('/agents/research', data),
  runs: () => http.get('/agents/runs'),
  runDetail: (id: number) => http.get(`/agents/runs/${id}`),
  ask: (id: number, question: string) =>
    http.post(`/agents/runs/${id}/ask`, { question }),
};

export const reportsApi = {
  list: () => http.get('/reports'),
  get: (id: number) => http.get(`/reports/${id}`),
  generate: (data: {
    reportType: ReportType;
    stockCode?: string;
    payload?: object;
  }) => http.post('/reports/generate', data),
};

export const portfolioApi = {
  diagnose: () => http.get('/portfolio/diagnose'),
  exportDiagnose: () => http.post('/portfolio/diagnose/export'),
};

export const riskApi = {
  getProfile: () => http.get('/risk/profile'),
  saveProfile: (answers: number[]) => http.post('/risk/profile', { answers }),
};
