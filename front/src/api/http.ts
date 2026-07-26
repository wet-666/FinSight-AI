import axios from 'axios';
import { MessagePlugin } from 'tdesign-vue-next';
import type { ApiResponse } from '@shared/types/common';

const http = axios.create({
  // 走 Vite 代理，避免硬编码端口；也可直连 http://localhost:3300/api
  baseURL: '/api',
  timeout: 50000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const data = res.data as ApiResponse<unknown>;
    if (data.code !== 0) {
      MessagePlugin.error(data.message || '请求失败');
      return Promise.reject(data);
    }
    return data;
  },
  (err) => {
    const status = err.response?.status;
    switch (status) {
      case 401:
        MessagePlugin.error('您未登录，请先登录');
        localStorage.removeItem('token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        break;
      case 403:
        MessagePlugin.error('您没有权限执行此操作');
        break;
      case 404:
        MessagePlugin.error('请求的资源不存在，请检查地址');
        break;
      case 500:
        MessagePlugin.error('服务器开小差了，请稍后重试');
        break;
      default:
        MessagePlugin.error(err.response?.data?.message || err.message || '请求失败');
    }
    return Promise.reject(err);
  }
);

export default http;
