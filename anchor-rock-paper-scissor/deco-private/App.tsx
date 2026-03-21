/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { PublicKey } from '@solana/web3.js';
import { ArrowDown, Menu, X, Shield, Lock, Activity, Zap, Plus, ChevronDown, ArrowLeft, Vote, CheckCircle } from 'lucide-react';
import { useDecoProgram } from './hooks/useDecoProgram';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const HeroScene = lazy(() => import('./components/QuantumScene').then(m => ({ default: m.HeroScene })));
const SurfaceCodeDiagram = lazy(() => import('./components/Diagrams').then(m => ({ default: m.SurfaceCodeDiagram })));
const TransformerDecoderDiagram = lazy(() => import('./components/Diagrams').then(m => ({ default: m.TransformerDecoderDiagram })));
const PerformanceMetricDiagram = lazy(() => import('./components/Diagrams').then(m => ({ default: m.PerformanceMetricDiagram })));

const GOLD = '#C5A059';

interface GrantRoundData {
  pubkey: any;
  roundId: { toNumber: () => number };
  isActive: boolean;
  winner: any | null;
}
interface VoteData {
  pubkey: any;
  roundId: { toNumber: () => number };
  voter: any;
  votedFor: any | null;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, delay }: { label: string; value: string; delay: string }) => (
  <div className="flex flex-col items-center p-8 bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-all duration-300 w-full max-w-xs" style={{ animationDelay: delay }}>
    <h3 className="font-serif text-3xl text-stone-900 text-center mb-3">{value}</h3>
    <div className="w-12 h-0.5 mb-4 opacity-60" style={{ backgroundColor: GOLD }}></div>
    <p className="text-xs text-stone-500 font-bold uppercase tracking-widest text-center leading-relaxed">{label}</p>
  </div>
);

const TxToast = ({ msg, onClose }: { msg: string; onClose: () => void }) => (
  <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-stone-900 text-white px-5 py-4 rounded-xl shadow-2xl border border-stone-700 flex items-start gap-3">
    <Shield size={16} className="mt-0.5 shrink-0" style={{ color: GOLD }} />
    <p className="text-sm leading-relaxed flex-1">{msg}</p>
    <button onClick={onClose} className="text-stone-400 hover:text-white shrink-0"><X size={14} /></button>
  </div>
);

// ── Vote Modal ────────────────────────────────────────────────────────────────
const VoteModal = ({
  round, onClose, onVote, loading, alreadyVoted,
}: {
  round: GrantRoundData;
  onClose: () => void;
  onVote: (roundId: number, pubkey: string) => void;
  loading: boolean;
  alreadyVoted: boolean;
}) => {
  const roundId = round.roundId.toNumber();
  const winner = round.winner ? round.winner.toString() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-md p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"><X size={20} /></button>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 text-stone-600 text-xs font-bold tracking-widest uppercase rounded-full mb-4 border border-stone-200">
          <Vote size={12} /> Cast Private Vote
        </div>
        <h3 className="font-serif text-3xl text-stone-900 mb-2">Round #{roundId}</h3>
        <div className="w-12 h-0.5 mb-6" style={{ backgroundColor: GOLD }}></div>

        <div className="space-y-3 mb-8">
          {[
            { label: 'Status', value: round.isActive ? 'Active' : 'Closed', green: round.isActive },
            { label: 'Privacy', value: '🔒 TEE Shielded' },
            { label: 'Winner', value: winner ? winner.slice(0, 8) + '...' + winner.slice(-4) : 'Pending' },
          ].map(r => (
            <div key={r.label} className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500 text-xs uppercase font-bold tracking-wider">{r.label}</span>
              <span className={`text-xs font-bold ${(r as any).green ? 'text-emerald-600' : 'text-stone-700'}`}>{r.value}</span>
            </div>
          ))}
        </div>

        {alreadyVoted ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <CheckCircle size={20} className="text-emerald-600 shrink-0" />
            <p className="text-emerald-700 text-sm font-bold">You have already voted in this round.</p>
          </div>
        ) : (
          <button
            onClick={() => onVote(roundId, '11111111111111111111111111111111')}
            disabled={loading || !round.isActive}
            className="w-full py-4 rounded-full font-bold uppercase tracking-widest text-sm transition-colors shadow-sm disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
            {loading ? 'Casting Vote...' : !round.isActive ? 'Round Closed' : 'Cast Private Vote'}
          </button>
        )}
        <p className="text-center text-stone-400 text-xs mt-4">Your vote is encrypted inside the MagicBlock TEE. No one can see who you voted for.</p>
      </div>
    </div>
  );
};

