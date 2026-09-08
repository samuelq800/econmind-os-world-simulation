# Resume R2 Governance Sync — use the corrected 101-step authority

You are resuming `chore/r2-governance-sync` after the previous sync correctly stopped because the earlier pack did not contain an authoritative 101-step definition.

Authoritative correction package now provides:
- `PLANS.md`
- `planning/r2_steps.json` — exactly 101 step IDs with hard dependencies
- `planning/R2_33_WORK_PACKAGES_101_STEPS.md`
- `prompts/steps/*.md` — one prompt per step
- `status/progress.template.json`
- `status/decisions.template.json`

First run structural validation yourself:
1. exactly 33 work packages V00–V32 are represented;
2. exactly 101 unique step IDs exist;
3. every hard dependency resolves;
4. dependency graph is acyclic;
5. JSON and Markdown titles/IDs agree;
6. do not copy template progress statuses blindly — derive actual repository status.

Then continue the original governance-sync task on the governance branch only. Do not touch runtime/product files. In current repository truth, V00.1 remains whatever the latest independent review establishes; do not mark it VERIFIED merely because this package exists. V00.2 remains blocked until V00.1 is VERIFIED and governance sync itself is reviewed/merged.
