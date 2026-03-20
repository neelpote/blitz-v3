// Auto-synced from target/idl/deco_private.json
export const PROGRAM_ID = "4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX";

export const MAGIC_PROGRAM  = "Magic11111111111111111111111111111111111111";
export const MAGIC_CONTEXT  = "MagicContext1111111111111111111111111111111";
export const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
export const PERMISSION_PROGRAM = "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1";

// Magic Router — single endpoint that auto-routes to ER or base chain
export const MAGIC_ROUTER_RPC = "https://devnet-router.magicblock.app";

export const IDL = {
  version: "0.1.0",
  name: "deco_private",
  instructions: [
    // ── Base chain ──────────────────────────────────────────────────────────
    {
      name: "createGrantRound",
      accounts: [
        { name: "grantRound",     isMut: true,  isSigner: false },
        { name: "authority",      isMut: true,  isSigner: true  },
        { name: "systemProgram",  isMut: false, isSigner: false },
      ],
      args: [{ name: "roundId", type: "u64" }],
    },
    // ── Base chain — init vote PDA, then delegate to ER ────────────────────
    {
      name: "castVote",
      accounts: [
        { name: "memberVote",    isMut: true,  isSigner: false },
        { name: "voter",         isMut: true,  isSigner: true  },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "roundId",       type: "u64"       },
        { name: "projectPubkey", type: "publicKey" },
      ],
    },
    // ── Base chain — delegate a PDA to the ER ─────────────────────────────
    {
      name: "delegatePda",
      accounts: [
        { name: "bufferPda",           isMut: true,  isSigner: false },
        { name: "delegationRecordPda", isMut: true,  isSigner: false },
        { name: "delegationMetadataPda", isMut: true, isSigner: false },
        { name: "pda",                 isMut: true,  isSigner: false },
        { name: "payer",               isMut: false, isSigner: true  },
        { name: "validator",           isMut: false, isSigner: false, isOptional: true },
        { name: "ownerProgram",        isMut: false, isSigner: false },
        { name: "delegationProgram",   isMut: false, isSigner: false },
        { name: "systemProgram",       isMut: false, isSigner: false },
      ],
      args: [
        {
          name: "accountType",
          type: {
            defined: "AccountType",
          },
        },
      ],
    },
    // ── ER — commit + undelegate vote back to base chain ──────────────────
    {
      name: "tallyAndReveal",
      accounts: [
        { name: "grantRound",      isMut: true,  isSigner: false },
        { name: "vote1",           isMut: true,  isSigner: false },
        { name: "vote2",           isMut: true,  isSigner: false },
        { name: "permissionRound", isMut: true,  isSigner: false },
        { name: "permission1",     isMut: true,  isSigner: false },
        { name: "permission2",     isMut: true,  isSigner: false },
        { name: "payer",           isMut: true,  isSigner: true  },
        { name: "permissionProgram", isMut: false, isSigner: false },
        { name: "magicProgram",    isMut: false, isSigner: false },
        { name: "magicContext",    isMut: true,  isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "GrantRound",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId",  type: "u64"                    },
          { name: "isActive", type: "bool"                   },
          { name: "winner",   type: { option: "publicKey" }  },
        ],
      },
    },
    {
      name: "MemberVote",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId",   type: "u64"                   },
          { name: "voter",     type: "publicKey"             },
          { name: "votedFor",  type: { option: "publicKey" } },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "AlreadyVoted",   msg: "You have already cast your vote." },
    { code: 6001, name: "RoundNotActive", msg: "Grant round is not active."       },
    { code: 6002, name: "NoVotes",        msg: "No votes have been cast."         },
  ],
  types: [
    {
      name: "AccountType",
      type: {
        kind: "enum",
        variants: [
          { name: "GrantRound", fields: [{ name: "roundId", type: "u64" }] },
          { name: "MemberVote", fields: [{ name: "roundId", type: "u64" }, { name: "voter", type: "publicKey" }] },
        ],
      },
    },
  ],
} as const;
