use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("4TocTt21C8CYTGCjP7BgynrL8kQSn2zTHbMhSyB5hivX");

pub const GRANT_ROUND_SEED: &[u8] = b"grant_round";
pub const MEMBER_VOTE_SEED: &[u8] = b"member_vote";

#[ephemeral]
#[program]
pub mod deco_private {
    use super::*;

    /// Create a new grant round on base chain
    pub fn create_grant_round(ctx: Context<CreateGrantRound>, round_id: u64) -> Result<()> {
        let round = &mut ctx.accounts.grant_round;
        round.round_id = round_id;
        round.is_active = true;
        round.winner = None;
        round.authority = ctx.accounts.authority.key();
        msg!("Grant round {} created", round_id);
        Ok(())
    }

    /// Initialize a member_vote PDA on base chain so it can be delegated to the ER
    pub fn init_member_vote(ctx: Context<InitMemberVote>, round_id: u64) -> Result<()> {
        let vote = &mut ctx.accounts.member_vote;
        vote.round_id = round_id;
        vote.voter = ctx.accounts.voter.key();
        vote.voted_for = None;
        msg!("MemberVote initialized for voter {} round {}", vote.voter, round_id);
        Ok(())
    }

    /// Cast a private vote — runs on Ephemeral Rollup (TEE)
    /// member_vote must already exist and be delegated before calling this
    pub fn cast_vote(
        ctx: Context<CastVote>,
        _round_id: u64,
        project_pubkey: Pubkey,
    ) -> Result<()> {
        let vote = &mut ctx.accounts.member_vote;
        require!(vote.voted_for.is_none(), DecoError::AlreadyVoted);
        vote.voted_for = Some(project_pubkey);
        msg!("Vote cast by {} for {}", vote.voter, project_pubkey);
        Ok(())
    }

    /// Commit vote state from ER back to base chain and undelegate
    pub fn commit_vote(ctx: Context<CommitVote>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.member_vote.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        Ok(())
    }

    /// Delegate a grant round PDA to the MagicBlock TEE
    pub fn delegate_pda(ctx: Context<DelegatePda>) -> Result<()> {
        let round_id = ctx.accounts.grant_round_ref.round_id;
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[GRANT_ROUND_SEED, &round_id.to_le_bytes()],
            DelegateConfig {
                validator: ctx.accounts.validator.as_ref().map(|v| v.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }
}

// ─── Contexts ────────────────────────────────────────────────────────────────

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
pub struct InitMemberVote<'info> {
    #[account(
        init,
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

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CastVote<'info> {
    #[account(
        mut,
        seeds = [MEMBER_VOTE_SEED, &round_id.to_le_bytes(), voter.key().as_ref()],
        bump
    )]
    pub member_vote: Account<'info, MemberVote>,
    pub voter: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitVote<'info> {
    #[account(mut)]
    pub member_vote: Account<'info, MemberVote>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: The grant round PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    /// Used to read round_id for seed derivation
    pub grant_round_ref: Account<'info, GrantRound>,
    pub payer: Signer<'info>,
    /// CHECK: Optional specific ER validator
    pub validator: Option<AccountInfo<'info>>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct GrantRound {
    pub round_id: u64,
    pub is_active: bool,
    pub winner: Option<Pubkey>,
    pub authority: Pubkey,
}
impl GrantRound {
    pub const LEN: usize = 8 + 1 + (1 + 32) + 32;
}

#[account]
pub struct MemberVote {
    pub round_id: u64,
    pub voter: Pubkey,
    pub voted_for: Option<Pubkey>,
}
impl MemberVote {
    pub const LEN: usize = 8 + 32 + (1 + 32);
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum DecoError {
    #[msg("You have already cast your vote.")]
    AlreadyVoted,
    #[msg("Grant round is not active.")]
    RoundNotActive,
}
