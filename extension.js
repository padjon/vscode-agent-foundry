'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const encoder = new TextEncoder();
const ACTION_OPEN_RESEARCH = 'agentFoundry.action.openResearch';
const ACTION_ANALYZE = 'agentFoundry.action.analyze';
const ACTION_BOOTSTRAP = 'agentFoundry.action.bootstrap';
const ACTION_HANDOFF = 'agentFoundry.action.handoff';

function activate(context) {
  const state = {
    analysis: null
  };

  const provider = new FoundryTreeProvider(state);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agentFoundry.sidebar', provider),
    vscode.commands.registerCommand('agentFoundry.analyzeWorkspace', () => analyzeWorkspaceCommand(context, state, provider)),
    vscode.commands.registerCommand('agentFoundry.bootstrapWorkspace', () => bootstrapWorkspaceCommand(context, state, provider)),
    vscode.commands.registerCommand('agentFoundry.generateTaskHandoff', () => generateTaskHandoffCommand(context, state, provider)),
    vscode.commands.registerCommand('agentFoundry.showActions', () => showActionsCommand(context)),
    vscode.commands.registerCommand('agentFoundry.openResearchNotes', () => openResearchNotesCommand(context)),
    vscode.commands.registerCommand('agentFoundry.openWalkthrough', () => openWalkthroughCommand()),
    vscode.commands.registerCommand(ACTION_OPEN_RESEARCH, () => openResearchNotesCommand(context)),
    vscode.commands.registerCommand(ACTION_ANALYZE, () => analyzeWorkspaceCommand(context, state, provider)),
    vscode.commands.registerCommand(ACTION_BOOTSTRAP, () => bootstrapWorkspaceCommand(context, state, provider)),
    vscode.commands.registerCommand(ACTION_HANDOFF, () => generateTaskHandoffCommand(context, state, provider)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.languages.onDidChangeDiagnostics(() => provider.refresh())
  );

  refreshWorkspaceContext();
}

function deactivate() {}

async function showActionsCommand(context) {
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: 'Bootstrap agent workflow assets',
        description: 'Generate AGENTS.md, Copilot instructions, custom agents, skills, and reports',
        action: 'bootstrap'
      },
      {
        label: 'Analyze workspace',
        description: 'Inspect the repo and refresh the sidebar snapshot',
        action: 'analyze'
      },
      {
        label: 'Generate task handoff',
        description: 'Create a portable handoff document from the current workspace state',
        action: 'handoff'
      },
      {
        label: 'Open market research',
        description: 'Review the strategy and market validation behind Agent Foundry',
        action: 'research'
      },
      {
        label: 'Open getting started guide',
        description: 'Open the built-in walkthrough for first-run onboarding',
        action: 'walkthrough'
      }
    ],
    {
      placeHolder: 'Agent Foundry actions'
    }
  );

  if (!pick) {
    return;
  }

  if (pick.action === 'bootstrap') {
    await vscode.commands.executeCommand('agentFoundry.bootstrapWorkspace');
  } else if (pick.action === 'analyze') {
    await vscode.commands.executeCommand('agentFoundry.analyzeWorkspace');
  } else if (pick.action === 'handoff') {
    await vscode.commands.executeCommand('agentFoundry.generateTaskHandoff');
  } else if (pick.action === 'walkthrough') {
    await vscode.commands.executeCommand('agentFoundry.openWalkthrough');
  } else {
    await vscode.commands.executeCommand('agentFoundry.openResearchNotes');
  }
}

async function analyzeWorkspaceCommand(context, state, provider) {
  const folder = getPrimaryWorkspaceFolder();
  if (!folder) {
    vscode.window.showWarningMessage('Open a folder or workspace before using Agent Foundry.');
    refreshWorkspaceContext();
    provider.refresh();
    return;
  }

  const analysis = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Agent Foundry: analyzing workspace',
      cancellable: false
    },
    async () => analyzeWorkspace(folder)
  );

  state.analysis = analysis;
  refreshWorkspaceContext();
  provider.refresh();

  const summary = [
    `${analysis.repoName} scored ${analysis.readinessScore}/100`,
    `${analysis.techStack.join(', ') || 'generic repo'} detected`,
    `${analysis.recommendedActions.length} recommended action${analysis.recommendedActions.length === 1 ? '' : 's'}`
  ].join(' | ');

  vscode.window.showInformationMessage(summary);
}

async function bootstrapWorkspaceCommand(context, state, provider) {
  const folder = getPrimaryWorkspaceFolder();
  if (!folder) {
    vscode.window.showWarningMessage('Open a folder or workspace before bootstrapping agent workflow assets.');
    refreshWorkspaceContext();
    provider.refresh();
    return;
  }

  const previewBeforeWrite = getConfiguration().get('previewBeforeWrite', true);

  const analysis = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Agent Foundry: generating workspace assets',
      cancellable: false
    },
    async () => {
      const nextAnalysis = await analyzeWorkspace(folder);
      const generatedFiles = buildGeneratedFiles(folder, nextAnalysis);
      const existingOutputs = detectPotentialOverwriteTargets(folder.fsPath, generatedFiles.map((file) => file.relativePath));

      if (previewBeforeWrite) {
        const proceed = await previewGeneratedFiles(folder, nextAnalysis, generatedFiles, existingOutputs);
        if (!proceed) {
          return nextAnalysis;
        }
      }

      const shouldPrompt = getConfiguration().get('promptBeforeOverwrite', true);
      if (shouldPrompt && existingOutputs.length) {
        const decision = await vscode.window.showWarningMessage(
          `Agent Foundry will overwrite ${existingOutputs.length} existing workflow file${existingOutputs.length === 1 ? '' : 's'}.`,
          { modal: true, detail: existingOutputs.slice(0, 10).join('\n') },
          'Overwrite',
          'Cancel'
        );

        if (decision !== 'Overwrite') {
          return nextAnalysis;
        }
      }

      await writeGeneratedFiles(folder, generatedFiles);
      return await analyzeWorkspace(folder);
    }
  );

  state.analysis = analysis;
  refreshWorkspaceContext();
  provider.refresh();

  const mainDoc = await vscode.workspace.openTextDocument(path.join(folder.fsPath, 'AGENTS.md'));
  await vscode.window.showTextDocument(mainDoc, { preview: false });
  vscode.window.showInformationMessage('Agent Foundry generated repo instructions, custom agents, skills, and reports.');
}

