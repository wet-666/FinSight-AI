export interface NoteContent {
  html?: string;
  plainText?: string;
  attachments?: string[];
  tags?: string[];
  /** tip tap JSON 等扩展 */
  [key: string]: unknown;
}

export interface NoteItem {
  id: number;
  stock_code: string;
  title: string;
  updated_at?: string;
  created_at?: string;
}

export interface NoteDetail extends NoteItem {
  content: NoteContent | object;
}
