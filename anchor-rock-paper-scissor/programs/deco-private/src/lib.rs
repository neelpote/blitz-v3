use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpiBuilder, UpdatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("9SBBpJa9rd8DRP6tkcqnyad4LaCWWB3FgSFmZ2tFVhq");

pub const MEMBER_VOTE_SEED: &[u8] = b"member_vote";
pub const GRANT_ROUND_SEED: &[u8] = b"grant_round";

#[ephemeral]
#[program]
pub mod deco_private {

    use super::*;

    // 1️⃣ Create a new grant round
    pub fn create_grant_round(ctx: Context<CreateGrantRound>, round_id: u64) -> Result<()> {
        let round = &mut ctx.accounts.grant_round;

        round.round_id = round_id;
        round.is_active = true;
        round.winner = None;

        msg!("Grant Round ID: {}", round_id);
        msg!("Grant Round PDA: {}", round.key());

        Ok(())
    }

    // 2️⃣ Cast a vote for a startup project
    pub fn cast_vote(
        ctx: Context<CastVote>,
        round_id: u64,
        project_pubkey: Pubkey,
    ) -> Result<()> {
        let vote = &mut ctx.accounts.member_vote;
        require!(vote.voted_for.is_none(), DecoError::AlreadyVoted);

        // Initialise fields on first write (init_if_needed pattern)
        vote.round_id = round_id;
        vote.voter = ctx.accounts.voter.key();
        vote.voted_for = Some(project_pubkey);

        msg!(
            "Voter {:?} voted for project {:?}",
            vote.voter,
            vote.voted_for
        );

        Ok(())
    }

    // 3️⃣ Tally votes and reveal the winner — MagicBlock privacy shield preserved
    pub fn tally_and_reveal(ctx: Context<TallyAndReveal>) -> Result<()> {
        let round = &mut ctx.accounts.grant_round;
        let vote1 = &ctx.accounts.vote1;
        let vote2 = &ctx.accounts.vote2;
        let permission_program = &ctx.accounts.permission_program.to_account_info();
        let permission_round = &ctx.accounts.permission_round.to_account_info();
        let permission1 = &ctx.accounts.permission1.to_account_info();
        let permission2 = &ctx.accounts.permission2.to_account_info();
        let magic_program = &ctx.accounts.magic_program.to_account_info();
        let magic_context = &ctx.accounts.magic_context.to_account_info();

        // Tally: simple majority between two votes (extendable to N voters)
        let winner = match (&vote1.voted_for, &vote2.voted_for) {
            (Some(p1), Some(p2)) => {
                if p1 == p2 {
                    Some(*p1) // unanimous
                } else {
                    Some(*p1) // tie-break: first voter wins (deterministic)
                }
            }
            (Some(p), None) => Some(*p),
            (None, Some(p)) => Some(*p),
            (None, None) => None,
        };

        round.winner = winner;
        round.is_active = false;

        msg!("Grant Round {} winner: {:?}", round.round_id, round.winner);

        // 🔒 CRITICAL: UpdatePermission CPIs — MagicBlock privacy shield
        // Removes access restrictions so the result is publicly readable on-chain
        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&round.to_account_info(), true)
            .authority(&round.to_account_info(), false)
            .permission(&permission_round.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[
                GRANT_ROUND_SEED,
                &round.round_id.to_le_bytes(),
                &[ctx.bumps.grant_round],
            ]])?;

        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&vote1.to_account_info(), true)
            .authority(&vote1.to_account_info(), false)
            .permission(&permission1.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[
                MEMBER_VOTE_SEED,
                &vote1.round_id.to_le_bytes(),
                &vote1.voter.as_ref(),
                &[ctx.bumps.vote1],
            ]])?;

        UpdatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&vote2.to_account_info(), true)
            .authority(&vote2.to_account_info(), false)
            .permission(&permission2.to_account_info())
            .args(MembersArgs { members: None })
            .invoke_signed(&[&[
                MEMBER_VOTE_SEED,
                &vote2.round_id.to_le_bytes(),
                &vote2.voter.as_ref(),
                &[ctx.bumps.vote2],
            ]])?;

        round.exit(&crate::ID)?;

        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&round.to_account_info()],
            magic_context,
            magic_program,
        )?;

        Ok(())
    }

    /// Delegate a PDA to the MagicBlock TEE validator via the delegation program
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = derive_seeds_from_account_type(&account_type);
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();

        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Creates a permission for a PDA based on account type
    pub fn create_permission(
        ctx: Context<CreatePermission>,
        account_type: AccountType,
        members: Option<Vec<Member>>,
    ) -> Result<()> {
        let CreatePermission {
            permissioned_account,
            permission,
            payer,
            permission_program,
            system_program,
        } = ctx.accounts;

        let seed_data = derive_seeds_from_account_type(&account_type);

        let (_, bump) = Pubkey::find_program_address(
            &seed_data.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );

        let mut seeds = seed_data.clone();
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();

        CreatePermissionCpiBuilder::new(&permission_program)
            .permissioned_account(&permissioned_account.to_account_info())
            .permission(&permission)
            .payer(&payer)
            .system_program(&system_program)
            .args(MembersArgs { members })
            .invoke_signed(&[seed_refs.as_slice()])?;
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CreateGrantRound<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + GrantRound::LEN,
        seeds = [GRANT_ROUND_SEED, &round_id.to_le_bytes()],
        bump
    )]
    pub grant_round: Account<'info, GrantRound>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CastVote<'info> {
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + MemberVote::LEN,
        seeds = [MEMBER_VOTE_SEED, &round_id.to_le_bytes(), voter.key().as_ref()],
        bump
    )]
    pub member_vote: Account<'info, MemberVote>,

    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[commit]
