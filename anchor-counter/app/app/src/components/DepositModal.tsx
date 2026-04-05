import React, { useState } from 'react';
import { StrategyVault } from '../hooks/useAlphaVault';

interface Props {
  vault:     StrategyVault;
  isLoading: boolean;
  onSubmit:  (amountSol: number) => Promise<void>;
  onClose:   () => void;
}

export const DepositModal: React.FC<Props> = ({ vault, isLoading, onSubmit, onClose }) => {
  const [amount, setAmount] = useState('');
  const [err,    setErr]    = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const sol = parseFloat(amount);
    if (!sol || sol < 0.1) { setErr('Minimum deposit is 0.1 SOL'); return; }
    await onSubmit(sol);
  };

  const fmtSol = (n: bigint) => (Number(n) / 1e9).toFixed(3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border border-black">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <div className="text-[11px] font-bold uppercase tracking-widest">Invest in Vault</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-black text-xl leading-none">×</button>
        </div>

        <form onSubmit={handle} className="p-6 space-y-5">
          {/* Vault info */}
          <div className="border border-black/10 bg-zinc-50 p-4">
            <div className="text-lg font-bold tracking-tight mb-3">{vault.name}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Performance</div>
                <div className={`font-bold ${vault.performanceBps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {vault.performanceBps >= 0 ? '+' : ''}{(vault.performanceBps / 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">TVL</div>
                <div className="font-bold">{fmtSol(vault.totalDeposits)} SOL</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Perf Fee</div>
                <div className="font-bold">{(vault.feeBps / 100).toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Trades</div>
                <div className="font-bold">{vault.tradeCount}</div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Amount (SOL)
            </label>
            <div className="relative">
              <input
                type="number" min="0.1" step="0.01"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="form-input pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">SOL</span>
            </div>
            <p className="text-[10px] text-zinc-400">Minimum 0.1 SOL</p>
          </div>

          {err && <p className="text-[11px] font-bold text-red-600">{err}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1 py-3">Cancel</button>
            <button type="submit" disabled={isLoading || !amount} className="btn btn-primary flex-1 py-3">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Depositing…
                </span>
              ) : 'Deposit →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
