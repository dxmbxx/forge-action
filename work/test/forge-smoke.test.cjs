'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const {
  assessResult,
  buildReport,
  createFixtureRoot,
  finalizeRun,
  removeFixtureRoot,
  summarize,
} = require('../lib/forge-smoke.cjs');

function observation(overrides = {}) {
  return {
    id: 'scenario',
    duration_ms: 1,
    exit_code: 0,
    signal: null,
    timed_out: false,
    error: null,
    stdout: '',
    stderr: '',
    output: '',
    environment: '',
    trace: '',
    ...overrides,
  };
}

function expectation(overrides = {}) {
  return {outcome: 'expected', description: 'test expectation', exit_code: 0, ...overrides};
}

function temporaryOutputPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-smoke-test-'));
  return {directory, outputPath: path.join(directory, 'test-results.json')};
}

test('expected successful scenario passes and the report records it', () => {
  const result = observation({
    stdout: 'Workflow completed successfully',
    output: 'status=success\nworkflow_url=https://example.invalid/run\n',
    environment: 'PLATFORM_OS=linux\n',
    trace: 'validate-github-token\nsetup-branch\n',
    expectation: expectation({
      trace_equals: ['validate-github-token', 'setup-branch'],
      stdout_includes: ['Workflow completed successfully'],
      output_includes: ['status=success'],
      environment_keys: ['PLATFORM_OS'],
    }),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'pass');
  assert.deepEqual(assessed.failures, []);
  assert.equal(summarize([result]).summary.verdict, 'pass');

  const {directory, outputPath} = temporaryOutputPath();
  const exitCode = finalizeRun({
    results: [result],
    outputPath,
    scope: 'unit test',
    startedAt: '2026-01-01T00:00:00.000Z',
    log: () => {},
  });
  assert.equal(exitCode, 0);
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.summary.verdict, 'pass');
  assert.equal(report.summary.exit_code, 0);
  assert.equal(report.summary.total, 1);
  assert.equal(report.results[0].verdict, 'pass');
  fs.rmSync(directory, {recursive: true, force: true});
});

test('an unexpected crash fails the run, returns exit code 1 and still saves the report', () => {
  const result = observation({
    id: 'unexpected-crash',
    exit_code: 1,
    stderr: 'bash: something broke',
    expectation: expectation(),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'fail');
  assert.match(assessed.failures.join('\n'), /exit code: expected 0, got 1/);

  const {directory, outputPath} = temporaryOutputPath();
  const exitCode = finalizeRun({
    results: [result],
    outputPath,
    scope: 'unit test',
    log: () => {},
  });
  assert.equal(exitCode, 1);
  assert.ok(fs.existsSync(outputPath), 'report must be written before exiting');
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.summary.verdict, 'fail');
  assert.equal(report.summary.failed, 1);
  assert.deepEqual(report.summary.failed_ids, ['unexpected-crash']);
  assert.equal(report.results[0].stderr, 'bash: something broke');
  fs.rmSync(directory, {recursive: true, force: true});
});

