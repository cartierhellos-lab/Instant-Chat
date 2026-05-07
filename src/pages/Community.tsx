import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  return { key: sub.id, name: sub.name, role: 'user', note: sub.note };
}

// 根据名字生成固定渐变色
function nameToGradient(name: string): string {
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `linear-gradient(135deg, hsl(${hue},65%,55%) 0%, hsl(${(hue + 40) % 360},70%,45%) 100%)`;
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

  const refreshMembers = useCallback(async () => {
    const data = await getSubAccounts();
    setSubAccounts(data);
    setMembers([
      { key: 'admin', name: '管理员', role: 'admin', note: '社群管理员' },
      ...data.map(memberFromSubAccount),
    ]);
  }, [setSubAccounts]);

  const refreshMessages = useCallback(async (nextSelected = selectedKey, nextRoom = room) => {
    if (!currentMember || !nextRoom) return;
    if (nextSelected === 'room') {
      const roomMessages = await getCommunityMessages(nextRoom.id);
      setMessages(roomMessages);
    } else {
      const directMessages = await getDirectMessages(currentMember.key, nextSelected);
      setMessages(directMessages);
    }
  }, [currentMember, room, selectedKey]);

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
    return () => { cancelled = true; };
  }, []);

  const handleSend = async () => {
    const body = input.trim();
    if ((!body && !selectedImage) || !currentMember || !room) return;
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
      if (selectedImagePreview?.startsWith('blob:')) URL.revokeObjectURL(selectedImagePreview);
      setSelectedImagePreview(null);
      await refreshMessages();
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (selectedImagePreview?.startsWith('blob:')) URL.revokeObjectURL(selectedImagePreview);
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
    <div className="flex h-full w-full overflow-hidden bg-[#f2f2f7]">
      {/* ── 左侧边栏 ── */}
      <aside className="tool-sidebar w-64 shrink-0 overflow-y-auto border-r border-[#e5e5ea] bg-white">
        {/* 社群频道 */}
        <div className="p-3 border-b border-[#f2f2f7]">
          <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1 mb-2">频道</p>
          <div
            onClick={() => setSelectedKey('room')}
            className={cn(
              'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 cursor-pointer transition-colors',
              selectedKey === 'room'
                ? 'bg-[#007aff]/10'
                : 'hover:bg-[#f2f2f7]'
            )}
          >
            <div className="w-9 h-9 rounded-full bg-[#007aff]/15 flex items-center justify-center shrink-0">
              <MessageCircleMore size={16} className="text-[#007aff]" />
            </div>
            <div className="min-w-0">
              <p className={cn('text-[14px] font-semibold truncate', selectedKey === 'room' ? 'text-[#007aff]' : 'text-[#1c1c1e]')}>
                {room?.name ?? '社群'}
              </p>
              <p className="text-[11px] text-[#8e8e93] truncate">{room?.description || '所有成员'}</p>
            </div>
          </div>
        </div>

        {/* 成员列表 */}
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Users size={11} className="text-[#8e8e93]" />
            <span className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider">成员</span>
          </div>
          <div className="space-y-0.5">
            {members
              .filter((item) => currentMember?.key !== item.key)
              .map((member) => (
                <button
                  key={member.key}
                  onClick={() => setSelectedKey(member.key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition-colors',
                    selectedKey === member.key ? 'bg-[#007aff]/10' : 'hover:bg-[#f2f2f7]'
                  )}
                >
                  {/* 头像 */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[12px] font-semibold"
                    style={{ background: nameToGradient(member.name) }}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'text-[13px] font-medium truncate',
                        selectedKey === member.key ? 'text-[#007aff]' : 'text-[#1c1c1e]'
                      )}>{member.name}</span>
                      {member.role === 'admin' && (
                        <span className="text-[9px] text-[#007aff] bg-[#007aff]/10 px-1.5 py-0.5 rounded-full shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8e8e93] truncate">{member.note || '可发起私聊'}</p>
                  </div>
                  {member.role !== 'admin' && (
                    <Lock size={11} className="text-[#c7c7cc] shrink-0" />
                  )}
                </button>
              ))}
          </div>
        </div>
      </aside>

      {/* ── 右侧主区域 ── */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {/* 顶部栏 */}
        <div className="tool-toolbar h-11 px-4 flex items-center gap-3 shrink-0">
          {selectedKey === 'room' ? (
            <>
              <div className="w-7 h-7 rounded-full bg-[#007aff]/10 flex items-center justify-center shrink-0">
                <MessageCircleMore size={14} className="text-[#007aff]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[#1c1c1e] truncate leading-tight">{room?.name ?? '社群'}</p>
                <p className="text-[11px] text-[#8e8e93] truncate leading-none">{room?.description || '所有子账号共用的群组频道'}</p>
              </div>
              {currentRole === 'admin' && (
                <button
                  onClick={() => setEditing((value) => !value)}
                  className="tool-btn tool-btn-quiet h-7 px-2.5 text-[12px]"
                >
                  <PencilLine size={12} />
                  {editing ? '收起' : '编辑'}
                </button>
              )}
            </>
          ) : (
            <>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                style={{ background: nameToGradient(selectedMember?.name ?? '?') }}
              >
                {(selectedMember?.name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[#1c1c1e] truncate leading-tight">{selectedMember?.name ?? '私聊'}</p>
                <p className="text-[11px] text-[#8e8e93] truncate leading-none">{selectedMember?.note || '成员私聊频道'}</p>
              </div>
            </>
          )}
        </div>

        {/* 社群编辑面板（管理员） */}
        {selectedKey === 'room' && editing && currentRole === 'admin' && (
          <div className="mx-4 mt-3 ios-card p-4 space-y-2.5 animate-fade-up shrink-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1c1c1e]">
              <ShieldCheck size={14} className="text-[#007aff]" />
              <span>社群配置</span>
            </div>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="tool-input h-8 px-3 text-[13px]"
              placeholder="社群名称"
            />
            <input
              value={draftDesc}
              onChange={(event) => setDraftDesc(event.target.value)}
              className="tool-input h-8 px-3 text-[13px]"
              placeholder="社群简介"
            />
            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              className="tool-textarea min-h-20 px-3 py-2 text-[13px]"
              placeholder="管理员备注 / 公告"
            />
            <input
              value={draftMarquee}
              onChange={(event) => setDraftMarquee(event.target.value)}
              className="tool-input h-8 px-3 text-[13px]"
              placeholder="顶部滚动公告内容"
            />
            <div className="flex justify-end">
              <button onClick={handleSaveRoom} className="ios-btn ios-btn-primary h-8 px-4 text-[13px]">
                保存社群信息
              </button>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[#8e8e93]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>加载社群中…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <div className="w-16 h-16 rounded-full bg-[#f2f2f7] flex items-center justify-center mx-auto mb-3">
                  <MessageCircleMore className="w-7 h-7 text-[#c7c7cc]" />
                </div>
                <p className="text-[15px] font-medium text-[#8e8e93]">还没有消息</p>
                <p className="text-[13px] text-[#c7c7cc] mt-1">
                  {selectedKey === 'room' ? '发出第一条社群消息' : '开始这段私聊'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.senderMemberKey === currentMember?.key;
              return (
                <div key={message.id} className={cn('flex gap-2.5', mine ? 'flex-row-reverse' : 'flex-row')}>
                  {/* 头像 */}
                  {!mine && (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold shrink-0 self-end"
                      style={{ background: nameToGradient(message.senderName) }}
                    >
                      {message.senderName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  {/* 气泡 */}
                  <div className={cn('max-w-[70%] space-y-1', mine ? 'items-end' : 'items-start')}>
                    <div className={cn('text-[11px]', mine ? 'text-right text-[#8e8e93]' : 'text-[#8e8e93]')}>
                      {!mine && <span className="font-medium text-[#1c1c1e] mr-1">{message.senderName}</span>}
                      {formatMsgTime(message.createdAt)}
                    </div>
                    <div className={cn(
                      'rounded-[16px] px-3.5 py-2.5 text-[14px]',
                      mine
                        ? 'bg-[#007aff] text-white rounded-br-[4px]'
                        : 'bg-[#f2f2f7] text-[#1c1c1e] rounded-bl-[4px]'
                    )}>
                      {message.imageUrl && (
                        <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block mb-2">
                          <img
                            src={message.imageUrl}
                            alt={message.imageName || 'community image'}
                            className="max-h-48 max-w-full rounded-[10px] object-cover"
                          />
                        </a>
                      )}
                      {message.body && <p className="leading-relaxed whitespace-pre-wrap">{message.body}</p>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* 底部输入栏 */}
        <div className="border-t border-[#f2f2f7] px-4 py-3 space-y-2 bg-white shrink-0">
          {/* 图片预览 */}
          {selectedImagePreview && (
            <div className="flex items-center gap-2">
              <img src={selectedImagePreview} alt="preview" className="h-12 rounded-[8px] object-cover border border-[#e5e5ea]" />
              <button
                type="button"
                onClick={() => {
                  if (selectedImagePreview.startsWith('blob:')) URL.revokeObjectURL(selectedImagePreview);
                  setSelectedImage(null);
                  setSelectedImagePreview(null);
                }}
                className="tool-btn tool-btn-quiet h-6 px-2 text-[11px]"
              >移除</button>
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
              className="tool-textarea min-h-[52px] flex-1 px-3 py-2 text-[13px] resize-none"
            />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
            <button
              type="button"
              onClick={() => {
                if (!room) {
                  toast({ title: '社群尚未就绪', description: '请等待社群初始化完成后再上传图片。' });
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="tool-btn tool-btn-quiet w-9 h-9 px-0 rounded-full"
              title="上传图片"
            >
              <ImageIcon size={15} />
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && !selectedImage) || !currentMember}
              className="ios-btn ios-btn-primary h-9 px-4 text-[13px] disabled:opacity-40 rounded-full"
            >
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              发送
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
