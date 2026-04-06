# AlphaVault

**Shielded Strategy Vaults on Solana — Powered by MagicBlock Ephemeral Rollups & TEE**

> Built for the Solana Frontier Hackathon 2025

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=flat-square)](https://app-fdzwmfrbu-neelpote96-9476s-projects.vercel.app)
[![Program](https://img.shields.io/badge/Program-Devnet-9945FF?style=flat-square)](https://explorer.solana.com/address/3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7?cluster=devnet)
[![MagicBlock](https://img.shields.io/badge/Powered%20by-MagicBlock-blue?style=flat-square)](https://magicblock.gg)

---

## The Problem

If you deploy a profitable trading algorithm on a public blockchain, you have a fatal flaw: **everything is visible**.

- Competitors watch your wallet and copy every trade for free
- MEV bots see your transactions in the mempool and front-run them
- Your edge evaporates the moment it's on-chain

This is why serious institutional traders keep their algorithms off-chain. Standard DeFi is too transparent for high-level finance.

## The Solution

AlphaVault is a **shielded strategy vault marketplace**. Think of it like the master chef analogy:

> A chef wants investors to fund their restaurant. Investors say "prove your food is good." The chef says "if I give you the recipe, you'll steal it."

AlphaVault solves this. A strategy manager can prove they generated **+20% returns** without revealing a single trade. Investors see a mathematically verified performance certificate — not the algorithm.

**How?** MagicBlock's Trusted Execution Environment (TEE) runs the trading logic inside secure hardware. The TEE generates cryptographic attestations of performance. Investors verify the proof, not the strategy.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        INVESTOR                              │
│  1. Browse vaults (values encrypted in public mode)         │
│  2. Authenticate with TEE → performance decrypts            │
│  3. Deposit SOL → receives proportional shares              │
└──────────────────────────┬──────────────────────────────────┘
                           │ SOL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SOLANA L1 (Anchor Program)                      │
│  StrategyVault PDA  ←→  Escrow PDA (lamport sink)           │
│  InvestorPosition PDA (per investor)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ delegate_vault()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         MAGICBLOCK PRIVATE EPHEMERAL ROLLUP (TEE)            │
│  tee.magicblock.app — Intel TDX hardware                     │
│  record_trade() — gasless, ~50ms, shielded                   │
│  Performance updates visible only to authenticated wallets   │
└──────────────────────────┬──────────────────────────────────┘
                           │ settle_vault() → commit back to L1
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SETTLEMENT (L1)                                 │
│  Manager deposits net yield → escrow                        │
│  Performance fee deducted                                    │
│  Investors withdraw proportional share                       │
└─────────────────────────────────────────────────────────────┘
```

### MagicBlock Stack Used

| Component | Endpoint | Purpose |
|-----------|----------|---------|
| Ephemeral Rollup Router | `devnet-router.magicblock.app` | Route ER transactions |
| Private ER (TEE) | `tee.magicblock.app` | Shielded trade execution |
| TEE Auth | `tee.magicblock.app/auth/*` | Hardware attestation + JWT |
| L1 RPC | `rpc.magicblock.app/devnet` | Solana devnet node |

---

## Smart Contract

**Program ID:** `3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7`  
**Network:** Solana Devnet  
**Framework:** Anchor 0.32.1

### Account Structure

```rust
// StrategyVault PDA — seeds: [b"alpha_vault", manager_pubkey]
pub struct StrategyVault {
    pub manager:          Pubkey,   // strategy operator
    pub total_deposits:   u64,      // total SOL deposited (lamports)
    pub total_shares:     u64,      // total share units issued
    pub performance_bps:  i64,      // signed P&L in basis points (+2000 = +20%)
    pub fee_bps:          u16,      // performance fee (max 50%)
    pub status:           VaultStatus, // Active | Paused | Settled
    pub escrow_bump:      u8,
    pub name:             [u8; 32], // strategy name
    pub trade_count:      u32,
}

// InvestorPosition PDA — seeds: [b"alpha_position", vault, investor]
pub struct InvestorPosition {
    pub vault:             Pubkey,
    pub investor:          Pubkey,
    pub deposit_lamports:  u64,
    pub shares:            u64,
    pub entry_performance: i64,
}
```

### Instructions

| Instruction | Layer | Description |
|-------------|-------|-------------|
| `create_vault(fee_bps, name)` | L1 | Manager deploys a new strategy vault |
| `deposit(amount)` | L1 | Investor deposits SOL, receives proportional shares |
| `delegate_vault()` | L1 → ER | Moves vault PDA to MagicBlock TEE |
| `record_trade(delta_bps)` | ER/TEE | Manager records trade result — shielded, gasless |
| `settle_vault(reported_performance_bps)` | L1 | Manager deposits net yield, vault marked Settled |
| `withdraw_position()` | L1 | Investor withdraws proportional share |

### Settlement Math

```
gross_profit        = total_deposits × reported_performance_bps / 10_000
manager_fee         = gross_profit × fee_bps / 10_000
net_yield_to_escrow = gross_profit - manager_fee  (manager deposits this)
investor_payout     = escrow_balance × investor_shares / total_shares
```

**Example:** 10 SOL deposited, +20% profit, 10% fee:
- Gross profit: 2.0 SOL
- Manager fee: 0.2 SOL (kept by manager)
- Net yield deposited: 1.8 SOL
- Escrow after settle: 11.8 SOL
- Investor receives: 11.8 SOL

---

## TEE Authentication Flow

The TEE (Trusted Execution Environment) is what makes order values private. Here's exactly what happens when you click "TEE Auth":

```
1. verifyTeeRpcIntegrity(TEE_URL)
   → Sends 32-byte random challenge to tee.magicblock.app
   → Receives Intel TDX quote
   → Verifies quote via DCAP QVL WASM (Phala PCCS)
   → Confirms server is running on genuine secure hardware

2. getAuthToken(TEE_URL, publicKey, signMessage)
   → Fetches challenge from /auth/challenge?pubkey=<wallet>
   → Wallet signs the challenge string
   → Posts { pubkey, challenge, signature } to /auth/login
   → Receives JWT token

3. new Connection(`${TEE_URL}?token=${jwt}`)
   → All subsequent reads go through authenticated TEE connection
   → Performance data decrypts
   → "Fill Order" / "Invest" buttons unlock
```

---

## Frontend

Built with React + Anchor + MagicBlock SDK. Styled after the [DeCo](https://github.com/neelpote/deco-combinator) design system — white/black, sharp corners, no gradients.

### Pages

**Vaults** — Browse all strategy vaults. In Public mode, performance numbers are blurred. After TEE Auth, they decrypt and the Invest button appears.

**Manage** — For strategy managers. Three-step flow:
1. Create vault (set name + performance fee)
2. Delegate to ER (moves PDA to TEE)
3. Record trades (gasless, shielded) → Settle (deposits yield to escrow)

**About** — Full explanation of the AlphaVault concept, architecture, and MagicBlock integration.

### Key Components

```
src/
├── hooks/
│   └── useAlphaVault.ts     # All Anchor + MagicBlock integration
├── components/
│   ├── VaultCard.tsx         # Vault display with encrypted/decrypted values
│   ├── CreateVaultModal.tsx  # Vault creation form
│   ├── DepositModal.tsx      # Investor deposit form
│   ├── ManagerPanel.tsx      # Delegate → Record → Settle flow
│   └── ViewModeToggle.tsx    # Public / TEE Auth toggle
└── idl/
    └── alpha_vault.json      # Generated Anchor IDL
```

---

## Tests

Integration tests run against Solana Devnet. All 6 pass:

```
AlphaVault — Off-Chain Yield Settlement
  ✓ T1 — creates vault with 10% performance fee
  ✓ T2 — investor deposits exactly 10 SOL
  ✓ T3 — manager settles vault reporting +20% profit, deposits 1.8 SOL net yield
  ✓ T4 — investor withdraws and receives exactly 11.8 SOL
  ✓ T5 — settle with loss (-10%) updates state, no yield deposit required
  ✓ T6 — rejects settle if manager cannot cover net yield (InsufficientYieldDeposit)

6 passing
```

Run them:
```bash
cd anchor-counter
anchor test --skip-build --skip-deploy --provider.cluster devnet
```

---

## Local Setup

### Prerequisites

- Rust + Cargo
- Solana CLI (`~1.18`)
- Anchor CLI (`0.32.1`)
- Node.js 18+
- A Solana wallet with devnet SOL

### 1. Clone

```bash
git clone https://github.com/neelpote/blitz-v3
cd blitz-v3/magicblock-engine-examples/anchor-counter
```

### 2. Build & Deploy the Program

```bash
# Build
anchor build

# Deploy to devnet (needs ~2.5 SOL for program account)
solana program deploy target/deploy/anchor_counter.so \
  --url https://rpc.magicblock.app/devnet \
  --program-id target/deploy/anchor_counter-keypair.json

# Upgrade IDL
anchor idl upgrade 3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7 \
  --filepath target/idl/alpha_vault.json \
  --provider.cluster devnet
```

### 3. Run the Frontend

```bash
cd app/app
npm install
npm start
```

Open `http://localhost:3000`

### 4. Fund Your Wallet

Make sure your Phantom wallet is set to **Solana Devnet** and has SOL. If not:

```bash
# Get your Phantom address from browser console: window.solana.publicKey.toString()
solana airdrop 2 <YOUR_PHANTOM_ADDRESS> --url https://rpc.magicblock.app/devnet
```

---

## How to Use

### As a Strategy Manager

1. Connect wallet → go to **Manage** tab
2. Click **Create Vault** → set name and performance fee (0–50%)
3. Wait for investors to deposit
4. Click **Delegate ER** → vault moves to MagicBlock TEE
5. Click **Record Trade** → enter `delta_bps` (e.g. `500` = +5%, `-200` = -2%)
6. When ready to settle → click **Settle Vault** → you deposit the net yield from your wallet

### As an Investor

1. Connect wallet → go to **Vaults** tab
2. Click **TEE Auth** → sign the challenge with your wallet
3. Performance numbers decrypt, **Invest** buttons appear
4. Click **Invest** on any Active vault → enter SOL amount
5. After the vault settles → **Withdraw** button appears → click to receive your share

---

## Project Structure

```
magicblock-engine-examples/
└── anchor-counter/
    ├── programs/anchor-counter/src/lib.rs   # Anchor smart contract
    ├── tests/settle-vault.ts                # Integration tests
    ├── Anchor.toml                          # Anchor config
    ├── Cargo.toml                           # Rust workspace
    └── app/app/                             # React frontend
        ├── src/
        │   ├── App.tsx                      # Main app + routing
        │   ├── hooks/useAlphaVault.ts       # Full blockchain integration
        │   ├── components/                  # UI components
        │   └── idl/alpha_vault.json         # Program IDL
        ├── tailwind.config.js
        └── vercel.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Rust, Anchor 0.32.1 |
| Ephemeral Rollup | MagicBlock ER SDK 0.6.5 |
| TEE Privacy | MagicBlock Private ER (Intel TDX) |
| Frontend | React 18, TypeScript, Tailwind CSS |
| Wallet | Phantom / Solflare (via wallet-adapter) |
| Deployment | Vercel (frontend), Solana Devnet (program) |

---

## Deployed Addresses

| Resource | Address |
|----------|---------|
| Program ID | `3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7` |
| IDL Account | `3A733HiY8NkgEAw22QGrYr4Vn254jAj4eQoHe4QzQAmU` |
| Network | Solana Devnet |
| Frontend | https://app-fdzwmfrbu-neelpote96-9476s-projects.vercel.app |

---

## Why MagicBlock?

Standard Solana is 100% public. Every trade, every position, every strategy is visible to anyone with an RPC connection. AlphaVault uses MagicBlock's stack to solve this:

- **Ephemeral Rollups** — trade recording runs gasless at ~50ms inside the ER, without leaving the Solana ecosystem
- **Private ER (TEE)** — the vault state is encrypted inside Intel TDX hardware. Only wallets with a valid JWT (obtained by signing a challenge) can read decrypted values
- **Hardware Attestation** — `verifyTeeRpcIntegrity` proves the server is running on genuine secure hardware, not a fake. The TDX quote is verified via DCAP QVL
- **L1 Settlement** — when a vault settles, the ER commits state back to Solana L1 atomically. No trust, no intermediary

---
Thanks for reading
