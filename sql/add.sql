USE finsightai;

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
