# Agent Foundry Status And Roadmap

## Current State

Agent Foundry is now a real published VS Code extension, not just a prototype.

Current release state:

- marketplace extension published as `padjon.vscode-agent-foundry`
- current version: `1.0.0`
- repository tag: `v1.0.0`
- repository: `https://github.com/padjon/vscode-agent-foundry`

## What Exists Today

### Product Surface

- native sidebar view with quick actions and workspace summary
- command palette flows for analysis, bootstrap, handoff generation, walkthrough, and research notes
- built-in walkthrough for first-run onboarding
- marketplace assets, icon, screenshots, and release packaging

### Core Workflow

- workspace analysis for stack, package manager, project shape, diagnostics, git state, and existing agent assets
- repo bootstrap for:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/*.instructions.md`
  - `.github/prompts/*.prompt.md`
  - `.github/agents/*.agent.md`
  - `.github/skills/*/SKILL.md`
  - `.agent-foundry/*` reports
- task handoff generation into markdown
- preview-before-write flow before bootstrap writes files

### Stack Awareness

- generic repo support
- Next.js-specific instruction generation
- Python-specific instruction generation
- monorepo-specific instruction generation

### Project Hygiene

- packaging flow with `vsce --no-dependencies`
- lightweight unit tests
- contribution guide
- security policy
- issue templates
- sponsor links and feedback channels

## What Is Good Enough

These areas are strong enough for a credible public `1.0.0`:

- install and publish path
- repo bootstrap concept
- task handoff concept
- onboarding and marketplace presence
- basic product positioning

## What Is Still Missing

Agent Foundry is not yet a category-leading or fully mature extension.

Main gaps:

- no extension-host integration tests
- no end-to-end validation of command flows inside a real VS Code session
- no selective write or diff-by-file experience after preview
- no migration/versioning strategy for generated repo assets
- no deeper repo inference for complex monorepos or multi-app workspaces
- no CI pipeline committed in the repo
- no usage analytics or opt-in telemetry loop
- no GitHub Release object automation from the repo side

## Product Assessment

Rough internal assessment:

- credible open-source `1.0.0`: achieved
- fully mature, category-leading product: not achieved yet

Working estimate:

- around `70-80%` of a solid open-source first major release
- around `40-50%` of a truly full-blown top-tier extension

## Recommended Next States

### State 2: Operationally Mature

Goal:

- make the extension safer, more testable, and easier to maintain

Required work:

- add extension-host integration tests
- add CI for verify, test, and package
- add better error reporting for failed generation cases
- add asset migration/version markers for generated files

Exit criteria:

- command flows are tested in CI
- failures are visible and actionable
- releases are repeatable without manual reconstruction

### State 3: Repository-Aware Product

Goal:

- make generation feel tailored rather than template-like

Required work:

- infer actual repo directories and scripts into generated instructions
- support more stacks such as Express/Fastify backends, React-only apps, Vue/Nuxt, and Rust/Go services
- improve monorepo awareness across apps, packages, and services
- generate stack-specific verification and ownership guidance

Exit criteria:

- generated files feel useful immediately in common real-world repos
- fewer users need to edit generated files heavily after bootstrap

### State 4: Daily-Use Workflow Product

Goal:

- make Agent Foundry something users return to, not just install once

Required work:

- selective write/diff mode
- regenerate/update flows for previously bootstrapped repos
- stronger handoff generation from changed files, diagnostics, and issue context
- branch-aware and task-aware handoffs

Exit criteria:

- handoffs and maintenance become repeated workflows
- the extension is useful after day-one setup

### State 5: Ecosystem Product

Goal:

- build defensibility and broader adoption

Required work:

- public gallery of templates/playbooks
- community-contributed stack packs
- optional opt-in telemetry for missing-stack feedback
- stronger docs around best practices for `AGENTS.md`, prompts, agents, and skills

Exit criteria:

- ecosystem participation outside the core repository
- distribution loop from generated assets in public repos

## Suggested Execution Order

If work continues from here, the recommended sequence is:

1. Add extension-host integration tests.
2. Add CI for `npm run verify`, `npm test`, and `npm run package`.
3. Add selective write or diff-based bootstrap.
4. Improve repo-shape inference for monorepos and high-volume frameworks.
5. Improve handoff generation from actual changed files and issue/task context.

## Recommended Next Task

If only one next task should be started, it should be:

- implement integration tests plus CI

Reason:

- this is the highest leverage maturity step
- it reduces release risk
- it makes future feature work safer
- it raises confidence that the published extension actually behaves as intended

## Resume Checklist

When returning later, check these first:

1. Is the marketplace version still aligned with `package.json`?
2. Is the latest git tag aligned with the marketplace release?
3. Do `npm run verify`, `npm test`, and `npm run package` still pass?
4. Is the next goal operational maturity, repo-awareness, or daily-use workflow depth?
5. Are there new GitHub issues or emails that should reshape priorities?
