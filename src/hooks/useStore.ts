import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppSettings, Conversation, BroadcastTask, CloudNumber, SmsMessage,
  TaskResult, TextNowAccount, PhoneBinding, CloudPhone, AccountStatus,
  SubAccount, AppRole,
} from '@/lib/index';
import {
  DEFAULT_SETTINGS, generateId, MAX_SLOTS, buildAdbCommand, generateSubKey,
  getSharedSettings, syncSharedSettings,
} from '@/lib/index';
import { fetchCloudNumbers, fetchSmsList, fetchCloudPhones, executeAdbCommand, writeSmsByPhone } from '@/api/duoplus';
import type { TextNowRawAccount } from '@/api/duoplus';

// ============================================================
// Settings Store
// ============================================================

interface SettingsStore {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: {
        ...DEFAULT_SETTINGS,
        ...getSharedSettings(),
      },
      updateSettings: (patch) =>
        set((state) => {
          const nextSettings = { ...state.settings, ...patch };
          syncSharedSettings(nextSettings);
          return { settings: nextSettings };
        }),
    }),
    {
      name: 'duoplus-settings',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<SettingsStore> | undefined)?.settings ?? {};
        const shared = getSharedSettings();
        const current = currentState.settings;

        return {
          ...currentState,
          ...(persistedState as object),
          settings: {
            ...current,
            ...shared,
            ...persisted,
            apiKey: persisted.apiKey || shared.apiKey || current.apiKey,
            apiRegion: persisted.apiRegion ?? shared.apiRegion ?? current.apiRegion,
            pollInterval: persisted.pollInterval ?? shared.pollInterval ?? current.pollInterval,
            adbCommandTemplate: persisted.adbCommandTemplate || shared.adbCommandTemplate || current.adbCommandTemplate,
            translateEngine: persisted.translateEngine ?? shared.translateEngine ?? current.translateEngine,
            ollamaUrl: persisted.ollamaUrl || shared.ollamaUrl || current.ollamaUrl,
            ollamaModel: persisted.ollamaModel || shared.ollamaModel || current.ollamaModel,
            accessKey: persisted.accessKey,
          },
        };
      },
    }
  )
);

// ============================================================
// Chat Store
// ============================================================

interface ChatStore {
  cloudNumbers: CloudNumber[];
  cloudPhones: CloudPhone[];
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  lastError: string | null;
  pollingInterval: ReturnType<typeof setInterval> | null;

  setCloudNumbers: (numbers: CloudNumber[]) => void;
  setActiveConversation: (id: string | null) => void;
  addOrUpdateConversation: (conv: Partial<Conversation> & { id: string }) => void;
  addMessage: (conversationId: string, message: SmsMessage) => void;
  sendOutboundMessage: (conversationId: string, text: string) => void;
  loadNumbers: (apiKey: string, region: 'cn' | 'global') => Promise<void>;
  loadCloudPhones: (apiKey: string, region: 'cn' | 'global') => Promise<void>;
  pollMessages: (apiKey: string, region: 'cn' | 'global') => Promise<void>;
  startPolling: (apiKey: string, region: 'cn' | 'global', interval: number) => void;
  stopPolling: () => void;
  markRead: (conversationId: string) => void;
}

