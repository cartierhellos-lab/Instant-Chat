import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  SubAccount,
  TextNowAccount,
  PhoneBinding,
  BroadcastTask,
  Conversation,
  SmsMessage,
  QueueItem,
  TaskResult,
  AccountStatus,
  AppRole,
} from '@/lib/index';

// ============================================================
// Supabase Client（支持动态 URL/Key，从 localStorage 读取）
// ============================================================

const STORAGE_URL_KEY = 'sb_url';
const STORAGE_KEY_KEY = 'sb_key';

function getSupabaseConfig(): { url: string; key: string } {
  const url =
    localStorage.getItem(STORAGE_URL_KEY) ||
    import.meta.env.VITE_SUPABASE_URL ||
    'https://placeholder.supabase.co';
  const key =
    localStorage.getItem(STORAGE_KEY_KEY) ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'placeholder_key';
  return { url, key };
}

let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const { url, key } = getSupabaseConfig();
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** 重新初始化 supabase 客户端（用于设置页保存后调用） */
export function reinitSupabase(url?: string, key?: string): SupabaseClient {
  if (url) localStorage.setItem(STORAGE_URL_KEY, url);
  if (key) localStorage.setItem(STORAGE_KEY_KEY, key);
  const config = getSupabaseConfig();
  _supabase = createClient(config.url, config.key);
  return _supabase;
}

// ============================================================
// 数据库行类型（DB Row 类型，字段使用 snake_case 对应数据库列）
// ============================================================

export interface SubAccountRow {
  id: string;
  name: string;
  key: string;
  role: AppRole;
  assigned_phone_ids: string[];
  assigned_account_ids: string[];
  created_at: string;
  note?: string | null;
}

export interface TextNowAccountRow {
  id: string;
  phone_number: string;
  username: string;
  password: string;
  email: string;
  email_password: string;
  raw: string;
  status: AccountStatus;
  assigned_phone_id?: string | null;
  slot_index?: number | null;
  imported_at: string;
  last_used_at?: string | null;
  banned_at?: string | null;
  send_count: number;
  fail_count: number;
  injected: boolean;
}

export interface PhoneBindingRow {
  phone_id: string;
  slots: (string | null)[];
  active_slot: number;
}

export interface QueueItemRow {
  id: string;
  task_id: string;
  target_number: string;
  message: string;
  image_url?: string | null;
  number_id: string;
  status: 'waiting' | 'sending' | 'success' | 'failed';
  scheduled_at: number;
  sent_at?: string | null;
  error?: string | null;
  retry_count: number;
}

export interface TaskResultRow {
  number_id: string;
  number: string;
  contact_number: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message: string;
  error?: string | null;
  sent_at?: string | null;
  account_id?: string | null;
}

export interface BroadcastTaskRow {
  id: string;
  name: string;
  message: string;
  image_url?: string | null;
  mode: 'cloud_number' | 'textnow';
  target_numbers: string[];
  target_phones: string[];
  interval_min: number;
  interval_max: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  completed_at?: string | null;
  results: TaskResultRow[];
  queue: QueueItemRow[];
}

export interface SmsMessageRow {
  id: string;
  number_id: string;
  number: string;
  message: string;
  image_url?: string | null;
  code?: string | null;
  received_at: string;
  direction: 'inbound' | 'outbound';
  status?: 'sent' | 'failed' | 'pending' | null;
}

export interface ConversationRow {
  id: string;
  cloud_number_id: string;
  cloud_number_number: string;
  cloud_number_name?: string | null;
  cloud_number_status?: 'online' | 'offline' | 'unknown' | null;
  contact_number: string;
  unread_count: number;
  last_updated: string;
}

// ============================================================
// 映射函数：DB Row ↔ 前端类型
// ============================================================

function rowToSubAccount(row: SubAccountRow): SubAccount {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    role: row.role,
    assignedPhoneIds: row.assigned_phone_ids ?? [],
    assignedAccountIds: row.assigned_account_ids ?? [],
    createdAt: row.created_at,
    note: row.note ?? undefined,
  };
}

