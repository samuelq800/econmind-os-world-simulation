/** Private offline composition. Integrity is NOT source/funding adoption.
 * No request path, SQL, registration, issuer, seed or runtime dependency. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalSerialize, parseWorldDecimal } from '@econmind/core';
import { freezeFinancialInput } from './formal-financial-opening-contract.js';

// Generated only from the independently reviewed 5aa692 private snapshot.
const FIXED_POLICY = {
  packageIdentity: {
    root: '/Users/samuel/Documents/econclub/artifacts/g-funding-source-registry-20261013',
    manifest: {
      path: 'PACKAGE_MANIFEST.json',
      bytes: 3790,
      sha256:
        '2f22d0d66cc01c0af0507beaa299646845a310836a61c3c5f9c3248d6c36eef7',
    },
    schema: {
      path: 'REGISTRY_SCHEMA.json',
      bytes: 9768,
      sha256:
        '41da4fc03c40e757a751f0c90bf3715a1adff4fee674d24ba81f2e6f8616cca9',
    },
    freezeSha256:
      '66477170b5cc3edf375ddff2531de4c825b95bf09d32f15e24b642d2bbeb3580',
    primary: [
      {
        path: 'SOURCE_REGISTRY.json',
        schemaVersion: 'FUNDING_SOURCE_REGISTRY_V1_NOT_ADOPTION',
        bytes: 254421,
        sha256:
          '659564aaf18306bb7b8adb93e5e53f1cfb8c6aef5aebd4095d52cc7673386502',
      },
      {
        path: 'COUNTRY_SOURCE_REGISTRY.json',
        schemaVersion: 'COUNTRY_FUNDING_SOURCE_INDEX_V1',
        bytes: 1241844,
        sha256:
          '6e3f32d32224b25793b94e95af7bc86612ba91b5c50394b56c381fddb99f2608',
      },
      {
        path: 'NATIVE_LEAF_INDEX.json',
        schemaVersion: 'NATIVE_LEAF_PRIMARY_INDEX_V1',
        bytes: 1661576,
        sha256:
          '7737c40f3804782f2e832fbbc7d62f4f47e2fdafc328a1dccdbe08e7af03ba57',
      },
      {
        path: 'SETTLEMENT_TERMS_CANDIDATE.json',
        schemaVersion: 'SETTLEMENT_TERMS_PROCESS_CANDIDATE_V1',
        bytes: 37736,
        sha256:
          '9c09ce97e6afbdd037b83f28db7096375d42b095be5a303db55f173e1d427735',
      },
    ],
    supplementalFiles:
      'Only the 16 exact manifest entries are permitted package members. Load supporting CLEARING_SOURCE_INDEX, REFERENCE_COUNTERPARTY_INDEX, GROSS_REFERENCE_AGGREGATES, GROSS_CLEARING_CANDIDATE_AGGREGATES and MINIMUM_DEPENDENCIES by those manifest identities, never invented filenames. Scripts/README/receipts are integrity metadata, not executed or adoption inputs.',
  },
  retainedRoots: [
    {
      rootId: 'FIRST14_V1',
      archiveAbsolutePath:
        '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'FX_CB_V2',
      archiveAbsolutePath:
        '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'LEGACY_FINANCE_INPUTS',
      archiveAbsolutePath:
        '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2/inputs',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'CORRECTED_R_V2',
      archiveAbsolutePath:
        '/Users/samuel/Documents/Codex/2026-10-10/task-3/r3am-native-binding-20261013-corrected-r-v2',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'ORIGINAL_REFERENCE',
      archiveAbsolutePath:
        '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2-revision',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'E47_REVIEW',
      archiveAbsolutePath:
        '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-reconstruction-v1/artifacts-a0fac7ce52cc1806ccbf85fa01c26f8ed7be053984fb1398f90d84cb5d504057/artifacts/E_FIRST14_DELTA_REVIEW',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'E_GUARD_REVIEW',
      archiveAbsolutePath:
        '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-guard-correction-v1/artifacts-0a4a521b48984053b73ee8f991abab1fa945fd833a99e5ba09d426ff164f51cd/artifacts/E_F14_R1_GUARD_REVIEW',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
    {
      rootId: 'G_FUNDING_REGISTRY',
      archiveAbsolutePath:
        '/Users/samuel/Documents/econclub/artifacts/g-funding-source-registry-20261013',
      authority: 'ARCHIVE_LOCATION_ONLY; D uses a private reviewed allowlist',
    },
  ],
  sources: [
    {
      sourceId: 'first14_manifest',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/DELIVERY_MANIFEST.json',
      sha256:
        'ee5208193ff1f10677829e7b918d114a9e24bec8b59f953e78c32ad3a7cd4e62',
      bytes: 7665,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'DELIVERY_MANIFEST.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'v2_manifest',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1/FIXED_DELIVERY_MANIFEST.json',
      sha256:
        '07d23e750abf2837b5961de6e74e60ec6dbdf9f4009aa442e4939786bc7f3781',
      bytes: 11375,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FX_CB_V2',
      relativeLocator: 'FIXED_DELIVERY_MANIFEST.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'source_evidence',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/SOURCE_EVIDENCE.json',
      sha256:
        '61c6b4dd8f0b434021e4320ab36b1da8c31dce1f21eb9b444e7ece0b497f2a84',
      bytes: 21810,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'SOURCE_EVIDENCE.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'native_lc',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/UNIT_SAFE_NATIVE_BUCKETS.json',
      sha256:
        '264b3b4d2278ebf407f4ff29446fc59d86cc72bcaced08ab7e60b54949ed2a8a',
      bytes: 535600,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'UNIT_SAFE_NATIVE_BUCKETS.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'budget_candidates',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/BUDGET_CHOICE_PATHS.candidate.json',
      sha256:
        '78daf5f5641870924dd62f50c7b8f51cbb0b6bafda16268ae86efcecb5c532c2',
      bytes: 90895,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'BUDGET_CHOICE_PATHS.candidate.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'clearing_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/CLEARING_TERMS.candidate.json',
      sha256:
        '18204b8bb0fbeac969727b6b34935473ea8b32e00507f63e75491c018ef87fc8',
      bytes: 12790,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'CLEARING_TERMS.candidate.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'terminal_reference',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/TERMINAL_REFERENCE_RECONCILIATION.json',
      sha256:
        '98974193fad22917d027d0e85f418025db6d2501bd41d63a24a723c6718b3b44',
      bytes: 61070,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'TERMINAL_REFERENCE_RECONCILIATION.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'existing_payment_ports',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/GCU_PAYMENT_PATH_REQUIREMENTS.json',
      sha256:
        'ef3b95396de6861260c5ed1438ae594ebbea2d78134a6719f403838f81b94a4c',
      bytes: 2010,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'GCU_PAYMENT_PATH_REQUIREMENTS.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'joint_opening',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1/FINANCE_INVENTORY_DAY0_JOINT.proposed.json',
      sha256:
        '76746d973e67a2d69d5172d2a99d84254ad8f70a70628fbec57f5c2a9509529f',
      bytes: 377398,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FX_CB_V2',
      relativeLocator: 'FINANCE_INVENTORY_DAY0_JOINT.proposed.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'fx_quote_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1/CURRENCY_FX_RULES_AND_CANDIDATE.json',
      sha256:
        '812e95994053837139afd6b8798a68d3ff4f4436fbd839dfb8f9568371c3e562',
      bytes: 213759,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FX_CB_V2',
      relativeLocator: 'CURRENCY_FX_RULES_AND_CANDIDATE.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'gov_terms_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1/GOVERNMENT_INITIAL_DEBT_AND_TERMS.json',
      sha256:
        'a7d6aaa0a21af0b006fcbc209dd0de7f338ae89924d3c63e6a7c9f241e540dc7',
      bytes: 208741,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FX_CB_V2',
      relativeLocator: 'GOVERNMENT_INITIAL_DEBT_AND_TERMS.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'paired_positions_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1/PAIRED_NATIVE_OPENING_POSITIONS.json',
      sha256:
        '22e0a293f9edbbdd28684c6c6c0c68c4621855b06a44fb17bd1bbda19b9fdfe3',
      bytes: 825645,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FX_CB_V2',
      relativeLocator: 'PAIRED_NATIVE_OPENING_POSITIONS.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'legacy_finance_reference',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2/inputs/finance.json',
      sha256:
        '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
      bytes: 89045,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'LEGACY_FINANCE_INPUTS',
      relativeLocator: 'finance.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'clearing_reference_closing',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2-revision/R3AM_PREPARATION_EXACT_GCU_CLOSING.proposed.json',
      sha256:
        '678c93987fafb2dc6ecddfd27a437951efa0800bdf3c71433029afcf7b47c277',
      bytes: 82518,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'ORIGINAL_REFERENCE',
      relativeLocator: 'R3AM_PREPARATION_EXACT_GCU_CLOSING.proposed.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'clearing_reference_claims',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/r3am-native-binding-20261013-corrected-r-v2/CROSS_CB_REFERENCE_CLAIMS.proposed.json',
      sha256:
        'e907ff5cc1de5dd031ef982fe04de95c229874010eef23b9685f077f8e42d32a',
      bytes: 6533,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'CORRECTED_R_V2',
      relativeLocator: 'CROSS_CB_REFERENCE_CLAIMS.proposed.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'e47_decision',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-reconstruction-v1/artifacts-a0fac7ce52cc1806ccbf85fa01c26f8ed7be053984fb1398f90d84cb5d504057/artifacts/E_FIRST14_DELTA_REVIEW/decision.json',
      sha256:
        'aa35734809446c70bf6f268a73965e469f43cc9d6222f9d2bcc64faaccced90c',
      bytes: 6450,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E47_REVIEW',
      relativeLocator: 'decision.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'e47_review',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-reconstruction-v1/artifacts-a0fac7ce52cc1806ccbf85fa01c26f8ed7be053984fb1398f90d84cb5d504057/artifacts/E_FIRST14_DELTA_REVIEW/review.md',
      sha256:
        '0e2a83483bd84fa03cc2862aab19c8d0ce4819645e90a14de4ee9a99c37cd623',
      bytes: 8983,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E47_REVIEW',
      relativeLocator: 'review.md',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'guard_accepted_decision',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-guard-correction-v1/artifacts-0a4a521b48984053b73ee8f991abab1fa945fd833a99e5ba09d426ff164f51cd/artifacts/E_F14_R1_GUARD_REVIEW/decision.json',
      sha256:
        '7585bcc36677d444b678e4c93a9bcbb9cb4320c93ffc68e7eaadaf10e5c72ccb',
      bytes: 1178,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E_GUARD_REVIEW',
      relativeLocator: 'decision.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'guard_accepted_review',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-guard-correction-v1/artifacts-0a4a521b48984053b73ee8f991abab1fa945fd833a99e5ba09d426ff164f51cd/artifacts/E_F14_R1_GUARD_REVIEW/review.md',
      sha256:
        '9ef0fe44d624af4dc5c6b813cbf2a7afbd739d278255438f8114328f59c0c2f2',
      bytes: 4325,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E_GUARD_REVIEW',
      relativeLocator: 'review.md',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'guard_supplement',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-guard-correction-v1/artifacts-0a4a521b48984053b73ee8f991abab1fa945fd833a99e5ba09d426ff164f51cd/artifacts/E_F14_R1_GUARD_REVIEW/input/SUPPLEMENT_MANIFEST.json',
      sha256:
        '8904b60769603d6c9410f6588850eec5ed419ee8773cf7a3694b51a1b764efee',
      bytes: 5878,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E_GUARD_REVIEW',
      relativeLocator: 'input/SUPPLEMENT_MANIFEST.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'guard_patch',
      path: '/Users/samuel/.codex/state/plugins/codex-security/scans/first14-finance-guard-correction-v1/artifacts-0a4a521b48984053b73ee8f991abab1fa945fd833a99e5ba09d426ff164f51cd/artifacts/E_F14_R1_GUARD_REVIEW/input/guard-correction.patch',
      sha256:
        '32943624c7ea025d32f8cf980eb54ebd65c64bbd22112c88d655b7d967db7d37',
      bytes: 3889,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'E_GUARD_REVIEW',
      relativeLocator: 'input/guard-correction.patch',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'fx_daily_reference',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/FX_SETTLEMENT_DAILY.csv',
      sha256:
        '573b42a6f798bd4265b64a76377f26bc6512ccea20ba3ba83b11c1c1870af8f3',
      bytes: 2713516,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'FX_SETTLEMENT_DAILY.csv',
      readMode: 'ARCHIVE_ONLY_NO_DEREFERENCE',
    },
    {
      sourceId: 'fiscal_daily_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/COUNTRY_DAILY_FINANCE.csv',
      sha256:
        '0af3cdff2a04dcb5763e997b1b6bf022e4ce0837651b1f6d5cb9c22bd08fd7f6',
      bytes: 7181596,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'COUNTRY_DAILY_FINANCE.csv',
      readMode: 'ARCHIVE_ONLY_NO_DEREFERENCE',
    },
    {
      sourceId: 'country_summary_candidate',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/COUNTRY_SUMMARY.csv',
      sha256:
        'd2c1893358c3aaf4d2ed1464f8bddcbde07f41e550b35a52edd265f2ea8a8e2a',
      bytes: 16340,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'COUNTRY_SUMMARY.csv',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'reference_cash_groups',
      path: '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/REFERENCE_CASH_EVENTS.jsonl',
      sha256:
        '0599c4ac8f8dbb63cedc84f2c7c9705a6665c53fd05f50af4714f690c528bd25',
      bytes: 36114001,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'FIRST14_V1',
      relativeLocator: 'REFERENCE_CASH_EVENTS.jsonl',
      readMode: 'ARCHIVE_ONLY_NO_DEREFERENCE',
    },
    {
      sourceId: 'reference_group_upstream_journal',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2-revision/region_R3AM_STARTUP_strict_bridge_R0.3_D140_S1_JOURNAL.json',
      sha256:
        '4eaff4010106a0ce3863a3d12122a7a6eb4218cbd4ab7f605b215e31b1d2ca76',
      bytes: null,
      evidenceClass: 'REFERENCE',
      verification: 'UPSTREAM_POINTER_ONLY_NOT_DEREFERENCED_THIS_RUN',
      retainedRootId: 'ORIGINAL_REFERENCE',
      relativeLocator:
        'region_R3AM_STARTUP_strict_bridge_R0.3_D140_S1_JOURNAL.json',
      readMode: 'ARCHIVE_ONLY_NO_DEREFERENCE',
    },
    {
      sourceId: 'gross_reference',
      path: '/Users/samuel/Documents/econclub/artifacts/g-funding-source-registry-20261013/GROSS_REFERENCE_AGGREGATES.json',
      sha256:
        'a217d35bb291941abf6d6e8a6ca0c1af7f4c31bb52654733df049cc129f8b3a6',
      bytes: 39841,
      evidenceClass: 'REFERENCE',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'G_FUNDING_REGISTRY',
      relativeLocator: 'GROSS_REFERENCE_AGGREGATES.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'gross_clearing_candidate',
      path: '/Users/samuel/Documents/econclub/artifacts/g-funding-source-registry-20261013/GROSS_CLEARING_CANDIDATE_AGGREGATES.json',
      sha256:
        '59ab4492b43f1d7a6f0b547e8bb67f8a2c711341d185a07de7de5428c91e6409',
      bytes: 40112,
      evidenceClass: 'CONSTRUCTED',
      verification: 'SELECTED_INPUT_HASH_VERIFIED',
      retainedRootId: 'G_FUNDING_REGISTRY',
      relativeLocator: 'GROSS_CLEARING_CANDIDATE_AGGREGATES.json',
      readMode: 'ALLOWLISTED_EXACT_SMALL_SOURCE_IF_REQUIRED',
    },
    {
      sourceId: 'clearing_original_journal',
      path: '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-remnant-v2-revision/R3AM_PRE314_R0.3_STARTUP_DELIVERY_JOURNAL.json',
      sha256:
        '16b06ba4e581fed1b0810611bd9f23de8da17232082f3d244c028d0460efef8a',
      bytes: null,
      evidenceClass: 'REFERENCE',
      verification: 'UPSTREAM_POINTER_ONLY_NOT_DEREFERENCED_THIS_RUN',
      retainedRootId: 'ORIGINAL_REFERENCE',
      relativeLocator: 'R3AM_PRE314_R0.3_STARTUP_DELIVERY_JOURNAL.json',
      readMode: 'ARCHIVE_ONLY_NO_DEREFERENCE',
    },
  ],
} as FixedPolicy;
interface FilePin {
  path: string;
  bytes: number;
  sha256: string;
}
interface SourcePin {
  sourceId: string;
  path: string;
  sha256: string;
  bytes: number | null;
  evidenceClass: string;
  verification: string;
  retainedRootId: string;
  relativeLocator: string;
  readMode: string;
}
interface FixedPolicy {
  packageIdentity: { manifest: FilePin; schema: FilePin; freezeSha256: string };
  retainedRoots: {
    rootId: string;
    archiveAbsolutePath: string;
    authority: string;
  }[];
  sources: SourcePin[];
}
export const FINANCIAL_PACKAGE_LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 96 * 1024 * 1024,
  files: 64,
  depth: 32,
  nodes: 250000,
  array: 20000,
  string: 65536,
  csvRows: 20000,
  csvColumns: 256,
});
type Row = Record<string, unknown>;
export interface RegistryLocator {
  readonly sourceId: string;
  readonly selector: Row;
}
export interface RegistryFact extends Row {
  readonly status: 'KNOWN_SOURCE_VALUE' | 'UNKNOWN';
  readonly value: unknown;
  readonly source: RegistryLocator | null;
}
export interface LocatedRegistryFact {
  readonly field: string;
  readonly countryId: string | null;
  readonly ownerLabel: string | null;
  readonly fact: RegistryFact;
}
export interface RegistrySourceGap {
  readonly code: 'BLOCKED_SOURCE_NOT_DEREFERENCED';
  readonly sourceId: string;
  readonly field: string;
}
export interface LoadedFinancialOpeningPackageRegistry {
  readonly packageManifestSha256: string;
  readonly schemaSha256: string;
  readonly sourceRegistry: Row;
  readonly countries: readonly Row[];
  readonly nativeLeaves: readonly Row[];
  readonly terms: readonly Row[];
  readonly clearingIndex: Row;
  readonly facts: readonly LocatedRegistryFact[];
  readonly sourceGaps: readonly RegistrySourceGap[];
  readonly originalCarrierInput: null;
  readonly selectedSourceIds: readonly string[];
  readonly archiveOnlySourceIds: readonly string[];
  readonly bytesRead: number;
}
const instances = new WeakSet<object>();
const sourceSnapshots = new WeakMap<object, ReadonlyMap<string, string>>();
const decodedSources = new WeakMap<object, Map<string, unknown>>();
export class FinancialPackageIntegrityError extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
  ) {
    super(code + ':' + field);
    this.name = 'FinancialPackageIntegrityError';
  }
}
function fail(code: string, field: string): never {
  throw new FinancialPackageIntegrityError(code, field);
}
export function registryRow(v: unknown, field: string): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    fail('OBJECT_REQUIRED', field);
  return v as Row;
}
export function registryArray(v: unknown, field: string): unknown[] {
  if (!Array.isArray(v) || v.length > FINANCIAL_PACKAGE_LIMITS.array)
    fail('BOUNDED_ARRAY_REQUIRED', field);
  return v;
}
export function registryString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v || v.length > FINANCIAL_PACKAGE_LIMITS.string)
    fail('BOUNDED_STRING_REQUIRED', field);
  return v;
}
function exactKeys(v: Row, keys: readonly string[], field: string): void {
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail('EXACT_KEYS_REQUIRED', field);
}
function confined(v: string): void {
  if (
    !v ||
    v.length > 512 ||
    path.posix.isAbsolute(v) ||
    [...v].some(
      (c) =>
        c === '\\' ||
        c === ':' ||
        c.charCodeAt(0) < 32 ||
        c.charCodeAt(0) === 127,
    ) ||
    path.posix.normalize(v) !== v ||
    v.split('/').some((s) => !s || s === '.' || s === '..')
  )
    fail('PATH_DENIED', v);
}
function structure(value: unknown): void {
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (
      ++nodes > FINANCIAL_PACKAGE_LIMITS.nodes ||
      depth > FINANCIAL_PACKAGE_LIMITS.depth
    )
      fail('STRUCTURE_BUDGET_EXCEEDED', 'json');
    if (typeof v === 'string' && v.length > FINANCIAL_PACKAGE_LIMITS.string)
      fail('STRING_BUDGET_EXCEEDED', 'json');
    if (Array.isArray(v)) {
      if (v.length > FINANCIAL_PACKAGE_LIMITS.array)
        fail('ARRAY_BUDGET_EXCEEDED', 'json');
      for (const x of v) visit(x, depth + 1);
    } else if (v && typeof v === 'object') {
      if (Object.keys(v).length > 512) fail('OBJECT_BUDGET_EXCEEDED', 'json');
      for (const x of Object.values(v)) visit(x, depth + 1);
    }
  };
  visit(value, 0);
}
function json(bytes: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    return fail('JSON_INVALID', 'json');
  }
  structure(value);
  return value;
}
/** Numeric source tokens remain lexemes, including values beyond 2^53. */
export function parseFinancialRegistrySourceJson(bytes: string): unknown {
  const parse = JSON.parse as (
    s: string,
    r: (k: string, v: unknown, c: { source?: string }) => unknown,
  ) => unknown;
  const value = parse(bytes, (_k, v, c) => {
    if (typeof v !== 'number') return v;
    if (typeof c?.source !== 'string')
      fail('LOSSLESS_CONTEXT_REQUIRED', 'source');
    return c.source;
  });
  structure(value);
  return freezeFinancialInput(value);
}
export function selectFinancialRegistryJsonPointer(
  value: unknown,
  pointer: string,
): unknown {
  if (pointer !== '' && !/^(?:\/(?:[^~/]|~[01])*)+$/u.test(pointer))
    fail('JSON_POINTER_INVALID', pointer);
  let current = value;
  for (const token of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, key) ||
      (Array.isArray(current) && !/^(?:0|[1-9]\d*)$/u.test(key))
    )
      fail('JSON_POINTER_MISSING', pointer);
    current = (current as Row)[key];
  }
  return current;
}
export function selectFinancialRegistryCsvCell(
  bytes: string,
  key: Row,
  column: string,
): string {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const pushCell = () => {
    if (
      cell.length > FINANCIAL_PACKAGE_LIMITS.string ||
      row.length >= FINANCIAL_PACKAGE_LIMITS.csvColumns
    )
      fail('CSV_BUDGET_EXCEEDED', column);
    row.push(cell);
    cell = '';
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (rows.length >= FINANCIAL_PACKAGE_LIMITS.csvRows)
      fail('CSV_BUDGET_EXCEEDED', column);
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (quoted) {
      if (c === '"') {
        if (bytes[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) fail('CSV_INVALID', column);
      quoted = true;
    } else if (c === ',') pushCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && bytes[i + 1] === '\n') i++;
      pushRow();
    } else {
      if (closed) fail('CSV_INVALID', column);
      cell += c;
    }
    if (cell.length > FINANCIAL_PACKAGE_LIMITS.string)
      fail('CSV_BUDGET_EXCEEDED', column);
  }
  if (quoted) fail('CSV_INVALID', column);
  if (cell || row.length || closed) pushRow();
  const header = rows.shift();
  if (
    !header ||
    header.some((h) => !h) ||
    new Set(header).size !== header.length ||
    !header.includes(column) ||
    !Object.keys(key).length
  )
    fail('CSV_HEADER_OR_KEY_INVALID', column);
  const keys = Object.entries(key).map(([k, v]) => {
    if (
      !header.includes(k) ||
      !(
        typeof v === 'string' ||
        (typeof v === 'number' && Number.isSafeInteger(v))
      )
    )
      fail('CSV_HEADER_OR_KEY_INVALID', k);
    return [header.indexOf(k), String(v)] as const;
  });
  const matching = rows.filter((r) => {
    if (r.length !== header.length) fail('CSV_WIDTH_INVALID', column);
    return keys.every(([i, v]) => r[i] === v);
  });
  if (matching.length !== 1) fail('CSV_KEY_NOT_UNIQUE', column);
  return matching[0]![header.indexOf(column)]!;
}
export function inspectFinancialRegistryFact(value: unknown): RegistryFact {
  const r = registryRow(value, 'fact');
  if (r.status === 'UNKNOWN') {
    exactKeys(
      r,
      ['status', 'evidenceClass', 'value', 'gapId', 'source'],
      'fact',
    );
    if (
      r.value !== null ||
      r.source !== null ||
      r.evidenceClass !== null ||
      !/^GAP_[A-Z0-9_]+$/u.test(registryString(r.gapId, 'gapId'))
    )
      fail('UNKNOWN_NOT_NULL', 'fact');
  } else if (r.status === 'KNOWN_SOURCE_VALUE') {
    exactKeys(
      r,
      [
        'status',
        'evidenceClass',
        'value',
        'valueKind',
        'currency',
        'unit',
        'meaning',
        'source',
      ],
      'fact',
    );
    if (!['REFERENCE', 'CONSTRUCTED'].includes(String(r.evidenceClass)))
      fail('ADOPTION_LABEL_NOT_ALLOWED', 'fact');
    registryString(r.meaning, 'meaning');
    for (const k of ['currency', 'unit'])
      if (r[k] !== null) registryString(r[k], k);
    const valid =
      r.valueKind === 'DECIMAL_STRING'
        ? typeof r.value === 'string' &&
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(r.value)
        : r.valueKind === 'STRING'
          ? typeof r.value === 'string'
          : r.valueKind === 'BOOLEAN'
            ? typeof r.value === 'boolean'
            : r.valueKind === 'INTEGER'
              ? typeof r.value === 'number' && Number.isSafeInteger(r.value)
              : r.valueKind === 'NULL' && r.value === null;
    if (!valid) fail('FACT_VALUE_KIND_INVALID', 'value');
    if (r.valueKind === 'DECIMAL_STRING') parseWorldDecimal(r.value as string);
    inspectLocator(r.source);
  } else fail('FACT_STATUS_INVALID', 'status');
  return r as RegistryFact;
}
function inspectLocator(value: unknown): RegistryLocator {
  const r = registryRow(value, 'source');
  exactKeys(r, ['sourceId', 'selector'], 'source');
  registryString(r.sourceId, 'sourceId');
  const s = registryRow(r.selector, 'selector');
  if (s.kind === 'JSON_POINTER') {
    exactKeys(
      s,
      [
        'kind',
        'pointer',
        ...(Object.hasOwn(s, 'originalValue') ? ['originalValue'] : []),
      ],
      'selector',
    );
    if (typeof s.pointer !== 'string') fail('JSON_POINTER_INVALID', 'selector');
  } else if (s.kind === 'CSV_CELL') {
    exactKeys(
      s,
      [
        'kind',
        'key',
        'column',
        'originalValue',
        ...['dataRowZeroBased', 'physicalLine'].filter((k) =>
          Object.hasOwn(s, k),
        ),
      ],
      'selector',
    );
    registryRow(s.key, 'selector.key');
    registryString(s.column, 'selector.column');
  } else fail('SELECTOR_KIND_INVALID', 'selector');
  return r as unknown as RegistryLocator;
}
export function isLoadedFinancialOpeningPackageRegistry(
  v: unknown,
): v is LoadedFinancialOpeningPackageRegistry {
  return !!v && typeof v === 'object' && instances.has(v);
}
export function resolveFinancialRegistrySource(
  loaded: LoadedFinancialOpeningPackageRegistry,
  value: unknown,
): Readonly<
  | { status: 'VERIFIED_LEAF'; value: unknown }
  | { status: 'NOT_DEREFERENCED'; sourceId: string }
