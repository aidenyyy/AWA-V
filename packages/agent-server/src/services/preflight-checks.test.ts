import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPreflightChecks } from "./preflight-checks.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "awa-v-preflight-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function initGitRepo(dir: string): void {
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
}

test("runPreflightChecks fails for non-git directories", () => {
  withTempDir((dir) => {
    const result = runPreflightChecks(dir);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /git work tree/i);
  });
});

test("runPreflightChecks passes for a clean git directory", () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const result = runPreflightChecks(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.checks, [
      "git_repo_ok",
      "repo_writable",
      "no_merge_conflicts",
      "no_in_progress_git_ops",
    ]);
  });
});

test("runPreflightChecks fails when git operation is in progress", () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    writeFileSync(join(dir, ".git", "MERGE_HEAD"), "deadbeef\n", "utf-8");
    const result = runPreflightChecks(dir);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /in-progress git operation/i);
  });
});
