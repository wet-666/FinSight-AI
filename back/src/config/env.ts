import dotenv from 'dotenv';

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
);

// 云上只用平台注入的变量，避免容器里误读到本地 .env
if (!onRailway) {
  dotenv.config();
}

export function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function isRailway(): boolean {
  return onRailway;
}
