'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration() {
          return {
            get(_key, fallback) {
              return fallback;
            }
          };
        },
        workspaceFolders: []
      },
      window: {},
      commands: {},
      languages: {
        getDiagnostics() {
          return [];
        }
      },
      DiagnosticSeverity: {
        Error: 0,
        Warning: 1
      }
    };
  }
  return originalLoad(request, parent, isMain);
};

const { __testUtils } = require('../extension.js');
Module._load = originalLoad;

test('detectVerificationCommands uses npm syntax by default', () => {
  const commands = __testUtils.detectVerificationCommands(
    {
      lint: 'eslint .',
      test: 'vitest',
      build: 'vite build'
    },
    'npm'
  );

  assert.deepEqual(commands, ['npm run lint', 'npm run test', 'npm run build']);
});

test('detectVerificationCommands uses package-manager specific syntax', () => {
  assert.deepEqual(
    __testUtils.detectVerificationCommands({ lint: 'eslint .', 'test:e2e': 'playwright test' }, 'pnpm'),
    ['pnpm lint', 'pnpm test:e2e']
  );

  assert.deepEqual(
    __testUtils.detectVerificationCommands({ typecheck: 'tsc --noEmit' }, 'yarn'),
    ['yarn typecheck']
  );

  assert.deepEqual(
    __testUtils.detectVerificationCommands({ test: 'bun test' }, 'bun'),
    ['bun run test']
  );
});

test('detectPackageManager respects lockfile priority', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-foundry-test-'));

  try {
    fs.writeFileSync(path.join(tempRoot, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(tempRoot, 'package-lock.json'), '');
    assert.equal(__testUtils.detectPackageManager(tempRoot), 'pnpm');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('slugify creates stable handoff-friendly slugs', () => {
  assert.equal(__testUtils.slugify('Tighten test coverage around auth middleware'), 'tighten-test-coverage-around-auth-middleware');
  assert.equal(__testUtils.slugify('  Weird__Spacing!!  '), 'weird-spacing');
});

test('computeReadinessScore rewards existing assets and clean diagnostics', () => {
  const score = __testUtils.computeReadinessScore(
    {
      agents: true,
      copilotInstructions: true,
      claude: true,
      githubAgentsCount: 3,
      githubSkillsCount: 2
    },
    ['npm run test', 'npm run lint'],
    {
      errors: 0,
      warnings: 0
    },
    {
      changedFiles: [{ status: 'M', file: 'README.md' }]
    }
  );

  assert.equal(score, 100);
});
