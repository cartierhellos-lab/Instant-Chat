-- ============================================================
-- Supabase Schema for DuoPlus Chat
-- 严格对应 src/lib/index.ts 中的类型定义
-- ============================================================

-- ============================================================
-- 1. sub_accounts 表（对应 SubAccount 类型）
-- ============================================================
CREATE TABLE IF NOT EXISTS sub_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  key                  TEXT NOT NULL UNIQUE,           -- 子账号密钥（UUID格式）
  role                 TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  assigned_phone_ids   TEXT[]  NOT NULL DEFAULT '{}', -- 分配的云手机ID列表
  assigned_account_ids TEXT[]  NOT NULL DEFAULT '{}', -- 分配的TextNow账号ID列表
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  note                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_sub_accounts_key ON sub_accounts(key);
CREATE INDEX IF NOT EXISTS idx_sub_accounts_role ON sub_accounts(role);

-- ============================================================
-- 2. textnow_accounts 表（对应 TextNowAccount 类型）
-- ============================================================
CREATE TABLE IF NOT EXISTS textnow_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number      TEXT NOT NULL,
  username          TEXT NOT NULL,
  password          TEXT NOT NULL,
  email             TEXT NOT NULL,
  email_password    TEXT NOT NULL,
  raw               TEXT NOT NULL,                   -- 原始5字段行
  status            TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','assigned','active','banned','cooling','injecting')),
  assigned_phone_id UUID,                            -- 所属云手机ID（外键可选）
  slot_index        INTEGER,                         -- 在云手机上的槽位索引(0-9)
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at      TIMESTAMPTZ,
  banned_at         TIMESTAMPTZ,
  send_count        INTEGER NOT NULL DEFAULT 0,
  fail_count        INTEGER NOT NULL DEFAULT 0,
  injected          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_textnow_accounts_status ON textnow_accounts(status);
CREATE INDEX IF NOT EXISTS idx_textnow_accounts_assigned_phone ON textnow_accounts(assigned_phone_id);
CREATE INDEX IF NOT EXISTS idx_textnow_accounts_phone_number ON textnow_accounts(phone_number);

-- ============================================================
-- 3. phone_bindings 表（对应 PhoneBinding 类型）
-- ============================================================
CREATE TABLE IF NOT EXISTS phone_bindings (
  phone_id    TEXT PRIMARY KEY,                       -- 云手机ID（来自DuoPlus API）
  slots       JSONB NOT NULL DEFAULT '[]',            -- (string|null)[] 最多10个槽位，存TextNowAccount.id或null
  active_slot INTEGER NOT NULL DEFAULT 0              -- 当前活跃槽位索引
);

CREATE INDEX IF NOT EXISTS idx_phone_bindings_phone_id ON phone_bindings(phone_id);

-- ============================================================
-- 4. broadcast_tasks 表（对应 BroadcastTask 类型）
-- results 和 queue 使用 JSONB 存储（嵌套类型 TaskResult[] 和 QueueItem[]）
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  message         TEXT NOT NULL,
  image_url       TEXT,
  mode            TEXT NOT NULL CHECK (mode IN ('cloud_number', 'textnow')),
  target_numbers  TEXT[]  NOT NULL DEFAULT '{}',
  target_phones   TEXT[]  NOT NULL DEFAULT '{}',
  interval_min    INTEGER NOT NULL DEFAULT 350,       -- 最小间隔秒数
  interval_max    INTEGER NOT NULL DEFAULT 450,       -- 最大间隔秒数
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','paused','completed','failed')),
  progress        FLOAT NOT NULL DEFAULT 0,           -- 0~1 进度
  success_count   INTEGER NOT NULL DEFAULT 0,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  results         JSONB NOT NULL DEFAULT '[]',        -- TaskResult[]
  queue           JSONB NOT NULL DEFAULT '[]'         -- QueueItem[]
);

CREATE INDEX IF NOT EXISTS idx_broadcast_tasks_status ON broadcast_tasks(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_tasks_created_at ON broadcast_tasks(created_at DESC);

-- JSONB 注释说明 results 元素结构:
-- {
--   "number_id": string, "number": string, "contact_number": string,
--   "status": "pending"|"running"|"success"|"failed",
--   "message": string, "error": string|null, "sent_at": string|null, "account_id": string|null
-- }

-- JSONB 注释说明 queue 元素结构:
-- {
--   "id": string, "task_id": string, "target_number": string, "message": string,
--   "image_url": string|null, "number_id": string,
--   "status": "waiting"|"sending"|"success"|"failed",
--   "scheduled_at": number, "sent_at": string|null, "error": string|null, "retry_count": number
-- }

-- ============================================================
-- 5. sms_messages 表（对应 SmsMessage 类型）
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id   TEXT NOT NULL,                          -- 对应云号码ID或conversation.id
  number      TEXT NOT NULL,                          -- 云号码/发件方号码
  message     TEXT NOT NULL,
  image_url   TEXT,
  code        TEXT,                                   -- 提取的验证码
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status      TEXT CHECK (status IN ('sent', 'failed', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_number_id ON sms_messages(number_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_received_at ON sms_messages(received_at ASC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);

-- ============================================================
-- 6. conversations 表（对应 Conversation 类型）
-- cloudNumber 字段内联存储（避免关联查询），messages 通过 sms_messages 关联
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloud_number_id      TEXT NOT NULL,                 -- CloudNumber.id
  cloud_number_number  TEXT NOT NULL,                 -- CloudNumber.number
  cloud_number_name    TEXT,                          -- CloudNumber.name
  cloud_number_status  TEXT CHECK (cloud_number_status IN ('online', 'offline', 'unknown')),
  contact_number       TEXT NOT NULL,
  unread_count         INTEGER NOT NULL DEFAULT 0,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_cloud_number_id ON conversations(cloud_number_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_number ON conversations(contact_number);
CREATE INDEX IF NOT EXISTS idx_conversations_last_updated ON conversations(last_updated DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair
  ON conversations(cloud_number_id, contact_number);

-- ============================================================
-- Row Level Security（可选，建议在生产环境启用）
-- ============================================================
-- ALTER TABLE sub_accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE textnow_accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE phone_bindings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE broadcast_tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