> {
  if (!isLoadedFinancialOpeningPackageRegistry(loaded))
    fail('GENUINE_REGISTRY_REQUIRED', 'registry');
  const locator = inspectLocator(value),
    pin = FIXED_POLICY.sources.find((s) => s.sourceId === locator.sourceId);
  if (!pin) fail('SOURCE_NOT_ALLOWLISTED', locator.sourceId);
  if (pin.readMode === 'ARCHIVE_ONLY_NO_DEREFERENCE')
    return Object.freeze({
      status: 'NOT_DEREFERENCED',
      sourceId: pin.sourceId,
    });
  const bytes = sourceSnapshots.get(loaded)?.get(pin.sourceId);
  if (bytes === undefined) fail('SOURCE_NOT_DEREFERENCED', pin.sourceId);
  const s = locator.selector;
  const cache = decodedSources.get(loaded)!;
  if (s.kind === 'JSON_POINTER' && !cache.has(pin.sourceId))
    cache.set(pin.sourceId, parseFinancialRegistrySourceJson(bytes));
  const actual =
    s.kind === 'JSON_POINTER'
      ? selectFinancialRegistryJsonPointer(
          cache.get(pin.sourceId),
          s.pointer as string,
        )
      : selectFinancialRegistryCsvCell(
          bytes,
          registryRow(s.key, 'key'),
          s.column as string,
        );
  if (Object.hasOwn(s, 'originalValue')) {
    const expected = s.originalValue;
    if (
      typeof expected === 'number'
        ? !Number.isSafeInteger(expected) || actual !== String(expected)
        : canonicalSerialize(actual) !== canonicalSerialize(expected)
    )
      fail('SOURCE_LEAF_MISMATCH', pin.sourceId);
  }
  return freezeFinancialInput({
    status: 'VERIFIED_LEAF' as const,
    value: actual,
  });
}
/** Constructor is reviewed private offline composition, never a request DTO.
 * Only the package directory is relocatable; all identities/source roots are fixed. */
