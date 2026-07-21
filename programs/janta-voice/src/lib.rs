pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("AxR7Xwhi2MkBUMDZweEd7pVozPcYCwPzviou7WGGhWJk");

#[program]
pub mod janta_voice {
    use super::*;

    /// File an immutable civic complaint record on-chain.
    /// `summary_hash` is the SHA-256 of the full off-chain summary and also
    /// forms part of the PDA seed, enforcing one record per wallet per report.
    pub fn submit_report(
        ctx: Context<SubmitReport>,
        category: String,
        location: String,
        summary_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::submit_report::handle_submit_report(
            ctx,
            category,
            location,
            summary_hash,
        )
    }
}
