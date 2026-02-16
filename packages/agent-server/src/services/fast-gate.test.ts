import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runFastGate } from "./fast-gate.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "awa-v-fast-gate-"));
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

function withFakePnpm(repoDir: string, scriptBody: string, run: () => void): void {
  const binDir = join(repoDir, "bin");
  writeFileSync(join(repoDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf-8");
  writeFileSync(join(repoDir, "package.json"), JSON.stringify({
    name: "fake",
    version: "0.0.0",
    scripts: {
      typecheck: "echo typecheck",
      lint: "echo lint",
    },
  }), "utf-8");
  mkdirSync(binDir, { recursive: true });
  writeExecutable(join(binDir, "pnpm"), scriptBody);

  const previousPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${previousPath}`;
  try {
    run();
  } finally {
    process.env.PATH = previousPath;
  }
}

test("runFastGate passes when typecheck and lint scripts succeed", () => {
  withTempDir((dir) => {
    withFakePnpm(
      dir,
      "#!/bin/sh\nexit 0\n",
      () => {
        const result = runFastGate(dir);
        assert.equal(result.ok, true);
        assert.deepEqual(result.checks.map((c) => c.status), ["passed", "passed"]);
      }
    );
  });
});

test("runFastGate stops early when typecheck fails", () => {
  withTempDir((dir) => {
    withFakePnpm(
      dir,
      "#!/bin/sh\nif [ \"$2\" = \"typecheck\" ]; then exit 1; fi\nexit 0\n",
      () => {
        const result = runFastGate(dir);
        assert.equal(result.ok, false);
        assert.equal(result.checks.length, 1);
        assert.equal(result.checks[0].script, "typecheck");
        assert.equal(result.checks[0].status, "failed");
      }
    );
  });
});

test("runFastGate skips missing scripts", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "fake",
      version: "0.0.0",
      scripts: {},
    }), "utf-8");
    const result = runFastGate(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.checks.map((c) => c.status), ["skipped", "skipped"]);
  });
});
