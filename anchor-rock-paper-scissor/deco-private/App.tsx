/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { ArrowDown, Menu, X, Shield, Lock, Activity, Zap, Wallet } from 'lucide-react';

// Lazy-load heavy 3D/animation components so they can't crash the page
const HeroScene            = lazy(() => import('./components/QuantumScene').then(m => ({ default: m.HeroScene })));
const SurfaceCodeDiagram   = lazy(() => import('./components/Diagrams').then(m => ({ default: m.SurfaceCodeDiagram })));
const TransformerDecoderDiagram = lazy(() => import('./components/Diagrams').then(m => ({ default: m.TransformerDecoderDiagram })));
const PerformanceMetricDiagram  = lazy(() => import('./components/Diagrams').then(m => ({ default: m.PerformanceMetricDiagram })));

// Lazy-load the Solana hook — only resolves when wallet providers are mounted
const useDecoProgramModule = () => {
  const [mod, setMod] = useState<typeof import('./hooks/useDecoProgram') | null>(null);
  useEffect(() => {
    import('./hooks/useDecoProgram').then(setMod).catch(() => {});
  }, []);
  return mod;
};

const GOLD = '#C5A059';

// Known project pubkeys for the two demo grant rounds
const NEBULA_PUBKEY = '11111111111111111111111111111111'; // replace post-deploy
const AURA_PUBKEY   = '11111111111111111111111111111112'; // replace post-deploy

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

interface AppProps { solanaReady?: boolean; }

