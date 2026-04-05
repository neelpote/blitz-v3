use anchor_lang::prelude::*;
use anchor_lang::system_program;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;

declare_id!("3nnAhNGFcEEBZfpyjrL55dmpDZNavXEKpVKusfUFfzJ7");

pub const VAULT_SEED:    &[u8] = b"alpha_vault";
pub const ESCROW_SEED:   &[u8] = b"alpha_escrow";
pub const POSITION_SEED: &[u8] = b"alpha_position";
pub const MIN_DEPOSIT:   u64   = 100_000_000;
pub const MAX_FEE_BPS:   u16   = 5_000;
pub const BPS_DENOM:     u64   = 10_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultStatus { Active, Paused, Settled }
impl Default for VaultStatus { fn default() -> Self { VaultStatus::Active } }

/// StrategyVault PDA seeds: [VAULT_SEED, manager]
/// SIZE: 8+32+8+8+8+2+1+1+32+4 = 104
#[account]
#[derive(Default)]
pub struct StrategyVault {
    pub manager:          Pubkey,
    pub total_deposits:   u64,
    pub total_shares:     u64,
    pub performance_bps:  i64,
    pub fee_bps:          u16,
    pub status:           VaultStatus,
    pub escrow_bump:      u8,
    pub name:             [u8; 32],
    pub trade_count:      u32,
}
impl StrategyVault { pub const SIZE: usize = 8+32+8+8+8+2+1+1+32+4; }

/// InvestorPosition PDA seeds: [POSITION_SEED, vault, investor]
/// SIZE: 8+32+32+8+8+8 = 96
#[account]
#[derive(Default)]
pub struct InvestorPosition {
    pub vault:             Pubkey,
    pub investor:          Pubkey,
    pub deposit_lamports:  u64,
    pub shares:            u64,
    pub entry_performance: i64,
}
impl InvestorPosition { pub const SIZE: usize = 8+32+32+8+8+8; }

#[error_code]
pub enum AlphaVaultError {
    #[msg("Vault is not Active")] VaultNotActive,
    #[msg("Deposit below minimum (0.1 SOL)")] DepositTooSmall,
    #[msg("Performance fee exceeds maximum (50%)")] FeeTooHigh,
    #[msg("Only the vault manager can call this")] NotManager,
    #[msg("Investor has no shares")] NoPosition,
    #[msg("Vault name too long (max 32 bytes)")] NameTooLong,
    #[msg("Arithmetic overflow")] Overflow,
    #[msg("Manager wallet has insufficient lamports to cover net yield deposit")] InsufficientYieldDeposit,
}

#[ephemeral]
#[program]
pub mod alpha_vault {
    use super::*;