function subAccountToRow(account: Omit<SubAccount, 'id'> & { id?: string }): Omit<SubAccountRow, 'id'> & { id?: string } {
  return {
    ...(account.id ? { id: account.id } : {}),
    name: account.name,
    key: account.key,
    role: account.role,
    assigned_phone_ids: account.assignedPhoneIds,
    assigned_account_ids: account.assignedAccountIds,
    created_at: account.createdAt,
    note: account.note ?? null,
  };
}

function rowToTextNowAccount(row: TextNowAccountRow): TextNowAccount {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    username: row.username,
    password: row.password,
    email: row.email,
    emailPassword: row.email_password,
    raw: row.raw,
    status: row.status,
    assignedPhoneId: row.assigned_phone_id ?? undefined,
    slotIndex: row.slot_index ?? undefined,
    importedAt: row.imported_at,
    lastUsedAt: row.last_used_at ?? undefined,
    bannedAt: row.banned_at ?? undefined,
    sendCount: row.send_count,
    failCount: row.fail_count,
    injected: row.injected,
  };
}

function textNowAccountToRow(account: Omit<TextNowAccount, 'id'> & { id?: string }): Omit<TextNowAccountRow, 'id'> & { id?: string } {
  return {
    ...(account.id ? { id: account.id } : {}),
    phone_number: account.phoneNumber,
    username: account.username,
    password: account.password,
    email: account.email,
    email_password: account.emailPassword,
    raw: account.raw,
    status: account.status,
    assigned_phone_id: account.assignedPhoneId ?? null,
    slot_index: account.slotIndex ?? null,
    imported_at: account.importedAt,
    last_used_at: account.lastUsedAt ?? null,
    banned_at: account.bannedAt ?? null,
    send_count: account.sendCount,
    fail_count: account.failCount,
    injected: account.injected,
  };
}

function rowToPhoneBinding(row: PhoneBindingRow): PhoneBinding {
  return {
    phoneId: row.phone_id,
    slots: row.slots,
    activeSlot: row.active_slot,
  };
}

function phoneBindingToRow(binding: PhoneBinding): PhoneBindingRow {
  return {
    phone_id: binding.phoneId,
    slots: binding.slots,
    active_slot: binding.activeSlot,
  };
}

function rowToQueueItem(row: QueueItemRow): QueueItem {
  return {
    id: row.id,
    targetNumber: row.target_number,
    message: row.message,
    imageUrl: row.image_url ?? undefined,
    numberId: row.number_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count,
  };
}

function rowToTaskResult(row: TaskResultRow): TaskResult {
  return {
    numberId: row.number_id,
    number: row.number,
    contactNumber: row.contact_number,
    status: row.status,
    message: row.message,
    error: row.error ?? undefined,
    sentAt: row.sent_at ?? undefined,
    accountId: row.account_id ?? undefined,
  };
}

function rowToBroadcastTask(row: BroadcastTaskRow): BroadcastTask {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    imageUrl: row.image_url ?? undefined,
    mode: row.mode,
    targetNumbers: row.target_numbers,
    targetPhones: row.target_phones,
    intervalMin: row.interval_min,
    intervalMax: row.interval_max,
    status: row.status,
    progress: row.progress,
    successCount: row.success_count,
    failCount: row.fail_count,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    results: (row.results ?? []).map(rowToTaskResult),
    queue: (row.queue ?? []).map(rowToQueueItem),
  };
}

function broadcastTaskToRow(task: Omit<BroadcastTask, 'id'> & { id?: string }): Omit<BroadcastTaskRow, 'id'> & { id?: string } {
  return {
    ...(task.id ? { id: task.id } : {}),
    name: task.name,
    message: task.message,
    image_url: task.imageUrl ?? null,
    mode: task.mode,
    target_numbers: task.targetNumbers,
    target_phones: task.targetPhones,
    interval_min: task.intervalMin,
    interval_max: task.intervalMax,
    status: task.status,
    progress: task.progress,
    success_count: task.successCount,
    fail_count: task.failCount,
    created_at: task.createdAt,
    completed_at: task.completedAt ?? null,
    results: task.results.map((r): TaskResultRow => ({
      number_id: r.numberId,
      number: r.number,
      contact_number: r.contactNumber,
      status: r.status,
      message: r.message,
      error: r.error ?? null,
      sent_at: r.sentAt ?? null,
      account_id: r.accountId ?? null,
    })),
    queue: task.queue.map((q): QueueItemRow => ({
      id: q.id,
      task_id: task.id ?? '',
      target_number: q.targetNumber,
      message: q.message,
      image_url: q.imageUrl ?? null,
      number_id: q.numberId,
      status: q.status,
      scheduled_at: q.scheduledAt,
      sent_at: q.sentAt ?? null,
      error: q.error ?? null,
      retry_count: q.retryCount,
    })),
  };
}