export const useChatStore = create<ChatStore>()((set, get) => ({
  cloudNumbers: [],
  cloudPhones: [],
  conversations: [],
  activeConversationId: null,
  isLoading: false,
  lastError: null,
  pollingInterval: null,

  setCloudNumbers: (numbers) => set({ cloudNumbers: numbers }),

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
    if (id) get().markRead(id);
  },

  addOrUpdateConversation: (partial) =>
    set((state) => {
      const existing = state.conversations.find((c) => c.id === partial.id);
      if (existing) {
        return { conversations: state.conversations.map((c) => c.id === partial.id ? { ...c, ...partial } : c) };
      }
      return {
        conversations: [
          ...state.conversations,
          { messages: [], unreadCount: 0, contactNumber: '', lastUpdated: new Date().toISOString(), cloudNumber: { id: '', number: '' }, ...partial } as Conversation,
        ],
      };
    }),

  addMessage: (conversationId, message) =>
    set((state) => {
      const activeId = state.activeConversationId;
      return {
        conversations: state.conversations.map((c) => {
          if (c.id !== conversationId) return c;
          const exists = c.messages.some((m) => m.id === message.id);
          if (exists) return c;
          const updated = [...c.messages, message];
          return { ...c, messages: updated, lastMessage: message, lastUpdated: message.receivedAt, unreadCount: activeId === conversationId ? 0 : c.unreadCount + 1 };
        }),
      };
    }),

  sendOutboundMessage: (conversationId, text) => {
    const outbound: SmsMessage = {
      id: generateId(), numberId: conversationId, number: '',
      message: text, receivedAt: new Date().toISOString(),
      direction: 'outbound', status: 'sent',
    };
    get().addMessage(conversationId, outbound);
  },

  markRead: (conversationId) =>
    set((state) => ({ conversations: state.conversations.map((c) => c.id === conversationId ? { ...c, unreadCount: 0 } : c) })),

  loadNumbers: async (apiKey, region) => {
    if (!apiKey) return;
    set({ isLoading: true, lastError: null });
    try {
      const numbers = await fetchCloudNumbers(apiKey, region);
      set({ cloudNumbers: numbers, isLoading: false });
      numbers.forEach((n) => {
        get().addOrUpdateConversation({ id: n.id, cloudNumber: n, contactNumber: n.number, lastUpdated: new Date().toISOString() });
      });
    } catch (e) {
      set({ lastError: (e as Error).message, isLoading: false });
    }
  },

  loadCloudPhones: async (apiKey, region) => {
    if (!apiKey) return;
    try {
      const phones = await fetchCloudPhones(apiKey, region);
      set({
        cloudPhones: phones.map((p) => ({
          id: p.id, name: p.name, status: p.status,
          os: p.os, ip: p.ip, area: p.area, adb: p.adb, expired_at: p.expired_at,
        })),
      });
    } catch {
      // silent
    }
  },

  pollMessages: async (apiKey, region) => {
    if (!apiKey) return;
    const { conversations } = get();
    for (const conv of conversations) {
      try {
        const msgs = await fetchSmsList(apiKey, region, conv.id);
        msgs.forEach((msg) => get().addMessage(conv.id, { ...msg, number: conv.cloudNumber.number }));
      } catch { /* continue */ }
    }
  },

  startPolling: (apiKey, region, interval) => {
    get().stopPolling();
    Promise.all([get().loadNumbers(apiKey, region), get().loadCloudPhones(apiKey, region)]).then(() => {
      get().pollMessages(apiKey, region);
    });
    const timer = setInterval(() => get().pollMessages(apiKey, region), interval * 1000);
    set({ pollingInterval: timer });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) { clearInterval(pollingInterval); set({ pollingInterval: null }); }
  },
}));

// ============================================================
// Account Store
// ============================================================

interface AccountStore {
  accounts: TextNowAccount[];
  bindings: PhoneBinding[];  // 云手机 -> 10槽账号

  importAccounts: (raws: TextNowRawAccount[]) => { added: number; duplicate: number };
  updateAccount: (id: string, patch: Partial<TextNowAccount>) => void;
  deleteAccount: (id: string) => void;
  deleteSelected: (ids: string[]) => void;
  markBanned: (id: string) => void;

  // Binding ops
  ensureBinding: (phoneId: string) => void;
  assignToSlot: (phoneId: string, slot: number, accountId: string | null) => void;
  autoAssign: (phoneId: string, count?: number) => number;
  getBinding: (phoneId: string) => PhoneBinding | undefined;
  getActiveAccount: (phoneId: string) => TextNowAccount | undefined;
  advanceSlot: (phoneId: string) => void;

  // ADB injection
  injectAccount: (
    phoneId: string, accountId: string,
    apiKey: string, region: 'cn' | 'global',
    template: string,
  ) => Promise<{ success: boolean; message: string }>;

