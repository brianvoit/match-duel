'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarColor } from '@/lib/avatar-color';
import { useRealtimeChannel } from '@/lib/realtime/useRealtimeChannel';

const PRESET_REACTIONS = ['👍', '❤️', '😂', '😮', '💀', '💯', '👌'];

type RawReaction = { user_id: string; emoji: string };

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  content: string;
  createdAt: string;
  reactions: RawReaction[];
};

interface ChatPanelProps {
  matchupId: string;
  myAppUserId: string;
  myAvatarUrl: string | null;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
  opponentAvatarUrl: string | null;
  onMarkRead: () => void;
  /** Whether the opponent is currently present (computed by the parent). */
  opponentOnline?: boolean;
  /** Hide the built-in opponent header — used on mobile where the overlay nav
   *  already shows the opponent's name + presence. */
  hideHeader?: boolean;
}

function initials(s: string | null | undefined) {
  return s?.trim()?.charAt(0)?.toUpperCase() ?? '?';
}

function groupReactions(raw: RawReaction[], myId: string) {
  const map = new Map<string, { count: number; includesMe: boolean }>();
  for (const r of raw) {
    const e = map.get(r.emoji) ?? { count: 0, includesMe: false };
    map.set(r.emoji, { count: e.count + 1, includesMe: e.includesMe || r.user_id === myId });
  }
  return [...map.entries()].map(([emoji, d]) => ({ emoji, ...d }));
}

