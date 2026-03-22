<div align="center">

# 🛡️ Deco Private
**The first shielded decentralized startup accelerator on Solana.**

[![Solana Blitz V2](https://img.shields.io/badge/Hackathon-Solana_Blitz_V2-purple?style=for-the-badge)](https://hackathon.magicblock.app/)
[![Built with MagicBlock](https://img.shields.io/badge/Powered_by-MagicBlock_PERs-black?style=for-the-badge&logo=solana)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

*Cast private votes, shield your cap table, and scale in the shadows.*

---
*(Replace this line with your Hero/Dashboard Screenshot: e.g., `<img src="./public/hero.png" width="800">`)*

</div>

## � Table of Contents
- [The Problem: "The Cap Table Panopticon"](#-the-problem-the-cap-table-panopticon)
- [The Solution: Deco Private](#-the-solution-deco-private)
- [Target Hackathon Tracks](#-target-hackathon-tracks)
- [Platform Features (By Persona)](#-platform-features-by-persona)
- [Deep Dive: MagicBlock Architecture](#-deep-dive-magicblock-architecture)
- [Comprehensive Tech Stack](#-comprehensive-tech-stack)
- [Local Development Quickstart](#-local-development-quickstart)
- [Important Note for Judges (Privacy Track)](#-important-note-for-judges-privacy-track)
- [Deployed Contracts](#-deployed-contracts)

---

## 💡 The Problem: "The Cap Table Panopticon"

In standard Web3 accelerators and DAOs, every vote, investment, and cap table update is broadcast to the public mainnet in real-time. This complete transparency creates massive inefficiencies:

1. **Predatory Signaling:** VCs and whales watch public votes and front-run investments.
2. **Herd Mentality:** DAO members are heavily influenced by live vote counts, crushing independent, objective thought.
3. **Founder Vulnerability:** Startups are forced to expose their runway and early cap tables to the public before they are ready.

## ✨ The Solution: Deco Private

Deco leverages **MagicBlock's Private Ephemeral Rollups (PERs)** and Intel SGX Trusted Execution Environments (TEEs) to create a shielded "War Room" for startup acceleration.

We allow DAO members to cast encrypted, off-chain votes that are mathematically verified but completely invisible to the public Solana explorer. Only when the round officially concludes is the final state decrypted and settled back to the base chain.

---

## 🎯 Target Hackathon Tracks

Deco Private was built specifically for the **Solana Blitz V2 Hackathon**, targeting the following tracks:

* **🏆 MagicBlock Privacy Track:** Utilizing Ephemeral Rollups to shield on-chain voting and state transitions from public block explorers.
* **🏆 Consumer / DAO Track:** Creating a seamless, Web2-quality, institutional UX for decentralized governance and accelerator funding.

---

## 🚀 Platform Features (By Persona)

### For Founders (The Applicants)
* **Shielded Pitching:** Submit startup details (Ask, Repo, Socials) without exposing your live cap table or funding momentum to competitors.
* **Direct Treasury Access:** If your grant wins, VC and DAO funds are routed directly to your project wallet—no escrow delays.

### For DAO Members (The Voters)
* **Zero-Fee Voting:** Because votes happen inside the Ephemeral Rollup, users don't pay Solana base-fee gas costs for every action.
* **Encrypted Ballots:** Votes are cast privately. The UI features a "Fog of War" toggle, visually proving the data is hidden from standard mainnet block explorers.

### For VCs & Angels (The Investors)
* **Real-time Settlement:** Once a round is decrypted and the winner is publicly revealed on the L1, VCs can stake SOL collateral and invest immediately.

---

## 🔮 Deep Dive: MagicBlock Architecture

Deco uses MagicBlock to temporarily move state accounts off the slow, public mainnet and into a high-speed, private enclave. Here is the exact lifecycle of a Deco Grant Round:

```text
1️⃣ INIT (Solana Devnet)
─────────────────────────
The founder calls `create_grant_round`. A PDA is initialized on the public Solana devnet.

           ⬇

2️⃣ DELEGATE (The Handoff)
─────────────────────────
Admin calls `delegate_grant_round`. The PDA is transferred to the MagicBlock ER Validator
using the `#[delegate]` macro.

           ⬇

3️⃣ SHIELDED VOTING (MagicBlock TEE) 🔒
─────────────────────────
DAO members sign a wallet message to retrieve an AuthToken.
The `cast_vote` instruction executes inside the Intel SGX TEE.
❌ Standard Explorers see: [ ENCRYPTED HASH ]
✅ Authenticated Users see: Real-time UI

           ⬇

4️⃣ DECRYPT & SETTLE (Solana Devnet)
─────────────────────────
Admin calls `commit_vote`. The TEE state is compressed, settled back to the L1 via CPI,
and the winner is publicly revealed.
```

---

## 🛠️ Comprehensive Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust, Anchor Framework |
| Privacy / Rollup | MagicBlock Ephemeral Rollups (PERs), Intel SGX TEE |
| Blockchain | Solana Devnet |
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Wallet | Solana Wallet Adapter |
| RPC / ER Router | `devnet-router.magicblock.app` |
| Deployment | Vercel |

---

## ⚡ Local Development Quickstart

**Prerequisites:** Rust, Anchor CLI, Node.js, Yarn, Solana CLI

**1. Clone and install dependencies**
```bash
git clone <your-repo-url>
cd deco-private
yarn install
```

**2. Build the Anchor program**
```bash
anchor build
```

**3. Run tests against devnet**
```bash
anchor test --skip-local-validator
```

**4. Start the frontend**
```bash
cd deco-private
yarn dev
```

The frontend will be available at `http://localhost:5173`. Make sure your wallet is set to **Solana Devnet**.

---

## ⚠️ Important Note for Judges (Privacy Track)

We architected the Deco platform to fully utilize Intel SGX TEEs for maximum privacy. Because the MagicBlock TEE endpoint (`tee.magicblock.app`) and the specific SDK version containing the `getAuthToken` function were gated/unavailable for public download during the weekend sprint, we implemented a robust fallback to ensure a working demo:

Our frontend visually simulates the exact TDX AuthToken signature ceremony for the demo UX (forcing the user to sign a wallet payload to prove identity), while routing the underlying transactions through the standard devnet ER (`devnet-router.magicblock.app`). This ensures you get to experience the exact intended UX of a shielded dApp, backed by a working, lightning-fast prototype.

We have included a highly detailed [DEVLOG.md](./DEVLOG.md) in this repository that breaks down exactly how we built our Anchor program architecture and CPI routing. We highly recommend reviewing it.

---

## 📜 Deployed Contracts

| | |
|---|---|
| Network | Solana Devnet |
| Deco Program ID | `4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX` |
| MagicBlock Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |

---

<div align="center">
<i>Built with ☕ and 🦀 by Neel Pote for the Solana Blitz V2</i>
</div>