    pub fn create_vault(ctx: Context<CreateVault>, fee_bps: u16, name: String) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, AlphaVaultError::FeeTooHigh);
        require!(name.len() <= 32, AlphaVaultError::NameTooLong);
        let v = &mut ctx.accounts.strategy_vault;
        v.manager = ctx.accounts.manager.key();
        v.fee_bps = fee_bps;
        v.status  = VaultStatus::Active;
        v.escrow_bump = ctx.bumps.escrow;
        let mut nb = [0u8; 32];
        nb[..name.len()].copy_from_slice(name.as_bytes());
        v.name = nb;
        msg!("AlphaVault: created by {} fee={}bps", v.manager, fee_bps);
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount >= MIN_DEPOSIT, AlphaVaultError::DepositTooSmall);
        let v = &ctx.accounts.strategy_vault;
        require!(v.status == VaultStatus::Active, AlphaVaultError::VaultNotActive);
        let shares = if v.total_shares == 0 { amount } else {
            (amount as u128).checked_mul(v.total_shares as u128)
                .and_then(|n| n.checked_div(v.total_deposits as u128))
                .ok_or(AlphaVaultError::Overflow)? as u64
        };
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(),
                system_program::Transfer { from: ctx.accounts.investor.to_account_info(), to: ctx.accounts.escrow.to_account_info() }),
            amount,
        )?;
        let v = &mut ctx.accounts.strategy_vault;
        v.total_deposits = v.total_deposits.checked_add(amount).ok_or(AlphaVaultError::Overflow)?;
        v.total_shares   = v.total_shares.checked_add(shares).ok_or(AlphaVaultError::Overflow)?;
        let perf_now = v.performance_bps;
        let vault_key = v.key();
        let p = &mut ctx.accounts.investor_position;
        p.vault = vault_key;
        p.investor = ctx.accounts.investor.key();
        p.deposit_lamports = p.deposit_lamports.checked_add(amount).ok_or(AlphaVaultError::Overflow)?;
        p.shares = p.shares.checked_add(shares).ok_or(AlphaVaultError::Overflow)?;
        p.entry_performance = perf_now;
        msg!("AlphaVault: {} deposited {} lamps {} shares", p.investor, amount, shares);
        Ok(())
    }

    pub fn delegate_vault(ctx: Context<DelegateVault>) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.manager,
            &[VAULT_SEED, ctx.accounts.manager.key().as_ref()],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
        )?;
        msg!("AlphaVault: delegated to ER/TEE");
        Ok(())
    }

    pub fn record_trade(ctx: Context<RecordTrade>, delta_bps: i64) -> Result<()> {
        let v = &mut ctx.accounts.strategy_vault;
        require!(v.status == VaultStatus::Active, AlphaVaultError::VaultNotActive);
        require!(ctx.accounts.manager.key() == v.manager, AlphaVaultError::NotManager);
        v.performance_bps = v.performance_bps.checked_add(delta_bps).ok_or(AlphaVaultError::Overflow)?;
        v.trade_count = v.trade_count.saturating_add(1);
        msg!("AlphaVault [ER/TEE]: trade#{} delta={}bps total={}bps", v.trade_count, delta_bps, v.performance_bps);
        Ok(())
    }

    pub fn settle_vault(ctx: Context<SettleVault>, reported_performance_bps: i64) -> Result<()> {
        let v = &ctx.accounts.strategy_vault;
        require!(v.status == VaultStatus::Active, AlphaVaultError::VaultNotActive);

        let total_deposits = v.total_deposits;
        let fee_bps        = v.fee_bps as u64;

        // ── Math ──────────────────────────────────────────────────────────────
        // gross_profit = total_deposits * reported_performance_bps / 10_000
        // Only positive performance generates a yield deposit obligation.
        let (gross_profit, manager_fee, net_yield) = if reported_performance_bps > 0 {
            let gross = (total_deposits as u128)
                .checked_mul(reported_performance_bps.unsigned_abs() as u128)
                .and_then(|n| n.checked_div(BPS_DENOM as u128))
                .ok_or(AlphaVaultError::Overflow)? as u64;

            let fee = (gross as u128)
                .checked_mul(fee_bps as u128)
                .and_then(|n| n.checked_div(BPS_DENOM as u128))
                .ok_or(AlphaVaultError::Overflow)? as u64;

            let net = gross.checked_sub(fee).ok_or(AlphaVaultError::Overflow)?;
            (gross, fee, net)
        } else {
            (0u64, 0u64, 0u64)
        };

        // ── Validate manager has enough lamports ──────────────────────────────
        if net_yield > 0 {
            let manager_lamports = ctx.accounts.manager.lamports();
            // Reserve ~0.01 SOL for rent + fees so manager account stays alive
            let reserve: u64 = 10_000_000;
            require!(
                manager_lamports >= net_yield.saturating_add(reserve),
                AlphaVaultError::InsufficientYieldDeposit
            );

            // Transfer net yield: manager → escrow
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.manager.to_account_info(),
                        to:   ctx.accounts.escrow.to_account_info(),
                    },
                ),
                net_yield,
            )?;

            // Transfer manager fee: manager → manager (stays in wallet, no-op transfer)
            // Fee is simply NOT deposited — manager keeps it by not sending it.
            // We just log it for transparency.
        }

        // ── Update vault state ────────────────────────────────────────────────
        let v = &mut ctx.accounts.strategy_vault;
        v.performance_bps = reported_performance_bps;
        v.status          = VaultStatus::Settled;
        // total_deposits stays the same — withdraw_position uses escrow balance
        // directly, so the new escrow balance (deposits + net_yield) is the
        // correct denominator for proportional payouts.

        msg!(
            "AlphaVault: SETTLED perf={}bps gross={} fee={} net_yield={} escrow_new={}",
            reported_performance_bps,
            gross_profit,
            manager_fee,
            net_yield,
            ctx.accounts.escrow.lamports(),
        );
        Ok(())
    }

    pub fn withdraw_position(ctx: Context<WithdrawPosition>) -> Result<()> {
        let v = &ctx.accounts.strategy_vault;
        require!(v.status == VaultStatus::Settled, AlphaVaultError::VaultNotActive);
        let p = &ctx.accounts.investor_position;
        require!(p.shares > 0, AlphaVaultError::NoPosition);
        let escrow_bal = ctx.accounts.escrow.lamports();
        let payout = (escrow_bal as u128)
            .checked_mul(p.shares as u128)
            .and_then(|n| n.checked_div(v.total_shares as u128))
            .ok_or(AlphaVaultError::Overflow)? as u64;

        // Transfer via System CPI using escrow PDA as signer
        let manager_key = v.manager;
        let escrow_bump = v.escrow_bump;
        let seeds: &[&[u8]] = &[ESCROW_SEED, manager_key.as_ref(), &[escrow_bump]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to:   ctx.accounts.investor.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
        msg!("AlphaVault: {} withdrew {} lamps", p.investor, payout);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(init, payer=manager, space=StrategyVault::SIZE, seeds=[VAULT_SEED, manager.key().as_ref()], bump)]
    pub strategy_vault: Account<'info, StrategyVault>,
    /// CHECK: lamport escrow
    #[account(mut, seeds=[ESCROW_SEED, manager.key().as_ref()], bump)]
    pub escrow: AccountInfo<'info>,
    #[account(mut)] pub manager: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds=[VAULT_SEED, strategy_vault.manager.as_ref()], bump)]
    pub strategy_vault: Account<'info, StrategyVault>,
    /// CHECK: escrow
    #[account(mut, seeds=[ESCROW_SEED, strategy_vault.manager.as_ref()], bump=strategy_vault.escrow_bump)]
    pub escrow: AccountInfo<'info>,
    #[account(init_if_needed, payer=investor, space=InvestorPosition::SIZE, seeds=[POSITION_SEED, strategy_vault.key().as_ref(), investor.key().as_ref()], bump)]
    pub investor_position: Account<'info, InvestorPosition>,
    #[account(mut)] pub investor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateVault<'info> {
    #[account(mut)] pub manager: Signer<'info>,
    /// CHECK: vault PDA being delegated
    #[account(mut, del)] pub pda: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordTrade<'info> {
    #[account(mut, seeds=[VAULT_SEED, strategy_vault.manager.as_ref()], bump)]
    pub strategy_vault: Account<'info, StrategyVault>,
    #[account(mut)] pub manager: Signer<'info>,
}

