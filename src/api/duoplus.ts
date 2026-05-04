import { API_BASE, type ApiRegion, type CloudNumber, type SmsMessage } from '@/lib/index';

interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

function getBaseUrl(region: ApiRegion): string {
  return API_BASE[region];
}

async function request<T>(
  apiKey: string,
  region: ApiRegion,
  endpoint: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl(region);
  const resp = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DuoPlus-API-Key': apiKey,
      'Lang': 'zh',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  return resp.json() as Promise<ApiResponse<T>>;
}

// ============================================================
// Cloud Number APIs
// ============================================================

interface CloudNumberListItem {
  id: string;
  phone_number: string;  // 文档真实字段名
  region_name?: string;
  type_name?: string;
  status_name?: string;
  remark?: string;
  created_at?: string;
  expired_at?: string;
}

interface CloudNumberListResponse {
  list: CloudNumberListItem[];
  page: number;
  pagesize: number;
  total: number;
  total_page: number;
}

export async function fetchCloudNumbers(
  apiKey: string,
  region: ApiRegion
): Promise<CloudNumber[]> {
  const res = await request<CloudNumberListResponse>(apiKey, region, '/api/v1/cloudNumber/numberList', {
    page: 1,
    pagesize: 100,
  });

  if (res.code !== 200) {
    throw new Error(res.message || '获取云号码列表失败');
  }

  return (res.data?.list ?? []).map((item) => ({
    id: item.id,
    number: item.phone_number,   // 文档字段: phone_number
    name: item.remark || item.region_name,
    status: 'online' as const,
  }));
}

// ============================================================
// SMS APIs
// ============================================================

interface SmsListItem {
  message: string;
  code?: string;
  received_at: string;
}

interface SmsListResponse {
  list: SmsListItem[];
  page: number;
  pagesize: number;
  total: number;
  total_page: number;
}

export async function fetchSmsList(
  apiKey: string,
  region: ApiRegion,
  numberId: string,
  page = 1,
  pagesize = 50
): Promise<SmsMessage[]> {
  const res = await request<SmsListResponse>(apiKey, region, '/api/v1/cloudNumber/smsList', {
    number_id: numberId,
    page,
    pagesize,
  });

  if (res.code !== 200) {
    throw new Error(res.message || '获取短信列表失败');
  }

  return (res.data?.list ?? []).map((item, idx) => ({
    id: `${numberId}-${idx}-${item.received_at}`,
    numberId,
    number: '',
    message: item.message,
    code: item.code,
    receivedAt: item.received_at,
    direction: 'inbound' as const,
  }));
}

// ============================================================
// Write SMS (Send)
// ============================================================

export async function writeSmsByPhone(
  apiKey: string,
  region: ApiRegion,
  imageId: string, // cloud phone ID
  smsArray: Array<{ phone: string; message: string }>
): Promise<void> {
  const res = await request<{ message: string }>(
    apiKey,
    region,
    '/api/v1/cloudNumber/imageWriteSms',
    {
      image_id: imageId,
      sms: smsArray,
    }
  );

  if (res.code !== 200) {
    throw new Error(res.message || '发送消息失败');
  }
}

// ============================================================
// Cloud Phone List (for broadcast tasks)
// ============================================================

export interface CloudPhoneItem {
  id: string;
  name?: string;
  status?: number; // 0未配置 1开机 2关机 3过期...
  adb?: string;
  adb_password?: string;
  os?: string;
  ip?: string;
  area?: string;
  remark?: string;
  expired_at?: string;
}

interface CloudPhoneListResponse {
  list: CloudPhoneItem[];
  total: number;
  page: number;
  pagesize: number;
  total_page: number;
}

export async function fetchCloudPhones(
  apiKey: string,
  region: ApiRegion
): Promise<CloudPhoneItem[]> {
  const res = await request<CloudPhoneListResponse>(
    apiKey,
    region,
    '/api/v1/cloudPhone/list',
    { page: 1, pagesize: 100 }
  );

  if (res.code !== 200) {
    throw new Error(res.message || '获取云手机列表失败');
  }

  return res.data?.list ?? [];
}

// ============================================================
// Execute ADB Command
// ============================================================

export interface AdbResult {
  success: boolean;
  content: string;
  message: string;
}

export async function executeAdbCommand(
  apiKey: string,
  region: ApiRegion,
  imageId: string,
  command: string
): Promise<AdbResult> {
  const res = await request<AdbResult>(apiKey, region, '/api/v1/cloudPhone/command', {
    image_id: imageId,
    command,
  });

  if (res.code !== 200) {
    throw new Error(res.message || 'ADB命令执行失败');
  }

  return res.data;
}

// ============================================================
// Parse 5-field TextNow TXT
// ============================================================

export interface TextNowRawAccount {
  phoneNumber: string;  // field 1: TextNow手机号
  username: string;     // field 2: 用户名/账号
  password: string;     // field 3: 密码
  email: string;        // field 4: 注册邮箱
  emailPassword: string;// field 5: 邮箱密码
  raw: string;
}

/** 自动检测分隔符并解析5字段账号 */
export function parseTxtAccounts(raw: string): TextNowRawAccount[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const results: TextNowRawAccount[] = [];

  for (const line of lines) {
    // 支持 | : ---- \t 空格 等分隔符
    let fields: string[] = [];
    if (line.includes('----')) {
      fields = line.split('----');
    } else if (line.includes('|')) {
      fields = line.split('|');
    } else if (line.includes(':')) {
      fields = line.split(':');
    } else if (line.includes('\t')) {
      fields = line.split('\t');
    } else {
      fields = line.split(/\s+/);
    }

    fields = fields.map((f) => f.trim()).filter(Boolean);
    if (fields.length < 5) continue;

    results.push({
      phoneNumber: fields[0],
      username: fields[1],
      password: fields[2],
      email: fields[3],
      emailPassword: fields[4],
      raw: line,
    });
  }

  return results;
}

/** 构建 TextNow 免密导入 ADB 命令
 *  使用 am broadcast 方式，适配 TextNow 原生环境 */
export function buildTextnowImportCommand(account: TextNowRawAccount): string {
  // TextNow 账号导入 ADB 命令（免密码命令符导入协议）
  // 格式: am broadcast -a com.enflick.android.TextNow.IMPORT_ACCOUNT
  //        --es phone "{phone}" --es username "{user}" --es password "{pass}"
  //        --es email "{email}" --es email_password "{emailPass}"
  const escaped = (s: string) => s.replace(/"/g, '\\"').replace(/'/g, "\\'");
  return (
    `am broadcast -a com.enflick.android.TextNow.IMPORT_ACCOUNT` +
    ` --es phone "${escaped(account.phoneNumber)}"` +
    ` --es username "${escaped(account.username)}"` +
    ` --es password "${escaped(account.password)}"` +
    ` --es email "${escaped(account.email)}"` +
    ` --es email_password "${escaped(account.emailPassword)}"`
  );
}