export function ChatPanel({
  matchupId, myAppUserId, myAvatarUrl,
  opponentDisplayName, opponentEmail, opponentAvatarUrl,
  onMarkRead,
  opponentOnline = false,
  hideHeader = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const oppName = opponentDisplayName || opponentEmail?.split('@')[0] || 'Opponent';

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/matchups/${matchupId}/messages`, { cache: 'no-store' });
    const payload = await res.json();
    if (payload.ok) {
      setMessages(payload.messages ?? []);
      scrollToBottom();
    }
  }, [matchupId, scrollToBottom]);

  const markRead = useCallback(async () => {
    await fetch(`/api/matchups/${matchupId}/messages/read`, { method: 'POST' });
    onMarkRead();
  }, [matchupId, onMarkRead]);

  // Initial load + mark read whenever the matchup changes.
  useEffect(() => {
    loadMessages();
    markRead();
  }, [matchupId, loadMessages, markRead]);

  // Realtime: broadcast for new messages (works on Nano), postgres_changes for
  // reactions. The hook handles reconnect-on-focus, backoff, and cleanup.
  const { channelRef } = useRealtimeChannel(
    `chat-${matchupId}`,
    (channel) => channel
      .on('broadcast', { event: 'new-message' }, () => { loadMessages(); markRead(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_reaction',
      }, () => { loadMessages(); }),
    { enabled: Boolean(matchupId) },
  );

  // Polling fallback — catches messages if realtime drops. Supabase Realtime
  // handles all normal delivery; this only fires every 2 minutes as a safety net.
  useEffect(() => {
    const interval = setInterval(() => { loadMessages(); }, 120_000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    // Optimistic insert so the message appears instantly
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      senderId: myAppUserId,
      senderName: null,
      senderAvatar: myAvatarUrl,
      content,
      createdAt: new Date().toISOString(),
      reactions: [],
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    const res = await fetch(`/api/matchups/${matchupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      setInput(content);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else {
      // Broadcast to opponent's client (~50ms delivery) then reload our own view
      channelRef.current?.send({ type: 'broadcast', event: 'new-message', payload: {} });
      loadMessages(); // replace optimistic entry with real DB row
    }
    setSending(false);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerMsgId(null);
    await fetch(`/api/matchups/${matchupId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    // Realtime will trigger loadMessages — no need to call it here
  }

  return (
    <div className="wc-chat">
      {/* Opponent header (hidden on mobile — the overlay nav shows it there) */}
      {!hideHeader && (
        <div className="wc-chat-header">
          <div className="wc-chat-opp-wrap">
            {opponentAvatarUrl
              ? <img src={opponentAvatarUrl} className="wc-chat-opp-avatar" referrerPolicy="no-referrer" alt={oppName} />
              : <span className="wc-chat-opp-avatar wc-chat-opp-avatar--init" style={{ background: avatarColor(opponentEmail) }}>{initials(oppName)}</span>
            }
            {opponentOnline && <span className="wc-presence-dot" />}
          </div>
          <span className="wc-chat-opp-name">{oppName}</span>
          <span className={`wc-chat-online-label${opponentOnline ? '' : ' wc-chat-online-label--off'}`}>
            {opponentOnline ? 'online' : 'offline'}
          </span>
        </div>
      )}

      {/* Message list */}
      <div className="wc-chat-messages" ref={scrollRef} onClick={() => setPickerMsgId(null)}>
        {messages.length === 0 ? (
          <div className="wc-chat-empty">No messages yet — start the trash talk!</div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.senderId === myAppUserId;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const isGroupEnd = !next || next.senderId !== msg.senderId;
            const grouped = groupReactions(msg.reactions, myAppUserId);

            return (
              <div key={msg.id} className={`wc-msg${isMe ? ' wc-msg--me' : ' wc-msg--them'}`}>
                {/* Avatar column (opponent only) */}
                {!isMe && (
                  <div className="wc-msg-avatar-col">
                    {isGroupEnd
                      ? opponentAvatarUrl
                        ? <img src={opponentAvatarUrl} className="wc-msg-avatar-sm" referrerPolicy="no-referrer" alt="" />
                        : <span className="wc-msg-avatar-sm wc-msg-avatar-sm--init" style={{ background: avatarColor(opponentEmail) }}>{initials(oppName)}</span>
                      : <div className="wc-msg-avatar-spacer" />
                    }
                  </div>
                )}

                <div className="wc-msg-body">
                  {/* Bubble */}
                  <div
                    className={`wc-msg-bubble${isMe ? ' wc-msg-bubble--me' : ' wc-msg-bubble--them'}`}
                    onClick={(e) => { e.stopPropagation(); setPickerMsgId(pickerMsgId === msg.id ? null : msg.id); }}
                  >
                    {msg.content}
                  </div>

                  {/* Reaction picker */}
                  {pickerMsgId === msg.id && (
                    <div className={`wc-reaction-picker${isMe ? ' wc-reaction-picker--me' : ''}`} onClick={(e) => e.stopPropagation()}>
                      {PRESET_REACTIONS.map((emoji) => (
                        <button key={emoji} className="wc-reaction-opt" onClick={() => toggleReaction(msg.id, emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Reaction chips */}
                  {grouped.length > 0 && (
                    <div className={`wc-msg-reactions${isMe ? ' wc-msg-reactions--me' : ''}`}>
                      {grouped.map((r) => (
                        <button
                          key={r.emoji}
                          className={`wc-reaction-chip${r.includesMe ? ' wc-reaction-chip--mine' : ''}`}
                          onClick={() => toggleReaction(msg.id, r.emoji)}
                        >
                          {r.emoji}{r.count > 1 ? ` ${r.count}` : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp on last of group */}
                  {isGroupEnd && (
                    <div className={`wc-msg-time${isMe ? ' wc-msg-time--me' : ''}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input — single inline pill: textarea grows, send button sits inside on the right */}
      <div className="wc-chat-input-wrap">
        <div className="wc-chat-input-pill">
          <textarea
            ref={textareaRef}
            className="wc-chat-textarea"
            value={input}
            maxLength={500}
            rows={1}
            placeholder="Message…"

            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          {input.length > 450 && (
            <span className={`wc-chat-char${input.length > 450 ? ' wc-chat-char--warn' : ''}`}>
              {500 - input.length}
            </span>
          )}
          <button className="wc-chat-send" disabled={!input.trim() || sending} onClick={sendMessage} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
