import type { ApiResponse } from './common.js';

export type { ApiResponse };

/** 对外返回的用户信息（不含密码） */
export interface PublicUser {
  id: number;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
}

/** 注册响应 */
export interface RegisterResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    nickname: string | null;
  };
}

/** 登录响应 */
export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    nickname?: string;
    avatar?: string;
  };
}

export type UserRow = PublicUser;
