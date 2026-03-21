// Synced with @coral-xyz/anchor v0.30+ IDL format (new spec)
export const PROGRAM_ID        = "4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX";
export const MAGIC_PROGRAM     = "Magic11111111111111111111111111111111111111";
export const MAGIC_CONTEXT     = "MagicContext1111111111111111111111111111111";
export const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
export const PERMISSION_PROGRAM = "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1";
export const MAGIC_ROUTER_RPC  = "https://devnet-router.magicblock.app";

export const IDL = {
  address: "4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX",
  metadata: { name: "deco_private", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "createGrantRound",
      discriminator: [178, 206, 10, 217, 100, 94, 125, 197],
      accounts: [
        { name: "grantRound",    writable: true  },
        { name: "authority",     writable: true,  signer: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [{ name: "roundId", type: "u64" }],
    },
    {
      name: "castVote",
      discriminator: [20, 212, 15, 189, 69, 180, 69, 151],
      accounts: [
        { name: "memberVote",    writable: true  },
        { name: "voter",         writable: true,  signer: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "roundId",       type: "u64"    },
        { name: "projectPubkey", type: "pubkey" },
      ],
    },
    {
      name: "delegatePda",
      discriminator: [248, 217, 193, 46, 124, 191, 64, 135],
      accounts: [
        { name: "bufferPda",             writable: true  },
        { name: "delegationRecordPda",   writable: true  },
        { name: "delegationMetadataPda", writable: true  },
        { name: "pda",                   writable: true  },
        { name: "payer",                 signer: true    },
        { name: "validator",             optional: true  },
        { name: "ownerProgram",          address: "4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX" },
        { name: "delegationProgram",     address: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh" },
        { name: "systemProgram",         address: "11111111111111111111111111111111" },
      ],
      args: [
        {
          name: "accountType",
          type: { defined: { name: "AccountType" } },
        },
      ],
    },
    {
      name: "tallyAndReveal",
      discriminator: [232, 52, 247, 82, 211, 45, 13, 27],
      accounts: [
        { name: "grantRound",      writable: true },
        { name: "vote1",           writable: true },
        { name: "vote2",           writable: true },
        { name: "permissionRound", writable: true },
        { name: "permission1",     writable: true },
        { name: "permission2",     writable: true },
        { name: "payer",           writable: true, signer: true },
        { name: "permissionProgram", address: "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1" },
        { name: "magicProgram",    address: "Magic11111111111111111111111111111111111111" },
        { name: "magicContext",    writable: true, address: "MagicContext1111111111111111111111111111111" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "GrantRound", discriminator: [57, 109, 151, 14, 8, 69, 188, 47] },
    { name: "MemberVote", discriminator: [211, 123, 133, 175, 95, 47, 54, 106] },
  ],
  errors: [
    { code: 6000, name: "AlreadyVoted",   msg: "You have already cast your vote." },
    { code: 6001, name: "RoundNotActive", msg: "Grant round is not active."       },
    { code: 6002, name: "NoVotes",        msg: "No votes have been cast."         },
  ],
  types: [
    {
      name: "GrantRound",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId",  type: "u64"                   },
          { name: "isActive", type: "bool"                  },
          { name: "winner",   type: { option: "pubkey" }    },
        ],
      },
    },
    {
      name: "MemberVote",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId",  type: "u64"                   },
          { name: "voter",    type: "pubkey"                 },
          { name: "votedFor", type: { option: "pubkey" }    },
        ],
      },
    },
    {
      name: "AccountType",
      type: {
        kind: "enum",
        variants: [
          { name: "GrantRound", fields: [{ name: "roundId", type: "u64" }] },
          { name: "MemberVote", fields: [{ name: "roundId", type: "u64" }, { name: "voter", type: "pubkey" }] },
        ],
      },
    },
  ],
} as const;
