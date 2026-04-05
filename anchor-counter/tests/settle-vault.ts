/**
 * AlphaVault — Off-Chain Yield Settlement Integration Test
 *
 * Math (10 SOL deposit, 20% profit, 10% fee):
 *   gross_profit        = 10 x 20%  = 2.0 SOL
 *   manager_fee         = 2.0 x 10% = 0.2 SOL  (kept by manager)
 *   net_yield_to_escrow = 2.0 - 0.2 = 1.8 SOL  (manager deposits)
 *   escrow after settle = 10 + 1.8  = 11.8 SOL
 *   investor withdraws              = 11.8 SOL
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction,
} from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VAULT_SEED    = Buffer.from("alpha_vault");
const ESCROW_SEED   = Buffer.from("alpha_escrow");
const POSITION_SEED = Buffer.from("alpha_position");
const PROGRAM_ID    = new PublicKey("3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7");
const RPC           = "https://api.devnet.solana.com";
const IDL           = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../target/idl/alpha_vault.json"), "utf8")
);

function getVaultPdas(managerKey: PublicKey) {
  const [vault]  = PublicKey.findProgramAddressSync([VAULT_SEED,  managerKey.toBytes()], PROGRAM_ID);
  const [escrow] = PublicKey.findProgramAddressSync([ESCROW_SEED, managerKey.toBytes()], PROGRAM_ID);
  return { vault, escrow };
}

function getPositionPda(vaultKey: PublicKey, investorKey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, vaultKey.toBytes(), investorKey.toBytes()], PROGRAM_ID
  )[0];
}

function makeProgram(conn: Connection, kp: Keypair): anchor.Program {
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" });
  return new anchor.Program(IDL, provider);
}

async function transfer(conn: Connection, from: Keypair, to: PublicKey, lamports: number) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })
  );
  const bh = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = from.publicKey;
  tx.sign(from);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(
    { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    "confirmed"
  );
}

describe("AlphaVault — Off-Chain Yield Settlement", () => {
  const conn     = new Connection(RPC, "confirmed");
  const payer    = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf8")))
  );
  const manager  = Keypair.generate();
  const investor = Keypair.generate();

  const { vault: vaultPda, escrow: escrowPda } = getVaultPdas(manager.publicKey);
  const positionPda = getPositionPda(vaultPda, investor.publicKey);

  let mProg: anchor.Program;
  let iProg: anchor.Program;

  before(async () => {
    mProg = makeProgram(conn, manager);
    iProg = makeProgram(conn, investor);

    // Fund manager (3 SOL) and investor (11 SOL) in one transaction
    const tx = new Transaction()
      .add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: manager.publicKey,  lamports: 3 * LAMPORTS_PER_SOL }))
      .add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: investor.publicKey, lamports: 11 * LAMPORTS_PER_SOL }));
    const bh = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed"
    );

    console.log("  Manager :", manager.publicKey.toBase58());
    console.log("  Investor:", investor.publicKey.toBase58());
    console.log("  Vault   :", vaultPda.toBase58());
    console.log("  Escrow  :", escrowPda.toBase58());
  });

  // T1 ─────────────────────────────────────────────────────────────────────────
  it("T1 — creates vault with 10% performance fee", async () => {
    const sig = await mProg.methods
      .createVault(1000, "Yield Test Vault")
      .accounts({ manager: manager.publicKey })
      .rpc({ skipPreflight: false, commitment: "confirmed" });

    const v = await (mProg.account as any).strategyVault.fetch(vaultPda);
    assert.equal(v.feeBps, 1000, "fee_bps = 1000");
    assert.deepEqual(v.status, { active: {} }, "status = Active");
    assert.equal(
      Buffer.from(v.name as number[]).toString("utf8").replace(/\0/g, ""),
      "Yield Test Vault"
    );
    console.log("  sig:", sig.slice(0, 20));
  });

  // T2 ─────────────────────────────────────────────────────────────────────────
  it("T2 — investor deposits exactly 10 SOL", async () => {
    const DEPOSIT = 10 * LAMPORTS_PER_SOL;
    const escrowBefore = await conn.getBalance(escrowPda);

    const sig = await iProg.methods
      .deposit(new BN(DEPOSIT))
      .accounts({ strategyVault: vaultPda, escrow: escrowPda, investor: investor.publicKey })
      .rpc({ skipPreflight: false, commitment: "confirmed" });

    const escrowAfter = await conn.getBalance(escrowPda);
    const v   = await (mProg.account as any).strategyVault.fetch(vaultPda);
    const pos = await (mProg.account as any).investorPosition.fetch(positionPda);

    assert.equal(escrowAfter - escrowBefore, DEPOSIT, "escrow +10 SOL");
    assert.equal(v.totalDeposits.toNumber(), DEPOSIT, "total_deposits = 10 SOL");
    assert.equal(pos.shares.toNumber(), DEPOSIT, "shares = deposit (1:1 first depositor)");
    assert.equal(pos.depositLamports.toNumber(), DEPOSIT, "deposit_lamports = 10 SOL");
    console.log("  sig:", sig.slice(0, 20), "| escrow:", escrowAfter / LAMPORTS_PER_SOL, "SOL");
  });

  // T3 ─────────────────────────────────────────────────────────────────────────
  it("T3 — manager settles vault reporting +20% profit, deposits 1.8 SOL net yield", async () => {
    const DEPOSIT         = 10 * LAMPORTS_PER_SOL;
    const NET_YIELD       = 1.8 * LAMPORTS_PER_SOL;
    const EXPECTED_ESCROW = DEPOSIT + NET_YIELD; // 11.8 SOL

    const escrowBefore     = await conn.getBalance(escrowPda);
    const managerBalBefore = await conn.getBalance(manager.publicKey);
    assert.equal(escrowBefore, DEPOSIT, "escrow = 10 SOL before settle");

    const sig = await mProg.methods
      .settleVault(new BN(2000))
      .accounts({ strategyVault: vaultPda, escrow: escrowPda, manager: manager.publicKey })
      .rpc({ skipPreflight: false, commitment: "confirmed" });

    const escrowAfter     = await conn.getBalance(escrowPda);
    const managerBalAfter = await conn.getBalance(manager.publicKey);
    const v               = await (mProg.account as any).strategyVault.fetch(vaultPda);
    const managerDecrease = managerBalBefore - managerBalAfter;

    assert.equal(escrowAfter, EXPECTED_ESCROW,
      `escrow = 11.8 SOL, got ${escrowAfter / LAMPORTS_PER_SOL}`);
    assert.isAtLeast(managerDecrease, NET_YIELD,
      `manager paid >= 1.8 SOL, paid ${managerDecrease / LAMPORTS_PER_SOL}`);
    assert.isAtMost(managerDecrease, NET_YIELD + 0.01 * LAMPORTS_PER_SOL,
      "manager paid <= 1.81 SOL");
    assert.equal(v.performanceBps.toNumber(), 2000, "performance_bps = 2000");
    assert.deepEqual(v.status, { settled: {} }, "status = Settled");

    console.log("  sig:", sig.slice(0, 20));
    console.log("  escrow:", escrowAfter / LAMPORTS_PER_SOL, "SOL (expected 11.8)");
    console.log("  manager decrease:", managerDecrease / LAMPORTS_PER_SOL, "SOL (expected ~1.8)");
    console.log("  performance_bps:", v.performanceBps.toNumber());
  });

  // T4 ─────────────────────────────────────────────────────────────────────────
  it("T4 — investor withdraws and receives exactly 11.8 SOL", async () => {
    const EXPECTED_PAYOUT   = 11.8 * LAMPORTS_PER_SOL;
    const escrowBefore      = await conn.getBalance(escrowPda);
    const investorBalBefore = await conn.getBalance(investor.publicKey);
    assert.equal(escrowBefore, EXPECTED_PAYOUT, "escrow = 11.8 SOL before withdraw");

    const sig = await iProg.methods
      .withdrawPosition()
      .accounts({
        strategyVault:    vaultPda,
        escrow:           escrowPda,
        investorPosition: positionPda,
        investor:         investor.publicKey,
      })
      .rpc({ skipPreflight: false, commitment: "confirmed" });

    const investorBalAfter = await conn.getBalance(investor.publicKey);
    const escrowAfter      = await conn.getBalance(escrowPda);
    const received         = investorBalAfter - investorBalBefore;

    assert.isAtLeast(received, EXPECTED_PAYOUT - 0.01 * LAMPORTS_PER_SOL,
      `investor received >= 11.79 SOL, got ${received / LAMPORTS_PER_SOL}`);
    assert.isAtMost(received, EXPECTED_PAYOUT,
      "investor received <= 11.8 SOL");
    assert.equal(escrowAfter, 0, "escrow = 0 after full withdrawal");

    console.log("  sig:", sig.slice(0, 20));
    console.log("  investor received:", received / LAMPORTS_PER_SOL, "SOL (expected ~11.8)");
    console.log("  escrow:", escrowAfter, "lamports (expected 0)");
  });

  // T5 ─────────────────────────────────────────────────────────────────────────
  it("T5 — settle with loss (-10%) updates state, no yield deposit required", async () => {
    // Reuse manager/investor with a second vault — manager creates from investor keypair
    const m2 = Keypair.generate();
    const i2 = investor; // reuse funded investor wallet
    // Fund m2 from investor (investor has ~0.8 SOL left after deposit+withdraw)
    await transfer(conn, investor, m2.publicKey, 200_000_000);

    const { vault: v2Pda, escrow: e2Pda } = getVaultPdas(m2.publicKey);
    const m2Prog = makeProgram(conn, m2);
    const i2Prog = makeProgram(conn, i2);

    await m2Prog.methods.createVault(1000, "Loss Test")
      .accounts({ manager: m2.publicKey })
      .rpc({ commitment: "confirmed" });

    await i2Prog.methods.deposit(new BN(100_000_000))
      .accounts({ strategyVault: v2Pda, escrow: e2Pda, investor: i2.publicKey })
      .rpc({ commitment: "confirmed" });

    const escrowBefore = await conn.getBalance(e2Pda);
    const m2BalBefore  = await conn.getBalance(m2.publicKey);

    await m2Prog.methods.settleVault(new BN(-1000))
      .accounts({ strategyVault: v2Pda, escrow: e2Pda, manager: m2.publicKey })
      .rpc({ commitment: "confirmed" });

    const escrowAfter = await conn.getBalance(e2Pda);
    const m2BalAfter  = await conn.getBalance(m2.publicKey);
    const v2          = await (m2Prog.account as any).strategyVault.fetch(v2Pda);

    assert.equal(escrowAfter, escrowBefore, "escrow unchanged on loss");
    assert.isAtMost(m2BalBefore - m2BalAfter, 0.01 * LAMPORTS_PER_SOL,
      "manager only pays tx fee on loss");
    assert.equal(v2.performanceBps.toNumber(), -1000, "performance_bps = -1000");
    assert.deepEqual(v2.status, { settled: {} });
    console.log("  loss settle: escrow unchanged, perf_bps =", v2.performanceBps.toNumber());
  });

  // T6 ─────────────────────────────────────────────────────────────────────────
  it("T6 — rejects settle if manager cannot cover net yield", async () => {
    const poorMgr = Keypair.generate();
    // Fund poorMgr from manager (manager has ~1.1 SOL left)
    await transfer(conn, manager, poorMgr.publicKey, 200_000_000);

    const { vault: pVault, escrow: pEscrow } = getVaultPdas(poorMgr.publicKey);
    const poorProg  = makeProgram(conn, poorMgr);
    const payerProg = makeProgram(conn, payer);

    await poorProg.methods.createVault(1000, "Poor Vault")
      .accounts({ manager: poorMgr.publicKey })
      .rpc({ commitment: "confirmed" });

    await payerProg.methods.deposit(new BN(100_000_000))
      .accounts({ strategyVault: pVault, escrow: pEscrow, investor: payer.publicKey })
      .rpc({ commitment: "confirmed" });

    let threw = false;
    try {
      // +10000% on 0.1 SOL = 10 SOL net yield needed — poorMgr only has ~0.09 SOL
      await poorProg.methods.settleVault(new BN(100000))
        .accounts({ strategyVault: pVault, escrow: pEscrow, manager: poorMgr.publicKey })
        .rpc({ skipPreflight: false, commitment: "confirmed" });
    } catch (e: any) {
      if (
        e.message?.includes("InsufficientYieldDeposit") ||
        e.logs?.some((l: string) => l.includes("InsufficientYieldDeposit"))
      ) {
        threw = true;
      } else {
        throw e;
      }
    }
    assert.isTrue(threw, "should throw InsufficientYieldDeposit");
    console.log("  correctly rejected: InsufficientYieldDeposit");
  });
});
