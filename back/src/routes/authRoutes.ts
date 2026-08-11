//接收用户请求，操作数据库，做出具体响应
import { Router, Response, Request, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { query } from '../config/database.js'
import { config } from '../config/index.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth.js'
import { ensureUsersSchema, AVATAR_DIR } from '../agents/ensureUsers.js'
import type { UserRow } from '@shared/types/database'

const router = Router()
interface UserRowWithPasswordHash extends UserRow {}

const AVATAR_MAX_BYTES = 800 * 1024
const AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

function extFromMime(mime: string): string {
   const m = mime.toLowerCase()
   if (m.includes('png')) return 'png'
   if (m.includes('webp')) return 'webp'
   if (m.includes('gif')) return 'gif'
   return 'jpg'
}

const avatarUpload = multer({
   storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
         fs.mkdirSync(AVATAR_DIR, { recursive: true })
         cb(null, AVATAR_DIR)
      },
      filename: (req, file, cb) => {
         const userId = (req as unknown as AuthRequest).userId
         cb(null, `u${userId}_${Date.now()}.${extFromMime(file.mimetype)}`)
      },
   }),
   limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
   fileFilter: (_req, file, cb) => {
      if (AVATAR_MIME.has(file.mimetype.toLowerCase())) {
         cb(null, true)
         return
      }
      cb(new Error('请上传 png/jpg/webp/gif 图片'))
   },
})

/** 将 multer 错误转成统一 JSON 响应 */
function handleAvatarUpload(req: Request, res: Response, next: NextFunction) {
   // monorepo 下 @types/express 可能重复，这里做一次兼容调用
   const run = avatarUpload.single('avatar') as unknown as (
      req: Request,
      res: Response,
      cb: (err?: unknown) => void
   ) => void
   run(req, res, (err?: unknown) => {
      if (!err) {
         next()
         return
      }
      if (err instanceof multer.MulterError) {
         if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json(error('头像不能超过 800KB，请压缩后再传'))
            return
         }
         res.status(400).json(error(err.message || '上传失败'))
         return
      }
      const message = err instanceof Error ? err.message : '上传失败'
      res.status(400).json(error(message))
   })
}

//注册
router.post(
   '/register',
   asyncHandler(async (req: Request, res: Response) => {
      const username = String(req.body?.username || '').trim()
      const email = String(req.body?.email || '').trim()
      const password = String(req.body?.password || '')
      const nickname = String(req.body?.nickname || '').trim()

      if (!username || !email || !password) {
         res.status(400).json(error('用户名、邮箱、密码不能为空！'))
         return
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
         res.status(400).json(error('用户名需为 3-20 位字母/数字/下划线'))
         return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
         res.status(400).json(error('邮箱格式不正确'))
         return
      }
      if (!/^(?=.*[A-Za-z])(?=.*\d).{6,20}$/.test(password)) {
         res.status(400).json(error('密码需 6-20 位，且同时包含字母和数字'))
         return
      }

      const existing = await query<UserRow[]>(
         `SELECT * FROM users WHERE username = ? OR email = ?`,
         [username, email]
      )
      if (existing.length > 0) {
         res.status(400).json(error('用户名或邮箱已存在！'))
         return
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const result = await query<{ insertId: number }>(
         'INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)',
         [username, email, passwordHash, nickname || username]
      )
      const userId = (result as unknown as { insertId: number }).insertId ?? 0
      const token = jwt.sign({ userId }, config.jwt.secret, {
         expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      });
      res.json(
         success({
            token,
            user: { id: userId, username, email, nickname: nickname || username },
         })
      );
   })
)

//登录
router.post(
   '/login',
   asyncHandler(async (req, res) => {
      const username = String(req.body?.username || '').trim()
      const password = String(req.body?.password || '')
      if (!username || !password) {
         res.status(400).json(error('用户名和密码不能为空'))
         return
      }

      const users = await query<UserRowWithPasswordHash[]>(
         'SELECT * FROM users WHERE username = ? OR email = ?',
         [username, username]
      )
      if (users.length === 0) {
         res.status(401).json(error('用户名或密码错误', 401))
         return
      }

      const user = users[0]
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) {
         res.status(401).json(error('用户名或密码错误', 401))
         return
      }

      const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
         expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      })

      res.json(
         success({
            token,
            user: {
               id: user.id,
               username: user.username,
               email: user.email,
               nickname: user.nickname,
               avatar: user.avatar
            }
         })
      )
   }

   )
)