async function generateTaskHandoffCommand(context, state, provider) {
  const folder = getPrimaryWorkspaceFolder();
  if (!folder) {
    vscode.window.showWarningMessage('Open a folder or workspace before generating a task handoff.');
    refreshWorkspaceContext();
    provider.refresh();
    return;
  }

  const title =
    (await vscode.window.showInputBox({
      prompt: 'Task handoff title',
      placeHolder: 'Example: tighten test coverage around auth middleware',
      ignoreFocusOut: true
    })) || 'Current task';

  const analysis =
    state.analysis && state.analysis.rootPath === folder.fsPath ? state.analysis : await analyzeWorkspace(folder);

  const handoffPath = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Agent Foundry: creating task handoff',
      cancellable: false
    },
    async () => writeTaskHandoff(folder, analysis, title)
  );

  state.analysis = analysis;
  refreshWorkspaceContext();
  provider.refresh();

  const doc = await vscode.workspace.openTextDocument(handoffPath);
  await vscode.window.showTextDocument(doc, { preview: false });
  vscode.window.showInformationMessage(`Task handoff written to ${path.relative(folder.fsPath, handoffPath)}`);
}

async function openResearchNotesCommand(context) {
  const researchUri = vscode.Uri.joinPath(context.extensionUri, 'docs', 'market-research.md');
  const doc = await vscode.workspace.openTextDocument(researchUri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openWalkthroughCommand() {
  await vscode.commands.executeCommand(
    'workbench.action.openWalkthrough',
    'padjon.vscode-agent-foundry#agentFoundry.gettingStarted',
    false
  );
}

class FoundryTreeProvider {
  constructor(state) {
    this.state = state;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    refreshWorkspaceContext();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const folder = getPrimaryWorkspaceFolder();
    if (!folder) {
      return [
        createInfoItem('No workspace folder open', 'Open a project to use Agent Foundry.'),
        createActionItem('Open getting started guide', 'See the core workflow and product entry points', 'agentFoundry.openWalkthrough'),
        createActionItem('Open market research', 'Review the market thesis', ACTION_OPEN_RESEARCH)
      ];
    }

    const analysis = this.state.analysis;
    if (!analysis || analysis.rootPath !== folder.fsPath) {
      return [
        createInfoItem('Workspace ready for analysis', path.basename(folder.fsPath)),
        createActionItem('Analyze workspace', 'Inspect stack, scripts, diagnostics, and current agent assets', ACTION_ANALYZE),
        createActionItem('Bootstrap assets', 'Generate instructions, agents, skills, and reports', ACTION_BOOTSTRAP),
        createActionItem('Generate task handoff', 'Create a portable context brief for another agent or teammate', ACTION_HANDOFF),
        createActionItem('Open getting started guide', 'See the recommended first-run flow', 'agentFoundry.openWalkthrough')
      ];
    }

    const items = [
      createInfoItem(`Readiness ${analysis.readinessScore}/100`, analysis.repoName),
      createInfoItem('Stack', analysis.techStack.join(', ') || 'Generic repository'),
      createInfoItem(
        'Verification',
        analysis.verificationCommands.length ? analysis.verificationCommands.join(' | ') : 'No test/lint/build scripts detected'
      ),
      createInfoItem(
        'Assets',
        [
          analysis.existingAssets.agents ? 'AGENTS.md' : null,
          analysis.existingAssets.copilotInstructions ? 'Copilot' : null,
          analysis.existingAssets.claude ? 'CLAUDE.md' : null,
          analysis.existingAssets.githubAgentsCount ? `${analysis.existingAssets.githubAgentsCount} custom agents` : null,
          analysis.existingAssets.githubSkillsCount ? `${analysis.existingAssets.githubSkillsCount} skills` : null
        ]
          .filter(Boolean)
          .join(' | ') || 'No agent workflow files yet'
      ),
      createInfoItem(
        'Diagnostics',
        `${analysis.diagnostics.errors} errors, ${analysis.diagnostics.warnings} warnings`
      ),
      createActionItem('Bootstrap assets', 'Write repo files and workspace reports', ACTION_BOOTSTRAP),
      createActionItem('Generate task handoff', 'Create a portable work brief', ACTION_HANDOFF),
      createActionItem('Re-run analysis', 'Refresh the workspace snapshot', ACTION_ANALYZE),
      createActionItem('Open getting started guide', 'See the recommended first-run flow', 'agentFoundry.openWalkthrough'),
      createActionItem('Open market research', 'Review product positioning and market data', ACTION_OPEN_RESEARCH)
    ];

    for (const action of analysis.recommendedActions.slice(0, 4)) {
      items.push(createInfoItem(`Opportunity: ${action.title}`, action.detail));
    }

    return items;
  }
}

function createInfoItem(label, description) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.contextValue = 'info';
  return item;
}

function createActionItem(label, description, command) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.command = { command, title: label };
  item.contextValue = 'action';
  return item;
}

async function analyzeWorkspace(folder) {
  const rootPath = folder.fsPath;
  const packageJson = readJsonIfExists(path.join(rootPath, 'package.json'));
  const packageScripts = packageJson && packageJson.scripts ? packageJson.scripts : {};
  const allDependencies = {
    ...(packageJson && packageJson.dependencies ? packageJson.dependencies : {}),
    ...(packageJson && packageJson.devDependencies ? packageJson.devDependencies : {})
  };

  const has = (relativePath) => fs.existsSync(path.join(rootPath, relativePath));
  const projectFacts = detectProjectFacts(rootPath, packageJson);
  const techStack = detectTechStack(rootPath, packageJson, allDependencies, projectFacts);
  const packageManager = detectPackageManager(rootPath);
  const verificationCommands = detectVerificationCommands(packageScripts, packageManager);
  const diagnostics = collectDiagnostics(rootPath);
  const git = await getGitSummary(rootPath);
  const existingAssets = await detectExistingAssets(rootPath);
  const recommendedActions = detectRecommendedActions(existingAssets, verificationCommands, diagnostics, git);

  return {
    rootPath,
    repoName: path.basename(rootPath),
    packageManager,
    techStack,
    diagnostics,
    verificationCommands,
    packageScripts,
    existingAssets,
    git,
    recommendedActions,
    projectFacts,
    readinessScore: computeReadinessScore(existingAssets, verificationCommands, diagnostics, git)
  };
}

