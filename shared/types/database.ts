/** 数据库 users 表完整行（含 password_hash，仅后端使用） */
export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  nickname: string;
  avatar: string;
}

/** 数据库 watchlists 表完整行 */
export interface WatchlistRow {
  id: number;
  user_id: number;
  stock_code: string;
  stock_name: string;
  market: string;
  added_at?: string;
}
