# Agent Foundry Implementation Plan

## Goal

Build a VS Code extension that can plausibly reach a very large install base by serving the whole agentic software-engineering ecosystem rather than a single model vendor.

## Product Definition

`Agent Foundry` should be the fastest way to make a repository agent-ready.

Core promise:

- one install
- one bootstrap command
- immediate repo-native outputs that improve agent quality

## MVP Scope

### 1. Workspace Analysis

- detect primary stack and package manager
- detect verification commands
- detect diagnostics
- detect current git status
- detect existing agent workflow files
- compute a simple readiness score

### 2. Repo Asset Generation

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`
- `.github/prompts/*.prompt.md`
- `.github/agents/planner.agent.md`
- `.github/agents/implementer.agent.md`
- `.github/agents/reviewer.agent.md`
- `.github/skills/bug-triage/SKILL.md`
- `.github/skills/change-safely/SKILL.md`
- `.agent-foundry/workspace-analysis.md`
- `.agent-foundry/workspace-analysis.json`
- `.agent-foundry/implementation-plan.md`

### 3. Portable Handoffs

- create markdown handoffs that include:
  - task title
  - detected stack
  - verification commands
  - open editor files
  - diagnostics snapshot
  - git status
  - a paste-ready continuation brief

### 4. Native VS Code UX

- sidebar with current readiness and quick actions
- command palette coverage for all major flows
- no required external service

## Why This Scope Matters

This scope covers both adoption loops:

- setup loop: "make my repo ready for agents"
- daily loop: "capture and hand off work cleanly"

Only doing setup would limit recurring usage. Only doing handoffs would make the product too narrow. The combination is stronger.

## Implementation Notes

- keep the extension in plain JavaScript first so packaging is simple
- avoid a build dependency for the MVP
- write generated files directly into the repository with deterministic templates
- treat the generated files as the product, not just a side effect
- keep the UX native and avoid a heavy webview for the first release

## Expansion Plan

After MVP:

1. Add stack-specific prompt files under `.github/instructions/`.
2. Add richer repo analysis for monorepos and polyglot workspaces.
3. Add preview/diff mode before writing generated assets.
4. Add issue import and branch-aware handoffs.
5. Add optional template marketplace or community playbook sharing.

## Revenue Strategy

Primary model:

- GitHub Sponsors

Support tactics:

- publish the repo outputs in public projects for organic discovery
- keep the extension open source and neutral
- reserve premium effort for support, template design, and deeper integrations rather than paywalling the core value

## Success Criteria

The extension is on the right track if:

- users install it because they already use Copilot, Claude, Codex, Cline, or Roo
- generated files are committed into public repositories
- handoff generation becomes a repeated command instead of a one-time setup step
- the marketplace listing can explain the value in one sentence
