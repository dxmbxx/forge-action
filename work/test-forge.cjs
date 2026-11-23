'use strict';

// Reproduce the pinned dockerless Forge shell scripts with stubs instead of
// Claude, the Forge API and git push. Every scenario has an explicit expected
// result; a mismatch makes the run exit non-zero, but the diagnostic report is
// always written to outputs/test-results.json.

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {
  createFixtureRoot,
  finalizeRun,
  formatSummary,
  removeFixtureRoot,
} = require('./lib/forge-smoke.cjs');

const root = path.resolve(__dirname, '..');
const src = path.join(__dirname, 'forge-action/.github/actions/dockerless/scripts');
const outputDir = path.join(root, 'outputs');
const outputPath = path.join(outputDir, 'test-results.json');
const bash =
  process.env.BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
const RUN_TIMEOUT_MS = 15000;
const PINNED_COMMIT = 'b85c96d5f597a28e9dc7528b818c5c79e6575ad5';

const posix = filePath =>
  filePath.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());

const REQUIRED_STEPS = [
  'validate-github-token',
  'setup-branch',
  'initialize-workflow-tracking',
  'fetch-context',
  'setup-claude',
  'setup-claude-plugins',
  'prepare-claude-conversation',
  'run-claude-with-context',
  'process-claude-response',
  'commit-and-push',
  'update-context',
];
const OPTIONAL_STEPS = ['upload-handoff-file', 'job-completion-summary'];
// Exact invocation order of the pinned orchestrate-workflow.sh: the optional
// handoff upload happens between commit-and-push and update-context.
const FULL_CALL_SEQUENCE = [
  ...REQUIRED_STEPS.slice(0, 10),
  'upload-handoff-file',
  'update-context',
  'job-completion-summary',
];
const WORKFLOW_ARGS = [
  'test-job',
  '1',
  'https://example.invalid',
  'test-branch',
  'test/repo',
  '1',
  'https://example.invalid/run',
  'dummy-not-a-secret',
];

const results = [];
let fixtureRoot = null;

