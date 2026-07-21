use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Category must not be empty")]
    CategoryEmpty,
    #[msg("Category exceeds the maximum allowed length")]
    CategoryTooLong,
    #[msg("Location must not be empty")]
    LocationEmpty,
    #[msg("Location exceeds the maximum allowed length")]
    LocationTooLong,
}
