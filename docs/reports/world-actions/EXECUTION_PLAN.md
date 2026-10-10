# Execution plan: reviewed HOLD GitHub Actions

## Authority and scope

User requested the econmind-os pattern of GitHub Actions and confirmed no
Cloudflare CI API Token exists. Scope is a separate World hosting workflow:
prepare and optionally republish the already reviewed HOLD release. Constitution,
AGENTS.md, PLANS.md and FAST_MAINLINE_REVIEW_POLICY.json remain controlling.

No economic Work Package completion or ADR approval is claimed. The immutable
hosting dependency is e7ecf45184baad69a37e2e51fff8862a635267dc, independently
approved in CLOUDFLARE_RUNTIME_INDEPENDENT_REVIEW_2026_10_09.md and published
with CLOUDFLARE_RUNTIME_DEPLOYMENT_EVIDENCE_2026_10_09.json. Those records approve
the hosted code; they do not approve this new deployment pipeline.

## Dependency and decision gate

V09 remains PLANNED and next_step_ready=false in status/progress.json. ADR18
does not authorize production economic activation. This hosting-only preparation
does not unlock V09 or dependent economic implementation.

Effective risk P0: deployment authorization and an external production account.
Implementation stays IMPLEMENTED_UNVERIFIED until independent approval of the
immutable pipeline candidate and actual evidence. No owner fast-track is inferred.

## Change plan

Add world-runtime-actions.yml, its release helper, ordinary fail-closed tests,
artifact ignore rule and collaborator/operator runbook. API/Worker/Core/browser
implementations and the frozen lockfile are unchanged. No commands, events,
postings, authoritative World writes, database/RLS/migrations, paid resources,
Clock, lease or legacy EconMind mutation are introduced.

Preparation uses no cloud credential and validates/builds fixed reviewed code.
Manual publication, from main only, uses an environment Token and the fixed
account; verifies the exact two existing HOLD targets, then publishes executor
and API. Unknown outcomes stop without automatic retry or rollback. Database
publication and its Secrets remain in econmind-os's unique approved chain.

## Validation plan

Run pinned Node24.20.0/pnpm12.3.4 with frozen dependencies, actionlint1.7.7,
JavaScript syntax, targeted lint/format and release guards. Run unmodified full
pnpm check with complete history in the existing macOS full-check environment.
Build immutable HOLD with Wrangler4.148.0,
run real workerd eleven checks, validate original bundle hashes and download
the prepared artifact to verify its layout and bytes.

Negative cases cover missing Token, wrong repository/event/ref/confirmation/
account, altered artifacts, extra database binding, wrong service, ACTIVE mode,
preview/public executor and cron. No cloud publication test uses fake credentials.

## Exit condition

Record actual PASS/FAIL/NOT_RUN/INSUFFICIENT_EVIDENCE with commands, environment
and exit codes. Required independent review precedes merge/VERIFIED. Publication
remains NOT_RUN without a CI Token. Missing formal economic dependencies remain
blocked and no repository-controlled gate advances.
