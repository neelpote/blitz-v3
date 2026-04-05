import React, { useState } from 'react';

interface Props {
  isLoading: boolean;
  onSubmit:  (feeBps: number, name: string) => Promise<void>;
  onClose:   () => void;
}

export const CreateVaultModal: React.FC<Props> = ({ isLoading, onSubmit, onClose }) => {
  const [name,   setName]   = useState('');
  const [fee,    setFee]    = useState('10');
  const [err,    setErr]    = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('Enter a strategy name'); return; }
    if (name.length > 32) { setErr('Name max 32 characters'); return; }
    const feeBps = Math.round(parseFloat(fee) * 100);
    if (isNaN(feeBps) || feeBps < 0 || feeBps > 5000) { setErr('Fee must be 0–50%'); return; }
    await onSubmit(feeBps, name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border border-black">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <div className="text-[11px] font-bold uppercase tracking-widest">Create Strategy Vault</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-black text-xl leading-none">×</button>
        </div>

        <form onSubmit={handle} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Strategy Name
            </label>
            <input
              type="text" maxLength={32}
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Momentum Alpha v1"
              className="form-input"
            />
            <div className="text-[10px] text-zinc-400 text-right">{name.length}/32</div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Performance Fee (%)
            </label>
            <div className="relative">
              <input
                type="number" min="0" max="50" step="0.1"
                value={fee} onChange={e => setFee(e.target.value)}
                className="form-input pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">%</span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Charged on profits only. Max 50%. {fee}% = {Math.round(parseFloat(fee || '0') * 100)} bps.
            </p>
          </div>

          <div className="border border-black/10 bg-zinc-50 p-4 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Summary</div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600">Name</span>
              <span className="font-bold">{name || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600">Performance Fee</span>
              <span className="font-bold">{fee || '0'}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600">Privacy</span>
              <span className="font-bold">TEE Shielded</span>
            </div>
          </div>

          {err && <p className="text-[11px] font-bold text-red-600">{err}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1 py-3">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn btn-primary flex-1 py-3">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </span>
              ) : 'Create Vault →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
