// Auto-derived IDL for deco_private Anchor program
// Program ID: 9SBBpJa9rd8DRP6tkcqnyad4LaCWWB3FgSFmZ2tFVhq

export const PROGRAM_ID = "9SBBpJa9rd8DRP6tkcqnyad4LaCWWB3FgSFmZ2tFVhq";

export const IDL = {
  version: "0.1.0",
  name: "deco_private",
  instructions: [
    {
      name: "createGrantRound",
      accounts: [
        { name: "grantRound", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "roundId", type: "u64" }],
    },
    {
      name: "castVote",
      accounts: [
        { name: "memberVote", isMut: true, isSigner: false },
        { name: "voter", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "roundId", type: "u64" },
        { name: "projectPubkey", type: "publicKey" },
      ],
    },
    {
      name: "tallyAndReveal",
      accounts: [
        { name: "grantRound", isMut: true, isSigner: false },
        { name: "vote1", isMut: true, isSigner: false },
        { name: "vote2", isMut: true, isSigner: false },
        { name: "permissionRound", isMut: true, isSigner: false },
        { name: "permission1", isMut: true, isSigner: false },
        { name: "permission2", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "permissionProgram", isMut: false, isSigner: false },
        { name: "magicProgram", isMut: false, isSigner: false },
        { name: "magicContext", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "delegatePda",
      accounts: [
        { name: "pda", isMut: true, isSigner: false },
        { name: "payer", isMut: false, isSigner: true },
        { name: "validator", isMut: false, isSigner: false, isOptional: true },
        { name: "ownerProgram", isMut: false, isSigner: false },
        { name: "buffer", isMut: true, isSigner: false },
        { name: "delegationRecord", isMut: true, isSigner: false },
        { name: "delegationMetadata", isMut: true, isSigner: false },
        { name: "delegationProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "accountType", type: { defined: "AccountType" } }],
    },
  ],
  accounts: [
    {
      name: "GrantRound",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId", type: "u64" },
          { name: "isActive", type: "bool" },
          { name: "winner", type: { option: "publicKey" } },
        ],
      },
    },
    {
      name: "MemberVote",
      type: {
        kind: "struct",
        fields: [
          { name: "roundId", type: "u64" },
          { name: "voter", type: "publicKey" },
          { name: "votedFor", type: { option: "publicKey" } },
        ],
      },
    },
  ],
  types: [
    {
      name: "AccountType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "GrantRound",
            fields: [{ name: "roundId", type: "u64" }],
          },
          {
            name: "MemberVote",
            fields: [
              { name: "roundId", type: "u64" },
              { name: "voter", type: "publicKey" },
            ],
          },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "AlreadyVoted", msg: "You have already cast your vote." },
    { code: 6001, name: "RoundNotActive", msg: "Grant round is not active." },
    { code: 6002, name: "NoVotes", msg: "No votes have been cast." },
  ],
} as const;