function detectTechStack(rootPath, packageJson, dependencies, projectFacts) {
  const stack = [];
  const add = (label) => {
    if (!stack.includes(label)) {
      stack.push(label);
    }
  };

  if (packageJson) {
    add('Node.js');
  }
  if (fs.existsSync(path.join(rootPath, 'tsconfig.json')) || dependencies.typescript) {
    add('TypeScript');
  }
  if (dependencies.react) {
    add('React');
  }
  if (dependencies.next) {
    add('Next.js');
  }
  if (dependencies.vue) {
    add('Vue');
  }
  if (dependencies.nuxt) {
    add('Nuxt');
  }
  if (dependencies.svelte || dependencies['@sveltejs/kit']) {
    add('Svelte');
  }
  if (dependencies.express) {
    add('Express');
  }
  if (dependencies.fastify) {
    add('Fastify');
  }
  if (dependencies.vitest) {
    add('Vitest');
  }
  if (dependencies.jest) {
    add('Jest');
  }
  if (dependencies.playwright || dependencies['@playwright/test']) {
    add('Playwright');
  }
  if (dependencies.cypress) {
    add('Cypress');
  }
  if (dependencies.prisma) {
    add('Prisma');
  }
  if (fs.existsSync(path.join(rootPath, 'turbo.json'))) {
    add('Turborepo');
  }
  if (fs.existsSync(path.join(rootPath, 'pyproject.toml')) || fs.existsSync(path.join(rootPath, 'requirements.txt'))) {
    add('Python');
  }
  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) {
    add('Rust');
  }
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
    add('Go');
  }
  if (fs.existsSync(path.join(rootPath, 'Gemfile'))) {
    add('Ruby');
  }
  if (fs.existsSync(path.join(rootPath, 'pom.xml')) || fs.existsSync(path.join(rootPath, 'build.gradle'))) {
    add('Java');
  }
  if (fs.existsSync(path.join(rootPath, 'Dockerfile')) || fs.existsSync(path.join(rootPath, 'docker-compose.yml'))) {
    add('Docker');
  }
  if (projectFacts && projectFacts.isMonorepo) {
    add('Monorepo');
  }

  if (!stack.length) {
    add('Generic repository');
  }

  return stack;
}

function detectProjectFacts(rootPath, packageJson) {
  const packageJsonWorkspaces = packageJson && Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces
    : packageJson && packageJson.workspaces && Array.isArray(packageJson.workspaces.packages)
      ? packageJson.workspaces.packages
      : [];
  const hasDirectory = (relativePath) => {
    try {
      return fs.statSync(path.join(rootPath, relativePath)).isDirectory();
    } catch (_error) {
      return false;
    }
  };

  return {
    hasPackageJson: Boolean(packageJson),
    hasDocker: fs.existsSync(path.join(rootPath, 'Dockerfile')) || fs.existsSync(path.join(rootPath, 'docker-compose.yml')) || fs.existsSync(path.join(rootPath, 'compose.yml')),
    hasEnvExample: fs.existsSync(path.join(rootPath, '.env.example')) || fs.existsSync(path.join(rootPath, '.env.sample')),
    hasReadme: fs.existsSync(path.join(rootPath, 'README.md')),
    hasPyproject: fs.existsSync(path.join(rootPath, 'pyproject.toml')),
    hasRequirementsTxt: fs.existsSync(path.join(rootPath, 'requirements.txt')),
    hasTurboConfig: fs.existsSync(path.join(rootPath, 'turbo.json')),
    hasPnpmWorkspace: fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml')),
    hasAppDirectory: hasDirectory('app'),
    hasPagesDirectory: hasDirectory('pages'),
    hasSrcDirectory: hasDirectory('src'),
    hasAppsDirectory: hasDirectory('apps'),
    hasPackagesDirectory: hasDirectory('packages'),
    hasServicesDirectory: hasDirectory('services'),
    hasTestsDirectory: hasDirectory('test') || hasDirectory('tests'),
    workspaceGlobs: packageJsonWorkspaces,
    isMonorepo:
      Boolean(packageJsonWorkspaces.length) ||
      fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(rootPath, 'turbo.json')) ||
      (hasDirectory('apps') && hasDirectory('packages'))
  };
}

function detectPackageManager(rootPath) {
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) {
    return 'npm';
  }
  if (fs.existsSync(path.join(rootPath, 'bun.lockb')) || fs.existsSync(path.join(rootPath, 'bun.lock'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) {
    return 'cargo';
  }
  if (fs.existsSync(path.join(rootPath, 'pyproject.toml'))) {
    return 'python';
  }
  return 'unknown';
}

function detectVerificationCommands(scripts, packageManager) {
  const runner = getScriptRunner(packageManager);
  const candidates = [];
  const add = (value) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (scripts.lint) {
    add(formatScriptCommand(runner, 'lint'));
  }
  if (scripts.typecheck) {
    add(formatScriptCommand(runner, 'typecheck'));
  }
  if (scripts.test) {
    add(formatScriptCommand(runner, 'test'));
  }
  if (scripts.build) {
    add(formatScriptCommand(runner, 'build'));
  }
  if (scripts['test:unit']) {
    add(formatScriptCommand(runner, 'test:unit'));
  }
  if (scripts['test:integration']) {
    add(formatScriptCommand(runner, 'test:integration'));
  }
  if (scripts['test:e2e']) {
    add(formatScriptCommand(runner, 'test:e2e'));
  }

  return candidates;
}

function getScriptRunner(packageManager) {
  if (packageManager === 'pnpm') {
    return 'pnpm';
  }
  if (packageManager === 'yarn') {
    return 'yarn';
  }
  if (packageManager === 'bun') {
    return 'bun';
  }
  return 'npm';
}

function formatScriptCommand(runner, scriptName) {
  if (runner === 'yarn' || runner === 'pnpm') {
    return `${runner} ${scriptName}`;
  }
  if (runner === 'bun') {
    return `bun run ${scriptName}`;
  }
  return `npm run ${scriptName}`;
}

function collectDiagnostics(rootPath) {
  const result = {
    errors: 0,
    warnings: 0,
    topItems: []
  };

  for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
    if (!uri || !uri.fsPath || !uri.fsPath.startsWith(rootPath)) {
      continue;
    }

    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
        result.errors += 1;
      } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
        result.warnings += 1;
      }

      if (result.topItems.length < 20) {
        result.topItems.push({
          file: path.relative(rootPath, uri.fsPath),
          message: diagnostic.message.replace(/\s+/g, ' ').trim(),
          line: diagnostic.range.start.line + 1,
          severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning'
        });
      }
    }
  }

  return result;
}

async function getGitSummary(rootPath) {
  const insideWorkTree = await execFileSafe('git', ['rev-parse', '--is-inside-work-tree'], rootPath);
  if (!insideWorkTree.ok || insideWorkTree.stdout.trim() !== 'true') {
    return {
      isRepository: false,
      branch: '',
      changedFiles: [],
      rawStatus: ''
    };
  }

  const status = await execFileSafe('git', ['status', '--short', '--branch'], rootPath);
  if (!status.ok) {
    return {
      isRepository: true,
      branch: '',
      changedFiles: [],
      rawStatus: ''
    };
  }

  const lines = status.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const branchLine = lines[0] && lines[0].startsWith('## ') ? lines[0].slice(3) : '';
  const changedFiles = lines
    .slice(branchLine ? 1 : 0)
    .map((line) => ({
      status: line.slice(0, 2).trim() || '??',
      file: line.slice(3).trim()
    }))
    .filter((entry) => entry.file);

  return {
    isRepository: true,
    branch: branchLine,
    changedFiles,
    rawStatus: lines.join('\n')
  };
}

