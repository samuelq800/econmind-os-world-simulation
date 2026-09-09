#!/usr/bin/env python3
"""Read-only validation for the repository's R2-101.1 governance layer.

This utility reads local files only. It does not modify status, approve
decisions, run application code, access a database, or use the network.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_EXECUTION_MODES = {"NORMAL", "PARALLEL_PREPARATION"}
POLICY_PATH = "docs/governance/FAST_MAINLINE_REVIEW_POLICY.json"
IMPLEMENTATION_AGENT_STATUSES = {
    "IN_PROGRESS",
    "IMPLEMENTED_UNVERIFIED",
    "BLOCKED",
}
STEP_ID_PATTERN = re.compile(r"^V\d{2}\.\d+$")


class GovernanceError(Exception):
    pass


def validate(root: Path) -> dict[str, Any]:
    root = root.resolve()
    checks: list[dict[str, str]] = []
    errors: list[str] = []
    metrics: dict[str, Any] = {}

    def require(condition: bool, message: str) -> None:
        if not condition:
            raise GovernanceError(message)

    def file(relative: str) -> Path:
        target = (root / relative).resolve()
        require(target.is_relative_to(root), f"path escapes repository: {relative}")
        require(target.is_file(), f"missing required file: {relative}")
        return target

    def load_json(relative: str) -> Any:
        return json.loads(file(relative).read_text(encoding="utf-8"))

    def git(*arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def commit_exists(commit: Any, label: str) -> str:
        require(
            isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{40}", commit) is not None,
            f"{label} must be a full Git commit hash",
        )
        result = git("cat-file", "-e", f"{commit}^{{commit}}")
        require(result.returncode == 0, f"{label} does not exist: {commit}")
        return commit

    def is_ancestor(ancestor: str, descendant: str, label: str) -> None:
        result = git("merge-base", "--is-ancestor", ancestor, descendant)
        require(result.returncode == 0, f"{label}: {ancestor} is not an ancestor of {descendant}")

    def independent_review(subject: str, target: Any, review: Any) -> None:
        require(isinstance(review, dict), f"{subject} requires review metadata")
        require(review.get("decision") == "APPROVED", f"{subject} review decision must be APPROVED")
        reviewed_commit = commit_exists(review.get("reviewed_commit"), f"{subject} reviewed_commit")
        implementation_commit = commit_exists(target, f"{subject} implementation_commit")
        require(
            reviewed_commit == implementation_commit,
            f"{subject} reviewed_commit differs from implementation_commit",
        )
        review_file = review.get("review_file")
        require(
            isinstance(review_file, str) and review_file.startswith("docs/reports/"),
            f"{subject} review_file must be a repository report path",
        )
        file(review_file)
        require(review.get("owner_approved") is True, f"{subject} requires explicit owner approval")

    review_policy: dict[str, Any] = {}

    def verification_record(subject: str, target: Any, record: Any) -> None:
        require(isinstance(record, dict), f"{subject} requires verification metadata")
        method = record.get("method", "INDEPENDENT_REVIEW")
        if method == "INDEPENDENT_REVIEW":
            independent_review(subject, target, record)
            return
        require(method == "OWNER_FAST_TRACK", f"{subject} has invalid verification method")
        require(
            record.get("decision") == "OWNER_FAST_TRACK_ACCEPTED",
            f"{subject} fast-track decision must be OWNER_FAST_TRACK_ACCEPTED",
        )
        risk_class = record.get("risk_class")
        allowed = review_policy["verification_methods"]["OWNER_FAST_TRACK"][
            "allowed_risk_classes"
        ]
        require(risk_class in allowed, f"{subject} {risk_class} cannot use owner fast-track")
        implementation_commit = commit_exists(target, f"{subject} implementation_commit")
        require(
            commit_exists(record.get("reviewed_commit"), f"{subject} reviewed_commit")
            == implementation_commit,
            f"{subject} fast-track commit differs from implementation_commit",
        )
        evidence_file = record.get("evidence_file")
        require(
            isinstance(evidence_file, str) and evidence_file.startswith("docs/reports/"),
            f"{subject} fast-track evidence_file must be a repository report path",
        )
        file(evidence_file)
        require(
            record.get("automated_evidence_status") == "PASS",
            f"{subject} evidence did not pass",
        )
        require(
            record.get("p0_boundary_changed") is False,
            f"{subject} fast-track changed a P0 boundary",
        )
        require(record.get("owner_approved") is True, f"{subject} requires explicit owner fast-track")

    def check(name: str, operation: Callable[[], None]) -> None:
        try:
            operation()
            checks.append({"name": name, "status": "PASS"})
        except (GovernanceError, KeyError, OSError, TypeError, ValueError) as error:
            message = str(error)
            checks.append({"name": name, "status": "FAIL", "error": message})
            errors.append(f"{name}: {message}")

    steps_data: dict[str, Any] = {}
    steps: list[dict[str, Any]] = []
    step_by_id: dict[str, dict[str, Any]] = {}
    valid_statuses: set[str] = set()
    package_ids = {f"V{index:02d}" for index in range(33)}

    def required_files() -> None:
        required = [
            "AGENTS.md",
            "PLANS.md",
            "requirements.docx",
            "planning/01_新仓库架构与完整交付路线.md",
            "planning/02_架构裁决与数据库协议.md",
            "planning/03_33个工作包与依赖.md",
            "planning/04_完整功能覆盖登记.md",
            "planning/05_验收与交付清单.md",
            "planning/R2_33_WORK_PACKAGES_101_STEPS.md",
            "planning/r2_steps.json",
            "planning/work_packages.json",
            "status/progress.json",
            "status/decisions.json",
            POLICY_PATH,
            "docs/governance/r2/SOURCE_ATTRIBUTION.md",
            "docs/reports/governance/R2_GOVERNANCE_SYNC.md",
        ]
        for relative in required:
            require(file(relative).stat().st_size > 0, f"empty required file: {relative}")
        metrics["required_files"] = len(required)

    def fast_mainline_policy() -> None:
        nonlocal review_policy
        review_policy = load_json(POLICY_PATH)
        require(review_policy["schema_version"] == "FAST_MAINLINE-1", "wrong review policy schema")
        require(review_policy["active_mode"] == "FAST_MAINLINE", "FAST_MAINLINE is not active")
        require(
            review_policy["classification_order_low_to_high"] == ["P3", "P2", "P1", "P0"],
            "risk order must resolve upward to P0",
        )
        classes = review_policy["classes"]
        require(set(classes) == {"P0", "P1", "P2", "P3"}, "review classes must be P0-P3")
        require(classes["P0"]["blocking_independent_review"] is True, "P0 review must block")
        require(
            set(review_policy["verification_methods"]["OWNER_FAST_TRACK"]["allowed_risk_classes"])
            == {"P2", "P3"},
            "owner fast-track must be limited to P2/P3",
        )
        required_topics = {
            "authoritative World State",
            "database schema/migrations/RLS",
            "identity and authorization",
            "Command/Event/Receipt authority",
            "append-only ledger",
            "atomic settlement",
            "financial/inventory conservation",
            "single-writer semantics",
            "production environment",
            "determinism/idempotency",
            "cross-country settlement",
        }
        require(set(classes["P0"]["topics"]) == required_topics, "P0 topic set changed")
        required_prohibitions = {
            "downgrade a risk classification to bypass review",
            "approve its own P0 change",
            "ignore failed tests",
            "weaken Constitution requirements",
            "create a second Source of Truth",
            "permit UI authoritative mutation",
            "introduce direct macro buffs",
            "mutate production Supabase outside an authorized release",
        }
        require(
            set(review_policy["prohibitions"]) == required_prohibitions,
            "FAST_MAINLINE prohibitions changed",
        )
        metrics["review_mode"] = review_policy["active_mode"]

    def step_manifest() -> None:
        nonlocal steps_data, steps, step_by_id, valid_statuses
        steps_data = load_json("planning/r2_steps.json")
        require(steps_data["schema_version"] == "R2-101.1", "wrong step schema")
        status_model = steps_data["status_model"]
        require(isinstance(status_model, list), "status model must be a list")
        require(
            all(isinstance(status, str) and status for status in status_model),
            "status model contains an invalid value",
        )
        require(len(status_model) == len(set(status_model)), "duplicate status value")
        valid_statuses = set(status_model)
        require("PARTIAL" not in valid_statuses, "PARTIAL is not an authoritative status")
        require(
            IMPLEMENTATION_AGENT_STATUSES <= valid_statuses,
            "implementation-agent status vocabulary is missing from the status model",
        )
        steps = steps_data["steps"]
        ids = [step["step_id"] for step in steps]
        require(len(steps) == 101, f"expected 101 steps, found {len(steps)}")
        require(len(set(ids)) == 101, "step IDs are not unique")
        step_by_id = {step["step_id"]: step for step in steps}
        require(
            {step["work_package"] for step in steps} == package_ids,
            "step manifest does not represent V00-V32 exactly",
        )
        for step in steps:
            step_id = step["step_id"]
            for key in (
                "work_package",
                "stage",
                "work_package_title",
                "title",
                "execution_mode",
                "hard_dependencies",
                "purpose",
                "acceptance",
                "status_default",
            ):
                require(key in step, f"{step_id} missing required field {key}")
            require(STEP_ID_PATTERN.fullmatch(step_id) is not None, f"invalid step ID: {step_id}")
            require(
                step_id.split(".", 1)[0] == step["work_package"],
                f"step/package mismatch: {step_id}",
            )
            require(
                step["execution_mode"] in ALLOWED_EXECUTION_MODES,
                f"invalid execution mode {step_id}: {step['execution_mode']}",
            )
            require(
                isinstance(step["hard_dependencies"], list),
                f"hard dependencies must be a list: {step_id}",
            )
            require(
                isinstance(step["purpose"], str) and step["purpose"].strip(),
                f"empty purpose: {step_id}",
            )
            require(
                isinstance(step["acceptance"], str) and step["acceptance"].strip(),
                f"empty acceptance gate: {step_id}",
            )
            require(
                step["status_default"] in valid_statuses,
                f"invalid default status {step_id}: {step['status_default']}",
            )
        metrics["execution_modes"] = dict(
            sorted(
                {
                    mode: sum(step["execution_mode"] == mode for step in steps)
                    for mode in ALLOWED_EXECUTION_MODES
                }.items()
            )
        )
        metrics.update(work_packages=33, steps=101)

    def dependency_graph() -> None:
        ids = set(step_by_id)
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(step_id: str) -> None:
            require(step_id not in visiting, f"dependency cycle at {step_id}")
            if step_id in visited:
                return
            visiting.add(step_id)
            for dependency in step_by_id[step_id]["hard_dependencies"]:
                require(dependency in ids, f"{step_id} has missing dependency {dependency}")
                visit(dependency)
            visiting.remove(step_id)
            visited.add(step_id)

        for step_id in ids:
            visit(step_id)
        metrics["dependency_graph"] = "ACYCLIC"

    def human_navigation_matches() -> None:
        text = file("planning/R2_33_WORK_PACKAGES_101_STEPS.md").read_text(
            encoding="utf-8"
        )
        package_rows = re.findall(r"^## (V\d{2})｜(.+)$", text, re.MULTILINE)
        step_matches = list(
            re.finditer(r"^### (V\d{2}\.\d+)｜(.+)$", text, re.MULTILINE)
        )
        step_rows = [(match.group(1), match.group(2)) for match in step_matches]
        require(len(package_rows) == 33, "human navigation must contain 33 package headings")
        require(len(step_rows) == 101, "human navigation must contain 101 step headings")
        require(len(dict(package_rows)) == 33, "duplicate package heading")
        require(len(dict(step_rows)) == 101, "duplicate step heading")
        for step_id, title in step_rows:
            require(step_id in step_by_id, f"Markdown has unknown step {step_id}")
            require(step_by_id[step_id]["title"] == title, f"title mismatch for {step_id}")
        for index, match in enumerate(step_matches):
            step_id = match.group(1)
            step = step_by_id[step_id]
            block_end = (
                step_matches[index + 1].start()
                if index + 1 < len(step_matches)
                else len(text)
            )
            block = text[match.end() : block_end]

            def navigation_field(label: str) -> str:
                field_match = re.search(
                    rf"^- {re.escape(label)}：(.+)$", block, re.MULTILINE
                )
                require(field_match is not None, f"Markdown {step_id} missing {label}")
                return field_match.group(1).strip()

            dependency_text = navigation_field("Hard dependencies")
            dependencies = (
                []
                if dependency_text == "无"
                else [item.strip() for item in dependency_text.split(",")]
            )
            require(
                navigation_field("执行模式").strip("`") == step["execution_mode"],
                f"execution mode mismatch for {step_id}",
            )
            require(
                dependencies == step["hard_dependencies"],
                f"dependency mismatch for {step_id}",
            )
            require(
                navigation_field("目的") == step["purpose"],
                f"purpose mismatch for {step_id}",
            )
            require(
                navigation_field("Exit gate") == step["acceptance"],
                f"acceptance mismatch for {step_id}",
            )
        for package_id, title in package_rows:
            json_titles = {
                step["work_package_title"]
                for step in steps
                if step["work_package"] == package_id
            }
            require(json_titles == {title}, f"package title mismatch for {package_id}")

    def work_packages() -> None:
        packages = load_json("planning/work_packages.json")
        ids = [package["id"] for package in packages]
        require(len(packages) == 33, "work package file must contain 33 records")
        require(set(ids) == package_ids and len(set(ids)) == 33, "invalid package IDs")
        package_by_id = {package["id"]: package for package in packages}
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(package_id: str) -> None:
            require(package_id not in visiting, f"package dependency cycle at {package_id}")
            if package_id in visited:
                return
            visiting.add(package_id)
            for dependency in package_by_id[package_id]["depends_on"]:
                require(dependency in package_ids, f"unknown package dependency {dependency}")
                visit(dependency)
            visiting.remove(package_id)
            visited.add(package_id)

        for package in packages:
            visit(package["id"])
        metrics["work_package_dependency_graph"] = "ACYCLIC"

    def prompts() -> None:
        prompt_directory = root / "prompts/steps"
        actual = {path.stem for path in prompt_directory.glob("*.md")}
        require(actual == set(step_by_id), "step prompt set differs from step manifest")
        heading_pattern = re.compile(r"^# (V\d{2}\.\d+) — (.+)$", re.MULTILINE)
        for step_id, step in step_by_id.items():
            text = file(f"prompts/steps/{step_id}.md").read_text(encoding="utf-8")
            match = heading_pattern.search(text)
            require(match is not None, f"missing prompt heading: {step_id}")
            require(match.group(1) == step_id, f"wrong prompt ID: {step_id}")
            require(match.group(2) == step["title"], f"wrong prompt title: {step_id}")

            def prompt_match(pattern: str, field: str) -> re.Match[str]:
                field_match = re.search(pattern, text, re.MULTILINE)
                require(field_match is not None, f"missing prompt {field}: {step_id}")
                return field_match

            package_match = prompt_match(
                r"^- Work package: (V\d{2}) — (.+)$", "work package"
            )
            require(
                package_match.groups()
                == (step["work_package"], step["work_package_title"]),
                f"prompt work package mismatch: {step_id}",
            )
            require(
                prompt_match(r"^- Stage: (.+)$", "stage").group(1) == step["stage"],
                f"prompt stage mismatch: {step_id}",
            )
            require(
                prompt_match(
                    r"^- Execution mode: `([^`]+)`$", "execution mode"
                ).group(1)
                == step["execution_mode"],
                f"prompt execution mode mismatch: {step_id}",
            )
            dependency_text = prompt_match(
                r"^- Hard dependencies: (.+)$", "hard dependencies"
            ).group(1)
            prompt_dependencies = (
                []
                if dependency_text == "none"
                else [item.strip() for item in dependency_text.split(",")]
            )
            require(
                prompt_dependencies == step["hard_dependencies"],
                f"prompt dependency mismatch: {step_id}",
            )
            require(
                prompt_match(r"^## Goal\n([^\n]+)$", "goal").group(1)
                == step["purpose"],
                f"prompt goal mismatch: {step_id}",
            )
            require(
                prompt_match(r"^## Exit gate\n([^\n]+)$", "exit gate").group(1)
                == step["acceptance"],
                f"prompt exit gate mismatch: {step_id}",
            )
            require(POLICY_PATH in text, f"prompt lacks centralized policy reference: {step_id}")
            require(
                "P0 always stops for independent review" in text,
                f"prompt weakens P0 review: {step_id}",
            )
            require("PARTIAL" not in text, f"prompt authorizes PARTIAL: {step_id}")
        controls = [
            "ENTRY_CURRENT_STATE.md",
            "EXECUTE_NEXT_READY_STEP.md",
            "CONTINUE_INTERRUPTED_STEP.md",
            "INDEPENDENT_REVIEW.md",
            "FIX_BLOCKERS_ONLY.md",
            "PREPARE_ARCHITECTURE_DECISION.md",
            "CREATE_RETURN_REVIEW_PACKAGE.md",
            "RESUME_GOVERNANCE_SYNC.md",
        ]
        for name in controls:
            require(file(f"prompts/control/{name}").stat().st_size > 0, f"empty control {name}")
        active_documents = [
            file("AGENTS.md"),
            file("PLANS.md"),
            *sorted((root / "planning").glob("*.md")),
            *sorted((root / "prompts/control").glob("*.md")),
            *sorted((root / "templates").glob("*.md")),
        ]
        reference_pattern = re.compile(r"`(prompts/[^`]+\.md)`")
        checked_references = 0
        for document in active_documents:
            for reference in reference_pattern.findall(document.read_text(encoding="utf-8")):
                if "<" in reference or "*" in reference:
                    continue
                require(file(reference).is_file(), f"missing referenced prompt: {reference}")
                checked_references += 1
        metrics.update(step_prompts=101, control_prompts=len(controls))
        metrics["implementation_agent_statuses"] = sorted(
            IMPLEMENTATION_AGENT_STATUSES
        )
        metrics["static_prompt_references"] = checked_references

    def progress() -> None:
        progress_data = load_json("status/progress.json")
        require(progress_data["schema_version"] == "R2-101.1", "wrong progress schema")
        states = progress_data["steps"]
        require(set(states) == set(step_by_id), "progress step set differs from manifest")
        valid_states = set(steps_data["status_model"])
        implementation_commits = progress_data.get("implementation_commits", {})
        step_reviews = progress_data.get("step_reviews", {})
        require(
            isinstance(implementation_commits, dict) and set(implementation_commits) <= set(states),
            "invalid implementation_commits subjects",
        )
        require(
            isinstance(step_reviews, dict) and set(step_reviews) <= set(states),
            "invalid step_reviews subjects",
        )
        for step_id, state in states.items():
            require(state in valid_states, f"invalid progress state {step_id}: {state}")
            dependencies_ready = all(
                states[dependency] == "VERIFIED"
                for dependency in step_by_id[step_id]["hard_dependencies"]
            )
            if state in {"IN_PROGRESS", "IMPLEMENTED_UNVERIFIED", "CHANGES_REQUIRED", "VERIFIED"}:
                require(dependencies_ready, f"impossible {state} dependency claim: {step_id}")
            if state == "VERIFIED":
                verification_record(
                    step_id,
                    implementation_commits.get(step_id),
                    step_reviews.get(step_id),
                )
            else:
                require(step_id not in step_reviews, f"non-VERIFIED step carries approved review: {step_id}")

        require(states["V00.1"] == "VERIFIED", "V00.1 must remain VERIFIED")
        require(
            states["V00.2"]
            in {"BLOCKED", "IN_PROGRESS", "IMPLEMENTED_UNVERIFIED", "VERIFIED"},
            "V00.2 has an invalid current lifecycle state",
        )
        sync = progress_data["governance_sync"]
        require(sync.get("status") == "VERIFIED", "governance sync must remain VERIFIED")
        independent_review("Governance Sync", sync.get("implementation_commit"), sync.get("review"))
        require("merge_authorized" not in sync, "legacy separate merge authorization is unsupported")

        reconciliation = sync.get("final_reconciliation")
        require(isinstance(reconciliation, dict), "missing final_reconciliation")
        require(
            reconciliation.get("status") in {"PASS", "FAIL", "NOT_RUN", "INSUFFICIENT_EVIDENCE"},
            "invalid final_reconciliation status",
        )
        integration = sync.get("integration")
        require(isinstance(integration, dict), "missing governance integration status")
        require(integration.get("status") in {"PENDING", "MERGED"}, "invalid governance integration status")
        merged = integration["status"] == "MERGED"
        if merged:
            merged_commit = commit_exists(integration.get("merged_commit"), "governance merged_commit")
            is_ancestor(merged_commit, "refs/remotes/origin/main", "governance remote integration")
            is_ancestor(merged_commit, "HEAD", "governance local integration")
        else:
            require(integration.get("merged_commit") is None, "pending integration cannot name merged_commit")

        v002_ready = merged and reconciliation["status"] == "PASS"
        require(
            states["V00.2"] == "BLOCKED" or v002_ready,
            "V00.2 implementation requires merged governance and passing final reconciliation",
        )
        gate = progress_data["current_gate"]
        require(
            gate.get("step_id") in states and gate.get("status") == states[gate["step_id"]],
            "current_gate status differs from step truth",
        )
        next_step = gate.get("next_step")
        require(next_step in states, "current_gate names an unknown next step")
        dependency_ready = (
            v002_ready
            if next_step == "V00.2"
            else all(states[dependency] == "VERIFIED" for dependency in step_by_id[next_step]["hard_dependencies"])
        )
        required_gate = gate.get("required_gate")
        if required_gate is None:
            gate_open = True
        else:
            require(isinstance(required_gate, str) and required_gate, "invalid required_gate")
            require(gate.get("gate_status") in {"PENDING", "PASS"}, "invalid package gate status")
            gate_open = gate["gate_status"] == "PASS"
        next_ready = dependency_ready and gate_open
        require(
            gate.get("next_step_ready") is next_ready,
            "current_gate next_step_ready differs from validated readiness",
        )
        metrics["progress_states"] = dict(
            sorted({state: list(states.values()).count(state) for state in valid_states}.items())
        )
        metrics.update(
            governance_sync_status=sync["status"],
            governance_integration=integration["status"],
            approved_reviews=1 + sum(state == "VERIFIED" for state in states.values()),
            v002_ready=v002_ready,
            required_gate=required_gate,
        )

    def decisions() -> None:
        decision_data = load_json("status/decisions.json")
        records = decision_data["decisions"]
        expected = {f"ADR-{index:02d}" for index in range(1, 21)}
        ids = [record["id"] for record in records]
        require(len(records) == 20 and set(ids) == expected, "decision register must contain ADR-01..20")
        require(len(set(ids)) == 20, "duplicate decision ID")
        for record in records:
            for key in (
                "subject",
                "status",
                "proposal",
                "latest_gate",
                "affected_work_packages",
                "approval_required_from",
                "approval_record",
            ):
                require(key in record, f"{record['id']} missing {key}")
            require(record["status"] == "PROPOSED_NOT_APPROVED", f"{record['id']} was self-approved")
            require(record["approval_record"] is None, f"{record['id']} has unsupported approval")
            require(
                set(record["affected_work_packages"]) <= package_ids,
                f"{record['id']} names an invalid work package",
            )
        metrics["decisions"] = 20

    def source_material() -> None:
        manifest = load_json("requirements/source_manifest.json")
        require(len(manifest) == 8, "source manifest must contain eight documents")
        for record in manifest:
            source = file(record["original_path"])
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            require(digest == record["sha256"], f"source hash mismatch: {record['id']}")
            file(record["extracted_path"])
        constitution_hash = hashlib.sha256(file("requirements.docx").read_bytes()).hexdigest()
        constitution = next(record for record in manifest if record["id"] == "CONSTITUTION")
        require(constitution_hash == constitution["sha256"], "requirements.docx differs from Constitution")
        metrics["source_documents"] = 8

    def templates() -> None:
        required_templates = [
            "templates/EXECUTION_PLAN.md",
            "templates/IMPLEMENTATION_REPORT.md",
            "templates/TEST_EVIDENCE.template.json",
            "templates/INDEPENDENT_REVIEW.md",
            "templates/ADR.md",
            "templates/RELEASE_ACCEPTANCE.md",
        ]
        vocabulary = {"PASS", "FAIL", "NOT_RUN", "INSUFFICIENT_EVIDENCE"}
        for relative in required_templates:
            text = file(relative).read_text(encoding="utf-8")
            require(all(item in text for item in vocabulary), f"evidence vocabulary missing: {relative}")
            if relative.endswith(".json"):
                json.loads(text)
        metrics["standard_templates"] = len(required_templates)

    for name, operation in (
        ("required_governance_files", required_files),
        ("fast_mainline_policy", fast_mainline_policy),
        ("r2_step_manifest", step_manifest),
        ("step_dependencies", dependency_graph),
        ("human_navigation_matches_json", human_navigation_matches),
        ("work_packages", work_packages),
        ("control_and_step_prompts", prompts),
        ("progress_truth", progress),
        ("decision_register", decisions),
        ("source_material", source_material),
        ("templates", templates),
    ):
        check(name, operation)

    return {
        "scope": "R2_GOVERNANCE_READ_ONLY",
        "status": "PASS" if not errors else "FAIL",
        "application_code_executed": False,
        "database_access": False,
        "checks": checks,
        "metrics": metrics,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--json", action="store_true")
    arguments = parser.parse_args()
    result = validate(arguments.root)
    if arguments.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["status"])
        for check_result in result["checks"]:
            suffix = f": {check_result['error']}" if "error" in check_result else ""
            print(f"{check_result['status']}: {check_result['name']}{suffix}")
        print(json.dumps(result["metrics"], ensure_ascii=False, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
