# Agent Foundry Market Research

## Executive Summary

The best opportunity is not to launch another standalone coding agent. The opportunity is to become the open-source workflow layer that makes the whole agent ecosystem work better inside real repositories.

The extension idea with the strongest install upside is:

- `vscode-agent-foundry`

Its wedge is simple:

- analyze a repo
- generate portable workflow assets
- make handoffs between agent sessions reliable
- support the current agent stack instead of fighting it

## Why The Timing Is Good

VS Code is explicitly moving toward agent-native development:

- prompt files now cover custom instructions, reusable prompts, `AGENTS.md`, and `CLAUDE.md`
- custom agents can be defined in the workspace
- agent skills are first-class and use `SKILL.md`
- handoff support lets work move between agents
- the January 2026 release notes add extension-contributed `chatSkills` and support Claude custom agents and slash commands from extensions

This means the platform direction is no longer speculative. The workflow surface area now exists.

## Distribution Reality

The biggest distribution channel is still the VS Code Marketplace, and it is extremely top-heavy:

- GitHub Copilot Chat: `65,865,985` installs
- Cline: `3,315,582` installs
- Roo Code: `1,356,196` installs
- Continue: `262,157` installs

Those numbers matter because they show two things:

- there is already a massive audience using agent-assisted development
- even non-Microsoft agent tools can reach seven-figure installs if the value is obvious

## Why Not Build Another Agent

Competing directly with Copilot, Cline, Roo, Claude, or Codex is the wrong wedge:

- the incumbents already own model access and chat surfaces
- the best-funded players can copy agent UX quickly
- users do not want five more assistants; they want their existing assistants to work better in their repos

The better position is "infrastructure for agentic software engineering".

## The Market Gap

What is still broken in practice:

- repo instructions are fragmented across vendors
- setup is still manual even though the platform supports it
- handoffs between sessions, tools, or teammates are inconsistent
- most context engineering still lives in chat history instead of repository files
- prompt-manager or chat-export utilities are too narrow to become massive products on their own

This is visible in adjacent marketplace tools. For example, Copilot Chat Porter is only at `118` installs, which supports the idea that narrow export utilities are not the big category. The bigger category is "make the repo agent-ready."

## Winning Product Thesis

The extension with the highest upside should:

- work with Copilot, Claude, Codex, and agent-adjacent tools instead of forcing lock-in
- generate actual repository assets, not just transient prompts
- help both on day one setup and day-to-day handoffs
- stay lightweight, local, and open source
- be easy to understand from the marketplace listing in under ten seconds

That leads to:

- `vscode-agent-foundry`

## Positioning

Suggested one-line pitch:

> Turn any repository into an agent-ready workspace with instructions, custom agents, skills, and portable handoffs.

## Monetization Fit

For sponsorship-based monetization, this direction is stronger than a hosted product because:

- open-source teams can adopt it with low friction
- the outputs are visible in public repos, which creates discovery
- power users and teams benefit repeatedly over time
- the project can remain neutral across vendors, which broadens goodwill

The sponsor pitch should be:

- support neutral, open-source infrastructure for agentic software engineering

## Recommended Scope For The First Version

The first release should ship:

- workspace analysis and readiness score
- generation of `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, and scoped instruction/prompt files
- generation of planner, implementer, and reviewer custom agent files
- generation of a small starter skills pack
- portable task handoffs that capture repo state, diagnostics, and git status
- a simple sidebar that keeps the workflow visible

That scope is large enough to feel like a product, but small enough to implement and explain.

## Sources

- VS Code prompt files: https://code.visualstudio.com/docs/copilot/customization/prompt-files
- VS Code custom agents: https://code.visualstudio.com/docs/copilot/customization/custom-agents
- VS Code agent skills: https://code.visualstudio.com/docs/copilot/customization/agent-skills
- VS Code AI extensibility and plugins preview: https://code.visualstudio.com/blogs/2025/11/12/ai-extensibility
- VS Code January 2026 release notes: https://code.visualstudio.com/updates/v1_109
- GitHub Copilot Chat marketplace page: https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat
- Cline marketplace page: https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev
- Roo Code marketplace page: https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline
- Continue marketplace page: https://marketplace.visualstudio.com/items?itemName=Continue.continue
- Copilot Chat Porter marketplace page: https://marketplace.visualstudio.com/items?itemName=Vizards.copilot-chat-porter
