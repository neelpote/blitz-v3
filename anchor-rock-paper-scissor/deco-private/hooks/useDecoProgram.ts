import { useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import { IDL, PROGRAM_ID } from '../idl/deco_private';

// MagicBlock ephemeral RPC — votes are sent here (private, inside TEE)
const EPHEMERAL_RPC = 'https://devnet.magicblock.app';

// MagicBlock constants
const MAGIC_PROGRAM_ID = new PublicKey('MagicProgram11111111111111111111111111111111');
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');
const PERMISSION_PROGRAM_ID = new PublicKey('9tKE7iUkFBMSFA9G31UcCMCFDxkSMHiHfGkFMkNribHK');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

const GRANT_ROUND_SEED = Buffer.from('grant_round');
const MEMBER_VOTE_SEED = Buffer.from('member_vote');

const programId = new PublicKey(PROGRAM_ID);

function getGrantRoundPda(roundId: number): [PublicKey, number] {
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [GRANT_ROUND_SEED, roundIdBuf],
    programId
  );
}

function getMemberVotePda(roundId: number, voter: PublicKey): [PublicKey, number] {
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [MEMBER_VOTE_SEED, roundIdBuf, voter.toBuffer()],
    programId
  );
}

export function useDecoProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // Base-chain provider (devnet) — used for createGrantRound + delegatePda
  const baseProvider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
    });
  }, [connection, wallet]);

  // Ephemeral provider — used for castVote + tallyAndReveal (inside TEE)
  const ephemeralProvider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const ephemeralConn = new web3.Connection(EPHEMERAL_RPC, 'confirmed');
    return new AnchorProvider(ephemeralConn, wallet as any, {
      commitment: 'confirmed',
    });
  }, [wallet]);

  const baseProgram = useMemo(
    () => (baseProvider ? new Program(IDL as any, programId, baseProvider) : null),
    [baseProvider]
  );

  const ephemeralProgram = useMemo(
    () => (ephemeralProvider ? new Program(IDL as any, programId, ephemeralProvider) : null),
    [ephemeralProvider]
  );

  /** 1. Create a new grant round on base chain */
  const createGrantRound = useCallback(
    async (roundId: number) => {
      if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
      const [grantRoundPda] = getGrantRoundPda(roundId);

      const tx = await baseProgram.methods
        .createGrantRound(new BN(roundId))
        .accounts({
          grantRound: grantRoundPda,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Grant round ${roundId} created. Tx: ${tx}`);
      return tx;
    },
    [baseProgram, wallet.publicKey]
  );

  /** 2. Delegate a PDA into the MagicBlock TEE (base chain) */
  const delegatePda = useCallback(
    async (roundId: number) => {
      if (!baseProgram || !wallet.publicKey) throw new Error('Wallet not connected');
      const [grantRoundPda] = getGrantRoundPda(roundId);

      const tx = await baseProgram.methods
        .delegatePda({ grantRound: { roundId: new BN(roundId) } })
        .accounts({
          pda: grantRoundPda,
          payer: wallet.publicKey,
          validator: null,
          ownerProgram: programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ PDA delegated to TEE. Tx: ${tx}`);
      return tx;
    },
    [baseProgram, wallet.publicKey]
  );

  /** 3. Cast a private vote — sent to ephemeral RPC (inside TEE) */
  const castVote = useCallback(
    async (roundId: number, projectPubkey: PublicKey) => {
      if (!ephemeralProgram || !wallet.publicKey) throw new Error('Wallet not connected');
      const [memberVotePda] = getMemberVotePda(roundId, wallet.publicKey);

      const tx = await ephemeralProgram.methods
        .castVote(new BN(roundId), projectPubkey)
        .accounts({
          memberVote: memberVotePda,
          voter: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Vote cast for ${projectPubkey.toBase58()}. Tx: ${tx}`);
      return tx;
    },
    [ephemeralProgram, wallet.publicKey]
  );

  /** 4. Tally votes and reveal winner — sent to ephemeral RPC */
  const tallyAndReveal = useCallback(
    async (roundId: number, voter1: PublicKey, voter2: PublicKey) => {
      if (!ephemeralProgram || !wallet.publicKey) throw new Error('Wallet not connected');

      const [grantRoundPda] = getGrantRoundPda(roundId);
      const [vote1Pda] = getMemberVotePda(roundId, voter1);
      const [vote2Pda] = getMemberVotePda(roundId, voter2);

      // Permission PDAs are derived by the permission program
      const [permissionRound] = PublicKey.findProgramAddressSync(
        [grantRoundPda.toBuffer()],
        PERMISSION_PROGRAM_ID
      );
      const [permission1] = PublicKey.findProgramAddressSync(
        [vote1Pda.toBuffer()],
        PERMISSION_PROGRAM_ID
      );
      const [permission2] = PublicKey.findProgramAddressSync(
        [vote2Pda.toBuffer()],
        PERMISSION_PROGRAM_ID
      );

      const tx = await ephemeralProgram.methods
        .tallyAndReveal()
        .accounts({
          grantRound: grantRoundPda,
          vote1: vote1Pda,
          vote2: vote2Pda,
          permissionRound,
          permission1,
          permission2,
          payer: wallet.publicKey,
          permissionProgram: PERMISSION_PROGRAM_ID,
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
        })
        .rpc();

      console.log(`✅ Tally complete. Tx: ${tx}`);
      return tx;
    },
    [ephemeralProgram, wallet.publicKey]
  );

  /** Fetch grant round state from base chain */
  const fetchGrantRound = useCallback(
    async (roundId: number) => {
      if (!baseProgram) return null;
      const [grantRoundPda] = getGrantRoundPda(roundId);
      try {
        return await baseProgram.account.grantRound.fetch(grantRoundPda);
      } catch {
        return null;
      }
    },
    [baseProgram]
  );

  return {
    connected: !!wallet.publicKey,
    publicKey: wallet.publicKey,
    createGrantRound,
    delegatePda,
    castVote,
    tallyAndReveal,
    fetchGrantRound,
    getGrantRoundPda,
    getMemberVotePda,
  };
}