async function detectExistingAssets(rootPath) {
  const githubAgents = await readMarkdownFiles(path.join(rootPath, '.github', 'agents'));
  const githubSkills = await readSkillFiles(path.join(rootPath, '.github', 'skills'));
  const claudeAgents = await readMarkdownFiles(path.join(rootPath, '.claude', 'agents'));

  return {
    agents: fs.existsSync(path.join(rootPath, 'AGENTS.md')),
    claude: fs.existsSync(path.join(rootPath, 'CLAUDE.md')),
    copilotInstructions: fs.existsSync(path.join(rootPath, '.github', 'copilot-instructions.md')),
    githubAgentsCount: githubAgents.length,
    githubSkillsCount: githubSkills.length,
    claudeAgentsCount: claudeAgents.length,
    foundryOutput: fs.existsSync(path.join(rootPath, getOutputFolderName()))
  };
}

async function readMarkdownFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);
}

async function readSkillFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directoryPath, entry.name, 'SKILL.md'))
    .filter((skillPath) => fs.existsSync(skillPath));
}

function detectRecommendedActions(existingAssets, verificationCommands, diagnostics, git) {
  const actions = [];

  if (!existingAssets.agents) {
    actions.push({
      title: 'Add AGENTS.md',
      detail: 'A vendor-neutral project contract is still missing.'
    });
  }
  if (!existingAssets.copilotInstructions) {
    actions.push({
      title: 'Add Copilot instructions',
      detail: 'GitHub Copilot can consume repo-level instructions directly.'
    });
  }
  if (!existingAssets.githubAgentsCount) {
    actions.push({
      title: 'Add custom agents',
      detail: 'Planner, implementer, and reviewer agents can encode workflow roles.'
    });
  }
  if (!existingAssets.githubSkillsCount) {
    actions.push({
      title: 'Add reusable skills',
      detail: 'Skill files turn repeated workflows into durable assets instead of chat history.'
    });
  }
  if (!verificationCommands.length) {
    actions.push({
      title: 'Surface verification commands',
      detail: 'Agents perform better when lint, test, build, and typecheck commands are explicit.'
    });
  }
  if (diagnostics.errors > 0) {
    actions.push({
      title: 'Clear editor errors',
      detail: `${diagnostics.errors} current errors could distort agent output and handoffs.`
    });
  }
  if (git.changedFiles.length > 0) {
    actions.push({
      title: 'Capture a task handoff',
      detail: `${git.changedFiles.length} changed file${git.changedFiles.length === 1 ? '' : 's'} already form a useful portable brief.`
    });
  }

  return actions;
}

function computeReadinessScore(existingAssets, verificationCommands, diagnostics, git) {
  let score = 25;

  if (existingAssets.agents) {
    score += 15;
  }
  if (existingAssets.copilotInstructions) {
    score += 15;
  }
  if (existingAssets.claude) {
    score += 10;
  }
  if (existingAssets.githubAgentsCount > 0) {
    score += 10;
  }
  if (existingAssets.githubSkillsCount > 0) {
    score += 10;
  }
  if (verificationCommands.length > 0) {
    score += 10;
  }
  if (git.changedFiles.length > 0) {
    score += 5;
  }
  if (diagnostics.errors === 0) {
    score += 5;
  }
  if (diagnostics.warnings === 0) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

async function writeWorkspaceAssets(folder, analysis) {
  const generatedFiles = buildGeneratedFiles(folder, analysis);
  await writeGeneratedFiles(folder, generatedFiles);
}

function buildGeneratedFiles(folder, analysis) {
  const outputFolder = getOutputFolderName();
  const includeClaudeAssets = getConfiguration().get('includeClaudeAssets', true);
  const files = [
    { relativePath: 'AGENTS.md', content: buildAgentsMd(analysis) },
    { relativePath: '.github/copilot-instructions.md', content: buildCopilotInstructions(analysis) },
    { relativePath: '.github/agents/planner.agent.md', content: buildGithubAgent('planner', analysis) },
    { relativePath: '.github/agents/implementer.agent.md', content: buildGithubAgent('implementer', analysis) },
    { relativePath: '.github/agents/reviewer.agent.md', content: buildGithubAgent('reviewer', analysis) },
    { relativePath: '.github/instructions/repository.instructions.md', content: buildInstructionFile('repository', analysis) },
    { relativePath: '.github/instructions/frontend.instructions.md', content: buildInstructionFile('frontend', analysis) },
    { relativePath: '.github/instructions/backend.instructions.md', content: buildInstructionFile('backend', analysis) },
    { relativePath: '.github/prompts/plan-change.prompt.md', content: buildPromptFile('plan-change', analysis) },
    { relativePath: '.github/prompts/ship-change.prompt.md', content: buildPromptFile('ship-change', analysis) },
    { relativePath: '.github/skills/bug-triage/SKILL.md', content: buildSkill('bug-triage', analysis) },
    { relativePath: '.github/skills/change-safely/SKILL.md', content: buildSkill('change-safely', analysis) },
    { relativePath: `${outputFolder}/workspace-analysis.md`, content: buildWorkspaceAnalysisMarkdown(analysis) },
    { relativePath: `${outputFolder}/workspace-analysis.json`, content: JSON.stringify(buildWorkspaceAnalysisJson(analysis), null, 2) },
    { relativePath: `${outputFolder}/implementation-plan.md`, content: buildImplementationPlan(analysis) }
  ];

  if (analysis.techStack.includes('Next.js')) {
    files.push({ relativePath: '.github/instructions/nextjs.instructions.md', content: buildInstructionFile('nextjs', analysis) });
  }
  if (analysis.techStack.includes('Python')) {
    files.push({ relativePath: '.github/instructions/python.instructions.md', content: buildInstructionFile('python', analysis) });
  }
  if (analysis.projectFacts && analysis.projectFacts.isMonorepo) {
    files.push({ relativePath: '.github/instructions/monorepo.instructions.md', content: buildInstructionFile('monorepo', analysis) });
  }

  if (includeClaudeAssets) {
    files.push({ relativePath: 'CLAUDE.md', content: buildClaudeMd(analysis) });
    files.push({ relativePath: '.claude/agents/planner.md', content: buildClaudeAgent('planner', analysis) });
    files.push({ relativePath: '.claude/agents/implementer.md', content: buildClaudeAgent('implementer', analysis) });
    files.push({ relativePath: '.claude/agents/reviewer.md', content: buildClaudeAgent('reviewer', analysis) });
  }

  return files;
}

async function writeGeneratedFiles(folder, generatedFiles) {
  const rootPath = folder.fsPath;
  await Promise.all(generatedFiles.map((file) => writeTextFile(path.join(rootPath, file.relativePath), file.content)));
}

async function previewGeneratedFiles(folder, analysis, generatedFiles, existingOutputs) {
  const previewDocument = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: buildGenerationPreviewMarkdown(analysis, generatedFiles, existingOutputs)
  });
  await vscode.window.showTextDocument(previewDocument, { preview: false });

  const decision = await vscode.window.showInformationMessage(
    `Agent Foundry is ready to write ${generatedFiles.length} workflow file${generatedFiles.length === 1 ? '' : 's'}.`,
    { modal: true, detail: 'Review the preview document, then choose whether to write the files into the repository.' },
    'Write Files',
    'Cancel'
  );

  return decision === 'Write Files';
}

