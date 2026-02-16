import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPostMergeSmoke } from "./post-merge-smoke.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "awa-v-smoke-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body, "utf-8");
  chmodSync(path, 0o755);
}

function withFakeNpm(repoDir: string, scriptBody: string, run: () => void): void {
  const binDir = join(repoDir, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(repoDir, "package.json"), JSON.stringify({
    name: "fake",
    version: "0.0.0",
    scripts: {
      build: "echo build",
      test: "echo test",
    },
  }), "utf-8");
  writeExecutable(join(binDir, "npm"), scriptBody);

  const previousPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${previousPath}`;
  try {
    run();
  } finally {
    process.env.PATH = previousPath;
  }
}

test("runPostMergeSmoke passes when build and test scripts succeed", () => {
  withTempDir((dir) => {
    withFakeNpm(
      dir,
      "#!/bin/sh\nexit 0\n",
      () => {
        const result = runPostMergeSmoke(dir);
        assert.equal(result.ok, true);
        assert.deepEqual(result.checks.map((c) => c.status), ["passed", "passed"]);
      }
    );
  });
});

test("runPostMergeSmoke stops early when build fails", () => {
  withTempDir((dir) => {
    withFakeNpm(
      dir,
      "#!/bin/sh\nif [ \"$2\" = \"build\" ]; then exit 1; fi\nexit 0\n",
      () => {
        const result = runPostMergeSmoke(dir);
        assert.equal(result.ok, false);
        assert.equal(result.checks.length, 1);
        assert.equal(result.checks[0].script, "build");
        assert.equal(result.checks[0].status, "failed");
      }
    );
  });
});

test("runPostMergeSmoke skips missing scripts", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "fake",
      version: "0.0.0",
      scripts: {},
    }), "utf-8");
    const result = runPostMergeSmoke(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.checks.map((c) => c.status), ["skipped", "skipped"]);
  });
});
