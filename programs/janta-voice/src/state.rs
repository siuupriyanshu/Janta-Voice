use anchor_lang::prelude::*;

use crate::constants::{MAX_CATEGORY_LEN, MAX_LOCATION_LEN};

/// An immutable civic complaint record, one PDA per (wallet, summary_hash).
///
/// Only the summary *hash* lives on-chain (integrity + cost); the full
/// AI-generated summary text is stored off-chain against this hash.
#[account]
#[derive(InitSpace)]
pub struct ReportRecord {
    /// The wallet that filed this report.
    pub reporter: Pubkey,
    /// Closed-set classification: road, water, electricity, corruption, other.
    #[max_len(MAX_CATEGORY_LEN)]
    pub category: String,
    /// Free-text location (e.g. ward / municipality name).
    #[max_len(MAX_LOCATION_LEN)]
    pub location: String,
    /// Hash of the full off-chain summary (SHA-256).
    pub summary_hash: [u8; 32],
    /// Unix timestamp when the record was committed on-chain.
    pub timestamp: i64,
}
