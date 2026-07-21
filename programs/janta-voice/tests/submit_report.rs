//! Integration tests for the `submit_report` instruction, run in-process with
//! LiteSVM (the Anchor 1.1 default). Covers:
//!   1. happy path — a report is committed with the correct fields
//!   2. duplicate rejection — the same wallet + same summary_hash fails (anti-spam)
//!   3. distinct reports — the same wallet CAN file reports with different hashes

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const CATEGORY: &str = "road";
const LOCATION: &str = "Ward 5, Kathmandu";
const SUMMARY_HASH: [u8; 32] = [7u8; 32];

/// Fresh LiteSVM with the compiled program loaded and a funded reporter wallet.
fn setup() -> (LiteSVM, Keypair, Pubkey) {
    let program_id = janta_voice::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/janta_voice.so"
    ));
    svm.add_program(program_id, bytes).unwrap();

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    (svm, payer, program_id)
}

/// Derive the ReportRecord PDA for a (reporter, summary_hash) pair.
fn report_pda(reporter: &Pubkey, summary_hash: &[u8; 32], program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            janta_voice::constants::REPORT_SEED,
            reporter.as_ref(),
            summary_hash,
        ],
        program_id,
    )
    .0
}

/// Build a `submit_report` instruction.
fn submit_report_ix(
    reporter: &Pubkey,
    report: &Pubkey,
    program_id: &Pubkey,
    category: &str,
    location: &str,
    summary_hash: [u8; 32],
) -> Instruction {
    Instruction::new_with_bytes(
        *program_id,
        &janta_voice::instruction::SubmitReport {
            category: category.to_string(),
            location: location.to_string(),
            summary_hash,
        }
        .data(),
        janta_voice::accounts::SubmitReport {
            reporter: *reporter,
            report: *report,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

/// Sign and send a single-instruction transaction from `payer`.
fn send(
    svm: &mut LiteSVM,
    ix: Instruction,
    payer: &Keypair,
) -> Result<(), litesvm::types::FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ())
}

#[test]
fn happy_path_commits_report() {
    let (mut svm, payer, program_id) = setup();
    let report = report_pda(&payer.pubkey(), &SUMMARY_HASH, &program_id);

    let ix = submit_report_ix(
        &payer.pubkey(),
        &report,
        &program_id,
        CATEGORY,
        LOCATION,
        SUMMARY_HASH,
    );
    let res = send(&mut svm, ix, &payer);
    assert!(res.is_ok(), "submit_report should succeed: {:?}", res.err());

    let account = svm.get_account(&report).unwrap();
    let mut data: &[u8] = &account.data;
    let record = janta_voice::state::ReportRecord::try_deserialize(&mut data).unwrap();

    assert_eq!(record.reporter, payer.pubkey());
    assert_eq!(record.category, CATEGORY);
    assert_eq!(record.location, LOCATION);
    assert_eq!(record.summary_hash, SUMMARY_HASH);
    assert!(record.timestamp >= 0, "timestamp should be set");
}

#[test]
fn duplicate_report_is_rejected() {
    let (mut svm, payer, program_id) = setup();
    let report = report_pda(&payer.pubkey(), &SUMMARY_HASH, &program_id);

    // First submission succeeds.
    let ix = submit_report_ix(
        &payer.pubkey(),
        &report,
        &program_id,
        CATEGORY,
        LOCATION,
        SUMMARY_HASH,
    );
    assert!(send(&mut svm, ix, &payer).is_ok());

    // Second identical submission (same wallet + same summary_hash) must fail:
    // the PDA already exists so the `init` constraint aborts the transaction.
    // This failure IS the v1 anti-spam mechanism, not a bug.
    // Expire the blockhash so the retry is a distinct transaction (otherwise
    // LiteSVM would reject it as an already-processed signature).
    svm.expire_blockhash();
    let ix_dup = submit_report_ix(
        &payer.pubkey(),
        &report,
        &program_id,
        CATEGORY,
        LOCATION,
        SUMMARY_HASH,
    );
    let res = send(&mut svm, ix_dup, &payer);
    assert!(
        res.is_err(),
        "duplicate report (same wallet + same hash) must be rejected"
    );
}

#[test]
fn same_wallet_can_file_different_reports() {
    let (mut svm, payer, program_id) = setup();

    // Report A.
    let hash_a = [1u8; 32];
    let report_a = report_pda(&payer.pubkey(), &hash_a, &program_id);
    let ix_a = submit_report_ix(
        &payer.pubkey(),
        &report_a,
        &program_id,
        "road",
        "Ward 5, Kathmandu",
        hash_a,
    );
    assert!(send(&mut svm, ix_a, &payer).is_ok());

    // Report B — different content => different summary_hash => different PDA.
    let hash_b = [2u8; 32];
    let report_b = report_pda(&payer.pubkey(), &hash_b, &program_id);
    let ix_b = submit_report_ix(
        &payer.pubkey(),
        &report_b,
        &program_id,
        "water",
        "Ward 9, Lalitpur",
        hash_b,
    );
    assert!(
        send(&mut svm, ix_b, &payer).is_ok(),
        "a different report from the same wallet should succeed"
    );

    assert_ne!(report_a, report_b);
}