async function writeTaskHandoff(folder, analysis, title) {
  const rootPath = folder.fsPath;
  const handoffDirectory = path.join(rootPath, getOutputFolderName(), 'handoffs');
  const fileName = `${formatDateStamp(new Date())}-${slugify(title).slice(0, 60) || 'task'}.md`;
  const outputPath = path.join(handoffDirectory, fileName);
  const handoff = buildTaskHandoff(analysis, title, collectCurrentEditorFiles(rootPath));
  await writeTextFile(outputPath, handoff);
  return outputPath;
}

function buildWorkspaceAnalysisJson(analysis) {
  return {
    repoName: analysis.repoName,
    packageManager: analysis.packageManager,
    readinessScore: analysis.readinessScore,
    techStack: analysis.techStack,
    verificationCommands: analysis.verificationCommands,
    diagnostics: analysis.diagnostics,
    existingAssets: analysis.existingAssets,
    git: {
      branch: analysis.git.branch,
      changedFiles: analysis.git.changedFiles
    },
    recommendedActions: analysis.recommendedActions
  };
}

function buildWorkspaceAnalysisMarkdown(analysis) {
  return [
    '# Agent Foundry Workspace Analysis',
    '',
    `- Repository: \`${analysis.repoName}\``,
    `- Readiness score: \`${analysis.readinessScore}/100\``,
    `- Package manager: \`${analysis.packageManager}\``,
    `- Stack: ${analysis.techStack.join(', ')}`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'none detected'}`,
    `- Diagnostics: ${analysis.diagnostics.errors} errors, ${analysis.diagnostics.warnings} warnings`,
    `- Git branch: ${analysis.git.branch || 'not available'}`,
    '',
    '## Existing Assets',
    '',
    `- AGENTS.md: ${analysis.existingAssets.agents ? 'yes' : 'no'}`,
    `- CLAUDE.md: ${analysis.existingAssets.claude ? 'yes' : 'no'}`,
    `- Copilot instructions: ${analysis.existingAssets.copilotInstructions ? 'yes' : 'no'}`,
    `- GitHub custom agents: ${analysis.existingAssets.githubAgentsCount}`,
    `- GitHub skills: ${analysis.existingAssets.githubSkillsCount}`,
    '',
    '## Recommended Actions',
    '',
    ...analysis.recommendedActions.map((action) => `- ${action.title}: ${action.detail}`),
    '',
    '## Current Diagnostics',
    '',
    ...(analysis.diagnostics.topItems.length
      ? analysis.diagnostics.topItems.map(
          (item) => `- ${item.severity.toUpperCase()} ${item.file}:${item.line} ${item.message}`
        )
      : ['- No diagnostics detected.']),
    '',
    '## Changed Files',
    '',
    ...(analysis.git.changedFiles.length
      ? analysis.git.changedFiles.map((entry) => `- ${entry.status} ${entry.file}`)
      : ['- No changed files detected.']),
    ''
  ].join('\n');
}

function buildImplementationPlan(analysis) {
  return [
    '# Agent Foundry Implementation Plan',
    '',
    '## Phase 1: Productize the Bootstrap Loop',
    '',
    '- Harden the generated templates against more stacks and monorepo layouts.',
    '- Add per-stack prompt files under `.github/instructions/` for detected frontend, backend, and test areas.',
    '- Add a diff command so users can preview generated changes before writing them.',
    '',
    '## Phase 2: Make Handoffs Daily-Use',
    '',
    '- Add optional issue import and branch naming so a handoff starts from a real unit of work.',
    '- Add task snapshots from terminal output, test failures, and selected files.',
    '- Add a compact handoff copy mode for pasting into Codex, Claude Code, or Cline.',
    '',
    '## Phase 3: Grow Marketplace Distribution',
    '',
    '- Publish opinionated templates for common stacks such as Next.js, Python services, and full-stack monorepos.',
    '- Add usage telemetry only if users opt in, focused on template popularity and missing-stack feedback.',
    '- Build a public gallery of high-performing open-source playbooks to create a contribution loop around the extension.',
    '',
    '## Current Workspace Targets',
    '',
    `- Detected stack: ${analysis.techStack.join(', ')}`,
    `- Verification anchors: ${analysis.verificationCommands.join(', ') || 'none yet'}`,
    `- Readiness baseline: ${analysis.readinessScore}/100`,
    ''
  ].join('\n');
}

function buildGenerationPreviewMarkdown(analysis, generatedFiles, existingOutputs) {
  return [
    '# Agent Foundry Preview',
    '',
    `Agent Foundry is about to generate ${generatedFiles.length} file${generatedFiles.length === 1 ? '' : 's'} for \`${analysis.repoName}\`.`,
    '',
    `- Readiness score: \`${analysis.readinessScore}/100\``,
    `- Stack: ${analysis.techStack.join(', ')}`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'none detected'}`,
    '',
    '## Files To Be Written',
    '',
    ...generatedFiles.map((file) => `- \`${file.relativePath}\` (${countLines(file.content)} lines)`),
    '',
    '## Existing Files That Will Be Overwritten',
    '',
    ...(existingOutputs.length ? existingOutputs.map((file) => `- \`${file}\``) : ['- None']),
    '',
    '## Generated Highlights',
    '',
    '- Vendor-neutral repo contract in `AGENTS.md`',
    '- Copilot instructions plus scoped instruction and prompt files',
    '- Planner, implementer, and reviewer custom agent roles',
    '- Starter skills for bug triage and safe changes',
    '- Workspace analysis and implementation plan reports under `.agent-foundry`',
    '',
    'Use the modal confirmation after this preview to write the files or cancel safely.',
    ''
  ].join('\n');
}