  // Auto replace banned account
  autoReplace: (
    phoneId: string,
    apiKey: string, region: 'cn' | 'global',
    template: string,
  ) => Promise<{ replaced: boolean; newAccountId?: string }>;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      accounts: [] as TextNowAccount[],
      bindings: [] as PhoneBinding[],

      importAccounts: (raws) => {
        const existing = new Set(get().accounts.map((a) => a.phoneNumber));
        let added = 0;
        let duplicate = 0;
        const newAccounts: TextNowAccount[] = [];
        for (const raw of raws) {
          if (existing.has(raw.phoneNumber)) { duplicate++; continue; }
          existing.add(raw.phoneNumber);
          added++;
          newAccounts.push({
            id: generateId(),
            phoneNumber: raw.phoneNumber,
            username: raw.username,
            password: raw.password,
            email: raw.email,
            emailPassword: raw.emailPassword,
            raw: raw.raw,
            status: 'available',
            importedAt: new Date().toISOString(),
            sendCount: 0,
            failCount: 0,
            injected: false,
          });
        }
        set((state) => ({ accounts: [...state.accounts, ...newAccounts] }));
        return { added, duplicate };
      },

      updateAccount: (id, patch) =>
        set((state) => ({ accounts: state.accounts.map((a) => a.id === id ? { ...a, ...patch } : a) })),