function rowToSmsMessage(row: SmsMessageRow): SmsMessage {
  return {
    id: row.id,
    numberId: row.number_id,
    number: row.number,
    message: row.message,
    imageUrl: row.image_url ?? undefined,
    code: row.code ?? undefined,
    receivedAt: row.received_at,
    direction: row.direction,
    status: row.status ?? undefined,
  };
}

function smsMessageToRow(msg: Omit<SmsMessage, 'id'> & { id?: string }): Omit<SmsMessageRow, 'id'> & { id?: string } {
  return {
    ...(msg.id ? { id: msg.id } : {}),
    number_id: msg.numberId,
    number: msg.number,
    message: msg.message,
    image_url: msg.imageUrl ?? null,
    code: msg.code ?? null,
    received_at: msg.receivedAt,
    direction: msg.direction,
    status: msg.status ?? null,
  };
}

function rowToConversation(row: ConversationRow, messages: SmsMessage[] = []): Conversation {
  return {
    id: row.id,
    cloudNumber: {
      id: row.cloud_number_id,
      number: row.cloud_number_number,
      name: row.cloud_number_name ?? undefined,
      status: row.cloud_number_status ?? undefined,
    },
    contactNumber: row.contact_number,
    messages,
    unreadCount: row.unread_count,
    lastMessage: messages[messages.length - 1],
    lastUpdated: row.last_updated,
  };
}

function conversationToRow(conv: Omit<Conversation, 'id' | 'messages' | 'lastMessage'> & { id?: string }): Omit<ConversationRow, 'id'> & { id?: string } {
  return {
    ...(conv.id ? { id: conv.id } : {}),
    cloud_number_id: conv.cloudNumber.id,
    cloud_number_number: conv.cloudNumber.number,
    cloud_number_name: conv.cloudNumber.name ?? null,
    cloud_number_status: conv.cloudNumber.status ?? null,
    contact_number: conv.contactNumber,
    unread_count: conv.unreadCount,
    last_updated: conv.lastUpdated,
  };
}

// ============================================================
// sub_accounts CRUD
// ============================================================