function readIfExists(directory, name) {
  const file = path.join(directory, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

// Stubs must be executable: on Linux a non-executable file invoked directly
// fails with EACCES, which the pinned orchestrator would then mask.
function writeStubs(directory, failingStep) {
  const names = [...REQUIRED_STEPS, ...OPTIONAL_STEPS, 'report-workflow-failure'];
  for (const name of names) {
    const file = path.join(directory, 'scripts', `${name}.sh`);
    const exitCode = name === failingStep ? 42 : 0;
    fs.writeFileSync(file, `#!/bin/bash\necho ${name} >> "$TRACE"\nexit ${exitCode}\n`, {
      mode: 0o755,
    });
    fs.chmodSync(file, 0o755);
  }
}

function runScenario({id, file, args = [], environment = {}, setup, expectation}) {
  const directory = path.join(fixtureRoot, id);
  fs.mkdirSync(path.join(directory, 'scripts'), {recursive: true});
  const env = {
    ...process.env,
    SIMPLE_FORGE_WORK_DIR: posix(directory),
    GITHUB_ENV: posix(path.join(directory, 'env')),
    GITHUB_OUTPUT: posix(path.join(directory, 'output')),
    TRACE: posix(path.join(directory, 'trace')),
    ...environment,
  };
  if (setup) {
    setup(directory, env);
  }

  const started = performance.now();
  const processResult = spawnSync(bash, [posix(path.join(src, file)), ...args], {
    env,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    cwd: root,
  });
  const timedOut = Boolean(processResult.error && processResult.error.code === 'ETIMEDOUT');

  results.push({
    id,
    duration_ms: Math.round(performance.now() - started),
    exit_code: processResult.status,
    signal: processResult.signal || null,
    timed_out: timedOut,
    error: processResult.error ? processResult.error.message : null,
    stdout: processResult.stdout ?? '',
    stderr: processResult.stderr ?? '',
    output: readIfExists(directory, 'output'),
    environment: readIfExists(directory, 'env'),
    trace: readIfExists(directory, 'trace'),
    expectation,
  });
}

function syntaxCheck(file) {
  const started = performance.now();
  const processResult = spawnSync(bash, ['-n', posix(path.join(src, file))], {encoding: 'utf8'});
  const timedOut = Boolean(processResult.error && processResult.error.code === 'ETIMEDOUT');
  results.push({
    id: `syntax-${file}`,
    duration_ms: Math.round(performance.now() - started),
    exit_code: processResult.status,
    signal: processResult.signal || null,
    timed_out: timedOut,
    error: processResult.error ? processResult.error.message : null,
    stdout: processResult.stdout ?? '',
    stderr: processResult.stderr ?? '',
    expectation: {
      outcome: 'expected',
      description: `bash -n accepts the pinned ${file}`,
      exit_code: 0,
      stdout_equals: '',
      stderr_equals: '',
    },
  });
}

function knownLimitation(limitation) {
  return {outcome: 'known_limitation', limitation};
}

function runScenarios() {
  runScenario({
    id: 'platform-native',
    file: 'detect-platform.sh',
    expectation: {
      outcome: 'expected',
      description: 'detect-platform.sh reports the platform and exports PLATFORM_* plus DOCKER_AVAILABLE',
      exit_code: 0,
      stdout_includes: ['Platform detected:'],
      environment_keys: ['PLATFORM_OS', 'PLATFORM_TYPE', 'PACKAGE_MANAGER', 'DOCKER_AVAILABLE'],
      trace_equals: [],
      output_equals: '',
      stderr_equals: '',
    },
  });

  runScenario({
    id: 'acquire-without-docker',
    file: 'acquire-scripts.sh',
    args: ['pinned-test'],
    environment: {DOCKER_AVAILABLE: 'false'},
    expectation: {
      outcome: 'expected',
      description: 'acquire-scripts.sh refuses to proceed without Docker',
      exit_code: 1,
      stdout_includes: ['Docker is required for script acquisition'],
      trace_equals: [],
      output_equals: '',
      stderr_equals: '',
    },
  });

  runScenario({
    id: 'orchestrate-missing-scripts',
    file: 'orchestrate-workflow.sh',
    args: WORKFLOW_ARGS,
    expectation: {
      ...knownLimitation(
        'Upstream dockerless defect: a missing required step is reported as exit code 0 and no ' +
          'status is written, because handle_error receives the exit code of the negated if condition.'
      ),
      description: 'orchestrate-workflow.sh without working scripts reproduces the masked failure',
      exit_code: 0,
      stdout_includes: ['Error in step: validate-github-token (exit code: 0)'],
      stdout_excludes: ['Workflow completed successfully'],
      output_equals: '',
      trace_equals: [],
      stderr_includes: ['validate-github-token.sh'],
    },
  });

  runScenario({
    id: 'orchestrate-success-stubs',
    file: 'orchestrate-workflow.sh',
    args: WORKFLOW_ARGS,
    setup: directory => writeStubs(directory, null),
    expectation: {
      outcome: 'expected',
      description: 'all required and optional steps succeed, so the orchestrator reports success',
      exit_code: 0,
      trace_equals: FULL_CALL_SEQUENCE,
      stdout_includes: ['Workflow completed successfully'],
      stdout_excludes: ['Error in step:'],
      output_includes: ['status=success', 'workflow_url=https://example.invalid/run'],
      stderr_equals: '',
    },
  });

  for (const step of REQUIRED_STEPS) {
    const prefix = FULL_CALL_SEQUENCE.slice(0, FULL_CALL_SEQUENCE.indexOf(step) + 1);
    runScenario({
      id: `failure-${step}`,
      file: 'orchestrate-workflow.sh',
      args: WORKFLOW_ARGS,
      setup: directory => writeStubs(directory, step),
      expectation: {
        ...knownLimitation(
          `Upstream dockerless defect: exit code 42 in required step ${step} is masked as ` +
            'exit code 0 and status output is not written.'
        ),
        description: `a failing required step ${step} reproduces the masked failure`,
        exit_code: 0,
        trace_equals: [...prefix, 'report-workflow-failure'],
        stdout_includes: [`Error in step: ${step} (exit code: 0)`],
        stdout_excludes: ['Workflow completed successfully'],
        output_equals: '',
        stderr_equals: '',
      },
    });
  }

  runScenario({
    id: 'optional-failure-upload-handoff-file',
    file: 'orchestrate-workflow.sh',
    args: WORKFLOW_ARGS,
    setup: directory => writeStubs(directory, 'upload-handoff-file'),
    expectation: {
      outcome: 'expected',
      description: 'a failing optional handoff upload warns and does not stop the workflow',
      exit_code: 0,
      trace_equals: FULL_CALL_SEQUENCE,
      stdout_includes: ['Warning: Failed to upload handoff file', 'Workflow completed successfully'],
      output_includes: ['status=success'],
      stderr_equals: '',
    },
  });

  runScenario({
    id: 'optional-failure-job-completion-summary',
    file: 'orchestrate-workflow.sh',
    args: WORKFLOW_ARGS,
    setup: directory => writeStubs(directory, 'job-completion-summary'),
    expectation: {
      outcome: 'expected',
      description: 'a failing optional completion summary warns and does not stop the workflow',
      exit_code: 0,
      trace_equals: FULL_CALL_SEQUENCE,
      stdout_includes: ['Warning: Failed to generate completion summary', 'Workflow completed successfully'],
      output_includes: ['status=success'],
      stderr_equals: '',
    },
  });

  const syntaxFiles = fs
    .readdirSync(src)
    .filter(name => name.endsWith('.sh'))
    .sort();
  if (syntaxFiles.length === 0) {
    throw new Error(`No shell scripts found in ${src}; check out the pinned forge-action commit first`);
  }
  for (const file of syntaxFiles) {
    syntaxCheck(file);
  }
}

function main() {
  const startedAt = new Date().toISOString();
  let cleaned = false;
  try {
    fixtureRoot = createFixtureRoot();
    runScenarios();
  } catch (error) {
    results.push({
      id: 'runner-error',
      duration_ms: 0,
      exit_code: null,
      signal: null,
      timed_out: false,
      error: String((error && error.stack) || error),
      stdout: '',
      stderr: '',
      output: '',
      environment: '',
      trace: '',
      expectation: {
        outcome: 'expected',
        description: 'the smoke runner completes every scenario',
        exit_code: 0,
      },
    });
  } finally {
    if (fixtureRoot) {
      try {
        cleaned = removeFixtureRoot(fixtureRoot);
      } catch (error) {
        console.error(`Failed to remove the isolated fixture directory: ${error.message}`);
      }
    }
  }

  const exitCode = finalizeRun({
    results,
    outputPath,
    startedAt,
    scope:
      'Local original shell scripts; external workflow steps stubbed. No AI or GitHub write calls. ' +
      `Pinned simple-container-com/forge-action ${PINNED_COMMIT}.`,
    fixtures: {
      isolation: 'a fresh per-run temporary directory',
      cleaned,
    },
    log: report => {
      console.log(formatSummary(report));
      console.log(
        JSON.stringify(
          report.results.map(({id, duration_ms, exit_code, verdict}) => ({
            id,
            duration_ms,
            exit_code,
            verdict,
          })),
          null,
          2
        )
      );
    },
  });
  process.exitCode = exitCode;
}

if (require.main === module) {
  main();
}

module.exports = {main};