// 获取个人信息
router.get(
   '/profile',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      const users = await query<UserRowWithPasswordHash[]>(
         'SELECT id, username, email, nickname, avatar FROM users WHERE id = ?',
         [req.userId!]
      )
      if (users.length === 0) {
         res.status(404).json(error('用户不存在', 404))
         return
      }
      res.json(
         success(users[0])
      )
   })
)

// 更新个人信息
router.put(
   '/profile',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      await ensureUsersSchema();
      const nickname = req.body?.nickname != null ? String(req.body.nickname).trim() : undefined;
      const avatar = req.body?.avatar != null ? String(req.body.avatar).trim() : undefined;
      if (nickname === undefined && avatar === undefined) {
         res.status(400).json(error('没有可更新的字段'));
         return;
      }
      if (nickname !== undefined && avatar !== undefined) {
         await query('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?', [
            nickname,
            avatar,
            req.userId!,
         ]);
      } else if (nickname !== undefined) {
         await query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.userId!]);
      } else if (avatar !== undefined) {
         await query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId!]);
      }
      const users = await query<UserRowWithPasswordHash[]>(
         'SELECT id, username, email, nickname, avatar FROM users WHERE id = ?',
         [req.userId!]
      );
      res.json(success(users[0] || null, '个人信息已更新'));
   })
)

/** 上传本地头像：multipart 字段名 avatar，落盘后把路径写入 users.avatar */
router.post(
   '/avatar',
   authMiddleware,
   handleAvatarUpload,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      await ensureUsersSchema()
      const file = req.file
      if (!file) {
         res.status(400).json(error('请选择要上传的图片'))
         return
      }

      // 清理该用户旧头像文件（仅 storage/avatars 下）
      try {
         const prev = await query<{ avatar: string }[]>(
            'SELECT avatar FROM users WHERE id = ?',
            [req.userId!]
         )
         const old = prev[0]?.avatar || ''
         const oldName = old.match(/\/uploads\/avatars\/(u\d+_[^/]+)$/)?.[1]
         if (oldName && oldName !== file.filename) {
            const oldAbs = path.join(AVATAR_DIR, oldName)
            if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs)
         }
      } catch {
         /* ignore */
      }

      const avatarUrl = `/uploads/avatars/${file.filename}`
      await query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.userId!])
      res.json(success({ avatar: avatarUrl }, '头像已更新'))
   })
)

// 修改密码
router.put(
   '/password',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
         res.status(400).json(error('原密码和新密码不能为空'));
         return;
      }
      if (oldPassword === newPassword) {
         res.status(400).json(error('新密码不能与原密码相同'));
         return;
      }
      const users = await query<UserRowWithPasswordHash[]>(
         'SELECT password_hash FROM users WHERE id = ?',
         [req.userId!]
      );
      if (users.length === 0) {
         res.status(404).json(error('用户不存在', 404));
         return;
      }

      const valid = await bcrypt.compare(oldPassword, users[0].password_hash);
      if (!valid) {
         res.status(400).json(error('原密码错误'));
         return;
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId!]);
      res.json(success(null, '密码已修改'));
   })
);

// 自选股列表
router.get(
   '/watchlist',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      const list = await query(
         'SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC',
         [req.userId!]
      );
      res.json(success(list));
   })
);

// 添加自选股
router.post(
   '/watchlist',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      const { stockCode, stockName, market } = req.body;
      if (!stockCode || !stockName) {
         res.status(400).json(error('股票代码和名称不能为空'));
         return;
      }

      try {
         await query(
            'INSERT INTO watchlist (user_id, stock_code, stock_name, market) VALUES (?, ?, ?, ?)',
            [req.userId!, stockCode, stockName, market || 'SH']
         );
         res.json(success(null, '已添加到自选股'));
      } catch {
         res.status(400).json(error('该股票已在自选股中'));
      }
   })
);

// 删除自选股
router.delete(
   '/watchlist/:code',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      await query('DELETE FROM watchlist WHERE user_id = ? AND stock_code = ?', [
         req.userId!,
         req.params.code as string,
      ]);
      res.json(success(null, '已从自选股移除'));
   })
);

export default router;