#[derive(Accounts)]
pub struct TallyAndReveal<'info> {
    #[account(mut, seeds = [GRANT_ROUND_SEED, &grant_round.round_id.to_le_bytes()], bump)]
    pub grant_round: Account<'info, GrantRound>,

    /// Vote from member 1
    #[account(
        mut,
        seeds = [MEMBER_VOTE_SEED, &grant_round.round_id.to_le_bytes(), vote1.voter.as_ref()],
        bump
    )]
    pub vote1: Account<'info, MemberVote>,

    /// Vote from member 2
    #[account(
        mut,
        seeds = [MEMBER_VOTE_SEED, &grant_round.round_id.to_le_bytes(), vote2.voter.as_ref()],
        bump
    )]
    pub vote2: Account<'info, MemberVote>,

    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission_round: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission1: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission2: UncheckedAccount<'info>,
    /// Anyone can trigger the tally
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

/// Unified delegate PDA context — routes to MagicBlock TEE validator
#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    pub payer: Signer<'info>,
    /// CHECK: Checked by the delegate program
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct CreatePermission<'info> {
    /// CHECK: Validated via permission program CPI
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: Checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PERMISSION PROGRAM
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ─── State Accounts ───────────────────────────────────────────────────────────

#[account]
pub struct GrantRound {
    pub round_id: u64,
    pub is_active: bool,
    pub winner: Option<Pubkey>,
}
impl GrantRound {
    pub const LEN: usize = 8      // round_id
        + 1                        // is_active
        + (1 + 32);                // winner: Option<Pubkey>
}

#[account]
pub struct MemberVote {
    pub round_id: u64,
    pub voter: Pubkey,
    pub voted_for: Option<Pubkey>,
}
impl MemberVote {
    pub const LEN: usize = 8      // round_id
        + 32                       // voter
        + (1 + 32);                // voted_for: Option<Pubkey>
}

// ─── Enums & Errors ───────────────────────────────────────────────────────────

#[error_code]
pub enum DecoError {
    #[msg("You have already cast your vote.")]
    AlreadyVoted,
    #[msg("Grant round is not active.")]
    RoundNotActive,
    #[msg("No votes have been cast.")]
    NoVotes,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    GrantRound { round_id: u64 },
    MemberVote { round_id: u64, voter: Pubkey },
}

fn derive_seeds_from_account_type(account_type: &AccountType) -> Vec<Vec<u8>> {
    match account_type {
        AccountType::GrantRound { round_id } => {
            vec![GRANT_ROUND_SEED.to_vec(), round_id.to_le_bytes().to_vec()]
        }
        AccountType::MemberVote { round_id, voter } => {
            vec![
                MEMBER_VOTE_SEED.to_vec(),
                round_id.to_le_bytes().to_vec(),
                voter.to_bytes().to_vec(),
            ]
        }
    }
}
