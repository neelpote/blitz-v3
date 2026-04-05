import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { ViewModeToggle, ViewMode } from './components/ViewModeToggle';
import { VaultCard } from './components/VaultCard';
import { CreateVaultModal } from './components/CreateVaultModal';
import { DepositModal } from './components/DepositModal';
import { ManagerPanel } from './components/ManagerPanel';
import { useAlphaVault, StrategyVault } from './hooks/useAlphaVault';

type Tab = 'vaults' | 'manage' | 'about';
interface Log { id: number; text: string; ok: boolean; }
let _lid = 0;

export default function App() {
  const { publicKey } = useWallet();
  const {
    vaults, myPositions, isLoading, txStatus, txError, tee, clearError,
    authTee, createVault, deposit, delegateVault, recordTrade, settleVault, withdrawPosition,
  } = useAlphaVault();

  const [viewMode,       setViewMode]       = useState<ViewMode>('public');
  const [tab,            setTab]            = useState<Tab>('vaults');
  const [log,            setLog]            = useState<Log[]>([]);
  const [showCreate,     setShowCreate]     = useState(false);
  const [depositTarget,  setDepositTarget]  = useState<StrategyVault | null>(null);
  const idRef = useRef(_lid);

  const push = useCallback((text: string, ok = true) => {
    setLog(p => [...p.slice(-8), { id: idRef.current++, text, ok }]);
  }, []);

  useEffect(() => {
    if (!txError) return;
    push(txError, false);
    clearError();
  }, [txError, push, clearError]);

  const handleTeeAuth = useCallback(async () => {
    await authTee();
    push('TEE authenticated · tee.magicblock.app');
    setViewMode('tee');
  }, [authTee, push]);

  const handleCreate = useCallback(async (feeBps: number, name: string) => {
    push(`Creating vault "${name}"…`);
    const sig = await createVault(feeBps, name);
    if (sig) { push(`Vault created · ${sig.slice(0, 14)}…`); setShowCreate(false); setTab('manage'); }
  }, [createVault, push]);

  const handleDeposit = useCallback(async (amountSol: number) => {
    if (!depositTarget) return;
    push(`Depositing ${amountSol} SOL into "${depositTarget.name}"…`);
    const sig = await deposit(depositTarget.manager, amountSol);
    if (sig) { push(`Deposited · ${sig.slice(0, 14)}…`); setDepositTarget(null); }
  }, [deposit, depositTarget, push]);

  const handleDelegate = useCallback(async () => {
    push('Delegating vault to ER/TEE…');
    const sig = await delegateVault();
    if (sig) push(`Delegated · ${sig.slice(0, 14)}…`);
  }, [delegateVault, push]);

  const handleRecord = useCallback(async (deltaBps: number) => {
    push(`Recording trade delta=${deltaBps}bps in ER/TEE…`);
    const sig = await recordTrade(deltaBps);
    if (sig) push(`[ER] Trade recorded · ${sig.slice(0, 14)}…`);
  }, [recordTrade, push]);

  const handleSettle = useCallback(async () => {
    push('Settling vault…');
    const sig = await settleVault();
    if (sig) push(`Settled · ${sig.slice(0, 14)}…`);
  }, [settleVault, push]);

  const handleWithdraw = useCallback(async (vault: StrategyVault) => {
    push(`Withdrawing from "${vault.name}"…`);
    const sig = await withdrawPosition(vault);
    if (sig) push(`Withdrawn · ${sig.slice(0, 14)}…`);
  }, [withdrawPosition, push]);

  const myVault = publicKey ? vaults.find(v => v.manager.equals(publicKey)) ?? null : null;
  const openCount = vaults.filter(v => v.status === 'Active').length;
  const totalTvl  = vaults.reduce((s, v) => s + Number(v.totalDeposits), 0);

  const navLinks: { label: string; tab: Tab }[] = [
    { label: 'Vaults', tab: 'vaults' },
    { label: 'Manage', tab: 'manage' },
    { label: 'About',  tab: 'about'  },
  ];

  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-black/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('vaults')}>
            <div className="w-8 h-8 bg-black flex items-center justify-center">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <span className="font-bold tracking-tighter text-xl">AlphaVault</span>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400 leading-none">Shielded Strategy Vaults</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <button key={l.tab} onClick={() => setTab(l.tab)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all ${tab === l.tab ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <ViewModeToggle mode={viewMode} onChange={setViewMode} onTeeAuth={handleTeeAuth} teeVerified={tee.verified} authed={tee.authed} />
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      {/* TX strip */}
      {txStatus && (
        <div className="fixed top-16 w-full z-40 bg-black text-white px-6 py-2 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-widest">{txStatus}</span>
        </div>
      )}

      <main className="pt-16">

        {/* VAULTS TAB */}
        {tab === 'vaults' && (
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-2">Live Data</div>
                <h2 className="text-4xl font-bold tracking-tighter">Strategy Vaults</h2>
                <p className="text-zinc-500 text-sm mt-2 max-w-xl">
                  Performance data is encrypted by MagicBlock TEE. Authenticate to decrypt and invest.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-px bg-black/10 shrink-0">
                {[
                  { value: openCount.toString(), label: 'Active' },
                  { value: vaults.length.toString(), label: 'Total' },
                  { value: (totalTvl/1e9).toFixed(1)+' SOL', label: 'TVL' },
                ].map(s => (
                  <div key={s.label} className="bg-white px-6 py-4 text-center">
                    <div className="text-2xl font-bold tracking-tighter">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* TEE banner */}
            {tee.authed ? (
              <div className="flex items-center gap-3 border border-black/10 bg-zinc-50 px-5 py-3 mb-6">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  TEE Authenticated · tee.magicblock.app
                  {tee.verified && <span className="text-green-600 ml-3">· Hardware Attested</span>}
                </span>
                <span className="ml-auto text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Performance decrypted · Invest unlocked</span>
              </div>
            ) : (
              <div className="flex items-center justify-between border border-black/10 bg-zinc-50 px-5 py-3 mb-6">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    TEE Auth required — performance data is encrypted
                  </span>
                </div>
                <button onClick={async () => { try { await handleTeeAuth(); } catch {} }} className="btn btn-primary text-[10px] px-4 py-2">
                  Authenticate →
                </button>
              </div>
            )}

            {!publicKey ? (
              <div className="card text-center py-16">
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Wallet Required</div>
                <p className="text-sm text-zinc-500 mb-6">Connect your wallet to view vaults.</p>
                <WalletMultiButton />
              </div>
            ) : vaults.length === 0 ? (
              <div className="card text-center py-16">
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2">No Vaults Yet</div>
                <p className="text-sm text-zinc-500 mb-6">Be the first to create a strategy vault.</p>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary px-8 py-3">Create Vault →</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {vaults.map(v => (
                  <VaultCard
                    key={v.publicKey.toBase58()}
                    vault={v}
                    myPosition={myPositions.find(p => p.vault.equals(v.publicKey))}
                    teeAuthed={tee.authed}
                    isMe={!!publicKey && v.manager.equals(publicKey)}
                    isLoading={isLoading}
                    onDeposit={setDepositTarget}
                    onDelegate={() => handleDelegate()}
                    onSettle={() => handleSettle()}
                    onWithdraw={handleWithdraw}
                  />
                ))}
              </div>
            )}

            <div className="mt-10 border border-black p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-1">Launch your own strategy</div>
                <p className="text-sm text-zinc-500 max-w-md">Create a vault, delegate to the TEE, record trades privately, and earn performance fees.</p>
              </div>
              {!myVault ? (
                <button onClick={() => { setShowCreate(true); }} className="btn btn-primary px-8 py-3 shrink-0">
                  Create Vault →
                </button>
              ) : (
                <button onClick={() => setTab('manage')} className="btn btn-outline px-8 py-3 shrink-0">
                  Manage Your Vault →
                </button>
              )}
            </div>
          </div>
        )}

        {/* MANAGE TAB */}
        {tab === 'manage' && (
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="mb-8">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-2">Manager</div>
              <h2 className="text-4xl font-bold tracking-tighter">Manage Your Vault</h2>
            </div>
            {!publicKey ? (
              <div className="card text-center py-16">
                <p className="text-sm text-zinc-500 mb-6">Connect wallet to manage your vault.</p>
                <WalletMultiButton />
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-8">
                <ManagerPanel
                  vault={myVault}
                  isLoading={isLoading}
                  txStatus={txStatus}
                  onDelegate={handleDelegate}
                  onRecord={handleRecord}
                  onSettle={handleSettle}
                />
                <div className="space-y-4">
              {!myVault && (
                <div className="card">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Get Started</div>
                  <p className="text-sm text-zinc-600 mb-4">You don't have a vault yet. Create one to start managing a strategy.</p>
                  <button onClick={() => setShowCreate(true)} className="btn btn-primary w-full py-3">Create Vault →</button>
                </div>
              )}
                  {log.length > 0 && (
                    <div className="card">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Activity</div>
                      <div className="space-y-2">
                        {[...log].reverse().map(l => (
                          <div key={l.id} className="flex items-start gap-2">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${l.ok ? 'bg-black' : 'bg-red-500'}`} />
                            <p className={`text-xs leading-relaxed ${l.ok ? 'text-zinc-600' : 'text-red-600'}`}>{l.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABOUT TAB */}
        {tab === 'about' && (
          <div className="max-w-7xl mx-auto px-6 py-20 space-y-24">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 border border-black/10 text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
                  </span>
                  Live on Solana Devnet · MagicBlock TEE
                </div>
                <h1 className="text-6xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-8">
                  SHIELDED<br /><span className="italic font-serif font-light">ALPHA VAULTS</span>
                </h1>
                <p className="text-xl text-zinc-600 max-w-lg leading-relaxed mb-4">
                  AlphaVault lets strategy managers run trading bots inside MagicBlock's TEE. Investors see verified performance — not the strategy.
                </p>
                <p className="text-base text-zinc-500 max-w-lg leading-relaxed mb-10">
                  Like the master chef who proves their burger is the best without giving away the recipe — AlphaVault proves returns without exposing the algorithm.
                </p>
                <div className="flex gap-4">
                  <button onClick={() => setTab('vaults')} className="btn btn-primary px-8 py-4 text-sm flex items-center gap-2">
                    Browse Vaults
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                  <button onClick={() => setTab('manage')} className="btn btn-outline px-8 py-4 text-sm">Manage Vault</button>
                </div>
                <div className="mt-16 grid grid-cols-4 gap-px bg-black/10">
                  {[{ value: '0%', label: 'Platform Fee' }, { value: '~50ms', label: 'ER Latency' }, { value: 'TEE', label: 'Privacy' }, { value: 'L1', label: 'Settlement' }].map(s => (
                    <div key={s.label} className="bg-white pr-4 py-4">
                      <div className="text-xl font-bold tracking-tighter">{s.value}</div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
                className="relative lg:h-[520px] bg-zinc-50 border border-black/5 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, black 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                <div className="relative z-10 w-full max-w-sm p-8 bg-white border border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Strategy Vault</div>
                      <div className="text-xl font-bold tracking-tight">Momentum Alpha v1</div>
                    </div>
                    <span className="badge badge-open border border-green-200">Active</span>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-black/5 mb-6">
                    {[{ label: 'Performance', value: '+18.4%' }, { label: 'TVL', value: '42.5 SOL' }, { label: 'Perf Fee', value: '10%' }, { label: 'Trades', value: '247' }].map(f => (
                      <div key={f.label} className="bg-white p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{f.label}</div>
                        <div className="text-xl font-bold tracking-tighter">{f.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
                      <span className="text-zinc-400">Strategy</span><span>████████ (TEE)</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
                      <span className="text-zinc-400">Positions</span><span>████████ (TEE)</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
                      <span className="text-zinc-400">Privacy</span>
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />TEE Shielded</span>
                    </div>
                  </div>
                </div>
                <div className="absolute top-8 right-8 w-20 h-20 border border-black/10 rounded-full animate-pulse" />
              </motion.div>
            </motion.div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-3">How It Works</div>
              <h2 className="text-4xl font-bold tracking-tighter mb-10">Four steps, fully on-chain</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-black/10">
                {[
                  { n: '01', title: 'Create Vault', body: 'Manager deploys a StrategyVault PDA on Solana L1. Sets a performance fee (0–50%). Investors can immediately deposit SOL.' },
                  { n: '02', title: 'Delegate to TEE', body: 'The vault PDA is delegated to MagicBlock\'s Private Ephemeral Rollup. All trade data is now shielded inside the TEE — invisible to observers.' },
                  { n: '03', title: 'Trade in TEE', body: 'Manager records trade results inside the ER. Investors see only the aggregate performance certificate — not individual trades, positions, or strategy logic.' },
                  { n: '04', title: 'Settle & Withdraw', body: 'Manager settles the vault back to L1. Performance fee is deducted. Investors withdraw their proportional share including any profits.' },
                ].map(s => (
                  <div key={s.n} className="bg-white p-10 flex gap-6">
                    <div className="text-[11px] font-bold tracking-widest text-zinc-200 shrink-0 w-8 pt-0.5">{s.n}</div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest mb-3">{s.title}</div>
                      <p className="text-sm text-zinc-600 leading-relaxed">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black text-white p-16">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Architecture</div>
              <h2 className="text-4xl font-bold tracking-tighter mb-10">Built on MagicBlock</h2>
              <div className="grid md:grid-cols-3 gap-px bg-white/10">
                {[
                  { title: 'Private ER (TEE)', body: 'Trade execution runs inside Intel TDX hardware. The TEE generates cryptographic attestations — investors verify performance without seeing the strategy.' },
                  { title: 'Ephemeral Rollups', body: 'Gasless ~50ms trade recording inside the ER. No MEV, no front-running. The strategy is invisible until settlement.' },
                  { title: 'L1 Settlement', body: 'Settlement commits ER state back to Solana. Performance fees and investor payouts are distributed atomically — no trust, no intermediary.' },
                ].map(f => (
                  <div key={f.title} className="bg-black p-10 space-y-4">
                    <div className="text-[11px] font-bold uppercase tracking-widest">{f.title}</div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-black/5 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black flex items-center justify-center">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="font-bold tracking-tighter">AlphaVault</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
            Built on MagicBlock Ephemeral Rollups · Solana Frontier Hackathon 2025
          </div>
          <div className="flex gap-8 text-[10px] font-bold uppercase tracking-widest">
            <a href="https://docs.magicblock.gg" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">MagicBlock</a>
            <a href="https://solana.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Solana</a>
          </div>
        </div>
      </footer>

      {showCreate && <CreateVaultModal isLoading={isLoading} onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {depositTarget && <DepositModal vault={depositTarget} isLoading={isLoading} onSubmit={handleDeposit} onClose={() => setDepositTarget(null)} />}
    </div>
  );
}
