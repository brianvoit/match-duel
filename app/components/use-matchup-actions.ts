'use client';

import { FormEvent, useState } from 'react';
import type { NoticeTone } from '@/app/components/playground-types';

/**
 * The create/join/cancel matchup flow: the three modals' open/form state, plus
 * the network calls behind them. All three end the same way — reload the
 * matchup list — so this owns that call too rather than making three separate
 * places at the composition layer remember to do it.
 */
export interface UseMatchupActionsResult {
  joinCode: string;
  setJoinCode: (v: string) => void;
  joinOpen: boolean;
  setJoinOpen: (v: boolean) => void;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  createdInviteCode: string | null;
  copyConfirmed: boolean;
  cancelMatchupId: string | null;
  setCancelMatchupId: (id: string | null) => void;
  createMatchup: () => Promise<void>;
  copyInviteLink: (code: string) => Promise<void>;
  closeCreateModal: () => void;
  cancelMatchup: () => Promise<void>;
  joinMatchup: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function useMatchupActions(params: {
  showNotice: (tone: NoticeTone, text: string) => void;
  setLoading: (v: boolean) => void;
  loadMatchups: () => Promise<void>;
  selectedMatchupId: string | null;
  setSelectedMatchupId: (id: string | null) => void;
}): UseMatchupActionsResult {
  const { showNotice, setLoading, loadMatchups, selectedMatchupId, setSelectedMatchupId } = params;

  const [joinCode, setJoinCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const [cancelMatchupId, setCancelMatchupId] = useState<string | null>(null);

  async function createMatchup() {
    setLoading(true);
    const res = await fetch('/api/matchups/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const payload = await res.json();
    setLoading(false);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to create matchup.');
      return;
    }
    setCreatedInviteCode(payload.matchup.inviteCode);
    await loadMatchups();
  }

  async function copyInviteLink(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(link);
    setCopyConfirmed(true);
    setTimeout(() => setCopyConfirmed(false), 2000);
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setCreatedInviteCode(null);
    setCopyConfirmed(false);
  }

  async function cancelMatchup() {
    if (!cancelMatchupId) return;
    setLoading(true);
    const res = await fetch(`/api/matchups/${cancelMatchupId}`, { method: 'DELETE' });
    const payload = await res.json();
    setLoading(false);
    setCancelMatchupId(null);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to cancel matchup.');
      return;
    }
    if (selectedMatchupId === cancelMatchupId) setSelectedMatchupId(null);
    await loadMatchups();
  }

  async function joinMatchup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinCode.trim()) { showNotice('error', 'Enter an invite code.'); return; }
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    const res = await fetch(`/api/matchups/invite/${code}/accept`, { method: 'POST' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to join matchup.');
      setLoading(false);
      return;
    }
    setJoinCode('');
    setJoinOpen(false);
    showNotice('ok', payload.alreadyJoined ? 'Already in this matchup.' : 'Joined matchup!');
    await loadMatchups();
    setLoading(false);
  }

  return {
    joinCode, setJoinCode, joinOpen, setJoinOpen,
    createOpen, setCreateOpen, createdInviteCode, copyConfirmed,
    cancelMatchupId, setCancelMatchupId,
    createMatchup, copyInviteLink, closeCreateModal, cancelMatchup, joinMatchup,
  };
}
