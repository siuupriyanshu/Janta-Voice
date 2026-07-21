use anchor_lang::prelude::*;

/// PDA seed prefix for a citizen's civic report record.
#[constant]
pub const REPORT_SEED: &[u8] = b"report";

/// Maximum byte length for the `category` string (road, water, electricity, corruption, other).
pub const MAX_CATEGORY_LEN: usize = 32;

/// Maximum byte length for the free-text `location` string (ward / municipality name).
pub const MAX_LOCATION_LEN: usize = 64;
