/**
 * useAlphaVault — Full MagicBlock integration for AlphaVault.
 *
 * L1  → rpc.magicblock.app/devnet  (ConnectionProvider endpoint)
 * TEE → tee.magicblock.app         (Private ER — JWT authenticated)
 * ER  → devnet-router.magicblock.app (Ephemeral Rollup router)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, Idl, BN } from '@coral-xyz/anchor';
// @ts-ignore
import { ConnectionMagicRouter, getAuthToken, verifyTeeRpcIntegrity } from '@magicblock-labs/ephemeral-rollups-sdk';
import IDL from '../idl/alpha_vault.json';

// ─── Endpoints ────────────────────────────────────────────────────────────────
const TEE_URL = 'https://tee.magicblock.app';
const ER_HTTP = 'https://devnet-router.magicblock.app/';
const ER_WS   = 'wss://devnet-router.magicblock.app/';

// ─── Constants ────────────────────────────────────────────────────────────────
export const PROGRAM_ID    = new PublicKey('3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7');
export const VAULT_SEED    = Buffer.from('alpha_vault');
export const ESCROW_SEED   = Buffer.from('alpha_escrow');
export const POSITION_SEED = Buffer.from('alpha_position');
export const MIN_DEPOSIT   = 0.1; // SOL

// ─── Types ────────────────────────────────────────────────────────────────────
export type VaultStatusTag = 'Active' | 'Paused' | 'Settled';

export interface StrategyVault {
  publicKey:      PublicKey;
  manager:        PublicKey;
  totalDeposits:  bigint;
  totalShares:    bigint;
  performanceBps: number;   // signed i64 as number
  feeBps:         number;
  status:         VaultStatusTag;
  escrowBump:     number;
  name:           string;
  tradeCount:     number;
}

export interface InvestorPosition {
  publicKey:        PublicKey;
  vault:            PublicKey;
  investor:         PublicKey;
  depositLamports:  bigint;
  shares:           bigint;
  entryPerformance: number;
}

export interface TeeState {
  verified: boolean;
  authed:   boolean;
  token:    string | null;
}

export interface UseAlphaVaultReturn {
  vaults:        StrategyVault[];
  myPositions:   InvestorPosition[];
  isLoading:     boolean;
  txStatus:      string | null;
  txError:       string | null;
  tee:           TeeState;
  clearError:    () => void;
  authTee:       () => Promise<void>;
  createVault:   (feeBps: number, name: string) => Promise<string | null>;
  deposit:       (vaultManagerKey: PublicKey, amountSol: number) => Promise<string | null>;
  delegateVault: () => Promise<string | null>;
  recordTrade:   (deltaBps: number) => Promise<string | null>;
  settleVault:   () => Promise<string | null>;
  withdrawPosition: (vault: StrategyVault) => Promise<string | null>;
  refresh:       () => Promise<void>;
}

// ─── PDA helpers ─────────────────────────────────────────────────────────────
export function deriveVaultPda(manager: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED, manager.toBytes()], PROGRAM_ID)[0];
}
export function deriveEscrowPda(manager: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ESCROW_SEED, manager.toBytes()], PROGRAM_ID)[0];
}
export function derivePositionPda(vault: PublicKey, investor: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([POSITION_SEED, vault.toBytes(), investor.toBytes()], PROGRAM_ID)[0];
}

// ─── Decoders ─────────────────────────────────────────────────────────────────
function decodeVaultStatus(raw: Record<string, unknown>): VaultStatusTag {
  if ('active'  in raw) return 'Active';
  if ('paused'  in raw) return 'Paused';
  return 'Settled';
}

function decodeVault(pk: PublicKey, raw: Record<string, unknown>): StrategyVault {
  return {
    publicKey:      pk,
    manager:        raw.manager as PublicKey,
    totalDeposits:  BigInt((raw.totalDeposits as BN).toString()),
    totalShares:    BigInt((raw.totalShares as BN).toString()),
    performanceBps: Number((raw.performanceBps as BN).toString()),
    feeBps:         raw.feeBps as number,
    status:         decodeVaultStatus(raw.status as Record<string, unknown>),
    escrowBump:     raw.escrowBump as number,
    name:           Buffer.from(raw.name as number[]).toString('utf8').replace(/\0/g, ''),
    tradeCount:     raw.tradeCount as number,
  };
}

function decodePosition(pk: PublicKey, raw: Record<string, unknown>): InvestorPosition {
  return {
    publicKey:        pk,
    vault:            raw.vault as PublicKey,
    investor:         raw.investor as PublicKey,
    depositLamports:  BigInt((raw.depositLamports as BN).toString()),
    shares:           BigInt((raw.shares as BN).toString()),
    entryPerformance: Number((raw.entryPerformance as BN).toString()),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAlphaVault(): UseAlphaVaultReturn {
  const { connection }                              = useConnection();
  const { publicKey, signMessage, signTransaction } = useWallet();

  const programRef = useRef<Program | null>(null);
  const erConnRef  = useRef<ConnectionMagicRouter | null>(null);

  const [vaults,      setVaults]      = useState<StrategyVault[]>([]);
  const [myPositions, setMyPositions] = useState<InvestorPosition[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [txStatus,    setTxStatus]    = useState<string | null>(null);
  const [txError,     setTxError]     = useState<string | null>(null);
  const [tee,         setTee]         = useState<TeeState>({ verified: false, authed: false, token: null });

  // ── Program client ────────────────────────────────────────────────────────
  const getProgram = useCallback((): Program => {
    if (programRef.current) return programRef.current;
    if (!publicKey) throw new Error('Wallet not connected');
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction: async t => t, signAllTransactions: async t => t },
      { commitment: 'confirmed' },
    );
    programRef.current = new Program(IDL as Idl, provider);
    return programRef.current;
  }, [connection, publicKey]);

  useEffect(() => { programRef.current = null; }, [publicKey]);

  // ── ER connection ─────────────────────────────────────────────────────────
  const getEr = useCallback((): ConnectionMagicRouter => {
    if (!erConnRef.current) {
      erConnRef.current = new ConnectionMagicRouter(ER_HTTP, { wsEndpoint: ER_WS });
    }
    return erConnRef.current;
  }, []);

  // ── TEE auth ──────────────────────────────────────────────────────────────
  const authTee = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error('Wallet not connected');
    setTxStatus('Verifying TEE hardware…');
    try {
      let verified = false;
      try { verified = await verifyTeeRpcIntegrity(TEE_URL); } catch { verified = false; }
      setTxStatus('Signing TEE challenge…');
      const { token } = await getAuthToken(TEE_URL, publicKey, signMessage);
      setTee({ verified, authed: true, token });
      setTxStatus(null);
    } catch (e) {
      setTxStatus(null);
      throw e;
    }
  }, [publicKey, signMessage]);

  // ── Refresh all data ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const program = getProgram();
      type AcctResult = { publicKey: PublicKey; account: Record<string, unknown> };
      const accts = program.account as Record<string, { all: () => Promise<AcctResult[]> }>;

      const [rawVaults, rawPositions] = await Promise.all([
        accts['strategyVault'].all(),
        accts['investorPosition'].all(),
      ]);

      const decoded = rawVaults.map(r => decodeVault(r.publicKey, r.account));
      setVaults(decoded);

      if (publicKey) {
        // Also try fetching the current wallet's vault directly in case
        // getProgramAccounts misses it (RPC indexing lag)
        const myVaultPda = deriveVaultPda(publicKey);
        const alreadyIn  = decoded.some(v => v.publicKey.equals(myVaultPda));
        if (!alreadyIn) {
          try {
            const info = await connection.getAccountInfo(myVaultPda);
            if (info) {
              const raw = program.coder.accounts.decode('StrategyVault', info.data);
              setVaults(prev => {
                const without = prev.filter(v => !v.publicKey.equals(myVaultPda));
                return [...without, decodeVault(myVaultPda, raw as Record<string, unknown>)];
              });
            }
          } catch { /* vault doesn't exist yet */ }
        }

        setMyPositions(
          rawPositions
            .map(r => decodePosition(r.publicKey, r.account))
            .filter(p => p.investor.equals(publicKey)),
        );
      }
    } catch { /* not connected yet */ }
  }, [getProgram, publicKey, connection]);

  useEffect(() => {
    if (!publicKey) return;
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [publicKey, refresh]);

  // On wallet connect, immediately fetch this wallet's vault directly
  useEffect(() => {
    if (!publicKey) return;
    const fetchMyVault = async () => {
      try {
        const program    = getProgram();
        const myVaultPda = deriveVaultPda(publicKey);
        const raw = await (program.account as Record<string, { fetch: (k: PublicKey) => Promise<Record<string, unknown>> }>)
          ['strategyVault'].fetch(myVaultPda);
        setVaults(prev => {
          const without = prev.filter(v => !v.publicKey.equals(myVaultPda));
          return [...without, decodeVault(myVaultPda, raw)];
        });
      } catch { /* no vault yet for this wallet */ }
    };
    fetchMyVault();
  }, [publicKey, getProgram]);

  // ── L1 tx helper ─────────────────────────────────────────────────────────
  // connection = api.devnet.solana.com (from ConnectionProvider in Wallet.tsx)
  // We sign via signTransaction (not sendTransaction) so Phantom can't
  // re-route to its own RPC. Then sendRawTransaction directly to our RPC.
  const sendL1 = useCallback(async (tx: Transaction): Promise<string> => {
    if (!publicKey || !signTransaction) throw new Error('Wallet not connected');

    setTxStatus('Fetching blockhash…');
    const { blockhash } =
      await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer        = publicKey;

    setTxStatus('Awaiting wallet signature…');
    const signed = await signTransaction(tx);

    setTxStatus('Sending…');
    const raw = signed.serialize();
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: true,
      maxRetries:    8,
    });

    // Re-send every 5s while polling — combats validator drops
    setTxStatus(`Confirming · ${sig.slice(0, 10)}…`);
    const deadline = Date.now() + 90_000;
    const resendInterval = setInterval(() => {
      connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    }, 5000);

    try {
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));
        const { value } = await connection.getSignatureStatuses([sig], {
          searchTransactionHistory: true,
        });
        const s = value?.[0];
        if (s?.err) throw new Error(`TX failed: ${JSON.stringify(s.err)}`);
        if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') {
          setTxStatus(null);
          return sig;
        }
      }
    } finally {
      clearInterval(resendInterval);
    }

    throw new Error(`Timeout — check explorer: ${sig}`);
  }, [connection, publicKey, signTransaction]);

  // ── createVault ───────────────────────────────────────────────────────────
  const createVault = useCallback(async (feeBps: number, name: string): Promise<string | null> => {
    if (!publicKey) return null;
    setIsLoading(true); setTxError(null);
    try {
      // Check if a real vault account already exists for this wallet
      // by trying to decode it — a bare system account won't decode
      const program  = getProgram();
      const vaultPda = deriveVaultPda(publicKey);
      try {
        await (program.account as Record<string, { fetch: (k: PublicKey) => Promise<unknown> }>)
          ['strategyVault'].fetch(vaultPda);
        // If fetch succeeds, vault exists
        setTxError('You already have a vault. Go to the Manage tab to manage it.');
        return null;
      } catch {
        // fetch throws if account doesn't exist or isn't a vault — proceed
      }
      const tx = await program.methods
        .createVault(feeBps, name)
        .accounts({ manager: publicKey })
        .transaction();
      const sig = await sendL1(tx);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, getProgram, sendL1, refresh]);

  // ── deposit ───────────────────────────────────────────────────────────────
  const deposit = useCallback(async (vaultManagerKey: PublicKey, amountSol: number): Promise<string | null> => {
    if (!publicKey) return null;
    setIsLoading(true); setTxError(null);
    try {
      const program  = getProgram();
      const vaultPda = deriveVaultPda(vaultManagerKey);
      const lamports = Math.round(amountSol * 1e9);
      const tx = await program.methods
        .deposit(new BN(lamports))
        .accounts({ strategyVault: vaultPda, investor: publicKey })
        .transaction();
      const sig = await sendL1(tx);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, getProgram, sendL1, refresh]);

  // ── delegateVault ─────────────────────────────────────────────────────────
  const delegateVault = useCallback(async (): Promise<string | null> => {
    if (!publicKey) return null;
    setIsLoading(true); setTxError(null);
    try {
      const program   = getProgram();
      const erConn    = getEr();
      const vaultPda  = deriveVaultPda(publicKey);
      const validator = await erConn.getClosestValidator().catch(() => null);
      const remaining = validator?.identity
        ? [{ pubkey: new PublicKey(validator.identity), isSigner: false, isWritable: false }]
        : [];
      const tx = await program.methods
        .delegateVault()
        .accounts({ manager: publicKey, pda: vaultPda })
        .remainingAccounts(remaining)
        .transaction();
      const sig = await sendL1(tx);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, getProgram, getEr, sendL1, refresh]);

  // ── recordTrade (ER) ──────────────────────────────────────────────────────
  const recordTrade = useCallback(async (deltaBps: number): Promise<string | null> => {
    if (!publicKey || !signTransaction) return null;
    setIsLoading(true); setTxError(null);
    try {
      const program  = getProgram();
      const erConn   = getEr();
      const vaultPda = deriveVaultPda(publicKey);
      const tx = await program.methods
        .recordTrade(new BN(deltaBps))
        .accounts({ strategyVault: vaultPda, manager: publicKey })
        .transaction();
      setTxStatus('Fetching ER blockhash…');
      const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer        = publicKey;
      setTxStatus('Awaiting wallet signature…');
      const signed = await signTransaction(tx);
      setTxStatus('Sending to ER/TEE…');
      const sig = await erConn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      setTxStatus(`ER confirming · ${sig.slice(0, 10)}…`);
      await erConn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      setTxStatus(null);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, signTransaction, getProgram, getEr, refresh]);

  // ── settleVault ───────────────────────────────────────────────────────────
  const settleVault = useCallback(async (): Promise<string | null> => {
    if (!publicKey) return null;
    setIsLoading(true); setTxError(null);
    try {
      const program = getProgram();
      const tx = await program.methods
        .settleVault()
        .accounts({ manager: publicKey })
        .transaction();
      const sig = await sendL1(tx);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, getProgram, sendL1, refresh]);

  // ── withdrawPosition ──────────────────────────────────────────────────────
  const withdrawPosition = useCallback(async (vault: StrategyVault): Promise<string | null> => {
    if (!publicKey) return null;
    setIsLoading(true); setTxError(null);
    try {
      const program = getProgram();
      const tx = await program.methods
        .withdrawPosition()
        .accounts({
          strategyVault: vault.publicKey,
          investor:      publicKey,
        })
        .transaction();
      const sig = await sendL1(tx);
      await refresh();
      return sig;
    } catch (e) { setTxError(String(e)); setTxStatus(null); return null; }
    finally { setIsLoading(false); }
  }, [publicKey, getProgram, sendL1, refresh]);

  return {
    vaults, myPositions, isLoading, txStatus, txError, tee,
    clearError: () => setTxError(null),
    authTee, createVault, deposit, delegateVault, recordTrade, settleVault, withdrawPosition, refresh,
  };
}
