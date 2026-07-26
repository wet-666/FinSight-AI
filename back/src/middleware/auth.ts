//包装jwt中间件和成功、错误响应函数
import { Response, Request, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { DatabaseError } from '../config/database.js'

export interface AuthRequest extends Request {
  userId?: number
}

//拦截所有需要登录才能访问的请求，验证token并设置userId属性
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: '未授权,请先登录' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, config.jwt.secret) as { userId: number }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ code: 401, message: 'token无效' })
  }
}

export function success<T>(data: T, message = 'success') {
  return { code: 0, message, data }
}

export function error(message: string, code = 400) {
  return { code, message }
}

export function handleRouteError(err: unknown, res: Response): void {
  if (err instanceof DatabaseError) {
    console.error('[DB]', err.message)
    res.status(503).json({ code: 503, message: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ code: 500, message: '服务器内部错误' })
}