test('an expected negative scenario passes despite its non-zero exit code', () => {
  const result = observation({
    id: 'expected-refusal',
    exit_code: 1,
    stdout: '❌ Error: Docker is required for script acquisition',
    expectation: expectation({
      exit_code: 1,
      stdout_includes: ['Docker is required for script acquisition'],
    }),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'pass');
  assert.deepEqual(assessed.failures, []);

  const {directory, outputPath} = temporaryOutputPath();
  assert.equal(finalizeRun({results: [result], outputPath, log: () => {}}), 0);
  fs.rmSync(directory, {recursive: true, force: true});
});

test('a timeout or launch error always fails, even with a non-zero expected code', () => {
  const timeout = observation({
    id: 'timed-out',
    exit_code: null,
    signal: 'SIGTERM',
    timed_out: true,
    error: 'spawnSync /bin/bash ETIMEDOUT',
    expectation: expectation({exit_code: 1}),
  });
  const launchError = observation({
    id: 'not-launched',
    exit_code: null,
    error: 'spawnSync /bin/bash ENOENT',
    expectation: expectation({exit_code: 0}),
  });

  for (const result of [timeout, launchError]) {
    const assessed = assessResult(result);
    assert.equal(assessed.verdict, 'fail');
    assert.match(assessed.failures.join('\n'), /timeout|launch error/);
  }
  assert.match(assessResult(timeout).failures[0], /timeout/);
  assert.match(assessResult(launchError).failures[0], /launch error/);
});

test('a failing bash -n check fails the run', () => {
  const result = observation({
    id: 'syntax-broken.sh',
    exit_code: 1,
    stderr: "broken.sh: line 3: syntax error: unexpected end of file",
    expectation: expectation({stdout_equals: '', stderr_equals: ''}),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'fail');
  assert.match(assessed.failures.join('\n'), /exit code: expected 0, got 1/);
  assert.match(assessed.failures.join('\n'), /stderr: expected ""/);
});

test('a mismatched call sequence fails even when the exit code is as expected', () => {
  const result = observation({
    trace: 'validate-github-token\nsetup-branch\ncommit-and-push\n',
    expectation: expectation({trace_equals: ['validate-github-token', 'setup-branch']}),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'fail');
  assert.match(assessed.failures.join('\n'), /call sequence/);
});

test('a documented upstream limitation is reported but does not fail the run', () => {
  const result = observation({
    id: 'known-upstream-defect',
    stdout: '❌ Error in step: validate-github-token (exit code: 0)',
    expectation: expectation({
      outcome: 'known_limitation',
      limitation: 'pinned version masks the failure',
      stdout_includes: ['Error in step: validate-github-token (exit code: 0)'],
    }),
  });

  const assessed = assessResult(result);
  assert.equal(assessed.verdict, 'known_limitation');
  const summary = summarize([result]).summary;
  assert.equal(summary.verdict, 'pass');
  assert.equal(summary.known_limitations, 1);
  assert.equal(summary.failed, 0);
});

test('negative control: the real runner process exits non-zero and keeps the failing report', () => {
  const {directory, outputPath} = temporaryOutputPath();
  const fixture = path.join(__dirname, 'fixtures', 'negative-control.cjs');
  const child = spawnSync(process.execPath, [fixture, outputPath], {encoding: 'utf8'});

  assert.equal(child.status, 1, `negative control must exit 1, stderr: ${child.stderr}`);
  assert.ok(fs.existsSync(outputPath), 'negative control must still write the report');
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.summary.verdict, 'fail');
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.exit_code, 1);
  assert.deepEqual(report.summary.failed_ids, ['negative-control']);
  fs.rmSync(directory, {recursive: true, force: true});
});

test('reports include verdicts and expectations next to the diagnostic fields', () => {
  const result = observation({
    expectation: expectation({description: 'diagnostics are preserved', trace_equals: []}),
  });
  const report = buildReport({
    results: [result],
    scope: 'unit test',
    startedAt: '2026-01-01T00:00:00.000Z',
    fixtures: {isolation: 'temporary directory'},
  });

  assert.equal(report.scope, 'unit test');
  assert.ok(report.timestamp);
  assert.ok(report.node);
  assert.equal(report.results[0].expectation.description, 'diagnostics are preserved');
  assert.equal(report.results[0].verdict, 'pass');
  assert.deepEqual(report.results[0].failures, []);
  assert.ok(Object.hasOwn(report.results[0], 'stdout'));
  assert.ok(Object.hasOwn(report.results[0], 'stderr'));
  assert.ok(Object.hasOwn(report.results[0], 'output'));
  assert.ok(Object.hasOwn(report.results[0], 'environment'));
  assert.ok(Object.hasOwn(report.results[0], 'trace'));
});

test('each run gets a fresh isolated fixture directory that only it removes', () => {
  const first = createFixtureRoot();
  const second = createFixtureRoot();
  try {
    assert.notEqual(first, second);
    assert.ok(fs.statSync(first).isDirectory());
    assert.deepEqual(fs.readdirSync(first), [], 'a fresh fixture root must be empty');
    fs.writeFileSync(path.join(first, 'trace'), 'stale data from a previous run');

    assert.equal(removeFixtureRoot(first), true);
    assert.equal(fs.existsSync(first), false);
    assert.ok(fs.existsSync(second), 'cleanup must not touch another run');
    assert.throws(() => removeFixtureRoot(path.join(second, 'nested')), /Refusing to remove/);
  } finally {
    removeFixtureRoot(second);
  }
});
