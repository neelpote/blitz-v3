import { useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import IDL_JSON from '../idl/deco_private.json';

export const PROGRAM_ID         = '4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX';
export const DELEGATION_PROGRAM = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
export const MAGIC_ROUTER_RPC   = 'https://devnet-router.magicblock.app';

const MAGIC_ROUTER_WS       = 'wss://devnet-router.magicblock.app';
const DELEGATION_PROGRAM_ID = new PublicKey(DELEGATION_PROGRAM);
const GRANT_ROUND_SEED      = Buffer.from('grant_round');
const MEMBER_VOTE_SEED      = Buffer.from('member_vote');
const programId             = new PublicKey(PROGRAM_ID);

export function getGrantRoundPda(roundId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync([GRANT_ROUND_SEED, buf], programId)[0];
}

export function getMemberVotePda(roundId: number, voter: PublicKey): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync([MEMBER_VOTE_SEED, buf, voter.toBuffer()], programId)[0];
}

function getDelegationPdas(accountPda: PublicKey) {
  const [bufferPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('buffer'), accountPda.toBuffer()], DELEGATION_PROGRAM_ID);
  const [delegationRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation'), accountPda.toBuffer()], DELEGATION_PROGRAM_ID);
  const [delegationMetadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation-metadata'), accountPda.toBuffer()], DELEGATION_PROGRAM_ID);
  return { bufferPda, delegationRecordPda, delegationMetadataPda };
}

export function useDecoProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const baseProvider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  }, [connection, wallet.publicKey, wallet.signTransaction]);

  const routerProvider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    try {
      const routerConn = new web3.Connection(MAGIC_ROUTER_RPC, {
        wsEndpoint: MAGIC_ROUTER_WS,
        commitment: 'confirmed',
      });
      return new AnchorProvider(routerConn, wallet as any, { commitment: 'confirmed' });
    } catch {
      return new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    }
  }, [connection, wallet.publicKey, wallet.signTransaction]);

  const baseProgram = useMemo(() => {
    if (!baseProvider) return null;
    try { return new Program(IDL_JSON as any, baseProvider); }
    catch (e) { console.error('baseProgram init failed:', e); return null; }
  }, [baseProvider]);

  const routerProgram = useMemo(() => {
    if (!routerProvider) return null;
    try { return new Program(IDL_JSON as any, routerProvider); }
    catch (e) { console.error('routerProgram init failed:', e); return null; }
  }, [routerProvider]);

  const createGrantRound = useCallback(async (roundId: number) => {
    if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
    const pda = getGrantRoundPda(roundId);
    const tx = await (baseProgram.methods as any)
      .createGrantRound(new BN(roundId))
      .accounts({ grantRound: pda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('createGrantRound tx:', tx);
    return tx;
  }, [baseProgram, wallet.publicKey]);

  const initMemberVote = useCallback(async (roundId: number) => {
    if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
    const pda = getMemberVotePda(roundId, wallet.publicKey);
    try {
      await (baseProgram.account as any).memberVote.fetch(pda);
      console.log('MemberVote already exists, skipping init');
      return null;
    } catch { /* not found, proceed */ }
    const tx = await (baseProgram.methods as any)
      .initMemberVote(new BN(roundId))
      .accounts({ memberVote: pda, voter: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('initMemberVote tx:', tx);
    return tx;
  }, [baseProgram, wallet.publicKey]);

  const delegateMemberVote = useCallback(async (roundId: number) => {
    if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
    const pda = getMemberVotePda(roundId, wallet.publicKey);
    const { bufferPda, delegationRecordPda, delegationMetadataPda } = getDelegationPdas(pda);
    const tx = await (baseProgram.methods as any)
      .delegateMemberVote(new BN(roundId))
      .accounts({
        pda,
        payer: wallet.publicKey,
        validator: null,
        ownerProgram: programId,
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('delegateMemberVote tx:', tx);
    return tx;
  }, [baseProgram, wallet.publicKey]);

  const delegateGrantRound = useCallback(async (roundId: number) => {
    if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
    const pda = getGrantRoundPda(roundId);
    const { bufferPda, delegationRecordPda, delegationMetadataPda } = getDelegationPdas(pda);
    const tx = await (baseProgram.methods as any)
      .delegateGrantRound(new BN(roundId))
      .accounts({
        pda,
        payer: wallet.publicKey,
        validator: null,
        ownerProgram: programId,
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('delegateGrantRound tx:', tx);
    return tx;
  }, [baseProgram, wallet.publicKey]);

  const castVote = useCallback(async (roundId: number, projectPubkey: PublicKey) => {
    if (!routerProgram || !wallet.publicKey) throw new Error('Wallet not connected');
    const pda = getMemberVotePda(roundId, wallet.publicKey);
    const tx = await (routerProgram.methods as any)
      .castVote(new BN(roundId), projectPubkey)
      .accounts({ memberVote: pda, voter: wallet.publicKey })
      .rpc();
    console.log('castVote tx (via Magic Router):', tx);
    return tx;
  }, [routerProgram, wallet.publicKey]);

  const fetchAllGrantRounds = useCallback(async () => {
    if (!baseProgram) return [];
    try {
      const all = await (baseProgram.account as any).grantRound.all();
      return all.map((r: any) => ({
        pubkey: r.publicKey as PublicKey,
        roundId: r.account.roundId,
        isActive: r.account.isActive,
        winner: r.account.winner,
      }));
    } catch { return []; }
  }, [baseProgram]);

  const fetchMyVotes = useCallback(async () => {
    if (!baseProgram || !wallet.publicKey) return [];
    try {
      const all = await (baseProgram.account as any).memberVote.all();
      return all
        .filter((v: any) => v.account.voter.equals(wallet.publicKey!))
        .map((v: any) => ({
          pubkey: v.publicKey as PublicKey,
          roundId: v.account.roundId,
          voter: v.account.voter,
          votedFor: v.account.votedFor,
        }));
    } catch { return []; }
  }, [baseProgram, wallet.publicKey]);

  const hasVoted = useCallback(async (roundId: number): Promise<boolean> => {
    if (!baseProgram || !wallet.publicKey) return false;
    try {
      const pda = getMemberVotePda(roundId, wallet.publicKey);
      const vote = await (baseProgram.account as any).memberVote.fetch(pda);
      return vote.votedFor !== null;
    } catch { return false; }
  }, [baseProgram, wallet.publicKey]);

  return {
    connected: !!wallet.publicKey,
    publicKey: wallet.publicKey,
    createGrantRound,
    initMemberVote,
    delegateGrantRound,
    delegateMemberVote,
    castVote,
    fetchAllGrantRounds,
    fetchMyVotes,
    hasVoted,
  };
}
