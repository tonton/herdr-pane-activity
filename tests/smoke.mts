#!/usr/bin/env node
// Functional test: runs sync.mts against tests/fake-herdr.mts (a stub
// `herdr` binary) and asserts which agent/tab renames it did — and, just as
// important, which ones it correctly left alone.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const fakeHerdr = path.join(here, "fake-herdr.mts");

const fixtures = {
  agents: [
    // Descriptive title, never renamed before -> should be renamed.
    {
      pane_id: "w1:p1",
      tab_id: "w1:t1",
      agent: "claude",
      terminal_title_stripped: "PRの認証バグを調査",
    },
    // Boring/idle title -> left alone.
    {
      pane_id: "w1:p2",
      tab_id: "w1:t2",
      agent: "claude",
      terminal_title_stripped: "Claude Code",
    },
    // Descriptive title, but user already gave it a manual name -> protected.
    {
      pane_id: "w1:p3",
      tab_id: "w1:t3",
      agent: "codex",
      name: "my-manual-agent-name",
      terminal_title_stripped: "別タスクを実行中",
    },
  ],
  tabs: [
    { tab_id: "w1:t1", label: "1" },
    // Numeric default label, boring pane title -> falls back to cwd.
    { tab_id: "w1:t2", label: "2" },
    // Manual label, descriptive pane title -> protected.
    { tab_id: "w1:t3", label: "my-tab" },
  ],
  panes: [
    {
      pane_id: "w1:p1",
      tab_id: "w1:t1",
      focused: true,
      cwd: "/work/api",
      terminal_title_stripped: "PRの認証バグを調査",
    },
    {
      pane_id: "w1:p2",
      tab_id: "w1:t2",
      focused: true,
      cwd: "/work/frontend",
      terminal_title_stripped: "Claude Code",
    },
    {
      pane_id: "w1:p3",
      tab_id: "w1:t3",
      focused: true,
      cwd: "/work/infra",
      terminal_title_stripped: "別タスクを実行中",
    },
  ],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-tab-activity-"));
const fixturesFile = path.join(tmp, "fixtures.json");
const callLogFile = path.join(tmp, "calls.json");
const stateDir = path.join(tmp, "state");
fs.mkdirSync(stateDir);

fs.writeFileSync(fixturesFile, JSON.stringify(fixtures));
fs.writeFileSync(callLogFile, "[]");

const result = spawnSync("node", [path.join(root, "sync.mts")], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    HERDR_BIN_PATH: fakeHerdr,
    HERDR_PLUGIN_STATE_DIR: stateDir,
    FIXTURES_FILE: fixturesFile,
    CALL_LOG_FILE: callLogFile,
  },
});

if (result.status !== 0) {
  console.error("sync.mts exited non-zero");
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(1);
}

const calls = JSON.parse(fs.readFileSync(callLogFile, "utf8")) as string[][];

function assertCalled(args: string[], message: string): void {
  const found = calls.some((call) => JSON.stringify(call) === JSON.stringify(args));
  if (!found) {
    console.error(`FAIL: ${message}`);
    console.error("expected call:", args);
    console.error("actual calls:", calls);
    process.exit(1);
  }
  console.log(`ok: ${message}`);
}

function assertNotCalled(prefix: string[], message: string): void {
  const found = calls.some((call) =>
    prefix.every((value, i) => call[i] === value),
  );
  if (found) {
    console.error(`FAIL: ${message}`);
    console.error("forbidden prefix:", prefix);
    console.error("actual calls:", calls);
    process.exit(1);
  }
  console.log(`ok: ${message}`);
}

assertCalled(
  ["agent", "rename", "w1:p1", "PRの認証バグを調査"],
  "renames an agent with a fresh descriptive title",
);
assertNotCalled(
  ["agent", "rename", "w1:p2"],
  "leaves an agent with a boring/idle title alone",
);
assertNotCalled(
  ["agent", "rename", "w1:p3"],
  "does not overwrite a manually-set agent name",
);

assertCalled(
  ["tab", "rename", "w1:t1", "PRの認証バグを調査"],
  "renames a default-numbered tab to the activity title",
);
assertCalled(
  ["tab", "rename", "w1:t2", "frontend"],
  "falls back to the cwd basename when the title is boring",
);
assertNotCalled(
  ["tab", "rename", "w1:t3"],
  "does not overwrite a manually-labeled tab",
);

const ownedAgents = JSON.parse(
  fs.readFileSync(path.join(stateDir, "agent-names.json"), "utf8"),
);
if (ownedAgents["w1:p1"] !== "PRの認証バグを調査") {
  console.error("FAIL: state file did not record the applied agent name");
  process.exit(1);
}
if ("w1:p3" in ownedAgents) {
  console.error("FAIL: state file recorded ownership of a manual agent name");
  process.exit(1);
}
console.log("ok: state file only tracks labels this plugin actually applied");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("all smoke tests passed");
