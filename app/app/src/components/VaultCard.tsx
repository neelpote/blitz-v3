import React from 'react';
import { StrategyVault, InvestorPosition } from '../hooks/useAlphaVault';

interface Props {
  vault:       StrategyVault;
  myPosition?: InvestorPosition;
  teeAuthed:   boolean;
  isMe:        boolean;        // I am the manager
  isLoading:   boolean;
  onDeposit:   (vault: StrategyVault) => void;
  onDelegate:  (vault: StrategyVault) => void;
  onSettle:    (vault: StrategyVault) => void;
  onWithdraw:  (vault: StrategyVault) => void;
}

const fmtSol  = (n: bigint) => (Number(n) / 1e9).toFixed(3);
const fmtPerf = (bps: number) => {
  const pct = (bps / 100).toFixed(2);
  return bps >= 0 ? `+${pct}%` : `${pct}%`;
};

const STATUS_STYLE: Record<string, string> = {
  Active:  'bg-green-50 text-green-700 border-green-200',
  Paused:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  Settled: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

export const VaultCard: React.FC<Props> = ({
  vault, myPosition, teeAuthed, isMe, isLoading, onDeposit, onDelegate, onSettle, onWithdraw,
}) => {
  const isActive  = vault.status === 'Active';
  const isSettled = vault.status === 'Settled';
  const hasPos    = myPosition && myPosition.shares > 0n;

  // Performance display — encrypted in public mode
  const perfDisplay = teeAuthed
    ? fmtPerf(vault.performanceBps)
    : '██████';

  const depositsDisplay = teeAuthed
    ? fmtSol(vault.totalDeposits) + ' SOL'
    : '████████';

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
            Strategy Vault
          </div>
          <h3 className="text-xl font-bold tracking-tight">{vault.name || 'Unnamed Strategy'}</h3>
          <div className="text-xs font-mono text-zinc-400 mt-1">
            {vault.manager.toBase58().slice(0, 8)}…{vault.manager.toBase58().slice(-6)}
            {isMe && <span className="ml-2 badge badge-black">You</span>}
          </div>
        </div>
        <span className={`badge border ${STATUS_STYLE[vault.status]}`}>
          {vault.status}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-black/5 mb-5">
        <div className="bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Performance</div>
          <div className={`text-2xl font-bold tracking-tighter ${
            teeAuthed
              ? vault.performanceBps >= 0 ? 'text-green-600' : 'text-red-600'
              : 'text-zinc-300 blur-sm select-none'
          }`}>
            {perfDisplay}
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">TVL</div>
          <div className={`text-2xl font-bold tracking-tighter ${!teeAuthed ? 'text-zinc-300 blur-sm select-none' : ''}`}>
            {depositsDisplay}
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Perf Fee</div>
          <div className="text-lg font-bold tracking-tighter">{(vault.feeBps / 100).toFixed(0)}%</div>
        </div>
        <div className="bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Trades</div>
          <div className="text-lg font-bold tracking-tighter">{vault.tradeCount}</div>
        </div>
      </div>

      {/* My position */}
      {hasPos && (
        <div className="border border-black/10 bg-zinc-50 p-3 mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">My Position</div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-600">Deposited</span>
            <span className="font-bold">{fmtSol(myPosition!.depositLamports)} SOL</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-zinc-600">Shares</span>
            <span className="font-bold">{myPosition!.shares.toString()}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {teeAuthed && isActive && !isMe && (
          <button onClick={() => onDeposit(vault)} disabled={isLoading}
            className="btn btn-primary text-[10px] px-4 py-2 flex-1">
            Invest →
          </button>
        )}
        {isMe && isActive && (
          <button onClick={() => onDelegate(vault)} disabled={isLoading}
            className="btn btn-outline text-[10px] px-3 py-2">
            Delegate ER
          </button>
        )}
        {isMe && isActive && (
          <button onClick={() => onSettle(vault)} disabled={isLoading}
            className="btn btn-outline text-[10px] px-3 py-2">
            Settle
          </button>
        )}
        {hasPos && isSettled && (
          <button onClick={() => onWithdraw(vault)} disabled={isLoading}
            className="btn btn-primary text-[10px] px-4 py-2 flex-1">
            Withdraw →
          </button>
        )}
        {!teeAuthed && !isMe && isActive && (
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            Authenticate TEE to invest
          </p>
        )}
      </div>
    </div>
  );
};