      deleteAccount: (id) => {
        // unassign from binding first
        const acc = get().accounts.find((a) => a.id === id);
        if (acc?.assignedPhoneId) {
          const b = get().bindings.find((b) => b.phoneId === acc.assignedPhoneId);
          if (b) {
            const slots = b.slots.map((s) => s === id ? null : s);
            set((state) => ({ bindings: state.bindings.map((bi) => bi.phoneId === acc.assignedPhoneId ? { ...bi, slots } : bi) }));
          }
        }
        set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) }));
      },

      deleteSelected: (ids) => {
        const idSet = new Set(ids);
        // clean bindings
        set((state) => ({
          bindings: state.bindings.map((b) => ({
            ...b,
            slots: b.slots.map((s) => (s && idSet.has(s)) ? null : s),
          })),
          accounts: state.accounts.filter((a) => !idSet.has(a.id)),
        }));
      },

      markBanned: (id) => {
        get().updateAccount(id, { status: 'banned', bannedAt: new Date().toISOString() });
      },

      ensureBinding: (phoneId) => {
        const exists = get().bindings.find((b) => b.phoneId === phoneId);
        if (!exists) {
          set((state) => ({
            bindings: [...state.bindings, { phoneId, slots: Array(MAX_SLOTS).fill(null) as (string | null)[], activeSlot: 0 }],
          }));
        }
      },

      assignToSlot: (phoneId, slot, accountId) => {
        get().ensureBinding(phoneId);
        // remove previous assignment if any
        if (accountId) {
          const prev = get().accounts.find((a) => a.id === accountId);
          if (prev?.assignedPhoneId && (prev.assignedPhoneId !== phoneId || prev.slotIndex !== slot)) {
            // unassign from old slot
            const oldBinding = get().bindings.find((b) => b.phoneId === prev.assignedPhoneId);
            if (oldBinding) {
              const oldSlots = oldBinding.slots.map((s) => s === accountId ? null : s);
              set((state) => ({ bindings: state.bindings.map((b) => b.phoneId === prev.assignedPhoneId ? { ...b, slots: oldSlots } : b) }));
            }
          }
          get().updateAccount(accountId, { assignedPhoneId: phoneId, slotIndex: slot, status: 'assigned' });
        }
        // clear old account in this slot
        const binding = get().bindings.find((b) => b.phoneId === phoneId);
        if (binding) {
          const oldId = binding.slots[slot];
          if (oldId && oldId !== accountId) {
            get().updateAccount(oldId, { assignedPhoneId: undefined, slotIndex: undefined, status: 'available' });
          }
        }
        set((state) => ({
          bindings: state.bindings.map((b) =>
            b.phoneId === phoneId
              ? { ...b, slots: b.slots.map((s, i) => i === slot ? (accountId ?? null) : s) }
              : b
          ),
        }));
      },

      autoAssign: (phoneId, count = MAX_SLOTS) => {
        get().ensureBinding(phoneId);
        const binding = get().bindings.find((b) => b.phoneId === phoneId);
        if (!binding) return 0;
        const available = get().accounts.filter((a) => a.status === 'available');
        let assigned = 0;
        for (let slot = 0; slot < MAX_SLOTS && assigned < count; slot++) {
          if (binding.slots[slot]) continue;
          const acc = available[assigned];
          if (!acc) break;
          get().assignToSlot(phoneId, slot, acc.id);
          assigned++;
        }
        return assigned;
      },

      getBinding: (phoneId) => get().bindings.find((b) => b.phoneId === phoneId),

      getActiveAccount: (phoneId) => {
        const b = get().bindings.find((bi) => bi.phoneId === phoneId);
        if (!b) return undefined;
        const activeId = b.slots[b.activeSlot];
        if (!activeId) return undefined;
        return get().accounts.find((a) => a.id === activeId);
      },

      advanceSlot: (phoneId) => {
        const b = get().bindings.find((bi) => bi.phoneId === phoneId);
        if (!b) return;
        let next = (b.activeSlot + 1) % MAX_SLOTS;
        // skip null slots
        let tries = 0;
        while (!b.slots[next] && tries < MAX_SLOTS) { next = (next + 1) % MAX_SLOTS; tries++; }
        set((state) => ({
          bindings: state.bindings.map((bi) => bi.phoneId === phoneId ? { ...bi, activeSlot: next } : bi),
        }));
      },

      injectAccount: async (phoneId, accountId, apiKey, region, template) => {
        const acc = get().accounts.find((a) => a.id === accountId);
        if (!acc) return { success: false, message: '账号不存在' };
        get().updateAccount(accountId, { status: 'injecting' });
        try {
          const cmd = buildAdbCommand(template, acc);
          const result = await executeAdbCommand(apiKey, region, phoneId, cmd);
          if (result.success) {
            get().updateAccount(accountId, { status: 'assigned', injected: true });
            return { success: true, message: result.content || 'ADB注入成功' };
          } else {
            get().updateAccount(accountId, { status: 'assigned' });
            return { success: false, message: result.message || 'ADB命令返回失败' };
          }
        } catch (e) {
          get().updateAccount(accountId, { status: 'assigned' });
          return { success: false, message: (e as Error).message };
        }
      },

      autoReplace: async (phoneId, apiKey, region, template) => {
        const b = get().bindings.find((bi) => bi.phoneId === phoneId);
        if (!b) return { replaced: false };
        // find first available account in pool
        const replacement = get().accounts.find((a) => a.status === 'available');
        if (!replacement) return { replaced: false };
        // find an empty/banned slot
        let targetSlot = b.slots.findIndex((s) => s === null);
        if (targetSlot === -1) {
          // find a banned slot
          targetSlot = b.slots.findIndex((s) => {
            if (!s) return false;
            const acc = get().accounts.find((a) => a.id === s);
            return acc?.status === 'banned';
          });
        }
        if (targetSlot === -1) return { replaced: false };
        // Replace the slot
        get().assignToSlot(phoneId, targetSlot, replacement.id);
        // Inject via ADB
        await get().injectAccount(phoneId, replacement.id, apiKey, region, template);
        return { replaced: true, newAccountId: replacement.id };
      },
    }),
    { name: 'duoplus-accounts' }
  )
);

// ============================================================
// Task Store
// ============================================================

interface TaskStore {
  tasks: BroadcastTask[];
  /** 后台运行中的任务ID → abort控制器 */
  _abortMap: Map<string, { abort: boolean }>;

  createTask: (task: Omit<BroadcastTask, 'id' | 'createdAt' | 'progress' | 'successCount' | 'failCount' | 'results'>) => string;
  updateTask: (id: string, patch: Partial<BroadcastTask>) => void;
  updateTaskResult: (taskId: string, result: TaskResult) => void;
  deleteTask: (id: string) => void;
  /** 启动后台队列执行（关闭弹窗后继续运行） */
  runTaskInBackground: (
    taskId: string,
    apiKey: string,
    region: 'cn' | 'global',
    onItemDone?: (taskId: string, itemId: string, success: boolean) => void,
  ) => void;
  abortTask: (taskId: string) => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [] as BroadcastTask[],
      _abortMap: new Map<string, { abort: boolean }>(),

