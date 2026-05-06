import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircleMore, Send, Users, ShieldCheck, PencilLine, Lock, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { cn, type CommunityMember, type CommunityMessage, type CommunityRoom, type SubAccount } from '@/lib/index';
import { useAdminStore } from '@/hooks/useStore';
import {
  createCommunityMessage,
  ensureCommunityRoom,
  getCommunityMessages,
  getDirectMessages,
  getSubAccounts,
  uploadCommunityImage,
  updateCommunityRoom,
} from '@/api/supabase';
import { toast } from '@/hooks/use-toast';

function formatMsgTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function memberFromSubAccount(sub: SubAccount): CommunityMember {
  return {
    key: sub.id,
    name: sub.name,
    role: 'user',
    note: sub.note,
  };
}

export default function CommunityPage() {
  const { currentRole, currentSubId, setSubAccounts, subAccounts } = useAdminStore();
  const [room, setRoom] = useState<CommunityRoom | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [selectedKey, setSelectedKey] = useState<'room' | string>('room');
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftMarquee, setDraftMarquee] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMember = useMemo<CommunityMember | null>(() => {
    if (currentRole === 'admin') {
      return { key: 'admin', name: '管理员', role: 'admin', note: '社群管理员' };
    }
    const found = subAccounts.find((item) => item.id === currentSubId);
    if (!found) return null;
    return memberFromSubAccount(found);
  }, [currentRole, currentSubId, subAccounts]);

  const selectedMember = useMemo(
    () => members.find((item) => item.key === selectedKey) ?? null,
    [members, selectedKey]
  );

  const refreshMembers = async () => {
    const data = await getSubAccounts();
    setSubAccounts(data);
    setMembers([
      { key: 'admin', name: '管理员', role: 'admin', note: '社群管理员' },
      ...data.map(memberFromSubAccount),
    ]);
  };

  const refreshMessages = async (nextSelected = selectedKey, nextRoom = room) => {
    if (!currentMember || !nextRoom) return;
    if (nextSelected === 'room') {
      const roomMessages = await getCommunityMessages(nextRoom.id);
      setMessages(roomMessages);
    } else {
      const directMessages = await getDirectMessages(currentMember.key, nextSelected);
      setMessages(directMessages);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (selectedImagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [nextRoom] = await Promise.all([
          ensureCommunityRoom(),
          refreshMembers(),
        ]);
        if (cancelled) return;
        setRoom(nextRoom);
        setDraftName(nextRoom.name);
        setDraftDesc(nextRoom.description ?? '');
        setDraftNote(nextRoom.adminNote ?? '');
        setDraftMarquee(nextRoom.marqueeNotice ?? '');
        await refreshMessages('room', nextRoom);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!room || !currentMember) return;
    refreshMessages();
  }, [selectedKey, room?.id, currentMember?.key]);

  const handleSend = async () => {
    const body = input.trim();
    if ((!body && !selectedImage) || !currentMember || !room || sending) return;
    setSending(true);
    try {
      let uploadResult: { imageUrl: string; imageName: string } | undefined;
      if (selectedImage) {
        uploadResult = await uploadCommunityImage(selectedImage, currentMember.key);
      }

      await createCommunityMessage({
        scope: selectedKey === 'room' ? 'room' : 'direct',
        roomId: selectedKey === 'room' ? room.id : undefined,
        senderMemberKey: currentMember.key,
        senderName: currentMember.name,
        senderRole: currentMember.role,
        targetMemberKey: selectedKey === 'room' ? undefined : selectedKey,
        targetName: selectedMember?.name,
        body,
        imageUrl: uploadResult?.imageUrl,
        imageName: uploadResult?.imageName,
      });
      setInput('');
      setSelectedImage(null);
      if (selectedImagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedImagePreview);
      }
      setSelectedImagePreview(null);
      await refreshMessages();
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (selectedImagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(selectedImagePreview);
    }
    setSelectedImage(file);
    setSelectedImagePreview(URL.createObjectURL(file));
    event.target.value = '';
  };

  const handleSaveRoom = async () => {
    if (!room) return;
    const updated = await updateCommunityRoom(room.id, {
      name: draftName.trim() || room.name,
      description: draftDesc.trim(),
      adminNote: draftNote.trim(),
      marqueeNotice: draftMarquee.trim(),
    });
    setRoom(updated);
    setEditing(false);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent">
      <aside className="tool-sidebar w-72 shrink-0 overflow-y-auto border-r border-[#dbe2e9]">
        <div className="p-4 border-b border-[#dbe2e9]">
          <div
            onClick={() => setSelectedKey('room')}
            className={cn(
              'rounded-[12px] border p-3 cursor-pointer transition',
              selectedKey === 'room'
                ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)]'
                : 'border-[#dbe2e9] bg-white hover:bg-white/80'
            )}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <MessageCircleMore size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">{room?.name ?? '社群'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{room?.description || '管理员分发的所有子账号都可在此交流'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Users size={12} />
            <span>成员</span>
          </div>
          <div className="space-y-2">
            {members
              .filter((item) => currentMember?.key !== item.key)
              .map((member) => (
                <button
                  key={member.key}
                  onClick={() => setSelectedKey(member.key)}
                  className={cn(
                    'w-full rounded-[10px] border px-3 py-2 text-left transition',
                    selectedKey === member.key
                      ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)]'
                      : 'border-[#dbe2e9] bg-white hover:bg-white/80'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-foreground truncate">{member.name}</span>
                    {member.role === 'admin' ? (
                      <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">ADMIN</span>
                    ) : (
                      <Lock size={11} className="text-muted-foreground/60" />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-1">{member.note || '可发起私聊'}</p>
                </button>
              ))}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="tool-toolbar flex items-center gap-3 px-4 py-2 shrink-0">
          {selectedKey === 'room' ? (
            <>
              <MessageCircleMore className="w-4 h-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-foreground truncate">{room?.name ?? '社群'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{room?.description || '所有子账号共用的群组频道'}</p>
              </div>
              {currentRole === 'admin' && (
                <button
                  onClick={() => setEditing((value) => !value)}
                  className="tool-btn h-6 px-2.5 text-[10px]"
                >
                  <PencilLine size={12} />
                  {editing ? '收起编辑' : '编辑群信息'}
                </button>
              )}
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-foreground truncate">{selectedMember?.name ?? '私聊'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{selectedMember?.note || '成员私聊频道'}</p>
              </div>
            </>
          )}
        </div>

        {selectedKey === 'room' && editing && currentRole === 'admin' && (
          <div className="mx-4 mt-3 rounded-[14px] border border-[#dbe2e9] bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
              <ShieldCheck size={13} className="text-primary" />
              <span>社群配置</span>
            </div>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="tool-input h-8 px-3 text-[12px]"
              placeholder="社群名称"
            />
            <input
              value={draftDesc}
              onChange={(event) => setDraftDesc(event.target.value)}
              className="tool-input h-8 px-3 text-[12px]"
              placeholder="社群简介"
            />
            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              className="tool-textarea min-h-20 px-3 py-2 text-[12px]"
              placeholder="管理员备注 / 公告"
            />
            <input
              value={draftMarquee}
              onChange={(event) => setDraftMarquee(event.target.value)}
              className="tool-input h-8 px-3 text-[12px]"
              placeholder="顶部滚动公告内容"
            />
            <div className="flex justify-end">
              <button onClick={handleSaveRoom} className="tool-btn tool-btn-primary h-7 px-4 text-[11px] font-semibold">
                保存社群信息
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>加载社群中…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <MessageCircleMore className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">还没有消息</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {selectedKey === 'room' ? '发出第一条社群消息' : '开始这段私聊'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => {
                const mine = message.senderMemberKey === currentMember?.key;
                return (
                  <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[70%] rounded-[12px] px-3 py-2 text-[12px]',
                        mine
                          ? 'bg-[linear-gradient(180deg,#3683ec_0%,#276bcc_100%)] text-white'
                          : 'border border-[#d8dee6] bg-white text-foreground'
                      )}
                    >
                      <div className={cn('mb-1 text-[10px]', mine ? 'text-white/75' : 'text-muted-foreground')}>
                        {message.senderName} · {formatMsgTime(message.createdAt)}
                      </div>
                      {message.imageUrl && (
                        <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block mb-2">
                          <img
                            src={message.imageUrl}
                            alt={message.imageName || 'community image'}
                            className="max-h-48 max-w-full rounded-[10px] object-cover"
                          />
                        </a>
                      )}
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="tool-toolbar px-4 py-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImage}
          />
          {selectedImagePreview && (
            <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-[#dbe2e9] bg-white px-3 py-2">
              <img src={selectedImagePreview} alt={selectedImage?.name ?? 'preview'} className="h-12 w-12 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-foreground">{selectedImage?.name}</p>
                <p className="text-[10px] text-muted-foreground">图片会上传到社群存储后发送</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedImagePreview.startsWith('blob:')) {
                    URL.revokeObjectURL(selectedImagePreview);
                  }
                  setSelectedImage(null);
                  setSelectedImagePreview(null);
                }}
                className="tool-btn h-6 px-2 text-[10px]"
              >
                移除
              </button>
            </div>
          )}
          <div className="flex w-full items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={selectedKey === 'room' ? '向社群发送消息…' : `向 ${selectedMember?.name ?? '成员'} 发送私聊…`}
              className="tool-textarea min-h-[52px] flex-1 px-3 py-2 text-[12px]"
            />
            <button
              type="button"
              onClick={() => {
                if (!room) {
                  toast({
                    title: '社群尚未就绪',
                    description: '请等待社群初始化完成后再上传图片。',
                  });
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="tool-btn h-9 w-9 px-0"
              title="上传图片"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && !selectedImage) || !currentMember}
              className="tool-btn tool-btn-primary h-9 px-4 text-[11px] font-semibold disabled:opacity-40"
            >
              {sending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
              发送
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
