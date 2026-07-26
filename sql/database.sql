-- 确保utf8mb4编码
SET NAMES utf8mb4;
-- 数据库初始化脚本
CREATE DATABASE IF NOT EXISTS FinSightAI DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE FinSightAI;

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) DEFAULT '',
  avatar VARCHAR(500) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建自选股表
CREATE TABLE IF NOT EXISTS watchlist (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(50) NOT NULL,
  market VARCHAR(10) DEFAULT 'SH',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_stock (user_id, stock_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建新闻表
CREATE TABLE IF NOT EXISTS news (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  source VARCHAR(100),
  url VARCHAR(500),
  related_stocks JSON,
  published_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建新闻情感分析结果表
CREATE TABLE IF NOT EXISTS news_sentiment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  news_id INT NOT NULL,
  stock_code VARCHAR(20),
  sentiment_score DECIMAL(5,4) NOT NULL COMMENT '-1到1',
  sentiment_label ENUM('positive','negative','neutral'),
  summary TEXT,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
  INDEX idx_stock (stock_code),
  INDEX idx_analyzed (analyzed_at)
);

-- 创建每日情绪指数（按股票聚合）
CREATE TABLE IF NOT EXISTS daily_sentiment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stock_code VARCHAR(20) NOT NULL,
  trade_date DATE NOT NULL,
  avg_score DECIMAL(5,4) NOT NULL,
  news_count INT DEFAULT 0,
  positive_count INT DEFAULT 0,
  negative_count INT DEFAULT 0,
  neutral_count INT DEFAULT 0,
  UNIQUE KEY uk_stock_date (stock_code, trade_date) 
);

-- 创建市场总体情绪表
CREATE TABLE IF NOT EXISTS market_sentiment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trade_date DATE NOT NULL UNIQUE,
  avg_score DECIMAL(5,4) NOT NULL,
  news_count INT DEFAULT 0
);

-- 创建历史行情表(用于回溯)
CREATE TABLE IF NOT EXISTS stock_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stock_code VARCHAR(20) NOT NULL,
  trade_date DATE NOT NULL,
  open_price DECIMAL(12,4),
  high_price DECIMAL(12,4),
  low_price DECIMAL(12,4),
  close_price DECIMAL(12,4),
  volume BIGINT,
  ma20 DECIMAL(12,4),
  UNIQUE KEY uk_stock_date (stock_code, trade_date),
  INDEX idx_code (stock_code)  
);

-- 创建投资笔记表
CREATE TABLE IF NOT EXISTS `notes` (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  title VARCHAR(200) DEFAULT '未命名笔记',
  content JSON NOT NULL COMMENT 'tiptap JSON content',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_stock (user_id, stock_code)
);

-- 创建回溯记录表
CREATE TABLE IF NOT EXISTS backtest_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  strategy_config JSON NOT NULL,
  result JSON NOT NULL,
  ai_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== 模拟投资模块 ==========

-- 模拟账户（虚拟资金）
CREATE TABLE IF NOT EXISTS sim_accounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  cash_balance DECIMAL(16,2) NOT NULL DEFAULT 1000000.00,
  initial_cash DECIMAL(16,2) NOT NULL DEFAULT 1000000.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 模拟持仓
CREATE TABLE IF NOT EXISTS sim_positions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(50) NOT NULL,
  shares INT NOT NULL DEFAULT 0,
  avg_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  weight DECIMAL(5,2) DEFAULT 0 COMMENT '组合权重百分比',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_stock (user_id, stock_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 模拟交易流水
CREATE TABLE IF NOT EXISTS sim_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(50) NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  shares INT NOT NULL,
  price DECIMAL(12,4) NOT NULL,
  amount DECIMAL(16,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_time (user_id, created_at)
);

-- AI 情景展望记录（非确定性预测）
CREATE TABLE IF NOT EXISTS ai_outlook_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  horizon_days INT NOT NULL,
  outlook JSON NOT NULL COMMENT 'bear/base/bull scenarios',
  disclaimer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 用户风险测评
CREATE TABLE IF NOT EXISTS risk_profiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  score INT NOT NULL DEFAULT 0,
  level ENUM('conservative','moderate','aggressive') NOT NULL DEFAULT 'moderate',
  answers JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(50) DEFAULT '',
  status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  stages JSON NOT NULL,
  final_report TEXT,
  mode ENUM('llm','demo') NOT NULL DEFAULT 'demo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_stock (user_id, stock_code)
);

CREATE TABLE IF NOT EXISTS research_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  report_type ENUM('stock_analysis','backtest','portfolio') NOT NULL,
  stock_code VARCHAR(20) DEFAULT '',
  title VARCHAR(200) NOT NULL,
  content_json JSON NOT NULL,
  markdown_body MEDIUMTEXT NOT NULL,
  status ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
  file_md VARCHAR(500) DEFAULT '',
  file_html VARCHAR(500) DEFAULT '',
  file_pdf VARCHAR(500) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_type (user_id, report_type)
);

CREATE TABLE IF NOT EXISTS stock_industry (
  stock_code VARCHAR(20) PRIMARY KEY,
  stock_name VARCHAR(50) NOT NULL,
  industry VARCHAR(50) NOT NULL,
  market VARCHAR(10) DEFAULT 'SH'
);
