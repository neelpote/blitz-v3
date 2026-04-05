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
  const [tab,            setTab]            = useState<Tab>('about');
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
    { label: 'Home',   tab: 'about'  },
    { label: 'Vaults', tab: 'vaults' },
    { label: 'Manage', tab: 'manage' },
  ];

  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-black/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('about')}>
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

        {/* ABOUT / LANDING PAGE */}
        {tab === 'about' && (
          <div>
            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="min-h-screen flex items-center border-b border-black/5">
              <div className="max-w-7xl mx-auto px-6 py-24 w-full">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                  <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
                    {/* Live badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-black/10 text-[10px] font-bold uppercase tracking-[0.2em] mb-10">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
                      </span>
                      Live on Solana Devnet · MagicBlock TEE
                    </div>

                    <h1 className="text-7xl md:text-8xl font-bold tracking-tighter leading-[0.88] mb-8">
                      TRADE IN<br />
                      <span className="italic font-serif font-light">THE DARK.</span>
                    </h1>

                    <p className="text-xl text-zinc-600 max-w-lg leading-relaxed mb-3">
                      AlphaVault is the first shielded strategy vault marketplace on Solana.
                    </p>
                    <p className="text-base text-zinc-500 max-w-lg leading-relaxed mb-12">
                      Managers run trading algorithms inside MagicBlock's Trusted Execution Environment.
                      Investors see verified returns — never the strategy. No MEV. No front-running. No leaks.
                    </p>

                    <div className="flex flex-wrap gap-4 mb-16">
                      <button onClick={() => setTab('vaults')} className="btn btn-primary px-10 py-4 text-sm flex items-center gap-2">
                        Browse Vaults
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </button>
                      <button onClick={() => { setShowCreate(true); setTab('manage'); }} className="btn btn-outline px-10 py-4 text-sm">
                        Launch a Vault
                      </button>
                    </div>

                    {/* Live on-chain stats */}
                    <div className="grid grid-cols-3 gap-px bg-black/10">
                      {[
                        { value: vaults.length.toString(), label: 'Vaults Live' },
                        { value: (totalTvl / 1e9).toFixed(1) + ' SOL', label: 'Total TVL' },
                        { value: '0%', label: 'Platform Fee' },
                      ].map(s => (
                        <div key={s.label} className="bg-white px-5 py-4">
                          <div className="text-2xl font-bold tracking-tighter">{s.value}</div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mt-1">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Mock vault card */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.9, delay: 0.15 }}
                    className="relative lg:h-[580px] bg-zinc-50 border border-black/5 flex items-center justify-center overflow-hidden"
                  >
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, black 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

                    <div className="relative z-10 w-full max-w-sm p-8 bg-white border border-black shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Strategy Vault</div>
                          <div className="text-xl font-bold tracking-tight">Momentum Alpha v1</div>
                        </div>
                        <span className="badge badge-open border border-green-200">Active</span>
                      </div>

                      <div className="grid grid-cols-2 gap-px bg-black/5 mb-6">
                        {[
                          { label: 'Performance', value: '+18.4%' },
                          { label: 'TVL', value: '42.5 SOL' },
                          { label: 'Perf Fee', value: '10%' },
                          { label: 'Trades', value: '247' },
                        ].map(f => (
                          <div key={f.label} className="bg-white p-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{f.label}</div>
                            <div className="text-xl font-bold tracking-tighter">{f.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2 mb-6">
                        {[
                          { label: 'Strategy', value: '████████ (TEE)' },
                          { label: 'Positions', value: '████████ (TEE)' },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
                            <span className="text-zinc-400">{r.label}</span>
                            <span className="text-zinc-300">{r.value}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
                          <span className="text-zinc-400">Privacy</span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                            TEE Shielded
                          </span>
                        </div>
                      </div>

                      {/* Fake progress bar */}
                      <div className="h-1 w-full bg-zinc-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '72%' }}
                          transition={{ duration: 1.4, delay: 0.6 }}
                          className="h-1 bg-black"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1.5">
                        <span>72% funded</span>
                        <span>30.6 / 42.5 SOL</span>
                      </div>
                    </div>

                    <div className="absolute top-8 right-8 w-24 h-24 border border-black/10 rounded-full animate-pulse" />
                    <div className="absolute bottom-8 left-8 w-32 h-32 border border-black/5 rotate-45" />
                  </motion.div>
                </div>
              </div>
            </section>

            {/* ── Problem / Solution ───────────────────────────────────────── */}
            <section className="py-24 border-b border-black/5">
              <div className="max-w-7xl mx-auto px-6">
                <div className="grid lg:grid-cols-2 gap-16">
                  <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-4">The Problem</div>
                    <h2 className="text-4xl font-bold tracking-tighter mb-6">Public blockchains kill your edge</h2>
                    <div className="space-y-4 text-zinc-600 leading-relaxed text-sm">
                      <p>If you deploy a profitable trading algorithm on Solana, everyone can see it. Competitors watch your wallet and copy every trade for free. MEV bots see your transactions in the mempool and front-run them.</p>
                      <p>Your edge evaporates the moment it's on-chain. This is why serious institutional traders keep their algorithms off-chain. Standard DeFi is too transparent for high-level finance.</p>
                      <p>The result: the best strategies never touch DeFi. Investors have no way to access institutional-grade returns on-chain.</p>
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-4">The Solution</div>
                    <h2 className="text-4xl font-bold tracking-tighter mb-6">Prove returns without revealing the recipe</h2>
                    <div className="space-y-4 text-zinc-600 leading-relaxed text-sm">
                      <p>AlphaVault runs trading logic inside MagicBlock's Trusted Execution Environment — secure hardware that encrypts all state. No one can see your positions, your strategy, or your trades.</p>
                      <p>The TEE generates a cryptographic performance certificate. Investors verify the proof, not the strategy. Like a chef who proves their food is the best without giving you the recipe.</p>
                      <p>Gasless execution at ~50ms. No MEV. No front-running. Settlement commits back to Solana L1 atomically — no trust, no intermediary.</p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </section>

            {/* ── How it works ─────────────────────────────────────────────── */}
            <section className="py-24 border-b border-black/5">
              <div className="max-w-7xl mx-auto px-6">
                <div className="mb-12">
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-3">Process</div>
                  <h2 className="text-4xl font-bold tracking-tighter">Four steps, fully on-chain</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-black/10">
                  {[
                    { n: '01', title: 'Create Vault', body: 'Manager deploys a StrategyVault PDA on Solana L1. Sets a name and performance fee (0–50%). Investors can immediately deposit SOL.' },
                    { n: '02', title: 'Delegate to TEE', body: 'The vault PDA is delegated to MagicBlock\'s Private Ephemeral Rollup. All trade data is now shielded inside Intel TDX hardware — invisible to everyone.' },
                    { n: '03', title: 'Trade in the Dark', body: 'Manager records trade results inside the ER. Investors see only the aggregate performance certificate — not individual trades, positions, or strategy logic.' },
                    { n: '04', title: 'Settle & Withdraw', body: 'Manager settles back to L1, deposits net yield to escrow. Performance fee deducted. Investors withdraw their proportional share including profits.' },
                  ].map(s => (
                    <div key={s.n} className="bg-white p-10 flex gap-6 hover:bg-zinc-50 transition-colors">
                      <div className="text-[11px] font-bold tracking-widest text-zinc-200 shrink-0 w-8 pt-0.5">{s.n}</div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-widest mb-3">{s.title}</div>
                        <p className="text-sm text-zinc-600 leading-relaxed">{s.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── For managers / investors ─────────────────────────────────── */}
            <section className="py-24 border-b border-black/5">
              <div className="max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-2 gap-px bg-black/10">
                  {/* Managers */}
                  <div className="bg-white p-12">
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400 mb-4">For Strategy Managers</div>
                    <h3 className="text-3xl font-bold tracking-tighter mb-6">Monetise your edge without exposing it</h3>
                    <ul className="space-y-3 text-sm text-zinc-600 mb-10">
                      {[
                        'Deploy a vault with your name and performance fee',
                        'Delegate to MagicBlock TEE — trades are fully shielded',
                        'Record trade results gaslessly at ~50ms',
                        'Earn performance fees only on profits — aligned incentives',
                        'Settle back to L1 when ready — atomic, trustless',
                      ].map(item => (
                        <li key={item} className="flex items-start gap-3">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => { setTab('manage'); }} className="btn btn-primary px-8 py-3">
                      Launch Your Vault →
                    </button>
                  </div>

                  {/* Investors */}
                  <div className="bg-zinc-950 text-white p-12">
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-4">For Investors</div>
                    <h3 className="text-3xl font-bold tracking-tighter mb-6">Access institutional returns on-chain</h3>
                    <ul className="space-y-3 text-sm text-zinc-400 mb-10">
                      {[
                        'Browse vaults — performance encrypted until you authenticate',
                        'Sign a TEE challenge with your wallet to decrypt values',
                        'Deposit SOL and receive proportional shares',
                        'Track performance in real-time via the TEE',
                        'Withdraw your share after settlement — no lock-ups',
                      ].map(item => (
                        <li key={item} className="flex items-start gap-3">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => setTab('vaults')} className="btn btn-primary px-8 py-3">
                      Browse Vaults →
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Architecture ─────────────────────────────────────────────── */}
            <section className="py-24 bg-black text-white">
              <div className="max-w-7xl mx-auto px-6">
                <div className="mb-12">
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-3">Architecture</div>
                  <h2 className="text-4xl font-bold tracking-tighter">Built on MagicBlock</h2>
                </div>
                <div className="grid md:grid-cols-3 gap-px bg-white/10 mb-16">
                  {[
                    { title: 'Private ER (TEE)', body: 'Trade execution runs inside Intel TDX hardware at tee.magicblock.app. The TEE generates cryptographic attestations — investors verify performance without seeing the strategy.' },
                    { title: 'Ephemeral Rollups', body: 'Gasless ~50ms trade recording inside the ER via devnet-router.magicblock.app. No MEV, no front-running. The strategy is invisible until settlement.' },
                    { title: 'L1 Settlement', body: 'Settlement commits ER state back to Solana via commit_and_undelegate. Performance fees and investor payouts distributed atomically — no trust, no intermediary.' },
                  ].map(f => (
                    <div key={f.title} className="bg-black p-10 space-y-4">
                      <div className="text-[11px] font-bold uppercase tracking-widest">{f.title}</div>
                      <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="border border-white/10 p-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest mb-2">Ready to start?</div>
                    <p className="text-sm text-zinc-400 max-w-lg">
                      Connect your wallet, authenticate with the TEE, and either browse existing vaults or launch your own strategy.
                    </p>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <button onClick={() => setTab('vaults')}
                      className="px-8 py-3 bg-white text-black text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-100 transition-colors">
                      Browse Vaults →
                    </button>
                    <button onClick={() => setTab('manage')}
                      className="px-8 py-3 border border-white/20 text-white text-[11px] font-bold uppercase tracking-widest hover:border-white/40 transition-colors">
                      Launch Vault
                    </button>
                  </div>
                </div>
              </div>
            </section>
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