      createTask: (partial) => {
        const id = generateId();
        const task: BroadcastTask = {
          ...partial,
          id,
          progress: 0,
          successCount: 0,
          failCount: 0,
          results: partial.queue.map((item) => ({
            numberId: item.numberId,
            number: item.numberId,
            contactNumber: item.targetNumber,
            status: 'pending' as const,
            message: item.message,
          })),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [task, ...state.tasks] }));
        return id;
      },

      updateTask: (id, patch) =>
        set((state) => ({ tasks: state.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) })),

      updateTaskResult: (taskId, result) =>
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const results = t.results.map((r) => r.numberId === result.numberId ? { ...r, ...result } : r);
            const successCount = results.filter((r) => r.status === 'success').length;
            const failCount = results.filter((r) => r.status === 'failed').length;
            const done = successCount + failCount;
            const progress = Math.round((done / results.length) * 100);
            const allDone = done === results.length;
            return {
              ...t, results, successCount, failCount, progress,
              status: allDone ? (failCount === results.length ? 'failed' : 'completed') : 'running',
              completedAt: allDone ? new Date().toISOString() : t.completedAt,
            };
          }),
        })),

      deleteTask: (id) => {
        get().abortTask(id);
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },

      abortTask: (taskId) => {
        const ctrl = get()._abortMap.get(taskId);
        if (ctrl) ctrl.abort = true;
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId && t.status === 'running' ? { ...t, status: 'paused' } : t
          ),
        }));
      },

      runTaskInBackground: (taskId, apiKey, region, onItemDone) => {
        const ctrl = { abort: false };
        get()._abortMap.set(taskId, ctrl);
        get().updateTask(taskId, { status: 'running' });

        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return;

        // 异步后台执行，不 await，不阻塞 UI
        (async () => {
          for (let i = 0; i < task.queue.length; i++) {
            if (ctrl.abort) break;
            const item = task.queue[i];

            // 等待到预定发送时间
            const waitMs = item.scheduledAt - Date.now();
            if (waitMs > 500) {
              let waited = 0;
              while (waited < waitMs && !ctrl.abort) {
                await new Promise(r => setTimeout(r, Math.min(1000, waitMs - waited)));
                waited += 1000;
              }
            }
            if (ctrl.abort) break;

            // 更新为 sending 状态
            set((state) => ({
              tasks: state.tasks.map(t => {
                if (t.id !== taskId) return t;
                return {
                  ...t,
                  queue: t.queue.map(q => q.id === item.id ? { ...q, status: 'sending' as const } : q),
                };
              }),
            }));

            try {
              if (task.mode === 'cloud_number') {
                await writeSmsByPhone(apiKey, region, item.numberId, [
                  { phone: item.targetNumber, message: item.message }
                ]);
              }

              // 成功
              set((state) => ({
                tasks: state.tasks.map(t => {
                  if (t.id !== taskId) return t;
                  const queue = t.queue.map(q =>
                    q.id === item.id ? { ...q, status: 'success' as const, sentAt: new Date().toISOString() } : q
                  );
                  const success = queue.filter(q => q.status === 'success').length;
                  const failed = queue.filter(q => q.status === 'failed').length;
                  const done = success + failed;
                  return {
                    ...t, queue,
                    successCount: success, failCount: failed,
                    progress: Math.round((done / queue.length) * 100),
                  };
                }),
              }));
              onItemDone?.(taskId, item.id, true);

            } catch (e) {
              set((state) => ({
                tasks: state.tasks.map(t => {
                  if (t.id !== taskId) return t;
                  const queue = t.queue.map(q =>
                    q.id === item.id
                      ? { ...q, status: 'failed' as const, error: (e as Error).message }
                      : q
                  );
                  const success = queue.filter(q => q.status === 'success').length;
                  const failed = queue.filter(q => q.status === 'failed').length;
                  const done = success + failed;
                  return {
                    ...t, queue,
                    successCount: success, failCount: failed,
                    progress: Math.round((done / queue.length) * 100),
                  };
                }),
              }));
              onItemDone?.(taskId, item.id, false);
            }
          }

          // 全部完成或中止
          const finalTask = get().tasks.find(t => t.id === taskId);
          if (finalTask && finalTask.status === 'running') {
            const allSuccess = finalTask.queue.every(q => q.status === 'success' || q.status === 'failed' || q.status === 'waiting');
            get().updateTask(taskId, {
              status: ctrl.abort ? 'paused' : (finalTask.failCount === finalTask.queue.length ? 'failed' : 'completed'),
              completedAt: ctrl.abort ? undefined : new Date().toISOString(),
              progress: ctrl.abort ? finalTask.progress : 100,
            });
          }
          get()._abortMap.delete(taskId);
        })();
      },
    }),
    {
      name: 'duoplus-tasks',
      // _abortMap 是运行时状态，不持久化
      partialize: (state) => ({ tasks: state.tasks }),
    }
  )
);