export class FinancialOpeningPackageRegistryLoader {
  readonly #root: string;
  constructor(input: Readonly<{ packageRoot: string }>) {
    exactKeys(
      registryRow(input, 'composition'),
      ['packageRoot'],
      'composition',
    );
    if (!path.isAbsolute(input.packageRoot)) fail('PATH_DENIED', 'packageRoot');
    this.#root = path.resolve(input.packageRoot);
  }
  async load(): Promise<LoadedFinancialOpeningPackageRegistry> {
    let total = 0;
    const read = async (
      root: string,
      locator: string,
      pin: FilePin,
    ): Promise<string> => {
      confined(locator);
      if (
        !Number.isSafeInteger(pin.bytes) ||
        pin.bytes <= 0 ||
        pin.bytes > FINANCIAL_PACKAGE_LIMITS.fileBytes ||
        (total += pin.bytes) > FINANCIAL_PACKAGE_LIMITS.totalBytes
      )
        fail('FILE_BUDGET_EXCEEDED', locator);
      if ((await realpath(root)) !== root) fail('PATH_DENIED', root);
      let current = path.parse(root).root;
      for (const part of [
        ...root.slice(current.length).split('/').filter(Boolean),
        ...locator.split('/'),
      ]) {
        current = path.join(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink()) fail('SYMLINK_DENIED', locator);
      }
      const file = await open(
        current,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size !== pin.bytes)
          fail('FILE_SIZE_MISMATCH', locator);
        const buffer = Buffer.alloc(pin.bytes + 1);
        let n = 0;
        while (n < buffer.length) {
          const r = await file.read(buffer, n, buffer.length - n, n);
          if (!r.bytesRead) break;
          n += r.bytesRead;
        }
        const b = buffer.subarray(0, n);
        if (
          n !== pin.bytes ||
          createHash('sha256').update(b).digest('hex') !== pin.sha256
        )
          fail('FILE_HASH_MISMATCH', locator);
        try {
          return new TextDecoder('utf8', {
            fatal: true,
            ignoreBOM: true,
          }).decode(b);
        } catch {
          return fail('UTF8_INVALID', locator);
        }
      } finally {
        await file.close();
      }
    };
    const manifest = registryRow(
      json(
        await read(
          this.#root,
          'PACKAGE_MANIFEST.json',
          FIXED_POLICY.packageIdentity.manifest,
        ),
      ),
      'manifest',
    );
    const pins = registryArray(manifest.files, 'files').map(
      (v) => registryRow(v, 'file') as unknown as FilePin,
    );
    if (
      pins.length !== 16 ||
      new Set(pins.map((p) => p.path)).size !== pins.length
    )
      fail('FILE_SET_INVALID', 'manifest');
    const names = await readdir(this.#root);
    const expected = [
      ...pins.map((p) => p.path),
      'PACKAGE_MANIFEST.json',
      'FREEZE.json',
    ].sort();
    if (canonicalSerialize(names.sort()) !== canonicalSerialize(expected))
      fail('FILE_SET_INVALID', 'packageRoot');
    const documents = new Map<string, unknown>();
    for (const pin of pins) {
      const bytes = await read(this.#root, pin.path, pin);
      if (pin.path.endsWith('.json')) documents.set(pin.path, json(bytes));
    }
    await read(this.#root, 'FREEZE.json', {
      path: 'FREEZE.json',
      bytes: 288,
      sha256: FIXED_POLICY.packageIdentity.freezeSha256,
    });
    const sourceRegistry = registryRow(
      documents.get('SOURCE_REGISTRY.json'),
      'sourceRegistry',
    );
    if (
      sourceRegistry.schemaVersion !==
        'FUNDING_SOURCE_REGISTRY_V1_NOT_ADOPTION' ||
      sourceRegistry.actualWorldId !== null ||
      sourceRegistry.actualSeedId !== null ||
      registryArray(sourceRegistry.adoptedFacts, 'adoptedFacts').length
    )
      fail('SOURCE_AUTHORITY_NOT_ALLOWED', 'sourceRegistry');
    const actualSources = registryArray(sourceRegistry.sources, 'sources');
    const expectedSources = FIXED_POLICY.sources.map((s) =>
      Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'readMode')),
    );
    if (
      !isDeepStrictEqual(actualSources, expectedSources) ||
      !isDeepStrictEqual(
        sourceRegistry.retainedRoots,
        FIXED_POLICY.retainedRoots,
      )
    )
      fail('PRIVATE_SOURCE_BINDING_MISMATCH', 'sources');
    const snapshots = new Map<string, string>();
    for (const s of FIXED_POLICY.sources) {
      if (s.readMode === 'ARCHIVE_ONLY_NO_DEREFERENCE') continue;
      const root = FIXED_POLICY.retainedRoots.find(
        (r) => r.rootId === s.retainedRootId,
      )?.archiveAbsolutePath;
      if (
        !root ||
        path.join(root, s.relativeLocator) !== s.path ||
        s.bytes === null
      )
        fail('PRIVATE_SOURCE_BINDING_MISMATCH', s.sourceId);
      snapshots.set(
        s.sourceId,
        await read(root, s.relativeLocator, {
          path: s.relativeLocator,
          bytes: s.bytes,
          sha256: s.sha256,
        }),
      );
    }
    const countries = registryArray(
      registryRow(documents.get('COUNTRY_SOURCE_REGISTRY.json'), 'countries')
        .countries,
      'countries',
    ).map((v) => registryRow(v, 'country'));
    const native = registryRow(
      documents.get('NATIVE_LEAF_INDEX.json'),
      'native',
    );
    const leaves = registryArray(native.leaves, 'leaves').map((v) =>
      registryRow(v, 'leaf'),
    );
    const terms = registryArray(
      registryRow(documents.get('SETTLEMENT_TERMS_CANDIDATE.json'), 'terms')
        .terms,
      'terms',
    ).map((v) => registryRow(v, 'term'));
    if (
      countries.length !== 70 ||
      new Set(countries.map((c) => c.countryId)).size !== 70 ||
      leaves.length !== 1960 ||
      terms.length !== 4 ||
      new Set(terms.map((t) => t.flowId)).size !== 4 ||
      new Set(terms.map((t) => t.canonicalClaimId)).size !== 4
    )
      fail('IDENTITY_COVERAGE_INVALID', 'package');
    const facts: LocatedRegistryFact[] = [],
      gaps: RegistrySourceGap[] = [];
    const loaded: LoadedFinancialOpeningPackageRegistry = {
      packageManifestSha256: FIXED_POLICY.packageIdentity.manifest.sha256,
      schemaSha256: FIXED_POLICY.packageIdentity.schema.sha256,
      sourceRegistry,
      countries,
      nativeLeaves: leaves,
      terms,
      clearingIndex: registryRow(
        documents.get('CLEARING_SOURCE_INDEX.json'),
        'clearing',
      ),
      facts,
      sourceGaps: gaps,
      originalCarrierInput: null,
      selectedSourceIds: [...snapshots.keys()],
      archiveOnlySourceIds: FIXED_POLICY.sources
        .filter((s) => s.readMode === 'ARCHIVE_ONLY_NO_DEREFERENCE')
        .map((s) => s.sourceId),
      bytesRead: total,
    };
    instances.add(loaded);
    sourceSnapshots.set(loaded, snapshots);
    decodedSources.set(loaded, new Map());
    const walk = (
      v: unknown,
      field: string,
      country: string | null,
      owner: string | null,
    ): void => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, field + '/' + i, country, owner));
        return;
      }
      const r = v as Row;
      country = typeof r.countryId === 'string' ? r.countryId : country;
      owner =
        typeof r.ownerSlot === 'string'
          ? r.ownerSlot
          : typeof r.candidateOwnerId === 'string'
            ? r.candidateOwnerId
            : owner;
      if (
        Object.hasOwn(r, 'value') &&
        Object.hasOwn(r, 'evidenceClass') &&
        ['UNKNOWN', 'KNOWN_SOURCE_VALUE'].includes(String(r.status))
      ) {
        const fact = inspectFinancialRegistryFact(r);
        facts.push({ field, countryId: country, ownerLabel: owner, fact });
        if (fact.status === 'KNOWN_SOURCE_VALUE') {
          const selected = resolveFinancialRegistrySource(loaded, fact.source);
          if (selected.status === 'NOT_DEREFERENCED')
            gaps.push({
              code: 'BLOCKED_SOURCE_NOT_DEREFERENCED',
              sourceId: selected.sourceId,
              field,
            });
          else if (
            typeof fact.value === 'number'
              ? selected.value !== String(fact.value)
              : canonicalSerialize(selected.value) !==
                canonicalSerialize(fact.value)
          )
            fail('FACT_SOURCE_VALUE_MISMATCH', field);
        }
        return;
      }
      for (const [k, x] of Object.entries(r))
        walk(x, field + '/' + k, country, owner);
    };
    for (const name of [
      'COUNTRY_SOURCE_REGISTRY.json',
      'CLEARING_SOURCE_INDEX.json',
      'SETTLEMENT_TERMS_CANDIDATE.json',
    ])
      walk(documents.get(name), name, null, null);
    if (
      native.primarySourceId !== 'native_lc' ||
      native.nativeSourceDigest !==
        FIXED_POLICY.sources.find((s) => s.sourceId === 'native_lc')?.sha256
    )
      fail('NATIVE_PRIMARY_MISMATCH', 'native');
    const leafIds = new Set<string>();
    for (const leaf of leaves) {
      const summary = leaf.ownerLabel === null;
      exactKeys(
        leaf,
        [
          'countryId',
          'ownerLabel',
          'field',
          'sourceId',
          'nativeAmountPointer',
          'amount',
          'currency',
          'unit',
          'evidenceClass',
          ...(!summary ? ['originalGcuLineage'] : []),
          'spendableCash',
          'source',
        ],
        'leaf',
      );
      if (
        leaf.sourceId !== 'native_lc' ||
        leaf.unit !== 'LC' ||
        leaf.evidenceClass !== 'CONSTRUCTED' ||
        leaf.spendableCash !== false
      )
        fail('NATIVE_PRIMARY_MISMATCH', 'leaf');
      registryString(leaf.countryId, 'countryId');
      registryString(leaf.currency, 'currency');
      parseWorldDecimal(registryString(leaf.amount, 'amount'));
      const id =
        String(leaf.countryId) + ':' + String(leaf.nativeAmountPointer);
      if (leafIds.has(id)) fail('DUPLICATE_NATIVE_LEAF', id);
      leafIds.add(id);
      const locator = inspectLocator(leaf.source);
      if (
        locator.sourceId !== 'native_lc' ||
        locator.selector.pointer !== leaf.nativeAmountPointer
      )
        fail('NATIVE_LINEAGE_SWAPPED', id);
      const selected = resolveFinancialRegistrySource(loaded, locator);
      if (selected.status !== 'VERIFIED_LEAF' || selected.value !== leaf.amount)
        fail('NATIVE_AMOUNT_MISMATCH', id);
      const pointer = registryString(leaf.nativeAmountPointer, 'pointer');
      const meta = resolveFinancialRegistrySource(loaded, {
        sourceId: 'native_lc',
        selector: {
          kind: 'JSON_POINTER',
          pointer: pointer.slice(0, pointer.lastIndexOf('/')),
        },
      });
      if (
        meta.status !== 'VERIFIED_LEAF' ||
        registryRow(meta.value, 'nativeMoney').currency !== leaf.currency ||
        registryRow(meta.value, 'nativeMoney').unit !== leaf.unit
      )
        fail('NATIVE_UNIT_MISMATCH', id);
      if (!summary) {
        const lineage = registryRow(leaf.originalGcuLineage, 'lineage');
        if (
          lineage.primaryNativeSource !== false ||
          lineage.sourceId === 'native_lc' ||
          typeof leaf.ownerLabel !== 'string'
        )
          fail('NATIVE_LINEAGE_SWAPPED', id);
      } else if (!pointer.includes('/valuesNative/'))
        fail('SUMMARY_OWNER_INVALID', id);
    }
    return freezeFinancialInput(loaded);
  }
}
