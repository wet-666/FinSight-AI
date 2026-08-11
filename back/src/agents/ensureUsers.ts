import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_ROOT = path.resolve(__dirname, '../../storage');
export const AVATAR_DIR = path.join(STORAGE_ROOT, 'avatars');

let usersEnsured = false;

/** 头像字段扩成 TEXT，存相对路径如 /uploads/avatars/... */
export async function ensureUsersSchema(): Promise<void> {
  if (usersEnsured) return;
  try {
    await pool.query(
      `ALTER TABLE users MODIFY COLUMN avatar TEXT NULL`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/doesn't exist|Unknown table/i.test(msg)) {
      console.warn('[users] ensure schema:', msg);
    }
  }
  try {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  usersEnsured = true;
}