// ============================================================
// Admin Store — 子账号管理 & 角色鉴权
// ============================================================



interface AdminStore {
  subAccounts: SubAccount[];
  /** 当前登录角色（由访问密钥决定） */
  currentRole: AppRole;
  /** 当前子账号ID（管理员为null） */
  currentSubId: string | null;
  roleResolved: boolean;
  setSubAccounts: (accounts: SubAccount[]) => void;
  setRoleResolved: (resolved: boolean) => void;
  setRole: (role: AppRole, subId?: string) => void;
  createSubAccount: (name: string, note?: string) => SubAccount;
  updateSubAccount: (id: string, patch: Partial<SubAccount>) => void;
  deleteSubAccount: (id: string) => void;
  assignPhones: (subId: string, phoneIds: string[]) => void;
  assignAccounts: (subId: string, accountIds: string[]) => void;
  resolveRole: (inputKey: string, adminApiKey: string) => AppRole;
}

export const useAdminStore = create<AdminStore>()(
  persist(
    (set, get) => ({
      subAccounts: [] as SubAccount[],
      currentRole: 'admin' as AppRole,
      currentSubId: null as string | null,
      roleResolved: false,

      setSubAccounts: (accounts) => set({ subAccounts: accounts }),
      setRoleResolved: (resolved) => set({ roleResolved: resolved }),
      setRole: (role, subId) => set({ currentRole: role, currentSubId: subId ?? null }),

      createSubAccount: (name, note) => {
        const sub: SubAccount = {
          id: generateId(),
          name,
          key: generateSubKey(),
          role: 'user',
          assignedPhoneIds: [],
          assignedAccountIds: [],
          createdAt: new Date().toISOString(),
          note,
        };
        set((s) => ({ subAccounts: [sub, ...s.subAccounts] }));
        return sub;
      },

      updateSubAccount: (id, patch) =>
        set((s) => ({
          subAccounts: s.subAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      deleteSubAccount: (id) =>
        set((s) => ({ subAccounts: s.subAccounts.filter((a) => a.id !== id) })),

      assignPhones: (subId, phoneIds) =>
        set((s) => ({
          subAccounts: s.subAccounts.map((a) =>
            a.id === subId ? { ...a, assignedPhoneIds: phoneIds } : a
          ),
        })),

      assignAccounts: (subId, accountIds) =>
        set((s) => ({
          subAccounts: s.subAccounts.map((a) =>
            a.id === subId ? { ...a, assignedAccountIds: accountIds } : a
          ),
        })),

      /** 根据输入密钥解析角色 */
      resolveRole: (inputKey, adminApiKey) => {
        // 空key or 与主API Key相同 → admin
        if (!inputKey || inputKey === adminApiKey) return 'admin';
        const sub = get().subAccounts.find((s) => s.key === inputKey);
        return sub ? 'user' : 'admin';
      },
    }),
    { name: 'duoplus-admin' }
  )
);