function buildAgentsMd(analysis) {
  return [
    '# AGENTS.md',
    '',
    'This repository uses Agent Foundry to keep agent behavior portable across VS Code, GitHub Copilot, Codex, Claude, and other coding agents.',
    '',
    '## Repository Snapshot',
    '',
    `- Repository name: \`${analysis.repoName}\``,
    `- Primary stack: ${analysis.techStack.join(', ')}`,
    `- Package manager: \`${analysis.packageManager}\``,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'document these before accepting large agent changes'}`,
    '',
    '## Working Agreement',
    '',
    '- Prefer small, reviewable changes over broad rewrites.',
    '- Read nearby code before changing patterns or abstractions.',
    '- Treat failing diagnostics as part of the task scope unless the user explicitly says otherwise.',
    '- Update documentation when the public workflow or developer expectations change.',
    '- Preserve user changes that are unrelated to the task.',
    '',
    '## Repo-Specific Expectations',
    '',
    ...buildRepoSpecificExpectations(analysis).map((line) => `- ${line}`),
    '',
    '## Definition Of Done',
    '',
    '- The requested behavior is implemented with minimal surface area.',
    '- The most relevant verification commands have been run or explicitly called out as not run.',
    '- New or changed workflow files stay aligned across AGENTS.md, Copilot instructions, and custom agent roles.',
    '- The final handoff to the user is concise, factual, and references the real files changed.',
    ''
  ].join('\n');
}

function buildClaudeMd(analysis) {
  return [
    '# CLAUDE.md',
    '',
    'This file mirrors the workspace contract in `AGENTS.md` and exists so Claude-compatible tools pick up the same repository guidance.',
    '',
    '## Project Summary',
    '',
    `- Stack: ${analysis.techStack.join(', ')}`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'not yet documented'}`,
    `- Current readiness score: ${analysis.readinessScore}/100`,
    '',
    '## Expectations',
    '',
    '- Start by reading nearby code and existing workflow files before making changes.',
    '- Prefer straightforward implementations that keep ownership obvious.',
    '- Surface risks, missing tests, or missing verification clearly when handing work back.',
    '- Use planner, implementer, and reviewer roles when the task is large enough to benefit from separation.',
    ''
  ].join('\n');
}

function buildCopilotInstructions(analysis) {
  return [
    '# Copilot Instructions',
    '',
    'Use these instructions when working in this repository.',
    '',
    '## Project Context',
    '',
    `- Stack: ${analysis.techStack.join(', ')}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'not yet documented'}`,
    '',
    '## Behavior',
    '',
    '- Keep changes narrow and aligned with existing repo patterns.',
    '- Read relevant files before proposing structural changes.',
    '- When a task is ambiguous, produce a concrete implementation plan before editing.',
    '- Mention any commands you could not run or checks you could not verify.',
    '- Prefer vendor-neutral repository files and reusable skill documents over one-off chat instructions.',
    '',
    '## Recommended Agent Flow',
    '',
    '- Use the planner role for scoping, risk detection, and rollout steps.',
    '- Use the implementer role for concrete edits and command execution.',
    '- Use the reviewer role for bug finding, regression checks, and missing-test detection.',
    ''
  ].join('\n');
}

function buildInstructionFile(kind, analysis) {
  if (kind === 'nextjs') {
    return [
      '---',
      'applyTo: "{app,pages,src/app,src/pages}/**/*.{ts,tsx,js,jsx}"',
      '---',
      '',
      '# Next.js Instructions',
      '',
      analysis.projectFacts.hasAppDirectory
        ? '- Respect the App Router boundaries: keep server components server-first and use client components only where interactivity is required.'
        : '- Preserve the current routing structure and avoid mixing incompatible Next.js router patterns without a clear migration plan.',
      '- Keep data fetching and cache invalidation choices explicit.',
      '- Prefer framework-native APIs before adding extra abstraction layers.',
      '- Call out any change that affects rendering mode, caching, or server/client boundaries.',
      ''
    ].join('\n');
  }

  if (kind === 'python') {
    return [
      '---',
      'applyTo: "**/*.py"',
      '---',
      '',
      '# Python Instructions',
      '',
      '- Keep modules explicit and import paths straightforward.',
      '- Prefer small functions with obvious inputs and outputs over magic-heavy abstractions.',
      '- Keep dependency changes minimal and mention them clearly in the final handoff.',
      '- If the repository exposes tests or linting, use them as part of the verification path before closing the task.',
      ''
    ].join('\n');
  }

  if (kind === 'monorepo') {
    return [
      '---',
      'applyTo: "{apps,packages,services}/**/*"',
      '---',
      '',
      '# Monorepo Instructions',
      '',
      '- Keep the blast radius explicit: list which package or app owns the change.',
      '- Prefer package-local fixes before introducing repo-wide abstractions.',
      '- Name cross-package contracts when changing shared types, APIs, or build configuration.',
      '- Run the narrowest verification commands that still prove the affected workspace is healthy.',
      analysis.projectFacts.workspaceGlobs.length
        ? `- Workspace globs detected: ${analysis.projectFacts.workspaceGlobs.join(', ')}.`
        : '- Workspace manifests were detected; keep package boundaries obvious in the final handoff.',
      ''
    ].join('\n');
  }

  if (kind === 'frontend') {
    return [
      '---',
      'applyTo: "**/*.{tsx,jsx,css,scss}"',
      '---',
      '',
      '# Frontend Instructions',
      '',
      '- Keep UI changes narrow and consistent with nearby components.',
      '- Prefer accessible markup and readable state transitions.',
      '- Avoid introducing new styling systems or component abstractions without a task-level reason.',
      analysis.techStack.includes('React') || analysis.techStack.includes('Next.js')
        ? '- Use function components and keep data flow explicit.'
        : '- Preserve the current frontend framework patterns already used in the repository.',
      ''
    ].join('\n');
  }

  if (kind === 'backend') {
    return [
      '---',
      'applyTo: "**/*.{ts,js,py,go,rs}"',
      '---',
      '',
      '# Backend Instructions',
      '',
      '- Prefer small, testable units over broad service rewrites.',
      '- Keep logging, error handling, and validation behavior explicit.',
      '- Make side effects obvious at the call site.',
      '- If a new dependency is necessary, justify it in the final handoff.',
      ''
    ].join('\n');
  }

  return [
    '---',
    'applyTo: "**"',
    '---',
    '',
    '# Repository Instructions',
    '',
    '- Read `AGENTS.md` and `.github/copilot-instructions.md` before changing repository-wide patterns.',
    `- Default verification path: ${analysis.verificationCommands.join(', ') || 'document missing verification before merging large changes'}.`,
    analysis.projectFacts && analysis.projectFacts.isMonorepo
      ? '- This repository is structured as a monorepo; keep ownership and affected packages explicit.'
      : '- Keep ownership obvious when changes span multiple directories or layers.',
    '- Keep changes reviewable and mention skipped checks explicitly.',
    ''
  ].join('\n');
}