const App: React.FC<AppProps> = ({ solanaReady = false }) => {
  const [scrolled, setScrolled]       = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [toast, setToast]             = useState<string | null>(null);
  const [loading, setLoading]         = useState<string | null>(null);

  // Load the Solana hook module lazily
  const decoMod = useDecoProgramModule();
  const decoProgram = decoMod && solanaReady ? decoMod.useDecoProgram() : null;

  const connected    = decoProgram?.connected ?? false;
  const publicKey    = decoProgram?.publicKey ?? null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }, []);

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
  };

  // Phantom direct connect fallback when wallet adapter isn't available
  const connectPhantomDirect = useCallback(async () => {
    try {
      const { solana } = window as any;
      if (!solana?.isPhantom) { showToast('Phantom wallet not found. Please install it.'); return; }
      const resp = await solana.connect();
      showToast('Wallet connected: ' + resp.publicKey.toString().slice(0, 4) + '...' + resp.publicKey.toString().slice(-4));
    } catch (e: any) { showToast('Connection failed: ' + e.message); }
  }, [showToast]);

  // ── Contract actions ──────────────────────────────────────────────────────

  const handleDelegateTEE = useCallback(async () => {
    if (!connected) { showToast('Connect your wallet first.'); return; }
    setLoading('delegate');
    try {
      await decoProgram!.delegatePda(1);
      await decoProgram!.delegatePda(2);
      showToast('✅ PDAs delegated to MagicBlock TEE validator.');
    } catch (e: any) {
      showToast('❌ Delegation failed: ' + e.message);
    } finally { setLoading(null); }
  }, [connected, decoProgram, showToast]);

  const handleCastVote = useCallback(async (name: string, roundId: number, projectPubkeyStr: string) => {
    if (!connected) { showToast('Connect your wallet first.'); return; }
    setLoading('vote-' + roundId);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      await decoProgram!.castVote(roundId, new PublicKey(projectPubkeyStr));
      showToast('✅ Private vote cast for ' + name + ' inside TEE. Ballot is shielded.');
    } catch (e: any) {
      showToast('❌ Vote failed: ' + e.message);
    } finally { setLoading(null); }
  }, [connected, decoProgram, showToast]);

  const handleRevealPortfolio = useCallback(async () => {
    if (!connected) { showToast('Connect your wallet first.'); return; }
    try {
      const round1 = await decoProgram!.fetchGrantRound(1);
      const round2 = await decoProgram!.fetchGrantRound(2);
      const w1 = round1?.winner ? round1.winner.toString().slice(0, 8) + '...' : 'Pending';
      const w2 = round2?.winner ? round2.winner.toString().slice(0, 8) + '...' : 'Pending';
      showToast(`Round 1 winner: ${w1} | Round 2 winner: ${w2}`);
    } catch (e: any) {
      showToast('❌ Fetch failed: ' + e.message);
    }
  }, [connected, decoProgram, showToast]);

  // Wallet button label
  const walletLabel = publicKey
    ? publicKey.toString().slice(0, 4) + '...' + publicKey.toString().slice(-4)
    : 'Connect Wallet';

  return (
    <div className="min-h-screen text-stone-800" style={{ backgroundColor: '#F9F8F4' }}>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{ backgroundColor: scrolled ? 'rgba(249,248,244,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', padding: scrolled ? '16px 0' : '24px 0' }}>
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: GOLD }}>
              <Shield size={20} />
            </div>
            <span className="font-serif font-bold text-lg tracking-wide">
              DECO PRIVATE <span className="font-normal text-stone-500">SOLANA</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-5 text-sm font-medium text-stone-600">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              TEE SECURE: ACTIVE
            </div>
            <a href="#warroom"   onClick={scrollToSection('warroom')}   className="hover:text-stone-900 transition-colors uppercase">War Room</a>
            <a href="#grants"    onClick={scrollToSection('grants')}    className="hover:text-stone-900 transition-colors uppercase">Active Grants</a>
            <a href="#portfolio" onClick={scrollToSection('portfolio')} className="hover:text-stone-900 transition-colors uppercase">Portfolio</a>
            <a href="#settings"  onClick={scrollToSection('settings')}  className="hover:text-stone-900 transition-colors uppercase">Settings</a>
            <button onClick={handleDelegateTEE} disabled={loading === 'delegate'}
              className="px-5 py-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors shadow-sm disabled:opacity-50 text-sm">
              {loading === 'delegate' ? 'Delegating...' : 'Delegate to TEE'}
            </button>
            {/* Wallet button — uses adapter modal if available, else Phantom direct */}
            {solanaReady ? (
              <WalletButtonWrapper label={walletLabel} connected={connected} />
            ) : (
              <button onClick={connectPhantomDirect}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-bold"
                style={{ backgroundColor: GOLD }}>
                <Wallet size={14} /> Connect Wallet
              </button>
            )}
          </div>

          <button className="md:hidden text-stone-900 p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 text-xl font-serif" style={{ backgroundColor: '#F9F8F4' }}>
          <a href="#warroom"   onClick={scrollToSection('warroom')}   className="uppercase">War Room</a>
          <a href="#grants"    onClick={scrollToSection('grants')}    className="uppercase">Active Grants</a>
          <a href="#portfolio" onClick={scrollToSection('portfolio')} className="uppercase">Portfolio</a>
          <a href="#settings"  onClick={scrollToSection('settings')}  className="uppercase">Settings</a>
          <button onClick={connectPhantomDirect} className="px-6 py-3 rounded-full text-white font-bold" style={{ backgroundColor: GOLD }}>
            Connect Wallet
          </button>
          <button onClick={() => { handleDelegateTEE(); setMenuOpen(false); }} className="px-6 py-3 bg-stone-900 text-white rounded-full">
            Delegate to TEE
          </button>
        </div>
      )}

      {/* Hero */}
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
          <div className="flex justify-center">
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
        {/* War Room */}
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
            <MetricCard label="Total Shielded TVL"    value="$4.2M"    delay="0.1s" />
            <MetricCard label="Active Private Rounds" value="3"        delay="0.2s" />
            <MetricCard label="Your Voting Power"     value="150 DECO" delay="0.3s" />
          </div>
        </section>

        {/* Nebula DEX */}
        <section id="grants" className="py-24 bg-white border-t border-stone-100">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 text-stone-600 text-xs font-bold tracking-widest uppercase rounded-full mb-6 border border-stone-200">
                  <Zap size={14} /> ACTIVE ROUNDS
                </div>
                <h2 className="font-serif text-4xl md:text-5xl mb-6 text-stone-900">Nebula DEX</h2>
                <GrantDetails funding="50,000 USDC" />
                <div className="flex gap-4 mt-8">
                  <button onClick={() => handleCastVote('Nebula DEX', 1, NEBULA_PUBKEY)}
                    disabled={loading === 'vote-1'}
                    className="flex-1 px-6 py-3 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors font-bold text-sm tracking-widest uppercase disabled:opacity-50">
                    {loading === 'vote-1' ? 'Casting...' : 'Cast Private Vote'}
                  </button>
                  <button className="px-6 py-3 border border-stone-300 rounded-full hover:border-stone-900 transition-colors font-bold text-sm tracking-widest uppercase text-stone-600">
                    Shielded Deposit
                  </button>
                </div>
              </div>
              <div><Suspense fallback={<div className="h-64 bg-stone-50 rounded-xl" />}><SurfaceCodeDiagram /></Suspense></div>
            </div>
          </div>
        </section>

        {/* Aura Pay */}
        <section className="py-24 bg-white border-t border-stone-100">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1"><Suspense fallback={<div className="h-64 bg-stone-50 rounded-xl" />}><PerformanceMetricDiagram /></Suspense></div>
              <div className="order-1 lg:order-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 text-stone-600 text-xs font-bold tracking-widest uppercase rounded-full mb-6 border border-stone-200">
                  <Zap size={14} /> ACTIVE ROUNDS
                </div>
                <h2 className="font-serif text-4xl md:text-5xl mb-6 text-stone-900">Aura Pay</h2>
                <GrantDetails funding="25,000 USDC" />
                <div className="flex gap-4 mt-8">
                  <button onClick={() => handleCastVote('Aura Pay', 2, AURA_PUBKEY)}
                    disabled={loading === 'vote-2'}
                    className="flex-1 px-6 py-3 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors font-bold text-sm tracking-widest uppercase disabled:opacity-50">
                    {loading === 'vote-2' ? 'Casting...' : 'Cast Private Vote'}
                  </button>
                  <button className="px-6 py-3 border border-stone-300 rounded-full hover:border-stone-900 transition-colors font-bold text-sm tracking-widest uppercase text-stone-600">
                    Shielded Deposit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Portfolio */}
        <section id="portfolio" className="py-24 bg-stone-900 text-stone-100 overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="w-96 h-96 rounded-full bg-stone-600 absolute top-[-100px] left-[-100px]" style={{ filter: 'blur(100px)' }}></div>
            <div className="w-96 h-96 rounded-full absolute bottom-[-100px] right-[-100px]" style={{ filter: 'blur(100px)', backgroundColor: GOLD }}></div>
          </div>
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1"><Suspense fallback={<div className="h-64 bg-stone-800 rounded-xl" />}><TransformerDecoderDiagram /></Suspense></div>
              <div className="order-1 lg:order-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-800 text-xs font-bold tracking-widest uppercase rounded-full mb-6 border border-stone-700" style={{ color: GOLD }}>
                  SHIELDED PORTFOLIO
                </div>
                <h2 className="font-serif text-4xl md:text-5xl mb-6 text-white">Your Private Holdings</h2>
                <p className="text-lg text-stone-400 mb-6 leading-relaxed">All your investments and grant allocations are stored within a <strong>Private Ephemeral Rollup</strong>. Invisible to the public Solana explorer.</p>
                <p className="text-lg text-stone-400 leading-relaxed">Only you, authenticated via your wallet and the TEE, can view the real-time valuation of your DECO-backed assets.</p>
                <div className="mt-8">
                  <button onClick={handleRevealPortfolio}
                    className="px-8 py-4 rounded-full font-bold uppercase tracking-widest text-sm transition-colors shadow-lg"
                    style={{ backgroundColor: GOLD, color: '#1a1a1a' }}>
                    Reveal Portfolio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Settings */}
        <section id="settings" className="py-24" style={{ backgroundColor: '#F9F8F4' }}>
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

