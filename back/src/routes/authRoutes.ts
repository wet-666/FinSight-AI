//接收用户请求，操作数据库，做出具体响应
import { Router, Response, Request } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'
import { config } from '../config/index.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth.js'
import type { UserRow } from '@shared/types/database'

const router = Router()
interface UserRowWithPasswordHash extends UserRow {}

//注册
router.post(
   '/register',
   asyncHandler(async (req: Request, res: Response) => {
      const { username, email, password, nickname } = req.body
      if (!username || !email || !password) {
         res.status(400).json(error('用户名、邮箱、密码不能为空！'))
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
      const { username, password } = req.body
      if (!username || !password) {
         res.status(400).json(error('用户名和密码不能为空'))
         return
      }

      //查询用户是否存在
      const users = await query<UserRowWithPasswordHash[]>(
         'SELECT * FROM users WHERE username = ? OR email = ?',
         [username, username]
      )
      if (users.length === 0) {
         res.status(401).json(error('用户名或密码错误', 401))
         return
      }

      const user = users[0]
      //验证密码
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) {
         res.status(401).json(error('用户名或密码错误', 401))
         return
      }

      //生成 token 并返回
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
      const { nickname, avatar } = req.body;
      await query('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?', [
         nickname,
         avatar,
         req.userId!,
      ]);
      res.json(success(null, '个人信息已更新'));
   })
)

// 修改密码
router.put(
   '/password',
   authMiddleware,
   asyncHandler(async (req: AuthRequest, res: Response) => {
      const { oldPassword, newPassword } = req.body;
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
