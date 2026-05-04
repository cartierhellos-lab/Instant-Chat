// ============================================================
// Routes
// ============================================================
export const ROUTE_PATHS = {
  HOME: '/',
  ACCOUNTS: '/accounts',
  PHONES: '/phones',
  TASKS: '/tasks',
  SETTINGS: '/settings',
  ADMIN: '/admin',
  LOGIN: '/login',
};

// ============================================================
// Roles & Auth
// ============================================================
export type AppRole = 'admin' | 'user';

export interface SubAccount {
  id: string;
  name: string;
  key: string;               // 子账号密钥（UUID格式）
  role: AppRole;
  assignedPhoneIds: string[]; // 分配的云手机ID列表
  assignedAccountIds: string[]; // 分配的TextNow账号ID列表
  createdAt: string;
  note?: string;
}

/** 管理员主密钥（固定，用户在设置中配置） */
export const ADMIN_MASTER_KEY = 'ADMIN_MASTER';

// ============================================================
// Types
// ============================================================

export type ApiRegion = 'cn' | 'global';

export interface AppSettings {
  apiKey: string;
  apiRegion: ApiRegion;
  pollInterval: number;
  adbCommandTemplate: string;
  /** 用于区分管理员/子账号的访问密钥，由用户启动时输入 */
  accessKey?: string;
  /** 翻译引擎：mymemory = 免费在线 | ollama = 本地模型 */
  translateEngine?: 'mymemory' | 'ollama';
  /** Ollama 服务地址，默认 http://localhost:11434 */
  ollamaUrl?: string;
  /** Ollama 翻译模型名，默认 qwen2:7b */
  ollamaModel?: string;
}

export interface CloudNumber {
  id: string;
  number: string;
  name?: string;
  status?: 'online' | 'offline' | 'unknown';
}

export interface CloudPhone {
  id: string;
  name?: string;
  status?: number;
  os?: string;
  ip?: string;
  area?: string;
  adb?: string;
  expired_at?: string;
}

export type AccountStatus =
  | 'available'
  | 'assigned'
  | 'active'
  | 'banned'
  | 'cooling'
  | 'injecting';

export interface TextNowAccount {
  id: string;
  phoneNumber: string;
  username: string;
  password: string;
  email: string;
  emailPassword: string;
  raw: string;
  status: AccountStatus;
  assignedPhoneId?: string;
  slotIndex?: number;
  importedAt: string;
  lastUsedAt?: string;
  bannedAt?: string;
  sendCount: number;
  failCount: number;
  injected: boolean;
}

export interface PhoneBinding {
  phoneId: string;
  slots: (string | null)[];
  activeSlot: number;
}

export interface SmsMessage {
  id: string;
  numberId: string;
  number: string;
  message: string;
  imageUrl?: string;       // 图片消息URL
  code?: string;
  receivedAt: string;
  direction: 'inbound' | 'outbound';
  status?: 'sent' | 'failed' | 'pending';
}

export interface Conversation {
  id: string;
  cloudNumber: CloudNumber;
  contactNumber: string;
  messages: SmsMessage[];
  unreadCount: number;
  lastMessage?: SmsMessage;
  lastUpdated: string;
}

/** 队列中单个发送条目 */
export interface QueueItem {
  id: string;
  targetNumber: string;    // 对方号码
  message: string;
  imageUrl?: string;
  numberId: string;        // 发送方云号码/云手机ID
  status: 'waiting' | 'sending' | 'success' | 'failed';
  scheduledAt: number;     // 预计发送时间戳(ms)
  sentAt?: string;
  error?: string;
  retryCount: number;
}

export interface BroadcastTask {
  id: string;
  name: string;
  message: string;
  imageUrl?: string;       // 图片附件
  mode: 'cloud_number' | 'textnow';
  targetNumbers: string[];
  targetPhones: string[];
  /** 每轮间隔：350-450秒随机 */
  intervalMin: number;
  intervalMax: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  successCount: number;
  failCount: number;
  createdAt: string;
  completedAt?: string;
  results: TaskResult[];
  queue: QueueItem[];      // 有序发送队列
}

export interface TaskResult {
  numberId: string;
  number: string;
  contactNumber: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message: string;
  error?: string;
  sentAt?: string;
  accountId?: string;
}

// ============================================================
// Constants
// ============================================================

export const API_BASE: Record<ApiRegion, string> = {
  cn: 'https://openapi.duoplus.cn',
  global: 'https://openapi.duoplus.net',
};

export const MAX_SLOTS = 10;

/** 群发轮次最小间隔(秒) */
export const QUEUE_INTERVAL_MIN = 350;
/** 群发轮次最大间隔(秒) */
export const QUEUE_INTERVAL_MAX = 450;

export const DEFAULT_ADB_TEMPLATE =
  'am broadcast -a com.enflick.android.TextNow.IMPORT_ACCOUNT --es phone "{phone}" --es username "{username}" --es password "{password}" --es email "{email}" --es email_password "{emailPassword}"';

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  apiRegion: 'cn',
  pollInterval: 5,
  adbCommandTemplate: DEFAULT_ADB_TEMPLATE,
  accessKey: undefined,
  translateEngine: 'mymemory',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2:7b',
};

// ============================================================
// Utils
// ============================================================

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function generateSubKey(): string {
  // 生成 UUID v4 格式子账号密钥
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getInitials(str: string): string {
  if (!str) return '?';
  return str.slice(-4);
}

export function buildAdbCommand(template: string, account: {
  phoneNumber: string; username: string; password: string;
  email: string; emailPassword: string;
}): string {
  return template
    .replace('{phone}', account.phoneNumber)
    .replace('{username}', account.username)
    .replace('{password}', account.password)
    .replace('{email}', account.email)
    .replace('{emailPassword}', account.emailPassword);
}

/** 随机生成 350-450 秒之间的间隔(毫秒) */
export function randomQueueInterval(): number {
  const sec = QUEUE_INTERVAL_MIN + Math.random() * (QUEUE_INTERVAL_MAX - QUEUE_INTERVAL_MIN);
  return Math.round(sec * 1000);
}

export function statusColor(status: AccountStatus): string {
  const map: Record<AccountStatus, string> = {
    available: 'text-emerald-600',
    assigned: 'text-blue-500',
    active: 'text-primary',
    banned: 'text-destructive',
    cooling: 'text-amber-500',
    injecting: 'text-muted-foreground',
  };
  return map[status] ?? 'text-muted-foreground';
}

export function statusLabel(status: AccountStatus): string {
  const map: Record<AccountStatus, string> = {
    available: '可用',
    assigned: '已分配',
    active: '活跃',
    banned: '已封禁',
    cooling: '冷却中',
    injecting: 'ADB注入中',
  };
  return map[status] ?? status;
}
