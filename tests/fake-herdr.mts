#!/usr/bin/env node
// Stub `herdr` binary for the smoke test: serves canned `agent list` /
// `tab list` / `pane list` responses from FIXTURES_FILE and records
// `agent rename` / `tab rename` calls to CALL_LOG_FILE.
import fs from "node:fs";

type Fixtures = {
  agents: unknown[];
  tabs: unknown[];
  panes: unknown[];
};

const fixturesFile = process.env.FIXTURES_FILE;
const callLogFile = process.env.CALL_LOG_FILE;
if (!fixturesFile || !callLogFile) {
  console.error("fake-herdr: FIXTURES_FILE and CALL_LOG_FILE are required");
  process.exit(1);
}

const fixtures = JSON.parse(fs.readFileSync(fixturesFile, "utf8")) as Fixtures;
const args = process.argv.slice(2);
const [group, verb, ...rest] = args;

function reply(result: unknown): never {
  process.stdout.write(`${JSON.stringify({ id: "cli:stub", result })}\n`);
  process.exit(0);
}

function logCall(file: string): void {
  const calls = JSON.parse(fs.readFileSync(file, "utf8")) as string[][];
  calls.push(args);
  fs.writeFileSync(file, JSON.stringify(calls));
}

if (group === "agent" && verb === "list") {
  reply({ agents: fixtures.agents });
} else if (group === "tab" && verb === "list") {
  reply({ tabs: fixtures.tabs });
} else if (group === "pane" && verb === "list") {
  reply({ panes: fixtures.panes });
} else if (group === "agent" && verb === "rename") {
  logCall(callLogFile);
  reply({ agent: { pane_id: rest[0], name: rest[1] } });
} else if (group === "tab" && verb === "rename") {
  logCall(callLogFile);
  reply({ tab: { tab_id: rest[0], label: rest[1] } });
} else {
  console.error(`fake-herdr: unhandled command ${args.join(" ")}`);
  process.exit(1);
}