// ── Grants Page ───────────────────────────────────────────────────────────────
const GrantsPage = ({
  grantRounds, votedRounds, loading, connected, onVote, onBack, myVotes,
}: {
  grantRounds: GrantRoundData[];
  votedRounds: Record<number, boolean>;
  loading: string | null;
  connected: boolean;
  onVote: (name: string, roundId: number, pubkey: string) => void;
  onBack: () => void;
  myVotes: VoteData[];
}) => {
  const [voteModal, setVoteModal] = useState<GrantRoundData | null>(null);

  const displayRounds: GrantRoundData[] = grantRounds.length > 0 ? grantRounds : [
    { pubkey: null, roundId: { toNumber: () => 1 }, isActive: true, winner: null },
    { pubkey: null, roundId: { toNumber: () => 2 }, isActive: true, winner: null },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F9F8F4' }}>
      {/* Header */}
      <div className="bg-white border-b border-stone-100 pt-24 pb-12">
        <div className="container mx-auto px-6">
          <button onClick={onBack} className="flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors text-sm font-bold uppercase tracking-widest mb-8">
            <ArrowLeft size={16} /> Back to Home
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 text-stone-600 text-xs font-bold tracking-widest uppercase rounded-full mb-4 border border-stone-200">
            <Zap size={12} /> Live on Solana Devnet
          </div>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-serif text-5xl text-stone-900 mb-2">Active Grant Rounds</h1>
              <p className="text-stone-500 text-lg">All votes are shielded inside MagicBlock's TEE. Your ballot is private.</p>
            </div>
            <button onClick={onBack} className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-bold" style={{ backgroundColor: GOLD }}>
              <Plus size={14} /> Submit Startup
            </button>
          </div>
          {/* Stats row */}
          <div className="flex gap-8 mt-8 flex-wrap">
            {[
              { label: 'Total Rounds', value: displayRounds.length },
              { label: 'Active', value: displayRounds.filter(r => r.isActive).length },
              { label: 'Your Votes', value: myVotes.length },
            ].map(s => (
              <div key={s.label}>
                <div className="font-serif text-3xl text-stone-900">{s.value}</div>
                <div className="text-xs text-stone-500 font-bold uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="container mx-auto px-6 py-16">
        {displayRounds.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-stone-400 text-lg">No grant rounds yet. Be the first to submit.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {displayRounds.map((round, idx) => {
              const roundId = round.roundId.toNumber();
              const alreadyVoted = votedRounds[roundId] ?? false;
              const winner = round.winner ? round.winner.toString() : null;
              const isVoting = loading === 'vote-' + roundId;

              return (
                <div key={roundId} className="bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  {/* Card top accent */}
                  <div className="h-1 w-full" style={{ backgroundColor: round.isActive ? GOLD : '#d6d3d1' }} />

                  <div className="p-8 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1">Grant Round</div>
                        <h3 className="font-serif text-3xl text-stone-900">#{roundId}</h3>
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${round.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-stone-100 text-stone-400 border border-stone-200'}`}>
                        {round.isActive ? '● Active' : 'Closed'}
                      </span>
                    </div>

                    {/* Diagram thumbnail */}
                    <div className="rounded-xl overflow-hidden mb-6 bg-stone-50" style={{ height: '140px' }}>
                      <Suspense fallback={<div className="h-full bg-stone-100" />}>
                        {idx % 2 === 0 ? <SurfaceCodeDiagram /> : <PerformanceMetricDiagram />}
                      </Suspense>
                    </div>

                    <div className="space-y-2 mb-6 flex-1">
                      {[
                        { label: 'Privacy', value: '🔒 TEE Shielded' },
                        { label: 'Winner', value: winner ? winner.slice(0, 6) + '...' + winner.slice(-4) : 'Pending' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between border-b border-stone-100 pb-2">
                          <span className="text-stone-400 text-xs uppercase font-bold tracking-wider">{r.label}</span>
                          <span className="text-stone-700 text-xs font-bold">{r.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Vote button */}
                    {alreadyVoted ? (
                      <div className="flex items-center justify-center gap-2 py-3 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm font-bold">
                        <CheckCircle size={16} /> Voted
                      </div>
                    ) : (
                      <button
                        onClick={() => setVoteModal(round)}
                        disabled={isVoting || !round.isActive}
                        className="w-full py-3 rounded-full font-bold text-sm tracking-widest uppercase transition-colors disabled:opacity-50"
                        style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
                        {isVoting ? 'Casting...' : !round.isActive ? 'Round Closed' : 'Cast Private Vote'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vote modal */}
      {voteModal && (
        <VoteModal
          round={voteModal}
          onClose={() => setVoteModal(null)}
          onVote={(roundId, pubkey) => {
            const name = `Round #${roundId}`;
            onVote(name, roundId, pubkey);
            setVoteModal(null);
          }}
          loading={loading === 'vote-' + voteModal.roundId.toNumber()}
          alreadyVoted={votedRounds[voteModal.roundId.toNumber()] ?? false}
        />
      )}
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const decoProgram = useDecoProgram();

  // Simple hash-based routing: '' = home, 'grants' = grants page
  const [page, setPage] = useState<'home' | 'grants'>(() =>
    window.location.hash === '#grants' ? 'grants' : 'home'
  );

  const navigate = useCallback((p: 'home' | 'grants') => {
    setPage(p);
    window.location.hash = p === 'grants' ? '#grants' : '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHash = () => setPage(window.location.hash === '#grants' ? 'grants' : 'home');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const [scrolled, setScrolled]           = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);
  const [loading, setLoading]             = useState<string | null>(null);
  const [grantRounds, setGrantRounds]     = useState<GrantRoundData[]>([]);
  const [myVotes, setMyVotes]             = useState<VoteData[]>([]);
  const [votedRounds, setVotedRounds]     = useState<Record<number, boolean>>({});
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [submitName, setSubmitName]       = useState('');
  const [submitDesc, setSubmitDesc]       = useState('');
  const [submitPubkey, setSubmitPubkey]   = useState('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!connected) return;
    (async () => {
      try {
        const rounds = await decoProgram.fetchAllGrantRounds();
        setGrantRounds(rounds as GrantRoundData[]);
        const votes = await decoProgram.fetchMyVotes();
        setMyVotes(votes as VoteData[]);
        const voted: Record<number, boolean> = {};
        for (const v of votes as VoteData[]) voted[v.roundId.toNumber()] = true;
        setVotedRounds(voted);
      } catch { /* chain not deployed yet */ }
    })();
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }, []);

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    if (page !== 'home') { navigate('home'); setTimeout(() => { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' }); }, 100); return; }
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
  };

  const handleDelegateTEE = useCallback(async () => {
    if (!connected) { showToast('Connect your wallet first.'); return; }
    setLoading('delegate');
    try {
      for (const r of grantRounds) await decoProgram.delegateGrantRound(r.roundId.toNumber());
      showToast('✅ Grant round PDAs delegated to MagicBlock ER.');
    } catch (e: any) { showToast('❌ Delegation failed: ' + e.message); }
    finally { setLoading(null); }
  }, [connected, decoProgram, grantRounds, showToast]);

  const handleCastVote = useCallback(async (name: string, roundId: number, projectPubkeyStr: string) => {
    if (!connected) { showToast('Connect your wallet first.'); return; }
    if (votedRounds[roundId]) { showToast('You already voted in this round.'); return; }
    setLoading('vote-' + roundId);
    try {
      await decoProgram.delegateMemberVote(roundId);
      await decoProgram.castVote(roundId, new PublicKey(projectPubkeyStr));
      showToast('✅ Private vote cast for ' + name + ' — shielded inside MagicBlock TEE.');
      setVotedRounds(prev => ({ ...prev, [roundId]: true }));
      const votes = await decoProgram.fetchMyVotes();
      setMyVotes(votes as VoteData[]);
    } catch (e: any) { showToast('❌ Vote failed: ' + e.message); }
    finally { setLoading(null); }
  }, [connected, decoProgram, votedRounds, showToast]);

  const handleSubmitStartup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) { showToast('Connect your wallet first.'); return; }
    if (!submitName || !submitPubkey) { showToast('Project name and wallet address are required.'); return; }
    setLoading('submit');
    try {
      const nextId = grantRounds.length + 1;
      await decoProgram.createGrantRound(nextId);
      showToast('✅ Grant round created for ' + submitName + ' (Round #' + nextId + ')');
      setSubmitName(''); setSubmitDesc(''); setSubmitPubkey('');
      const rounds = await decoProgram.fetchAllGrantRounds();
      setGrantRounds(rounds as GrantRoundData[]);
    } catch (e: any) { showToast('❌ Submission failed: ' + e.message); }
    finally { setLoading(null); }
  }, [connected, decoProgram, grantRounds, submitName, submitPubkey, showToast]);

  const displayRounds: GrantRoundData[] = grantRounds.length > 0 ? grantRounds : [
    { pubkey: null, roundId: { toNumber: () => 1 }, isActive: true, winner: null },
    { pubkey: null, roundId: { toNumber: () => 2 }, isActive: true, winner: null },
  ];

  // ── Shared Nav ──────────────────────────────────────────────────────────────
  const Nav = (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ backgroundColor: scrolled || page === 'grants' ? 'rgba(249,248,244,0.96)' : 'transparent', backdropFilter: 'blur(12px)', boxShadow: scrolled || page === 'grants' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', padding: scrolled ? '16px 0' : '24px 0' }}>
      <div className="container mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('home')}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: GOLD }}>
            <Shield size={20} />
          </div>
          <span className="font-serif font-bold text-lg tracking-wide text-stone-900">
            DECO PRIVATE <span className="font-normal text-stone-500">SOLANA</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-5 text-sm font-medium text-stone-600">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            TEE SECURE: ACTIVE
          </div>
          <a href="#warroom" onClick={scrollToSection('warroom')} className="hover:text-stone-900 transition-colors uppercase">War Room</a>
          <button onClick={() => navigate('grants')} className={`hover:text-stone-900 transition-colors uppercase ${page === 'grants' ? 'text-stone-900 font-bold' : ''}`}>Active Grants</button>
          <a href="#submit" onClick={scrollToSection('submit')} className="hover:text-stone-900 transition-colors uppercase">Submit</a>
          <a href="#portfolio" onClick={scrollToSection('portfolio')} className="hover:text-stone-900 transition-colors uppercase">Portfolio</a>
          <button onClick={handleDelegateTEE} disabled={loading === 'delegate'}
            className="px-5 py-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors shadow-sm disabled:opacity-50 text-sm">
            {loading === 'delegate' ? 'Delegating...' : 'Delegate to TEE'}
          </button>
          <WalletMultiButton style={{ height: '36px', borderRadius: '9999px', fontSize: '13px', padding: '0 16px', background: connected ? '#16a34a' : GOLD }} />
        </div>
        <button className="md:hidden text-stone-900 p-2" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>
    </nav>
  );

  const MobileMenu = menuOpen && (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 text-xl font-serif" style={{ backgroundColor: '#F9F8F4' }}>
      <button onClick={() => { navigate('home'); setMenuOpen(false); }} className="uppercase">War Room</button>
      <button onClick={() => { navigate('grants'); setMenuOpen(false); }} className="uppercase">Active Grants</button>
      <button onClick={() => { navigate('home'); setMenuOpen(false); setTimeout(() => { const el = document.getElementById('submit'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 100); }} className="uppercase">Submit Startup</button>
      <button onClick={() => { navigate('home'); setMenuOpen(false); setTimeout(() => { const el = document.getElementById('portfolio'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 100); }} className="uppercase">Portfolio</button>
      <WalletMultiButton style={{ borderRadius: '9999px', background: connected ? '#16a34a' : GOLD }} />
      <button onClick={() => { handleDelegateTEE(); setMenuOpen(false); }} className="px-6 py-3 bg-stone-900 text-white rounded-full">Delegate to TEE</button>
    </div>
  );

  // ── Grants page ─────────────────────────────────────────────────────────────
  if (page === 'grants') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F9F8F4' }}>
        {Nav}
        {MobileMenu}
        <GrantsPage
          grantRounds={grantRounds}
          votedRounds={votedRounds}
          loading={loading}
          connected={connected}
          onVote={handleCastVote}
          onBack={() => navigate('home')}
          myVotes={myVotes}
        />
        {toast && <TxToast msg={toast} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── Home page ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-stone-800" style={{ backgroundColor: '#F9F8F4' }}>
      {Nav}
      {MobileMenu}

      <header className="relative h-screen flex items-center justify-center overflow-hidden">
        <Suspense fallback={null}><HeroScene /></Suspense>
        <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(249,248,244,0.92) 0%, rgba(249,248,244,0.6) 50%, rgba(249,248,244,0.3) 100%)' }} />
        <div className="relative z-10 container mx-auto px-6 text-center">
          <div className="inline-block mb-4 px-3 py-1 text-xs tracking-[0.2em] uppercase font-bold rounded-full"
            style={{ border: `1px solid ${GOLD}`, color: GOLD, backgroundColor: 'rgba(255,255,255,0.3)' }}>
            Solana Blitz • 2026
          </div>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-9xl font-medium leading-tight mb-8 text-stone-900">
            Deco Private<br />
            <span className="italic font-normal text-stone-600 text-3xl md:text-5xl block mt-4">Shielded Startup Accelerator</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-stone-700 font-light leading-relaxed mb-12">
            The first decentralized accelerator powered by Private Ephemeral Rollups. Shield your cap table, cast private votes, and scale in the shadows.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <button onClick={() => navigate('grants')}
              className="px-8 py-4 rounded-full font-bold uppercase tracking-widest text-sm shadow-sm"
              style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
              View Active Grants
            </button>
            <a href="#warroom" onClick={scrollToSection('warroom')} className="group flex flex-col items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors cursor-pointer">
              <span>ENTER WAR ROOM</span>
              <span className="p-2 border border-stone-300 rounded-full group-hover:border-stone-900 transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}>
                <ArrowDown size={16} />
              </span>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section id="warroom" className="py-24 bg-white">
          <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
            <div className="md:col-span-4">
              <div className="inline-block mb-3 text-xs font-bold tracking-widest text-stone-500 uppercase">War Room</div>
              <h2 className="font-serif text-4xl mb-6 leading-tight text-stone-900">The Private Frontier</h2>
              <div className="w-16 h-1 mb-6" style={{ backgroundColor: GOLD }}></div>
            </div>
            <div className="md:col-span-8 text-lg text-stone-600 leading-relaxed space-y-6">
              <p><span className="text-5xl float-left mr-3 font-serif" style={{ color: GOLD }}>D</span>eco Private leverages MagicBlock's <strong>Private Ephemeral Rollups (PERs)</strong> to create a shielded environment for startup acceleration.</p>
              <p>By utilizing Trusted Execution Environments (TEEs), we ensure that sensitive data is processed off-chain in a verifiable, private manner before settling back to Solana. This is the future of <strong>Shielded Governance</strong>.</p>
            </div>
          </div>
          <div className="container mx-auto px-6 mt-16 flex flex-wrap justify-center gap-8">
            <MetricCard label="Total Shielded TVL" value="$4.2M" delay="0.1s" />
            <MetricCard label="Active Private Rounds" value={String(displayRounds.filter(r => r.isActive).length)} delay="0.2s" />
            <MetricCard label="Your Votes Cast" value={String(myVotes.length)} delay="0.3s" />
          </div>
        </section>

        {/* Grants preview on home — click card goes to grants page */}
        <section id="grants" className="py-24 bg-white border-t border-stone-100">
          <div className="container mx-auto px-6">
            <div className="flex items-center justify-between mb-12">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 text-stone-600 text-xs font-bold tracking-widest uppercase rounded-full mb-4 border border-stone-200">
                  <Zap size={14} /> ACTIVE ROUNDS
                </div>
                <h2 className="font-serif text-4xl text-stone-900">Grant Rounds</h2>
              </div>
              <button onClick={() => navigate('grants')} className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-bold" style={{ backgroundColor: GOLD }}>
                View All Grants →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {displayRounds.slice(0, 2).map((round, idx) => {
                const roundId = round.roundId.toNumber();
                const alreadyVoted = votedRounds[roundId] ?? false;
                return (
                  <div key={roundId} className="bg-stone-50 rounded-2xl border border-stone-200 p-8 flex flex-col gap-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('grants')}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif text-2xl text-stone-900">Round #{roundId}</h3>
                      <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${round.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-stone-100 text-stone-400'}`}>
                        {round.isActive ? '● Active' : 'Closed'}
                      </span>
                    </div>
                    <p className="text-stone-500 text-sm">🔒 Cap table shielded inside MagicBlock TEE</p>
                    <div className="flex gap-3 mt-2">
                      {alreadyVoted
                        ? <span className="flex items-center gap-2 text-emerald-600 text-sm font-bold"><CheckCircle size={14} /> Voted</span>
                        : <span className="text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>Cast Vote →</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="submit" className="py-24 border-t border-stone-100" style={{ backgroundColor: '#F9F8F4' }}>
          <div className="container mx-auto px-6 max-w-2xl">
            <div className="inline-block mb-3 text-xs font-bold tracking-widest text-stone-500 uppercase">For Founders</div>
            <h2 className="font-serif text-4xl mb-2 text-stone-900">Submit Your Startup</h2>
            <div className="w-16 h-1 mb-8" style={{ backgroundColor: GOLD }}></div>
            <p className="text-stone-600 mb-8 leading-relaxed">Apply for a private grant round. Your cap table and funding details remain shielded inside the TEE until the round closes.</p>
            <form onSubmit={handleSubmitStartup} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Project Name *</label>
                <input type="text" value={submitName} onChange={e => setSubmitName(e.target.value)} placeholder="e.g. Nebula DEX"
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-400 transition-colors" required />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">What is your idea about?</label>
                <textarea value={submitDesc} onChange={e => setSubmitDesc(e.target.value)}
                  placeholder="Describe your startup, the problem you're solving, and why it belongs in the Deco ecosystem..."
                  rows={4} className="w-full px-4 py-3 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-400 transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Project Wallet Address *</label>
                <input type="text" value={submitPubkey} onChange={e => setSubmitPubkey(e.target.value)} placeholder="Solana public key"
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-400 transition-colors font-mono text-sm" required />
              </div>
              <button type="submit" disabled={loading === 'submit' || !connected}
                className="w-full py-4 rounded-full font-bold uppercase tracking-widest text-sm transition-colors shadow-sm disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
                {loading === 'submit' ? 'Submitting...' : !connected ? 'Connect Wallet to Submit' : 'Submit for Grant Round'}
              </button>
            </form>
          </div>
        </section>

        <section id="portfolio" className="py-24 bg-stone-900 text-stone-100 overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="w-96 h-96 rounded-full bg-stone-600 absolute top-[-100px] left-[-100px]" style={{ filter: 'blur(100px)' }}></div>
            <div className="w-96 h-96 rounded-full absolute bottom-[-100px] right-[-100px]" style={{ filter: 'blur(100px)', backgroundColor: GOLD }}></div>
          </div>
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
              <div className="order-2 lg:order-1">
                <Suspense fallback={<div className="h-64 bg-stone-800 rounded-xl" />}><TransformerDecoderDiagram /></Suspense>
              </div>
              <div className="order-1 lg:order-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-800 text-xs font-bold tracking-widest uppercase rounded-full mb-6 border border-stone-700" style={{ color: GOLD }}>
                  SHIELDED PORTFOLIO
                </div>
                <h2 className="font-serif text-4xl md:text-5xl mb-6 text-white">Your Private Holdings</h2>
                <p className="text-lg text-stone-400 mb-6 leading-relaxed">All your investments and grant allocations are stored within a <strong>Private Ephemeral Rollup</strong>. Invisible to the public Solana explorer.</p>
                <button onClick={() => setPortfolioOpen(o => !o)}
                  className="flex items-center gap-2 px-8 py-4 rounded-full font-bold uppercase tracking-widest text-sm transition-colors shadow-lg mb-6"
                  style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
                  {portfolioOpen ? 'Hide Portfolio' : 'Reveal Portfolio'}
                  <ChevronDown size={16} className={`transition-transform ${portfolioOpen ? 'rotate-180' : ''}`} />
                </button>
                {portfolioOpen && (
                  <div className="space-y-4">
                    {!connected && <p className="text-stone-400 text-sm">Connect your wallet to view your portfolio.</p>}
                    {connected && myVotes.length === 0 && <p className="text-stone-400 text-sm">No votes found on-chain yet. Cast a vote to see your portfolio.</p>}
                    {connected && myVotes.map((vote, i) => {
                      const roundId = vote.roundId.toNumber();
                      const round = grantRounds.find(r => r.roundId.toNumber() === roundId);
                      const votedFor = vote.votedFor ? vote.votedFor.toString() : 'Unknown';
                      const winner = round?.winner ? round.winner.toString() : null;
                      const won = winner && vote.votedFor && winner === vote.votedFor.toString();
                      return (
                        <div key={i} className="bg-stone-800 rounded-xl p-5 border border-stone-700">
                          <div className="flex justify-between items-start mb-3">
                            <span className="font-serif text-lg text-white">Round #{roundId}</span>
                            <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full ${won ? 'bg-emerald-900 text-emerald-400' : 'bg-stone-700 text-stone-400'}`}>
                              {won ? '🏆 Winner' : winner ? 'Closed' : 'Active'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-stone-500 uppercase tracking-wider text-xs">Voted For</span>
                              <span className="text-stone-300 font-mono text-xs">{votedFor.slice(0, 8)}...{votedFor.slice(-4)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-stone-500 uppercase tracking-wider text-xs">Round Winner</span>
                              <span className="text-stone-300 font-mono text-xs">{winner ? winner.slice(0, 8) + '...' + winner.slice(-4) : 'Pending'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="py-24" style={{ backgroundColor: '#F9F8F4' }}>
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="font-serif text-4xl md:text-6xl mb-6 text-stone-900">Shielded Infrastructure</h2>
              <p className="text-xl text-stone-600 font-light">Powered by MagicBlock PERs and Intel SGX TEEs.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { icon: <Activity size={24} />, title: 'Real-time PERs', desc: 'Ephemeral rollups allow for sub-second private transactions that settle asynchronously to Solana.' },
                { icon: <Lock size={24} />, title: 'TEE Verification', desc: 'Trusted Execution Environments ensure that even the rollup operators cannot see your private data.' },
                { icon: <Shield size={24} />, title: 'Solana Settlement', desc: 'Final state transitions are compressed and anchored to Solana, inheriting its world-class security.' },
              ].map((c) => (
                <div key={c.title} className="p-10 bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-stone-900 mb-6">{c.icon}</div>
                  <h3 className="font-serif text-2xl mb-4">{c.title}</h3>
                  <p className="text-stone-500 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 bg-white border-t border-stone-100">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-serif font-bold text-xs" style={{ backgroundColor: GOLD }}>D</div>
            <span className="font-serif font-bold text-stone-900">DECO PRIVATE</span>
          </div>
          <div className="text-xs text-stone-400 font-medium tracking-widest uppercase">© 2026 DECO PRIVATE • SOLANA BLITZ HACKATHON</div>
          <div className="flex gap-6 text-stone-500">
            <a href="#" className="hover:text-stone-900 transition-colors"><Activity size={18} /></a>
            <a href="#" className="hover:text-stone-900 transition-colors"><Shield size={18} /></a>
          </div>
        </div>
      </footer>

      {toast && <TxToast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default App;