// Small shared component for grant round details
const GrantDetails = ({ funding }: { funding: string }) => (
  <div className="space-y-4">
    {[
      { label: 'Target Funding',  value: funding,             cls: 'text-stone-900 font-serif' },
      { label: 'Current Status',  value: 'In Progress',       cls: 'text-emerald-600 font-bold text-xs uppercase tracking-widest' },
      { label: 'Privacy Status',  value: '🔒 Cap Table Shielded', cls: 'font-bold text-xs uppercase tracking-widest', gold: true },
    ].map(r => (
      <div key={r.label} className="flex justify-between border-b border-stone-100 pb-2">
        <span className="text-stone-500 text-sm uppercase font-bold tracking-wider">{r.label}</span>
        <span className={r.cls} style={r.gold ? { color: GOLD } : {}}>{r.value}</span>
      </div>
    ))}
  </div>
);

// Wallet button — lazy loads the adapter UI button
const WalletButtonWrapper = ({ label, connected }: { label: string; connected: boolean }) => {
  const [WalletBtn, setWalletBtn] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import('@solana/wallet-adapter-react-ui').then(m => setWalletBtn(() => m.WalletMultiButton)).catch(() => {});
  }, []);
  if (!WalletBtn) return null;
  return <WalletBtn style={{ height: '36px', borderRadius: '9999px', fontSize: '13px', padding: '0 16px', background: connected ? '#16a34a' : GOLD }} />;
};

export default App;
