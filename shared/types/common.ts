/** 统一 API 响应结构（前后端共用） */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}
