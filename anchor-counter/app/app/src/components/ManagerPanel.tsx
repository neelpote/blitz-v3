import React, { useState } from 'react';
import { StrategyVault } from '../hooks/useAlphaVault';

interface Props {
  vault:       StrategyVault | null;
  isLoading:   boolean;
  txStatus:    string | null;
  onDelegate:  () => void;
  onRecord:    (deltaBps: number) => Promise<void>;
  onSettle:    () => void;
}

export const ManagerPanel: React.FC<Props> = ({
  vault, isLoading, txStatus, onDelegate, onRecord, onSettle,
}) => {
  const [delta, setDelta] = useState('');
  const [err,   setErr]   = useState('');

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const bps = parseInt(delta);
    if (isNaN(bps)) { setErr('Enter a valid number'); return; }
    await onRecord(bps);
    setDelta('');
  };

  if (!vault) {
    return (
      <div className="card text-center py-12">
        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2">No Vault Found</div>
        <p className="text-sm text-zinc-500">Create a vault from the Vaults tab to manage it here.</p>
      </div>
    );
  }

  const isActive  = vault.status === 'Active';
  const isSettled = vault.status === 'Settled';

  return (
    <div className="space-y-4">
      {/* Vault status */}
      <div className="card">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Your Vault</div>
        <div className="text-xl font-bold tracking-tight mb-4">{vault.name}</div>
        <div className="grid grid-cols-2 gap-px bg-black/5">
          {[
            { label: 'Status',      value: vault.status },
            { label: 'Performance', value: `${vault.performanceBps >= 0 ? '+' : ''}${(vault.performanceBps/100).toFixed(2)}%` },
            { label: 'TVL',         value: `${(Number(vault.totalDeposits)/1e9).toFixed(3)} SOL` },
            { label: 'Trades',      value: vault.tradeCount.toString() },
          ].map(s => (
            <div key={s.label} className="bg-white p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{s.label}</div>
              <div className="text-sm font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Delegate to ER */}
      {isActive && (
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
            Step 1 — Delegate to ER
          </div>
          <p className="text-sm text-zinc-600 mb-4">
            Move the vault PDA to the MagicBlock Ephemeral Rollup. Trades will be shielded inside the TEE.
          </p>
          <button onClick={onDelegate} disabled={isLoading} className="btn btn-outline w-full py-2.5">
            {isLoading && txStatus?.includes('Delegate') ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                {txStatus}
              </span>
            ) : 'Delegate to ER →'}
          </button>
        </div>
      )}

      {/* Record trade */}
      {isActive && (
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
            Step 2 — Record Trade (ER/TEE)
          </div>
          <p className="text-sm text-zinc-600 mb-4">
            Record a trade result inside the TEE. Shielded — investors only see the aggregate performance.
          </p>
          <form onSubmit={handleRecord} className="space-y-3">
            <div className="relative">
              <input
                type="number"
                value={delta} onChange={e => setDelta(e.target.value)}
                placeholder="e.g. 500 for +5%, -200 for -2%"
                className="form-input pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold">bps</span>
            </div>
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
            <button type="submit" disabled={isLoading || !delta} className="btn btn-primary w-full py-2.5">
              {isLoading && txStatus?.includes('ER') ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {txStatus}
                </span>
              ) : 'Record Trade (ER) →'}
            </button>
          </form>
        </div>
      )}

      {/* Settle */}
      {isActive && (
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
            Step 3 — Settle Vault
          </div>
          <p className="text-sm text-zinc-600 mb-4">
            Commit ER state back to L1. Performance fee deducted. Investors can then withdraw.
          </p>
          <button onClick={onSettle} disabled={isLoading} className="btn btn-primary w-full py-2.5">
            {isLoading && txStatus?.includes('Confirm') ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {txStatus}
              </span>
            ) : 'Settle Vault →'}
          </button>
        </div>
      )}

      {isSettled && (
        <div className="card border-green-200 bg-green-50">
          <div className="text-[11px] font-bold uppercase tracking-widest text-green-700">
            Vault Settled — Investors can now withdraw
          </div>
        </div>
      )}
    </div>
  );
};