function buildPromptFile(kind, analysis) {
  if (kind === 'ship-change') {
    return [
      '---',
      'description: Implement a change with explicit verification and a concise final handoff',
      'agent: implementer',
      "tools: ['editFiles', 'search', 'runCommands']",
      '---',
      '',
      '# Ship Change',
      '',
      'Implement the requested change with the smallest safe diff.',
      '',
      'Requirements:',
      '',
      '- Start with a brief implementation plan.',
      `- Use these verification commands when relevant: ${analysis.verificationCommands.join(', ') || 'identify the right verification commands first'}.`,
      analysis.projectFacts && analysis.projectFacts.isMonorepo
        ? '- State which app, package, or service owns the change before editing.'
        : '- State the primary files or subsystem before editing.',
      '- Keep unrelated user changes intact.',
      '- End with a short summary, commands run, and residual risks.',
      ''
    ].join('\n');
  }

  return [
    '---',
    'description: Produce an implementation plan with affected files, risks, and verification steps',
    'agent: planner',
    "tools: ['search', 'read', 'runCommands']",
    '---',
    '',
    '# Plan Change',
    '',
    'Create a concrete implementation plan for the requested task.',
    '',
    'Include:',
    '',
    '- the problem statement',
    '- affected files and why they matter',
    analysis.projectFacts && analysis.projectFacts.isMonorepo
      ? '- affected apps, packages, or services and any shared contracts they depend on'
      : '- the main subsystem or feature area impacted by the task',
    '- the smallest viable implementation path',
    `- relevant verification commands: ${analysis.verificationCommands.join(', ') || 'identify them from the repo first'}`,
    '- rollout risks and open questions',
    ''
  ].join('\n');
}

function buildGithubAgent(role, analysis) {
  const definitions = {
    planner: {
      title: 'Planner',
      description: 'Turns vague requests into an executable engineering plan before code is changed.',
      body: [
        'You scope the task, map the affected files, identify risks, and hand off an implementation-ready plan.',
        'Default output:',
        '- a short problem statement',
        '- affected files and why they matter',
        '- the smallest viable implementation path',
        '- the verification and rollout steps',
        '- open questions or assumptions'
      ]
    },
    implementer: {
      title: 'Implementer',
      description: 'Executes the plan with narrow changes and explicit verification.',
      body: [
        'You make focused code changes, explain important tradeoffs, and keep the workspace aligned with repo instructions.',
        'Default output:',
        '- the files changed',
        '- the user-visible outcome',
        '- commands run and their purpose',
        '- blockers or skipped verification'
      ]
    },
    reviewer: {
      title: 'Reviewer',
      description: 'Reviews changed files for bugs, regressions, and missing tests before shipping.',
      body: [
        'You operate like a rigorous code reviewer. Findings come first, ordered by severity.',
        'Default output:',
        '- concrete bug or regression findings with file references',
        '- missing tests or unverified behavior',
        '- residual risks after the review',
        '- a brief summary only after findings'
      ]
    }
  };

  const definition = definitions[role];
  return [
    '---',
    `name: ${role}`,
    `description: ${definition.description}`,
    'tools: ["read", "write", "run", "search"]',
    '---',
    '',
    `# ${definition.title}`,
    '',
    ...definition.body,
    '',
    '## Repository Context',
    '',
    `- Stack: ${analysis.techStack.join(', ')}`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'not yet documented'}`,
    `- Readiness score: ${analysis.readinessScore}/100`,
    '',
    '## Shared Guardrails',
    '',
    '- Preserve unrelated user changes.',
    '- Prefer repository files over one-off chat state.',
    '- Name risks and assumptions explicitly.',
    ''
  ].join('\n');
}

function buildClaudeAgent(role, analysis) {
  const descriptions = {
    planner: 'Plan the smallest safe implementation and hand off a precise execution brief.',
    implementer: 'Implement the plan with narrow edits and explicit verification.',
    reviewer: 'Review the change for correctness, regression risk, and missing tests.'
  };

  return [
    '---',
    `name: ${role}`,
    `description: ${descriptions[role]}`,
    'tools: Read, Write, Bash',
    '---',
    '',
    `Use the ${role} role for work in this repository.`,
    '',
    `Stack: ${analysis.techStack.join(', ')}`,
    `Verification commands: ${analysis.verificationCommands.join(', ') || 'not yet documented'}`,
    '',
    '- Read existing repo instructions before changing code.',
    '- Keep changes narrow and explain skipped verification.',
    '- Hand work off cleanly when another role should take over.',
    ''
  ].join('\n');
}

function buildSkill(skillName, analysis) {
  if (skillName === 'bug-triage') {
    return [
      '---',
      'name: bug-triage',
      'description: Turn a vague bug report into a reproducer, likely causes, and a minimal fix plan.',
      'user-invocable: true',
      '---',
      '',
      '# Bug Triage',
      '',
      'When this skill is used:',
      '',
      '- Restate the bug as an observable symptom.',
      '- Identify the most likely files and commands needed to reproduce it.',
      '- Prefer the smallest possible failing test or reproduction.',
      '- Separate confirmed facts from hypotheses.',
      '- End with a fix plan that includes verification.',
      '',
      'Repository anchors:',
      '',
      `- Stack: ${analysis.techStack.join(', ')}`,
      `- Verification commands: ${analysis.verificationCommands.join(', ') || 'document these before depending on agent output'}`,
      ''
    ].join('\n');
  }

  return [
    '---',
    'name: change-safely',
    'description: Ship a change with explicit blast-radius control, verification, and review criteria.',
    'user-invocable: true',
    '---',
    '',
    '# Change Safely',
    '',
    'When this skill is used:',
    '',
    '- Start with the narrowest implementation path.',
    '- List the files that must change and the files that must not change.',
    '- Name the verification steps before editing.',
    '- Record any skipped commands or residual risks in the final handoff.',
    '- Hand off to a reviewer role for bug finding before merge when the change is non-trivial.',
    '',
    'Repository anchors:',
    '',
    `- Readiness score: ${analysis.readinessScore}/100`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'not yet documented'}`,
    ''
  ].join('\n');
}

