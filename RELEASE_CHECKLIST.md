# Release Checklist

## Before Packaging

- Update version in `package.json`
- Review `README.md` screenshots and marketplace copy
- Verify repository, bugs, sponsor, and homepage metadata
- Run `npm run verify`
- Test `Agent Foundry: Analyze Workspace`
- Test `Agent Foundry: Bootstrap Agent Workflow Assets`
- Test `Agent Foundry: Generate Task Handoff`

## Before Publishing

- Run `npm run package`
- Install the generated `.vsix` locally in VS Code
- Confirm generated files use the current official VS Code customization paths
- Check the sidebar labels and welcome content in an Extension Development Host
- Update `CHANGELOG.md`

## After Publishing

- Publish release notes on GitHub
- Update the marketplace listing with screenshots or a short demo GIF
- Announce with a concrete before/after repo example
- Link to GitHub Sponsors from the README and marketplace page
