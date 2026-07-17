#!/usr/bin/env node
// Agent Activity Name: rename each herdr agent to its pane's live terminal
// title — the same "resume title" agent CLIs like Claude Code write via OSC
// 0/2 once they have a one-line summary of what they're doing. herdr reads
// this name through to the pane's own label, so renaming the agent is
// enough to update what's shown for the pane too. Runs as a herdr plugin
// event hook / action.
//
// This is TypeScript executed directly by Node's type stripping (Node
// 22.18+), so the source file is also the artifact — no build step. Only
// erasable TS syntax is used (no enums/namespaces).
//
// A title is only applied once it looks like a real summary rather than an
// app's generic idle title (e.g. "Claude Code") or a bare shell prompt
// (`user@host:~`) — see BORING_TITLES / SHELL_PROMPT_RE.
//
// Manual renames are respected: an agent is only relabeled while its
// current name is still one this plugin set earlier (tracked in
// HERDR_PLUGIN_STATE_DIR/agent-names.json). Set `overwrite_manual` to true
// in HERDR_PLUGIN_CONFIG_DIR/config.json to relabel every agent.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type AgentInfo = {
  pane_id: string;
  agent?: string;
  name?: string;
  terminal_title?: string;
  terminal_title_stripped?: string;
};

type Config = {
  overwriteManual: boolean;
  agentMaxLength: number;
  extraBoringTitles: readonly string[];
};

// Names this plugin set earlier, keyed by pane id.
type OwnedMap = Record<string, string>;

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const SHELL_PROMPT_RE = /^[\w.-]+@[\w.-]+:/;

// Generic titles agent CLIs show before they have anything to say — never
// treated as "activity", so a fresh pane doesn't get renamed to its own app
// name.
const BORING_TITLES = new Set(
  [
    "claude code",
    "claude",
    "codex",
    "codex cli",
    "gemini",
    "gemini cli",
    "opencode",
    "aider",
    "cursor",
    "cursor cli",
  ].map((title) => title.toLowerCase()),
);

function call<T>(args: string[]): T {
  const res = spawnSync(HERDR, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    throw new Error(`herdr ${args.join(" ")} exited ${res.status}: ${detail}`);
  }
  const parsed: unknown = JSON.parse(res.stdout);
  const envelope = parsed as { result?: T };
  return envelope && typeof envelope === "object" && "result" in envelope
    ? (envelope.result as T)
    : (parsed as T);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function loadConfig(): Config {
  const dir = process.env.HERDR_PLUGIN_CONFIG_DIR;
  const raw = dir
    ? readJson<Record<string, unknown>>(path.join(dir, "config.json"), {})
    : {};
  const extraBoringTitles = Array.isArray(raw.extra_boring_titles)
    ? raw.extra_boring_titles.filter((v): v is string => typeof v === "string")
    : [];
  return {
    overwriteManual: raw.overwrite_manual === true,
    agentMaxLength: Number.isInteger(raw.agent_max_length)
      ? (raw.agent_max_length as number)
      : 60,
    extraBoringTitles,
  } satisfies Config;
}

function truncate(label: string, maxLength: number): string {
  if (maxLength <= 0 || label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, maxLength - 1)}…`;
}

function activityTitle(
  pane: { terminal_title_stripped?: string },
  extraBoringTitles: readonly string[],
): string | null {
  const title = pane.terminal_title_stripped?.trim();
  if (!title) {
    return null;
  }
  const lower = title.toLowerCase();
  if (BORING_TITLES.has(lower)) {
    return null;
  }
  if (extraBoringTitles.some((boring) => boring.toLowerCase() === lower)) {
    return null;
  }
  if (SHELL_PROMPT_RE.test(title)) {
    return null;
  }
  return title;
}

function syncAgents(config: Config, stateDir: string | undefined): void {
  const stateFile = stateDir ? path.join(stateDir, "agent-names.json") : null;
  const owned: OwnedMap = stateFile ? readJson<OwnedMap>(stateFile, {}) : {};
  const nextOwned: OwnedMap = {};

  const agents =
    call<{ agents?: AgentInfo[] }>(["agent", "list"]).agents ?? [];

  for (const agent of agents) {
    const isOwned = !agent.name || owned[agent.pane_id] === agent.name;
    if (!isOwned && !config.overwriteManual) {
      continue;
    }

    const title = activityTitle(agent, config.extraBoringTitles);
    if (!title) {
      // Keep the last activity name we set; agent titles go blank/generic
      // between turns and we don't want to flap back to the app's own name.
      if (agent.name && owned[agent.pane_id] === agent.name) {
        nextOwned[agent.pane_id] = agent.name;
      }
      continue;
    }

    const label = truncate(title, config.agentMaxLength);
    if (agent.name !== label) {
      call(["agent", "rename", agent.pane_id, label]);
    }
    nextOwned[agent.pane_id] = label;
  }

  if (stateFile) {
    writeJsonAtomic(stateFile, nextOwned);
  }
}

function main(): void {
  const config = loadConfig();
  syncAgents(config, process.env.HERDR_PLUGIN_STATE_DIR);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-activity-name: ${message}`);
  process.exit(1);
}
