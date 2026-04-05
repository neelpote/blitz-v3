import React, { useState } from 'react';

export type ViewMode = 'public' | 'tee';

interface Props {
  mode:        ViewMode;
  onChange:    (m: ViewMode) => void;
  onTeeAuth:   () => Promise<void>;
  teeVerified: boolean;
  authed:      boolean;
}

export const ViewModeToggle: React.FC<Props> = ({ mode, onChange, onTeeAuth, teeVerified, authed }) => {
  const [loading, setLoading] = useState(false);
  const isTee = mode === 'tee';

  const handleTee = async () => {
    if (isTee) { onChange('public'); return; }
    setLoading(true);
    try { await onTeeAuth(); onChange('tee'); }
    catch { /* rejected */ }
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center border border-black/20">
      <button
        onClick={() => onChange('public')}
        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all ${
          !isTee ? 'bg-black text-white' : 'bg-white text-zinc-400 hover:text-black'
        }`}
      >
        Public
      </button>
      <button
        onClick={handleTee}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 ${
          isTee ? 'bg-black text-white' : 'bg-white text-zinc-400 hover:text-black'
        }`}
      >
        {loading ? (
          <>
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Signing
          </>
        ) : (
          <>
            {authed && (
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${teeVerified ? 'bg-green-400' : 'bg-white'}`} />
            )}
            TEE Auth
          </>
        )}
      </button>
    </div>
  );
};
