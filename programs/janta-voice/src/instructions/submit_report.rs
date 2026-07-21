use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_CATEGORY_LEN, MAX_LOCATION_LEN, REPORT_SEED},
    error::ErrorCode,
    state::ReportRecord,
};

#[derive(Accounts)]
#[instruction(category: String, location: String, summary_hash: [u8; 32])]
pub struct SubmitReport<'info> {
    #[account(mut)]
    pub reporter: Signer<'info>,

    /// One record per (wallet, summary_hash). If this PDA already exists the
    /// `init` constraint fails — that failure IS the v1 anti-spam behavior
    /// (a wallet cannot file the identical report twice).
    #[account(
        init,
        payer = reporter,
        space = 8 + ReportRecord::INIT_SPACE,
        seeds = [REPORT_SEED, reporter.key().as_ref(), summary_hash.as_ref()],
        bump
    )]
    pub report: Account<'info, ReportRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handle_submit_report(
    ctx: Context<SubmitReport>,
    category: String,
    location: String,
    summary_hash: [u8; 32],
) -> Result<()> {
    require!(!category.is_empty(), ErrorCode::CategoryEmpty);
    require!(category.len() <= MAX_CATEGORY_LEN, ErrorCode::CategoryTooLong);
    require!(!location.is_empty(), ErrorCode::LocationEmpty);
    require!(location.len() <= MAX_LOCATION_LEN, ErrorCode::LocationTooLong);

    let report = &mut ctx.accounts.report;
    report.reporter = ctx.accounts.reporter.key();
    report.category = category;
    report.location = location;
    report.summary_hash = summary_hash;
    report.timestamp = Clock::get()?.unix_timestamp;

    msg!(
        "Report filed by {} — category: {}, location: {}",
        report.reporter,
        report.category,
        report.location
    );
    Ok(())
}