function buildTaskHandoff(analysis, title, relevantFiles) {
  const maxDiagnostics = getConfiguration().get('maxDiagnosticsInHandoff', 12);
  const includeGitStatus = getConfiguration().get('includeGitStatusInHandoff', true);
  const diagnostics = analysis.diagnostics.topItems.slice(0, maxDiagnostics);
  const gitSection = includeGitStatus
    ? ['## Git Status', '', ...(analysis.git.changedFiles.length ? analysis.git.changedFiles.map((entry) => `- ${entry.status} ${entry.file}`) : ['- No changed files detected.']), '']
    : [];

  return [
    '# Task Handoff',
    '',
    `- Title: ${title}`,
    `- Repository: ${analysis.repoName}`,
    `- Generated: ${new Date().toISOString()}`,
    `- Stack: ${analysis.techStack.join(', ')}`,
    '',
    '## Current State',
    '',
    `- Readiness score: ${analysis.readinessScore}/100`,
    `- Verification commands: ${analysis.verificationCommands.join(', ') || 'none documented yet'}`,
    `- Diagnostics: ${analysis.diagnostics.errors} errors, ${analysis.diagnostics.warnings} warnings`,
    '',
    '## Relevant Files',
    '',
    ...(relevantFiles.length ? relevantFiles.map((file) => `- ${file}`) : ['- No open editor files captured.']),
    '',
    ...gitSection,
    '## Diagnostics Snapshot',
    '',
    ...(diagnostics.length
      ? diagnostics.map((item) => `- ${item.severity.toUpperCase()} ${item.file}:${item.line} ${item.message}`)
      : ['- No diagnostics captured.']),
    '',
    '## Recommended Agent Flow',
    '',
    '- Planner: confirm scope, affected files, and verification path.',
    '- Implementer: make the smallest viable change and keep a command log.',
    '- Reviewer: look for regressions, missing tests, and policy drift.',
    '',
    '## Paste-Ready Brief',
    '',
    'Use this brief to continue the work in another agent session:',
    '',
    '```text',
    `You are continuing the task "${title}" in the repository "${analysis.repoName}".`,
    `The stack is ${analysis.techStack.join(', ')}.`,
    `Use these verification commands when relevant: ${analysis.verificationCommands.join(', ') || 'none documented yet'}.`,
    relevantFiles.length ? `Start with these files: ${relevantFiles.join(', ')}.` : 'Start by identifying the relevant files from the current repo state.',
    includeGitStatus && analysis.git.changedFiles.length
      ? `There are already changed files: ${analysis.git.changedFiles.map((entry) => `${entry.status} ${entry.file}`).join(', ')}.`
      : 'There are no changed files or git status was not included.',
    diagnostics.length
      ? `Current diagnostics include: ${diagnostics
          .slice(0, 5)
          .map((item) => `${item.severity} in ${item.file}:${item.line} (${item.message})`)
          .join('; ')}.`
      : 'No diagnostics were captured.',
    'Produce a short plan first, then implement the smallest safe change, and call out any skipped verification.',
    '```',
    ''
  ]
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === '' && lines[index - 2] === ''))
    .join('\n');
}

function buildRepoSpecificExpectations(analysis) {
  const items = [];

  if (analysis.techStack.includes('TypeScript')) {
    items.push('Preserve or improve type safety when changing interfaces and data flow.');
  }
  if (analysis.techStack.includes('Next.js')) {
    items.push('Protect rendering boundaries, routing behavior, and cache semantics when changing Next.js code.');
  }
  if (analysis.techStack.includes('React') || analysis.techStack.includes('Next.js')) {
    items.push('Keep component changes localized and avoid broad UI rewrites unless the task requires them.');
  }
  if (analysis.techStack.includes('Python')) {
    items.push('Prefer straightforward modules and keep runtime dependencies explicit.');
  }
  if (analysis.projectFacts && analysis.projectFacts.isMonorepo) {
    items.push('Name the affected app, package, or service and avoid unnecessary cross-workspace churn.');
  }
  if (analysis.verificationCommands.length) {
    items.push(`Use ${analysis.verificationCommands.join(', ')} as the default verification spine.`);
  } else {
    items.push('Document missing verification commands before trusting a large automated change.');
  }
  if (analysis.git.isRepository) {
    items.push('Use the current git diff to keep handoffs and reviews grounded in real work-in-progress.');
  }

  if (!items.length) {
    items.push('Prefer the smallest possible change and document the verification path clearly.');
  }

  return items;
}

function collectCurrentEditorFiles(rootPath) {
  const files = [];
  for (const editor of vscode.window.visibleTextEditors) {
    const fsPath = editor.document && editor.document.uri ? editor.document.uri.fsPath : '';
    if (fsPath && fsPath.startsWith(rootPath)) {
      const relative = path.relative(rootPath, fsPath);
      if (!files.includes(relative)) {
        files.push(relative);
      }
    }
  }
  return files;
}

function detectPotentialOverwriteTargets(rootPath, candidates) {
  const targetCandidates =
    candidates ||
    [
    'AGENTS.md',
    'CLAUDE.md',
    '.github/copilot-instructions.md',
    '.github/instructions/repository.instructions.md',
    '.github/instructions/frontend.instructions.md',
    '.github/instructions/backend.instructions.md',
    '.github/prompts/plan-change.prompt.md',
    '.github/prompts/ship-change.prompt.md',
    '.github/agents/planner.agent.md',
    '.github/agents/implementer.agent.md',
    '.github/agents/reviewer.agent.md',
    '.github/skills/bug-triage/SKILL.md',
    '.github/skills/change-safely/SKILL.md',
    `${getOutputFolderName()}/workspace-analysis.md`,
    `${getOutputFolderName()}/workspace-analysis.json`,
    `${getOutputFolderName()}/implementation-plan.md`
    ];

  return targetCandidates.filter((relativePath) => fs.existsSync(path.join(rootPath, relativePath)));
}

async function writeTextFile(filePath, content) {
  const directoryPath = path.dirname(filePath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), encoder.encode(content));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function execFileSafe(command, args, cwd) {
  return new Promise((resolve) => {
    cp.execFile(command, args, { cwd, timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          stdout: '',
          stderr: stderr || error.message
        });
        return;
      }

      resolve({
        ok: true,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function countLines(value) {
  if (!value) {
    return 0;
  }
  return value.split(/\r?\n/).length;
}

function formatDateStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPrimaryWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders[0] || null;
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('agentFoundry');
}

function getOutputFolderName() {
  return getConfiguration().get('outputFolder', '.agent-foundry');
}

function refreshWorkspaceContext() {
  const hasWorkspace = Boolean(getPrimaryWorkspaceFolder());
  void vscode.commands.executeCommand('setContext', 'agentFoundry.hasWorkspace', hasWorkspace);
}

module.exports = {
  activate,
  deactivate,
  __testUtils: {
    detectVerificationCommands,
    getScriptRunner,
    formatScriptCommand,
    detectPackageManager,
    detectProjectFacts,
    detectTechStack,
    slugify,
    formatDateStamp,
    computeReadinessScore
  }
};
