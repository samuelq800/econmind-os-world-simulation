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
from pathlib import Path, PurePosixPath
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_EXECUTION_MODES = {"NORMAL", "PARALLEL_PREPARATION"}
IMPLEMENTATION_AGENT_STATUSES = {
    "IN_PROGRESS",
    "IMPLEMENTED_UNVERIFIED",
    "BLOCKED",
}
STEP_ID_PATTERN = re.compile(r"^V\d{2}\.\d+$")
GIT_COMMIT_PATTERN = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
REVIEW_MARKDOWN_NAME_PATTERN = re.compile(
    r"^R2_GOVERNANCE_REVIEW(?:_[A-Z0-9]+)*\.md$"
)
REVIEW_DECISIONS = {
    "APPROVED",
    "CHANGES_REQUIRED",
    "INSUFFICIENT_EVIDENCE",
    "BLOCKED",
}
LEGACY_REVIEW_VALIDATION_PATH = (
    "docs/reports/governance/R2_GOVERNANCE_RECHECK_VALIDATION.json"
)


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

    def git(*arguments: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *arguments],
            cwd=root,
            input=input_text,
            text=True,
            capture_output=True,
            check=False,
        )

    def git_commit_exists(commit: str, field: str) -> None:
        require(
            isinstance(commit, str) and GIT_COMMIT_PATTERN.fullmatch(commit) is not None,
            f"invalid {field}: expected a full Git commit ID",
        )
        result = git("cat-file", "-e", f"{commit}^{{commit}}")
        require(result.returncode == 0, f"{field} does not exist: {commit}")

    def git_ancestor(ancestor: str, descendant: str, message: str) -> None:
        result = git("merge-base", "--is-ancestor", ancestor, descendant)
        require(result.returncode in {0, 1}, "unable to verify Git commit ancestry")
        require(result.returncode == 0, message)

    def evidence_path_is_safe(relative: str) -> bool:
        if not isinstance(relative, str) or not relative:
            return False
        path = PurePosixPath(relative)
        return (
            not path.is_absolute()
            and ".." not in path.parts
            and path.parts[:3] == ("docs", "reports", "governance")
        )

    def parse_independent_review_evidence(
        relative: str, content: str
    ) -> tuple[str, str]:
        name = PurePosixPath(relative).name
        if relative.endswith(".md"):
            require(
                REVIEW_MARKDOWN_NAME_PATTERN.fullmatch(name) is not None,
                f"unsupported independent review evidence path: {relative}",
            )
            require(
                re.search(
                    r"^# R2 Governance Independent (?:Re-)?Review$",
                    content,
                    re.MULTILINE,
                )
                is not None,
                f"review evidence lacks an independent-review heading: {relative}",
            )
            reviewed_commits = re.findall(
                r"^- Reviewed HEAD: `((?:[0-9a-f]{40}|[0-9a-f]{64}))`\.$",
                content,
                re.MULTILINE,
            )
            require(
                len(reviewed_commits) == 1,
                f"review evidence must identify exactly one reviewed commit: {relative}",
            )
            sections = re.split(r"^## Final Decision\s*$", content, flags=re.MULTILINE)
            require(
                len(sections) == 2,
                f"review evidence must contain exactly one Final Decision section: {relative}",
            )
            decision_match = re.match(
                r"\s*\*\*(APPROVED|CHANGES_REQUIRED|INSUFFICIENT_EVIDENCE|BLOCKED)(?:[.:])",
                sections[1],
            )
            require(
                decision_match is not None,
                f"review evidence has no unambiguous final decision: {relative}",
            )
            return reviewed_commits[0], decision_match.group(1)

        if relative.endswith(".json"):
            require(
                relative == LEGACY_REVIEW_VALIDATION_PATH,
                f"unsupported independent review evidence path: {relative}",
            )
            record = json.loads(content)
            require(isinstance(record, dict), f"review evidence must be an object: {relative}")
            require(
                record.get("review_scope")
                == "INDEPENDENT_R2_GOVERNANCE_RE_REVIEW_ONLY",
                f"legacy review evidence has the wrong scope: {relative}",
            )
            reviewed_commit = record.get("reviewed_commit")
            decision = record.get("decision")
            require(
                isinstance(reviewed_commit, str)
                and GIT_COMMIT_PATTERN.fullmatch(reviewed_commit) is not None,
                f"review evidence has an invalid reviewed commit: {relative}",
            )
            require(
                decision in REVIEW_DECISIONS,
                f"review evidence has an invalid decision: {relative}",
            )
            return reviewed_commit, decision

        raise GovernanceError(f"unsupported independent review evidence path: {relative}")

    def validate_governance_verification(sync: dict[str, Any]) -> None:
        verification = sync.get("verification")
        require(
            isinstance(verification, dict),
            "Governance VERIFIED requires a verification object",
        )
        require(
            verification.get("decision") == "APPROVED",
            "Governance VERIFIED requires verification decision APPROVED",
        )
        reviewed_commit = verification.get("reviewed_commit")
        evidence_commit = verification.get("evidence_commit")
        git_commit_exists(reviewed_commit, "reviewed_commit")
        git_commit_exists(evidence_commit, "evidence_commit")
        require(
            reviewed_commit != evidence_commit,
            "reviewed_commit and evidence_commit must be different commits",
        )
        git_ancestor(
            reviewed_commit,
            evidence_commit,
            "reviewed_commit is not an ancestor of evidence_commit",
        )
        head = git("rev-parse", "--verify", "HEAD^{commit}")
        require(head.returncode == 0, "unable to resolve the current governance HEAD")
        current_head = head.stdout.strip()
        git_ancestor(
            evidence_commit,
            current_head,
            "evidence_commit is not an ancestor of the current governance HEAD",
        )

        evidence_paths = verification.get("evidence_paths")
        require(
            isinstance(evidence_paths, list) and len(evidence_paths) > 0,
            "Governance VERIFIED requires non-empty evidence_paths",
        )
        require(
            all(evidence_path_is_safe(relative) for relative in evidence_paths),
            "verification contains an invalid or unsupported evidence path",
        )
        require(
            len(evidence_paths) == len(set(evidence_paths)),
            "verification contains duplicate evidence paths",
        )
        for relative in evidence_paths:
            object_type = git("cat-file", "-t", f"{evidence_commit}:{relative}")
            require(
                object_type.returncode == 0 and object_type.stdout.strip() == "blob",
                f"evidence path does not exist at evidence_commit: {relative}",
            )
            historical = git("show", f"{evidence_commit}:{relative}")
            require(
                historical.returncode == 0,
                f"unable to read evidence at evidence_commit: {relative}",
            )
            artifact_commit, artifact_decision = parse_independent_review_evidence(
                relative, historical.stdout
            )
            require(
                artifact_commit == reviewed_commit,
                f"review evidence names a different reviewed commit: {relative}",
            )
            require(
                artifact_decision == "APPROVED",
                f"review evidence decision is not APPROVED: {relative}",
            )

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
            "docs/governance/r2/SOURCE_ATTRIBUTION.md",
            "docs/reports/governance/R2_GOVERNANCE_SYNC.md",
        ]
        for relative in required:
            require(file(relative).stat().st_size > 0, f"empty required file: {relative}")
        metrics["required_files"] = len(required)

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
            status_declaration = prompt_match(
                r"^7\. Final status must be one of: (.+)\. "
                r"Implementation agent may not mark .+$",
                "allowed status declaration",
            ).group(1)
            prompt_statuses = set(re.findall(r"`([^`]+)`", status_declaration))
            require(
                prompt_statuses == IMPLEMENTATION_AGENT_STATUSES,
                f"prompt allowed statuses differ from implementation vocabulary: {step_id}",
            )
            require(
                prompt_statuses <= valid_statuses,
                f"prompt authorizes a non-authoritative status: {step_id}",
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
        for step_id, state in states.items():
            require(state in valid_states, f"invalid progress state {step_id}: {state}")
            if state == "VERIFIED":
                for dependency in step_by_id[step_id]["hard_dependencies"]:
                    require(
                        states[dependency] == "VERIFIED",
                        f"impossible VERIFIED dependency claim: {step_id} <- {dependency}",
                    )
        require(states["V00.1"] == "IMPLEMENTED_UNVERIFIED", "V00.1 truth changed")
        require(states["V00.2"] == "BLOCKED", "V00.2 must remain blocked")
        for step_id, state in states.items():
            if step_id not in {"V00.1", "V00.2"}:
                require(state == "PLANNED", f"later work has non-planning state: {step_id}")
        sync = progress_data["governance_sync"]
        require(isinstance(sync, dict), "governance_sync must be an object")
        require(
            sync.get("status") in {"IMPLEMENTED_UNVERIFIED", "VERIFIED"},
            "invalid governance sync status",
        )
        require(
            isinstance(sync.get("merge_authorized"), bool),
            "governance merge_authorized must be a boolean",
        )
        if sync["status"] == "VERIFIED":
            validate_governance_verification(sync)
        else:
            require(
                sync.get("verification") is None,
                "unverified governance sync cannot carry verification authority",
            )
        if sync["merge_authorized"]:
            require(sync["status"] == "VERIFIED", "governance merge requires VERIFIED status")
            require(states["V00.1"] == "VERIFIED", "governance merge requires V00.1 VERIFIED")
            require(
                sync.get("final_reconciliation_gate") == "PASS",
                "governance merge requires final reconciliation PASS",
            )
        metrics["governance_sync_status"] = sync["status"]
        metrics["governance_merge_authorized"] = sync["merge_authorized"]
        metrics["progress_states"] = dict(
            sorted({state: list(states.values()).count(state) for state in valid_states}.items())
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
