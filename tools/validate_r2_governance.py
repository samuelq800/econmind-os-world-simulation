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
    continuation_policy: dict[str, Any] = {}

    def verification_record(subject: str, target: Any, record: Any) -> None:
        require(isinstance(record, dict), f"{subject} requires verification metadata")
        method = record.get("method", "INDEPENDENT_REVIEW")
        if method == "INDEPENDENT_REVIEW":
            independent_review(subject, target, record)
            return
        if method == "PROJECT_OWNER_ACCEPTANCE":
            expected_foundation_steps = {
                f"V{package:02d}.{step}"
                for package in range(2, 6)
                for step in range(1, 4)
            }
            require(
                subject in expected_foundation_steps,
                f"{subject} cannot use Gate A project-owner acceptance",
            )
            method_policy = review_policy["verification_methods"][method]
            require(record.get("gate_id") in method_policy["allowed_gates"], f"{subject} has invalid owner-acceptance gate")
            require(record.get("decision") == method_policy["decision"], f"{subject} owner-acceptance decision must be PASSED")
            require(record.get("risk_class") in method_policy["allowed_risk_classes"], f"{subject} owner acceptance must remain P0")
            implementation_commit = commit_exists(target, f"{subject} implementation_commit")
            require(
                commit_exists(record.get("reviewed_commit"), f"{subject} reviewed_commit")
                == implementation_commit,
                f"{subject} owner-acceptance commit differs from implementation_commit",
            )
            evidence_file = record.get("evidence_file")
            require(
                isinstance(evidence_file, str) and evidence_file.startswith("docs/reports/"),
                f"{subject} owner-acceptance evidence_file must be a repository report path",
            )
            file(evidence_file)
            require(record.get("baseline_evidence_status") == "PASS", f"{subject} baseline evidence did not pass")
            require(record.get("targeted_regression_status") == "PASS", f"{subject} targeted regressions did not pass")
            require(record.get("independent_review_claimed") is False, f"{subject} incorrectly claims independent review")
            require(record.get("open_ended_adversarial_required") is False, f"{subject} has invalid owner test-policy boundary")
            require(record.get("owner_approved") is True, f"{subject} requires explicit project-owner acceptance")
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
            "requirements/requirement_registry.json",
            "requirements/source_unit_assignments.jsonl",
            "requirements/adr_dependency_map.json",
            "requirements/two_repository_integration_contract.json",
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
        nonlocal review_policy, continuation_policy
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
        continuation_method = review_policy["verification_methods"].get(
            "OWNER_AUTHORIZED_PACKAGE_CONTINUATION"
        )
        require(
            isinstance(continuation_method, dict)
            and set(continuation_method.get("allowed_risk_classes", []))
            == {"P0", "P1"}
            and continuation_method.get("decision")
            == "ACCEPTED_FOR_MAINLINE_CONTINUATION"
            and continuation_method.get("requires_explicit_owner_instruction")
            is True
            and continuation_method.get(
                "requires_exact_branch_and_ordered_step_scope"
            )
            is True
            and continuation_method.get(
                "requires_immutable_candidate_and_passing_applicable_evidence"
            )
            is True
            and continuation_method.get("requires_package_exit_review") is True
            and continuation_method.get("cannot_mark_verified") is True
            and continuation_method.get("cannot_authorize_merge") is True,
            "owner-authorized package continuation policy is incomplete",
        )
        continuation_records = review_policy.get("scoped_continuation_records")
        require(
            continuation_records
            == ["docs/governance/WORLD_CORE_V06_CONTINUATION_POLICY.json"],
            "unexpected scoped continuation records",
        )
        continuation_policy = load_json(continuation_records[0])
        continuation_scope = continuation_policy.get("scope", {})
        require(
            continuation_policy.get("schema_version")
            == "WORLD_CORE_PACKAGE_CONTINUATION-1"
            and continuation_policy.get("record_type")
            == "OWNER_AUTHORIZED_PACKAGE_CONTINUATION"
            and continuation_policy.get("status") == "ACTIVE"
            and continuation_policy.get("authority")
            == "RESPONSIBLE_HUMAN_OWNER"
            and continuation_scope.get("branch")
            == "codex/world-core-v06-v10"
            and continuation_scope.get("allowed_steps")
            == ["V06.1", "V06.2", "V06.3"]
            and continuation_scope.get("terminal_gate") == "V06_PACKAGE_REVIEW",
            "V06 continuation scope or authority changed",
        )
        activation_record = continuation_policy.get("activation_record")
        require(
            isinstance(activation_record, str)
            and activation_record.startswith("docs/reports/V06/"),
            "V06 continuation activation record is invalid",
        )
        activation_text = file(activation_record).read_text(encoding="utf-8")
        require(
            "Decision: ACCEPTED_FOR_MAINLINE_CONTINUATION" in activation_text
            and "Authority: RESPONSIBLE_HUMAN_OWNER" in activation_text
            and "not a Codex self-approval" in activation_text,
            "V06 owner continuation activation evidence is incomplete",
        )
        review_exception = continuation_policy.get("review_unavailability_exception")
        require(
            isinstance(review_exception, dict)
            and review_exception.get("status") == "ACTIVE"
            and review_exception.get("authority") == "RESPONSIBLE_HUMAN_OWNER"
            and review_exception.get("from_step") == "V06.2"
            and review_exception.get("to_step") == "V06.3"
            and review_exception.get("implementation_commit")
            == "4e35c07758f4d39b05dac402eeb03b080275c3e0"
            and review_exception.get("evidence_commit")
            == "721993d871a72e0f12c9cfd115c5b04fc7abdcab"
            and review_exception.get("independent_review")
            == "UNAVAILABLE_SYSTEM_ERROR"
            and review_exception.get("owner_continuation_authorized") is True
            and review_exception.get("independent_closure_claimed") is False
            and review_exception.get("verification_claimed") is False
            and review_exception.get("merge_authorized") is False,
            "V06 review-unavailability exception differs from owner authority",
        )
        review_exception_record = review_exception.get("record")
        require(
            isinstance(review_exception_record, str)
            and review_exception_record.startswith("docs/reports/V06.2/"),
            "V06 review-unavailability record path is invalid",
        )
        review_exception_text = file(review_exception_record).read_text(
            encoding="utf-8"
        )
        require(
            "Decision: OWNER_CONTINUATION_AFTER_REVIEW_UNAVAILABLE"
            in review_exception_text
            and "Authority: RESPONSIBLE_HUMAN_OWNER" in review_exception_text
            and "not `VERIFIED`" in review_exception_text,
            "V06 review-unavailability owner record is incomplete",
        )
        owner_acceptance = review_policy["verification_methods"].get("PROJECT_OWNER_ACCEPTANCE")
        require(isinstance(owner_acceptance, dict), "missing Gate A project-owner acceptance policy")
        require(
            owner_acceptance.get("allowed_risk_classes") == ["P0"]
            and owner_acceptance.get("allowed_gates") == ["GATE_A_FOUNDATION_REVIEW"]
            and owner_acceptance.get("decision") == "PASSED"
            and owner_acceptance.get("requires_explicit_owner_instruction") is True
            and owner_acceptance.get("requires_passing_baseline_evidence") is True
            and owner_acceptance.get("requires_passing_targeted_regressions") is True
            and owner_acceptance.get("requires_preserved_prior_findings") is True
            and owner_acceptance.get("independent_review_claimed") is False
            and owner_acceptance.get("open_ended_adversarial_required") is False
            and owner_acceptance.get("cannot_approve_adrs") is True,
            "Gate A project-owner acceptance policy changed",
        )
        test_scope = review_policy.get("test_scope")
        require(
            isinstance(test_scope, dict)
            and test_scope.get("mode") == "NORMAL_ENGINEERING_VERIFICATION"
            and isinstance(test_scope.get("required"), list)
            and isinstance(test_scope.get("new_proactive_work_not_required"), list)
            and isinstance(test_scope.get("preservation_rule"), str),
            "normal engineering verification scope is incomplete",
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
        foundation_sprint = progress_data.get("foundation_sprint")
        continuation = progress_data.get("world_core_continuation")
        continuation_steps: list[str] = []
        continuation_completed: dict[str, Any] = {}
        foundation_steps: set[str] = set()
        foundation_finalized = False
        require(
            isinstance(implementation_commits, dict) and set(implementation_commits) <= set(states),
            "invalid implementation_commits subjects",
        )
        require(
            isinstance(step_reviews, dict) and set(step_reviews) <= set(states),
            "invalid step_reviews subjects",
        )
        if continuation is not None:
            require(isinstance(continuation, dict), "invalid World Core continuation record")
            continuation_steps = continuation_policy["scope"]["allowed_steps"]
            continuation_status = continuation.get("status")
            require(
                continuation_status in {"ACTIVE", "COMPLETED"}
                and continuation.get("method")
                == "OWNER_AUTHORIZED_PACKAGE_CONTINUATION"
                and continuation.get("policy_file")
                == "docs/governance/WORLD_CORE_V06_CONTINUATION_POLICY.json"
                and continuation.get("activation_record")
                == continuation_policy.get("activation_record")
                and continuation.get("branch")
                == continuation_policy["scope"]["branch"]
                and continuation.get("allowed_steps") == continuation_steps
                and continuation.get("terminal_gate")
                == continuation_policy["scope"]["terminal_gate"]
                and continuation.get("production_mutation") is False
                and continuation.get("owner_approved") is True,
                "World Core continuation status differs from owner policy",
            )
            if continuation_status == "ACTIVE":
                require(
                    continuation.get("decision")
                    == "ACCEPTED_FOR_MAINLINE_CONTINUATION"
                    and continuation.get("independent_review_pending") is True
                    and continuation.get("merge_authorized") is False,
                    "active World Core continuation has invalid gate state",
                )
                branch = git("branch", "--show-current")
                require(
                    branch.returncode == 0
                    and branch.stdout.strip() == continuation.get("branch"),
                    "active World Core continuation is used outside its exact branch",
                )
            else:
                require(
                    continuation.get("decision") == "V06_PACKAGE_APPROVED"
                    and continuation.get("independent_review_pending") is False
                    and continuation.get("merge_authorized") is True,
                    "completed World Core continuation lacks package approval",
                )
                approved_target = commit_exists(
                    continuation.get("approved_package_target"),
                    "V06 approved package target",
                )
                is_ancestor(approved_target, "HEAD", "V06 approved package target")
                acceptance_record = continuation.get("acceptance_record")
                require(
                    acceptance_record == "docs/reports/V06/FINAL_ACCEPTANCE.md",
                    "completed World Core continuation lacks owner acceptance record",
                )
                file(acceptance_record)
            continuation_completed = continuation.get("completed_steps", {})
            require(
                isinstance(continuation_completed, dict)
                and set(continuation_completed) <= set(continuation_steps),
                "World Core continuation completed-step set is invalid",
            )
            for completed_step, record in continuation_completed.items():
                require(
                    isinstance(record, dict)
                    and record.get("automated_evidence_status") == "PASS",
                    f"{completed_step} lacks passing continuation evidence",
                )
                implementation_commit = commit_exists(
                    record.get("implementation_commit"),
                    f"{completed_step} continuation implementation_commit",
                )
                require(
                    implementation_commits.get(completed_step)
                    == implementation_commit,
                    f"{completed_step} continuation commit differs from progress truth",
                )
                evidence_file = record.get("evidence_file")
                require(
                    isinstance(evidence_file, str)
                    and evidence_file
                    in progress_data.get("step_evidence", {}).get(completed_step, []),
                    f"{completed_step} continuation evidence is not registered",
                )
                evidence = load_json(evidence_file)
                require(
                    evidence.get("step_id") == completed_step
                    and evidence.get("commit") == implementation_commit
                    and any(
                        command.get("command") == "pnpm check"
                        and command.get("result") == "PASS"
                        and command.get("exit_code") == 0
                        for command in evidence.get("commands", [])
                    ),
                    f"{completed_step} continuation evidence lacks a passing full check",
                )
                independent_finding_status = record.get("independent_finding_status")
                if independent_finding_status is not None:
                    require(
                        independent_finding_status
                        in {
                            "P0_CLOSURE_PENDING",
                            "OWNER_CONTINUATION_ACCEPTED_CLOSURE_PENDING",
                            "CLEAR",
                        },
                        f"{completed_step} has invalid independent finding status",
                    )
                    findings_file = record.get("review_findings_file")
                    require(
                        isinstance(findings_file, str)
                        and findings_file
                        in progress_data.get("step_evidence", {}).get(completed_step, [])
                        and file(findings_file).is_file(),
                        f"{completed_step} independent finding evidence is not registered",
                    )
                    if (
                        independent_finding_status
                        == "OWNER_CONTINUATION_ACCEPTED_CLOSURE_PENDING"
                    ):
                        owner_record = record.get("owner_continuation_record")
                        require(
                            record.get("owner_approved") is True
                            and record.get("independent_review")
                            == "UNAVAILABLE_SYSTEM_ERROR"
                            and record.get("owner_continuation_authorized") is True
                            and record.get("independent_closure_claimed") is False
                            and owner_record
                            == continuation_policy[
                                "review_unavailability_exception"
                            ]["record"]
                            and file(owner_record).is_file(),
                            f"{completed_step} owner continuation exception is incomplete",
                        )
                    if independent_finding_status == "CLEAR":
                        continuation_review = record.get("continuation_review")
                        review_evidence_file = (
                            continuation_review.get("evidence_file")
                            if isinstance(continuation_review, dict)
                            else None
                        )
                        require(
                            isinstance(continuation_review, dict)
                            and continuation_review.get("decision")
                            == "APPROVED_FOR_CONTINUATION"
                            and continuation_review.get("reviewed_commit")
                            == "721993d871a72e0f12c9cfd115c5b04fc7abdcab"
                            and continuation_review.get("bound_code_candidate")
                            == implementation_commit
                            and continuation_review.get("closed_p0_findings") == 2
                            and continuation_review.get("remaining_p0_blockers") == 0
                            and continuation_review.get("package_verified") is False
                            and isinstance(review_evidence_file, str)
                            and review_evidence_file
                            in progress_data.get("step_evidence", {}).get(
                                completed_step, []
                            )
                            and file(review_evidence_file).is_file(),
                            f"{completed_step} independent finding closure is incomplete",
                        )
                evidence_commit = record.get("evidence_commit")
                if evidence_commit is not None:
                    evidence_commit = commit_exists(
                        evidence_commit,
                        f"{completed_step} continuation evidence_commit",
                    )
                    is_ancestor(
                        implementation_commit,
                        evidence_commit,
                        f"{completed_step} implementation-to-evidence binding",
                    )
                    is_ancestor(
                        evidence_commit,
                        "HEAD",
                        f"{completed_step} evidence is not in current history",
                    )
        if foundation_sprint is not None:
            require(isinstance(foundation_sprint, dict), "invalid foundation_sprint")
            expected_foundation_steps = {
                f"V{package:02d}.{step}"
                for package in range(2, 6)
                for step in range(1, 4)
            }
            foundation_steps = set(foundation_sprint.get("allowed_steps", []))
            require(
                foundation_steps == expected_foundation_steps,
                "Foundation sprint must cover exactly V02.1-V05.3",
            )
            foundation_status = foundation_sprint.get("status")
            require(
                foundation_status in {"IMPLEMENTED_UNVERIFIED", "VERIFIED"},
                "invalid Foundation sprint status",
            )
            foundation_finalized = foundation_status == "VERIFIED"
            expected_branch = (
                "codex/gate-a-targeted-fixes"
                if foundation_finalized
                else "codex/foundation-v02-v05"
            )
            require(foundation_sprint.get("branch") == expected_branch, "unexpected Foundation sprint branch")
            require(
                foundation_sprint.get("review_gate") == "GATE_A_FOUNDATION_REVIEW",
                "Foundation sprint requires Gate A",
            )
            require(foundation_sprint.get("production_mutation") is False, "Foundation sprint cannot mutate production")
            if foundation_finalized:
                require(
                    foundation_sprint.get("merge_allowed") is True
                    and foundation_sprint.get("independent_review_pending") is False
                    and foundation_sprint.get("verification_method") == "PROJECT_OWNER_ACCEPTANCE"
                    and foundation_sprint.get("decision") == "PASSED",
                    "finalized Foundation sprint acceptance is incomplete",
                )
                evidence_commit = commit_exists(
                    foundation_sprint.get("evidence_commit"),
                    "Foundation sprint evidence_commit",
                )
                integration = foundation_sprint.get("integration")
                require(isinstance(integration, dict), "missing Foundation integration status")
                require(integration.get("status") in {"PENDING", "MERGED"}, "invalid Foundation integration status")
                if integration["status"] == "MERGED":
                    merged_commit = commit_exists(integration.get("merged_commit"), "Foundation merged_commit")
                    is_ancestor(merged_commit, "refs/remotes/origin/main", "Foundation remote integration")
                    is_ancestor(merged_commit, "HEAD", "Foundation local integration")
                else:
                    require(integration.get("merged_commit") is None, "pending Foundation integration cannot name merged_commit")
            else:
                require(
                    foundation_sprint.get("merge_allowed") is False
                    and foundation_sprint.get("independent_review_pending") is True,
                    "Foundation sprint pending-review flags changed",
                )
            candidate_commit = commit_exists(
                foundation_sprint.get("candidate_commit"),
                "Foundation sprint candidate_commit",
            )
            is_ancestor(candidate_commit, "HEAD", "Foundation sprint candidate")
            if foundation_finalized:
                is_ancestor(candidate_commit, evidence_commit, "Foundation candidate evidence")
                gate_a_final = progress_data.get("gate_a_final")
                require(isinstance(gate_a_final, dict), "missing Gate A final record")
                require(
                    gate_a_final.get("gate") == "A"
                    and gate_a_final.get("decision") == "PASSED"
                    and gate_a_final.get("authority") == "PROJECT_OWNER_ACCEPTANCE"
                    and gate_a_final.get("code_candidate_commit") == candidate_commit
                    and gate_a_final.get("evidence_commit") == evidence_commit
                    and gate_a_final.get("test_policy") == "NORMAL_ENGINEERING_VERIFICATION"
                    and gate_a_final.get("open_ended_adversarial_probing")
                    == "NOT_REQUIRED_BY_OWNER_POLICY"
                    and gate_a_final.get("independent_review_claimed") is False
                    and gate_a_final.get("owner_approved") is True,
                    "Gate A final record differs from accepted owner policy",
                )
                file(gate_a_final.get("evidence_file"))
        for step_id, state in states.items():
            require(state in valid_states, f"invalid progress state {step_id}: {state}")
            dependencies_ready = all(
                states[dependency] == "VERIFIED"
                for dependency in step_by_id[step_id]["hard_dependencies"]
            )
            if state in {"IN_PROGRESS", "IMPLEMENTED_UNVERIFIED", "CHANGES_REQUIRED", "VERIFIED"}:
                batch_dependencies_ready = (
                    state in {"IN_PROGRESS", "IMPLEMENTED_UNVERIFIED"}
                    and step_id in foundation_steps
                    and all(
                        states[dependency] == "VERIFIED"
                        or (
                            dependency in foundation_steps
                            and states[dependency] == "IMPLEMENTED_UNVERIFIED"
                        )
                        for dependency in step_by_id[step_id]["hard_dependencies"]
                    )
                )
                continuation_dependencies_ready = (
                    state in {"IN_PROGRESS", "IMPLEMENTED_UNVERIFIED"}
                    and step_id in continuation_steps
                    and all(
                        states[dependency] == "VERIFIED"
                        or (
                            continuation_steps.index(step_id) > 0
                            and dependency
                            == continuation_steps[
                                continuation_steps.index(step_id) - 1
                            ]
                            and states[dependency] == "IMPLEMENTED_UNVERIFIED"
                            and dependency in continuation_completed
                            and continuation_completed[dependency].get(
                                "independent_finding_status"
                            )
                            != "P0_CLOSURE_PENDING"
                        )
                        for dependency in step_by_id[step_id]["hard_dependencies"]
                    )
                )
                require(
                    dependencies_ready
                    or batch_dependencies_ready
                    or continuation_dependencies_ready,
                    f"impossible {state} dependency claim: {step_id}",
                )
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
        owner_decisions = {
            decision["id"]: decision
            for decision in load_json("status/decisions.json")["decisions"]
        }
        group_a_ready = all(
            owner_decisions[decision_id].get("status") == "APPROVED"
            and owner_decisions[decision_id].get("approval_record")
            for decision_id in ("ADR-01", "ADR-03")
        )
        foundation_integrated = (
            not foundation_finalized
            or foundation_sprint.get("integration", {}).get("status") == "MERGED"
        )
        continuation_next_ready = False
        if next_step in continuation_steps:
            next_index = continuation_steps.index(next_step)
            if next_index > 0:
                previous_step = continuation_steps[next_index - 1]
                continuation_next_ready = (
                    gate.get("step_id") == previous_step
                    and states[previous_step]
                    in {"IMPLEMENTED_UNVERIFIED", "VERIFIED"}
                    and previous_step in continuation_completed
                    and continuation_completed[previous_step].get(
                        "independent_finding_status"
                    )
                    != "P0_CLOSURE_PENDING"
                    and required_gate == continuation.get("terminal_gate")
                    and gate.get("gate_status") == "PENDING"
                )
        next_ready = (dependency_ready and gate_open) or continuation_next_ready
        if next_step == "V06.1":
            next_ready = next_ready and foundation_integrated and group_a_ready
        require(
            gate.get("next_step_ready") is next_ready,
            "current_gate next_step_ready differs from validated readiness",
        )
        if foundation_steps:
            expected_foundation_state = "VERIFIED" if foundation_finalized else "IMPLEMENTED_UNVERIFIED"
            require(
                all(states[step_id] == expected_foundation_state for step_id in foundation_steps),
                "Foundation step state differs from sprint state",
            )
            v06_started = any(
                states[f"V06.{step}"] != "PLANNED" for step in range(1, 4)
            )
            if v06_started:
                require(
                    foundation_finalized and foundation_integrated and group_a_ready,
                    "V06 started before Gate A integration and Group A owner decisions",
                )
            else:
                require(
                    required_gate == "GATE_A_FOUNDATION_REVIEW"
                    and next_step == "V06.1",
                    "Foundation current gate changed before V06 start",
                )
                require(
                    gate.get("gate_status")
                    == ("PASS" if foundation_finalized else "PENDING"),
                    "Foundation Gate A status differs from sprint state",
                )
            if continuation_steps:
                v06_states = [states[step_id] for step_id in continuation_steps]
                if continuation.get("status") == "ACTIVE":
                    require(
                        states["V07.1"] == "PLANNED",
                        "V07 started before V06 package review",
                    )
                for index, state in enumerate(v06_states):
                    if state != "PLANNED":
                        require(
                            all(
                                prior in {"IMPLEMENTED_UNVERIFIED", "VERIFIED"}
                                for prior in v06_states[:index]
                            ),
                            "V06 continuation contains a gap or overlapping step",
                        )
                require(
                    sum(state == "IN_PROGRESS" for state in v06_states) <= 1,
                    "multiple V06 steps are IN_PROGRESS",
                )
                for step_id in continuation_steps:
                    if states[step_id] == "IMPLEMENTED_UNVERIFIED":
                        require(
                            step_id in continuation_completed,
                            f"{step_id} completed without continuation evidence",
                        )
                if continuation.get("status") == "ACTIVE":
                    require(
                        required_gate == "V06_PACKAGE_REVIEW"
                        and gate.get("gate_status") == "PENDING",
                        "V06 continuation must remain at the package-review gate",
                    )
                    in_progress = [
                        step_id
                        for step_id in continuation_steps
                        if states[step_id] == "IN_PROGRESS"
                    ]
                    if in_progress:
                        active_step = in_progress[0]
                        active_index = continuation_steps.index(active_step)
                        expected_next = (
                            continuation_steps[active_index + 1]
                            if active_index + 1 < len(continuation_steps)
                            else "V07.1"
                        )
                        require(
                            gate.get("step_id") == active_step
                            and gate.get("next_step") == expected_next
                            and gate.get("next_step_ready") is False,
                            "active V06 continuation step/gate differs from progress truth",
                        )
                    elif states["V06.3"] == "IMPLEMENTED_UNVERIFIED":
                        require(
                            gate.get("step_id") == "V06.3"
                            and gate.get("next_step") == "V07.1"
                            and gate.get("next_step_ready") is False,
                            "V06 package exit did not stop before V07",
                        )
                else:
                    require(
                        all(state == "VERIFIED" for state in v06_states)
                        and progress_data.get("work_packages", {}).get("V06")
                        == "VERIFIED",
                        "completed V06 continuation is not fully promoted",
                    )
                    package_review = progress_data.get("v06_package_review")
                    require(
                        isinstance(package_review, dict)
                        and package_review.get("decision")
                        == "V06_PACKAGE_APPROVED"
                        and package_review.get("reviewed_commit")
                        == continuation.get("approved_package_target")
                        and package_review.get("open_blockers") == 0
                        and package_review.get("open_majors") == 0
                        and package_review.get("package_verified") is True
                        and package_review.get("merge_authorized") is True,
                        "completed V06 package review record is invalid",
                    )
                    v07_entry = progress_data.get("v07_entry")
                    if isinstance(v07_entry, dict) and v07_entry.get("status") == "ACTIVE":
                        if states["V07.1"] == "IN_PROGRESS":
                            require(
                                gate.get("step_id") == "V07.1"
                                and gate.get("status") == states["V07.1"]
                                and gate.get("next_step") == "V07.1"
                                and gate.get("next_step_ready") is True
                                and required_gate == "V07.1_IMPLEMENTATION"
                                and gate.get("gate_status") == "PASS",
                                "active V07.1 entry gate differs from progress truth",
                            )
                        else:
                            require(
                                states["V07.1"] == "IMPLEMENTED_UNVERIFIED"
                                and gate.get("step_id") == "V07.1"
                                and gate.get("status") == states["V07.1"]
                                and gate.get("next_step") == "V07.2"
                                and gate.get("next_step_ready") is False
                                and required_gate == "V07.2_OWNER_ADR_GATE"
                                and gate.get("gate_status") == "PENDING",
                                "completed V07.1 ADR handoff differs from progress truth",
                            )
                            implementation = v07_entry.get("implementation_result")
                            require(
                                isinstance(implementation, dict)
                                and implementation.get("status")
                                == "IMPLEMENTED_UNVERIFIED"
                                and implementation.get("automated_evidence") == "PASS"
                                and implementation.get("independent_review") == "NOT_RUN"
                                and implementation.get("open_p0_blockers") == 0
                                and implementation.get("open_p1_majors") == 0,
                                "V07.1 implementation evidence is incomplete",
                            )
                            code_candidate = commit_exists(
                                implementation.get("code_candidate"),
                                "V07.1 code candidate",
                            )
                            evidence_commit = commit_exists(
                                implementation.get("evidence_commit"),
                                "V07.1 evidence commit",
                            )
                            is_ancestor(code_candidate, evidence_commit, "V07.1 evidence lineage")
                            file("docs/reports/V07.1/IMPLEMENTATION.md")
                            file("docs/reports/V07.1/TEST_EVIDENCE.json")
                        require(
                            v07_entry.get("branch") == "codex/world-core-v07"
                            and v07_entry.get("preflight") == "GO"
                            and v07_entry.get("approved_adrs") == ["ADR-11", "ADR-17"]
                            and v07_entry.get("production_mutation") is False
                            and v07_entry.get("owner_approved") is True,
                            "V07.1 entry authority is incomplete",
                        )
                        for decision_id in ("ADR-11", "ADR-17"):
                            require(
                                owner_decisions[decision_id].get("status") == "APPROVED"
                                and owner_decisions[decision_id].get("approval_record"),
                                f"{decision_id} is not approved for V07.1 entry",
                            )
                        file(v07_entry.get("preflight_file"))
                        file(v07_entry.get("continuation_policy"))
                        file(v07_entry.get("owner_activation"))
                    else:
                        require(
                            gate.get("step_id") == "V06.3"
                            and gate.get("status") == "VERIFIED"
                            and gate.get("next_step") == "V07.1"
                            and gate.get("next_step_ready") is False
                            and required_gate
                            in {"V06_MAINLINE_INTEGRATION", "V07.1_OWNER_ADR_GATE"}
                            and gate.get("gate_status") == "PENDING",
                            "completed V06 handoff gate differs from progress truth",
                        )
                    if required_gate == "V07.1_OWNER_ADR_GATE" or isinstance(v07_entry, dict):
                        v06_integration = progress_data.get("v06_integration")
                        require(
                            isinstance(v06_integration, dict)
                            and v06_integration.get("branch")
                            == continuation.get("branch")
                            and v06_integration.get("approved_package_target")
                            == continuation.get("approved_package_target")
                            and v06_integration.get("status") == "MERGED"
                            and v06_integration.get("history_preserved") is True
                            and v06_integration.get("runtime_equivalence") == "PASS"
                            and v06_integration.get("production_mutation") is False,
                            "V06 mainline integration record is incomplete",
                        )
                        promotion_commit = commit_exists(
                            v06_integration.get("promotion_commit"),
                            "V06 promotion commit",
                        )
                        merged_commit = commit_exists(
                            v06_integration.get("merged_commit"),
                            "V06 merge commit",
                        )
                        is_ancestor(
                            continuation.get("approved_package_target"),
                            promotion_commit,
                            "V06 approved target to promotion",
                        )
                        is_ancestor(
                            promotion_commit,
                            merged_commit,
                            "V06 promotion to merge",
                        )
                        is_ancestor(merged_commit, "HEAD", "V06 mainline merge")
                        file(v06_integration.get("evidence_file"))
            elif states["V06.1"] == "IMPLEMENTED_UNVERIFIED":
                require(
                    gate.get("step_id") == "V06.1"
                    and next_step == "V06.2"
                    and required_gate == "V06.1_INDEPENDENT_REVIEW"
                    and gate.get("gate_status") == "PENDING"
                    and gate.get("next_step_ready") is False,
                    "V06.1 P0 independent-review stop is not recorded",
                )
                require(
                    progress_data.get("work_packages", {}).get("V06")
                    == "IMPLEMENTED_UNVERIFIED",
                    "V06 package status differs from V06.1 review state",
                )
            require(
                all(
                    progress_data.get("work_packages", {}).get(f"V{package:02d}")
                    == expected_foundation_state
                    for package in range(2, 6)
                ),
                "Foundation package status differs from step truth",
            )
            package_evidence = progress_data.get("package_evidence", {}).get(
                "FOUNDATION_V02_V05", []
            )
            require(package_evidence, "Gate A package evidence is missing")
            for evidence_path in package_evidence:
                file(evidence_path)
        if states["V01.3"] == "VERIFIED":
            package_evidence = progress_data.get("package_evidence", {}).get("V01", [])
            require(package_evidence, "V01 package review evidence is missing")
            for evidence_path in package_evidence:
                file(evidence_path)
            if (
                required_gate == "V01_PACKAGE_LEVEL_REVIEW"
                and gate.get("gate_status") == "PENDING"
            ):
                require(states["V02.1"] == "PLANNED", "V02.1 started before V01 package review")
                require(
                    progress_data.get("work_packages", {}).get("V01")
                    == "IMPLEMENTATION_COMPLETE_PENDING_PACKAGE_REVIEW",
                    "V01 package status is not review-ready",
                )
            else:
                integration = progress_data.get("v01_integration")
                require(isinstance(integration, dict), "missing V01 integration record")
                require(integration.get("status") == "MERGED", "V01 is not integrated")
                require(
                    integration.get("method") == "OWNER_FAST_TRACK"
                    and integration.get("decision") == "OWNER_FAST_TRACK_ACCEPTED"
                    and integration.get("risk_class") == "P2",
                    "V01 integration lacks a valid P2 owner fast-track decision",
                )
                require(
                    integration.get("automated_evidence_status") == "PASS"
                    and integration.get("p0_boundary_changed") is False
                    and integration.get("production_mutation") is False
                    and integration.get("owner_approved") is True,
                    "V01 integration safety evidence is incomplete",
                )
                require(
                    integration.get("independent_review_claimed") is False,
                    "V01 integration incorrectly claims independent review",
                )
                file(integration.get("evidence_file"))
                merged_commit = commit_exists(
                    integration.get("merged_commit"), "V01 merged_commit"
                )
                is_ancestor(merged_commit, "HEAD", "V01 local integration")
                require(
                    progress_data.get("work_packages", {}).get("V01")
                    == "IMPLEMENTED_MERGED",
                    "V01 package status is not integrated",
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
            foundation_candidate_steps=len(foundation_steps),
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
            require(
                record["status"] in {"PROPOSED_NOT_APPROVED", "APPROVED"},
                f"{record['id']} has an invalid decision status",
            )
            if record["status"] == "APPROVED":
                approval_record = record["approval_record"]
                require(
                    isinstance(approval_record, str)
                    and approval_record.startswith("docs/architecture/decisions/"),
                    f"{record['id']} lacks a supported owner approval record",
                )
                approval_text = file(approval_record).read_text(encoding="utf-8")
                require(
                    "Decision: APPROVED" in approval_text
                    and "Authority: RESPONSIBLE_HUMAN_OWNER" in approval_text
                    and "Codex self-approval" in approval_text,
                    f"{record['id']} owner approval evidence is incomplete",
                )
            else:
                require(
                    record["approval_record"] is None,
                    f"{record['id']} proposed decision carries approval evidence",
                )
            require(
                set(record["affected_work_packages"]) <= package_ids,
                f"{record['id']} names an invalid work package",
            )
        metrics["decisions"] = 20
        metrics["approved_decisions"] = sum(
            record["status"] == "APPROVED" for record in records
        )

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

    def v01_traceability() -> None:
        registry = load_json("requirements/requirement_registry.json")
        require(
            registry["schema_version"] == "V01.1-TRACEABILITY-1",
            "wrong V01.1 traceability schema",
        )
        counts = registry["counts"]
        require(counts["authoritative_sources"] == 8, "V01.1 must cover eight sources")
        require(counts["source_units"] == 8743, "V01.1 source-unit count changed")
        require(counts["fixed_targets"] == 131, "V01.1 fixed-target count changed")
        require(
            registry["claim_boundary"]["implemented"] is False
            and registry["claim_boundary"]["verified_product_behavior"] is False,
            "V01.1 registry falsely claims implementation",
        )
        source_units = {
            json.loads(line)["source_id"]
            for line in file("requirements/source_units.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
            if line.strip()
        }
        assignments = [
            json.loads(line)
            for line in file("requirements/source_unit_assignments.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
            if line.strip()
        ]
        require(len(assignments) == 8743, "V01.1 assignment count changed")
        require(
            {row["source_unit_id"] for row in assignments} == source_units,
            "V01.1 source-unit assignments are incomplete",
        )
        target_requirements = [
            item for item in registry["requirements"] if item["kind"] != "source_scope"
        ]
        require(len(target_requirements) == 131, "V01.1 target requirements are incomplete")
        for requirement in registry["requirements"]:
            require(
                requirement["implementation_status"] == "PLANNED_NOT_IMPLEMENTED",
                f"V01.1 false implementation claim: {requirement['requirement_id']}",
            )
            require(
                requirement["planned_work_packages"]
                and requirement["planned_code_owners"],
                f"V01.1 missing planned ownership: {requirement['requirement_id']}",
            )
        for requirement in target_requirements:
            require(
                requirement["source_unit_refs"]
                and set(requirement["source_unit_refs"]) <= source_units,
                f"V01.1 invalid source evidence: {requirement['requirement_id']}",
            )
        metrics.update(v01_requirements=len(registry["requirements"]), v01_source_units=len(assignments))

    def v01_adr_graph() -> None:
        decision_data = load_json("status/decisions.json")
        graph = load_json("requirements/adr_dependency_map.json")
        require(graph["schema_version"] == "V01.2-ADR-GRAPH-1", "wrong V01.2 graph schema")
        require(graph["counts"]["adrs"] == 20, "V01.2 graph must contain 20 ADRs")
        approved = sum(record["status"] == "APPROVED" for record in decision_data["decisions"])
        require(
            graph["approval_summary"]
            == {
                "approved": approved,
                "proposed_not_approved": 20 - approved,
                "bulk_approval_permitted": False,
            },
            "V01.2 graph approval summary differs from the decision register",
        )
        require(
            graph["current_gate"]["unresolved_blockers"] == [],
            "V01.2 coordination gate has an unresolved blocker",
        )
        records = {record["id"]: record for record in decision_data["decisions"]}
        mapped = {record["id"]: record for record in graph["adrs"]}
        require(set(mapped) == set(records), "V01.2 ADR set differs from decision register")
        for adr_id, record in records.items():
            require(
                record["status"] == mapped[adr_id]["decision_status"],
                f"{adr_id} approval status drift",
            )
            require(
                record["approval_record"] == mapped[adr_id]["approval_record"],
                f"{adr_id} approval-record drift",
            )
            require(
                record["affected_work_packages"] == mapped[adr_id]["affected_work_packages"],
                f"{adr_id} affected-package drift",
            )
            require(record["latest_gate"] == mapped[adr_id]["latest_gate"], f"{adr_id} gate drift")
        for edge in graph["adr_relationships"]:
            require(
                edge["from"] in records and edge["to"] in records,
                "V01.2 relationship refers to unknown ADR",
            )
        metrics.update(
            v01_adrs=len(mapped),
            v01_adr_relationships=len(graph["adr_relationships"]),
            v01_adr_package_edges=len(graph["adr_to_package_edges"]),
        )

    def v01_integration_contract() -> None:
        contract = load_json("requirements/two_repository_integration_contract.json")
        require(
            contract["schema_version"] == "V01.3-INTEGRATION-CONTRACT-1",
            "wrong V01.3 contract schema",
        )
        require(contract["implementation_claim"] is False, "V01.3 falsely claims implementation")
        require(
            contract["shared_identity"]["profile_field_whitelist"]
            == ["user_id", "display_name", "school_id"],
            "V01.3 identity whitelist changed",
        )
        prohibited_identity = set(
            contract["shared_identity"]["prohibited_shared_fields_or_assumptions"]
        )
        require(
            {"role", "platform_role", "service_role key"} <= prohibited_identity,
            "V01.3 permits portable authorization or credentials",
        )
        never_authority = set(contract["ownership"]["never_world_v2_authority"])
        require(
            {"main site", "V1 World", "League", "Legacy World", "browser or UI state"}
            <= never_authority,
            "V01.3 creates an alternate World V2 authority",
        )
        boundary = contract["world_v2_authoritative_boundary"]
        require(boundary["source_of_truth_count"] == 1, "V01.3 source-of-truth count changed")
        require(
            boundary["authoritative_execution_host"] == "apps/world-worker"
            and boundary["authentication_command_query_boundary"] == "apps/world-api"
            and boundary["deterministic_domain_logic"] == "packages/core"
            and boundary["non_authoritative_ui"] == "apps/world-web",
            "V01.3 repository ownership boundary changed",
        )
        preserved_routes = {
            item["route"] for item in contract["route_contract"]["main_site_preserved"]
        }
        require(
            preserved_routes
            == {
                "/world",
                "/simulation/world and descendants",
                "/league/world and descendants",
                "/simulation/legacy-world and descendants",
                "/country, /lobby, /room, /results, /replay, /view",
            },
            "V01.3 route preservation set changed",
        )
        require(
            contract["next_gate"] == "V01_PACKAGE_LEVEL_REVIEW",
            "V01.3 must stop at package review",
        )
        metrics.update(
            v01_identity_fields=len(contract["shared_identity"]["profile_field_whitelist"]),
            v01_preserved_route_groups=len(preserved_routes),
            v01_next_gate=contract["next_gate"],
        )

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
        ("v01_traceability", v01_traceability),
        ("v01_adr_graph", v01_adr_graph),
        ("v01_integration_contract", v01_integration_contract),
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