export const getSubAccounts = async (): Promise<SubAccount[]> => {
  const { data, error } = await getSupabaseClient()
    .from('sub_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as SubAccountRow[]).map(rowToSubAccount);
};

export const getSubAccountById = async (id: string): Promise<SubAccount | null> => {
  const { data, error } = await getSupabaseClient()
    .from('sub_accounts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return rowToSubAccount(data as SubAccountRow);
};

export const getSubAccountByKey = async (key: string): Promise<SubAccount | null> => {
  const { data, error } = await getSupabaseClient()
    .from('sub_accounts')
    .select('*')
    .eq('key', key)
    .single();
  if (error) return null;
  return rowToSubAccount(data as SubAccountRow);
};

export const createSubAccount = async (account: Omit<SubAccount, 'id'>): Promise<SubAccount> => {
  const row = subAccountToRow(account);
  const { data, error } = await getSupabaseClient()
    .from('sub_accounts')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToSubAccount(data as SubAccountRow);
};

export const updateSubAccount = async (id: string, updates: Partial<SubAccount>): Promise<SubAccount> => {
  const partialRow: Partial<SubAccountRow> = {};
  if (updates.name !== undefined) partialRow.name = updates.name;
  if (updates.key !== undefined) partialRow.key = updates.key;
  if (updates.role !== undefined) partialRow.role = updates.role;
  if (updates.assignedPhoneIds !== undefined) partialRow.assigned_phone_ids = updates.assignedPhoneIds;
  if (updates.assignedAccountIds !== undefined) partialRow.assigned_account_ids = updates.assignedAccountIds;
  if (updates.note !== undefined) partialRow.note = updates.note ?? null;
  const { data, error } = await getSupabaseClient()
    .from('sub_accounts')
    .update(partialRow)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToSubAccount(data as SubAccountRow);
};

export const deleteSubAccount = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('sub_accounts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================
// textnow_accounts CRUD
// ============================================================

export const getTextNowAccounts = async (): Promise<TextNowAccount[]> => {
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .select('*')
    .order('imported_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TextNowAccountRow[]).map(rowToTextNowAccount);
};

export const getTextNowAccountById = async (id: string): Promise<TextNowAccount | null> => {
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return rowToTextNowAccount(data as TextNowAccountRow);
};

export const getTextNowAccountsByStatus = async (status: AccountStatus): Promise<TextNowAccount[]> => {
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .select('*')
    .eq('status', status)
    .order('imported_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TextNowAccountRow[]).map(rowToTextNowAccount);
};

export const createTextNowAccount = async (account: Omit<TextNowAccount, 'id'>): Promise<TextNowAccount> => {
  const row = textNowAccountToRow(account);
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTextNowAccount(data as TextNowAccountRow);
};

export const createTextNowAccountsBatch = async (accounts: Omit<TextNowAccount, 'id'>[]): Promise<TextNowAccount[]> => {
  const rows = accounts.map((a) => textNowAccountToRow(a));
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .insert(rows)
    .select();
  if (error) throw new Error(error.message);
  return (data as TextNowAccountRow[]).map(rowToTextNowAccount);
};

export const updateTextNowAccount = async (id: string, updates: Partial<TextNowAccount>): Promise<TextNowAccount> => {
  const partialRow: Partial<TextNowAccountRow> = {};
  if (updates.phoneNumber !== undefined) partialRow.phone_number = updates.phoneNumber;
  if (updates.username !== undefined) partialRow.username = updates.username;
  if (updates.password !== undefined) partialRow.password = updates.password;
  if (updates.email !== undefined) partialRow.email = updates.email;
  if (updates.emailPassword !== undefined) partialRow.email_password = updates.emailPassword;
  if (updates.raw !== undefined) partialRow.raw = updates.raw;
  if (updates.status !== undefined) partialRow.status = updates.status;
  if (updates.assignedPhoneId !== undefined) partialRow.assigned_phone_id = updates.assignedPhoneId ?? null;
  if (updates.slotIndex !== undefined) partialRow.slot_index = updates.slotIndex ?? null;
  if (updates.lastUsedAt !== undefined) partialRow.last_used_at = updates.lastUsedAt ?? null;
  if (updates.bannedAt !== undefined) partialRow.banned_at = updates.bannedAt ?? null;
  if (updates.sendCount !== undefined) partialRow.send_count = updates.sendCount;
  if (updates.failCount !== undefined) partialRow.fail_count = updates.failCount;
  if (updates.injected !== undefined) partialRow.injected = updates.injected;
  const { data, error } = await getSupabaseClient()
    .from('textnow_accounts')
    .update(partialRow)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTextNowAccount(data as TextNowAccountRow);
};

export const deleteTextNowAccount = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('textnow_accounts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================
// phone_bindings CRUD
// ============================================================

export const getPhoneBindings = async (): Promise<PhoneBinding[]> => {
  const { data, error } = await getSupabaseClient()
    .from('phone_bindings')
    .select('*');
  if (error) throw new Error(error.message);
  return (data as PhoneBindingRow[]).map(rowToPhoneBinding);
};

export const getPhoneBindingById = async (phoneId: string): Promise<PhoneBinding | null> => {
  const { data, error } = await getSupabaseClient()
    .from('phone_bindings')
    .select('*')
    .eq('phone_id', phoneId)
    .single();
  if (error) return null;
  return rowToPhoneBinding(data as PhoneBindingRow);
};

export const upsertPhoneBinding = async (binding: PhoneBinding): Promise<PhoneBinding> => {
  const row = phoneBindingToRow(binding);
  const { data, error } = await getSupabaseClient()
    .from('phone_bindings')
    .upsert(row, { onConflict: 'phone_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPhoneBinding(data as PhoneBindingRow);
};

export const updatePhoneBinding = async (phoneId: string, updates: Partial<Omit<PhoneBinding, 'phoneId'>>): Promise<PhoneBinding> => {
  const partialRow: Partial<Omit<PhoneBindingRow, 'phone_id'>> = {};
  if (updates.slots !== undefined) partialRow.slots = updates.slots;
  if (updates.activeSlot !== undefined) partialRow.active_slot = updates.activeSlot;
  const { data, error } = await getSupabaseClient()
    .from('phone_bindings')
    .update(partialRow)
    .eq('phone_id', phoneId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPhoneBinding(data as PhoneBindingRow);
};

export const deletePhoneBinding = async (phoneId: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('phone_bindings')
    .delete()
    .eq('phone_id', phoneId);
  if (error) throw new Error(error.message);
};

// ============================================================
// broadcast_tasks CRUD
// ============================================================

export const getBroadcastTasks = async (): Promise<BroadcastTask[]> => {
  const { data, error } = await getSupabaseClient()
    .from('broadcast_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as BroadcastTaskRow[]).map(rowToBroadcastTask);
};

export const getBroadcastTaskById = async (id: string): Promise<BroadcastTask | null> => {
  const { data, error } = await getSupabaseClient()
    .from('broadcast_tasks')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return rowToBroadcastTask(data as BroadcastTaskRow);
};

export const createBroadcastTask = async (task: Omit<BroadcastTask, 'id'>): Promise<BroadcastTask> => {
  const row = broadcastTaskToRow(task);
  const { data, error } = await getSupabaseClient()
    .from('broadcast_tasks')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToBroadcastTask(data as BroadcastTaskRow);
};

export const updateBroadcastTask = async (id: string, updates: Partial<BroadcastTask>): Promise<BroadcastTask> => {
  const partialRow: Partial<BroadcastTaskRow> = {};
  if (updates.name !== undefined) partialRow.name = updates.name;
  if (updates.message !== undefined) partialRow.message = updates.message;
  if (updates.imageUrl !== undefined) partialRow.image_url = updates.imageUrl ?? null;
  if (updates.mode !== undefined) partialRow.mode = updates.mode;
  if (updates.targetNumbers !== undefined) partialRow.target_numbers = updates.targetNumbers;
  if (updates.targetPhones !== undefined) partialRow.target_phones = updates.targetPhones;
  if (updates.intervalMin !== undefined) partialRow.interval_min = updates.intervalMin;
  if (updates.intervalMax !== undefined) partialRow.interval_max = updates.intervalMax;
  if (updates.status !== undefined) partialRow.status = updates.status;
  if (updates.progress !== undefined) partialRow.progress = updates.progress;
  if (updates.successCount !== undefined) partialRow.success_count = updates.successCount;
  if (updates.failCount !== undefined) partialRow.fail_count = updates.failCount;
  if (updates.completedAt !== undefined) partialRow.completed_at = updates.completedAt ?? null;
  if (updates.results !== undefined) {
    partialRow.results = updates.results.map((r): TaskResultRow => ({
      number_id: r.numberId,
      number: r.number,
      contact_number: r.contactNumber,
      status: r.status,
      message: r.message,
      error: r.error ?? null,
      sent_at: r.sentAt ?? null,
      account_id: r.accountId ?? null,
    }));
  }
  if (updates.queue !== undefined) {
    partialRow.queue = updates.queue.map((q): QueueItemRow => ({
      id: q.id,
      task_id: id,
      target_number: q.targetNumber,
      message: q.message,
      image_url: q.imageUrl ?? null,
      number_id: q.numberId,
      status: q.status,
      scheduled_at: q.scheduledAt,
      sent_at: q.sentAt ?? null,
      error: q.error ?? null,
      retry_count: q.retryCount,
    }));
  }
  const { data, error } = await getSupabaseClient()
    .from('broadcast_tasks')
    .update(partialRow)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToBroadcastTask(data as BroadcastTaskRow);
};

export const deleteBroadcastTask = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('broadcast_tasks')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================
// sms_messages CRUD
// ============================================================

export const getSmsMessages = async (numberId?: string): Promise<SmsMessage[]> => {
  let query = getSupabaseClient()
    .from('sms_messages')
    .select('*')
    .order('received_at', { ascending: true });
  if (numberId) query = query.eq('number_id', numberId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as SmsMessageRow[]).map(rowToSmsMessage);
};

export const getSmsMessageById = async (id: string): Promise<SmsMessage | null> => {
  const { data, error } = await getSupabaseClient()
    .from('sms_messages')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return rowToSmsMessage(data as SmsMessageRow);
};

export const createSmsMessage = async (msg: Omit<SmsMessage, 'id'>): Promise<SmsMessage> => {
  const row = smsMessageToRow(msg);
  const { data, error } = await getSupabaseClient()
    .from('sms_messages')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToSmsMessage(data as SmsMessageRow);
};

export const updateSmsMessage = async (id: string, updates: Partial<SmsMessage>): Promise<SmsMessage> => {
  const partialRow: Partial<SmsMessageRow> = {};
  if (updates.numberId !== undefined) partialRow.number_id = updates.numberId;
  if (updates.number !== undefined) partialRow.number = updates.number;
  if (updates.message !== undefined) partialRow.message = updates.message;
  if (updates.imageUrl !== undefined) partialRow.image_url = updates.imageUrl ?? null;
  if (updates.code !== undefined) partialRow.code = updates.code ?? null;
  if (updates.receivedAt !== undefined) partialRow.received_at = updates.receivedAt;
  if (updates.direction !== undefined) partialRow.direction = updates.direction;
  if (updates.status !== undefined) partialRow.status = updates.status ?? null;
  const { data, error } = await getSupabaseClient()
    .from('sms_messages')
    .update(partialRow)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToSmsMessage(data as SmsMessageRow);
};

export const deleteSmsMessage = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('sms_messages')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================
// conversations CRUD（含消息历史）
// ============================================================

export const getConversations = async (): Promise<Conversation[]> => {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .order('last_updated', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ConversationRow[]).map((row) => rowToConversation(row));
};

export const getConversationById = async (id: string): Promise<Conversation | null> => {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  // 同时加载该会话的消息
  const messages = await getSmsMessages(id);
  return rowToConversation(data as ConversationRow, messages);
};

/** 获取会话并附带其消息（sms_messages.number_id = conversation.id） */
export const getConversationWithMessages = async (conversationId: string): Promise<Conversation | null> => {
  const [convResult, messagesResult] = await Promise.all([
    getSupabaseClient()
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single(),
    getSupabaseClient()
      .from('sms_messages')
      .select('*')
      .eq('number_id', conversationId)
      .order('received_at', { ascending: true }),
  ]);
  if (convResult.error) return null;
  const messages = messagesResult.error
    ? []
    : (messagesResult.data as SmsMessageRow[]).map(rowToSmsMessage);
  return rowToConversation(convResult.data as ConversationRow, messages);
};

export const createConversation = async (
  conv: Omit<Conversation, 'id' | 'messages' | 'lastMessage'>
): Promise<Conversation> => {
  const row = conversationToRow(conv);
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToConversation(data as ConversationRow);
};

export const updateConversation = async (
  id: string,
  updates: Partial<Omit<Conversation, 'id' | 'messages' | 'lastMessage'>>
): Promise<Conversation> => {
  const partialRow: Partial<ConversationRow> = {};
  if (updates.cloudNumber !== undefined) {
    partialRow.cloud_number_id = updates.cloudNumber.id;
    partialRow.cloud_number_number = updates.cloudNumber.number;
    partialRow.cloud_number_name = updates.cloudNumber.name ?? null;
    partialRow.cloud_number_status = updates.cloudNumber.status ?? null;
  }
  if (updates.contactNumber !== undefined) partialRow.contact_number = updates.contactNumber;
  if (updates.unreadCount !== undefined) partialRow.unread_count = updates.unreadCount;
  if (updates.lastUpdated !== undefined) partialRow.last_updated = updates.lastUpdated;
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .update(partialRow)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToConversation(data as ConversationRow);
};

export const deleteConversation = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('conversations')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
};

// ============================================================
// 连接测试
// ============================================================

export const testSupabaseConnection = async (): Promise<{ ok: boolean; message: string }> => {
  try {
    const { error } = await getSupabaseClient()
      .from('sub_accounts')
      .select('id')
      .limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: '连接成功' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
};