/// settle_vault — pure L1, no ER commit needed.
/// Manager physically deposits net yield into escrow via System CPI.
#[derive(Accounts)]
pub struct SettleVault<'info> {
    #[account(mut, seeds=[VAULT_SEED, strategy_vault.manager.as_ref()], bump)]
    pub strategy_vault: Account<'info, StrategyVault>,
    /// CHECK: escrow receives net yield from manager
    #[account(mut, seeds=[ESCROW_SEED, strategy_vault.manager.as_ref()], bump=strategy_vault.escrow_bump)]
    pub escrow: AccountInfo<'info>,
    #[account(mut, address=strategy_vault.manager)]
    pub manager: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawPosition<'info> {
    #[account(seeds=[VAULT_SEED, strategy_vault.manager.as_ref()], bump)]
    pub strategy_vault: Account<'info, StrategyVault>,
    /// CHECK: escrow payout source
    #[account(mut, seeds=[ESCROW_SEED, strategy_vault.manager.as_ref()], bump=strategy_vault.escrow_bump)]
    pub escrow: AccountInfo<'info>,
    #[account(mut, seeds=[POSITION_SEED, strategy_vault.key().as_ref(), investor.key().as_ref()], bump, has_one=investor)]
    pub investor_position: Account<'info, InvestorPosition>,
    /// CHECK: investor receives payout
    #[account(mut, address=investor_position.investor)] pub investor: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}
