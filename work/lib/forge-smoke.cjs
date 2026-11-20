'use strict';

// Assessment logic for the Forge smoke checks.
//
// Each observed scenario carries an explicit expectation. The expectation owns
// the pinned-version behaviour: the expected exit code, the reported output and
// environment, and the exact sequence of shell steps that must be invoked.
// A scenario whose expectation is documented upstream behaviour is marked as a
// known limitation; it must not fail the smoke run, but it is also not claimed
// to be fixed.

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE_PREFIX = 'forge-smoke-fixtures-';

// A directory owned by this process, used to isolate every run's fixtures.
// mkdtemp guarantees a fresh, empty directory that cannot collide with a
// previous run or with another process.
function createFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
}

// Remove only the directory created by createFixtureRoot(). Anything else is
// refused instead of deleted.
function removeFixtureRoot(directory) {
  if (!directory) {
    return false;
  }
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  const insideTemp = resolved.startsWith(tempRoot + path.sep);
  const ownsName = path.basename(resolved).startsWith(FIXTURE_PREFIX);
  if (!insideTemp || !ownsName) {
    throw new Error(`Refusing to remove a directory this run does not own: ${directory}`);
  }
  fs.rmSync(resolved, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
  return true;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function lines(value) {
  return text(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function environmentMap(value) {
  const map = {};
  for (const line of lines(value)) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      map[line.slice(0, separator).trim()] = line.slice(separator + 1);
    }
  }
  return map;
}

// Assess one observed result against its expectation. Launch errors and
// timeouts always fail: no expectation can excuse a scenario that never ran.
function assessResult(result) {
  const expectation = result.expectation;
  const failures = [];

  if (!expectation) {
    return {...result, verdict: 'fail', failures: ['missing expectation']};
  }

  if (result.error || result.signal || result.exit_code === null || result.exit_code === undefined) {
    const reason = result.timed_out ? 'timeout' : 'launch error';
    const detail = result.error ? `: ${result.error}` : '';
    const signal = result.signal ? ` (signal ${result.signal})` : '';
    failures.push(`${reason}${detail}${signal}`);
    return {...result, verdict: 'fail', failures};
  }

  if (result.exit_code !== expectation.exit_code) {
    failures.push(`exit code: expected ${expectation.exit_code}, got ${result.exit_code}`);
  }

  const stdout = text(result.stdout);
  for (const needle of expectation.stdout_includes || []) {
    if (!stdout.includes(needle)) {
      failures.push(`stdout is missing ${JSON.stringify(needle)}`);
    }
  }
  for (const needle of expectation.stdout_excludes || []) {
    if (stdout.includes(needle)) {
      failures.push(`stdout must not contain ${JSON.stringify(needle)}`);
    }
  }
  if (expectation.stdout_equals !== undefined && stdout !== expectation.stdout_equals) {
    failures.push(`stdout: expected ${JSON.stringify(expectation.stdout_equals)}, got ${JSON.stringify(stdout)}`);
  }

  const stderr = text(result.stderr);
  if (expectation.stderr_equals !== undefined && stderr !== expectation.stderr_equals) {
    failures.push(`stderr: expected ${JSON.stringify(expectation.stderr_equals)}, got ${JSON.stringify(stderr)}`);
  }
  if (expectation.stderr_includes) {
    for (const needle of expectation.stderr_includes) {
      if (!stderr.includes(needle)) {
        failures.push(`stderr is missing ${JSON.stringify(needle)}`);
      }
    }
  }

  const output = text(result.output);
  for (const needle of expectation.output_includes || []) {
    if (!output.includes(needle)) {
      failures.push(`GITHUB_OUTPUT is missing ${JSON.stringify(needle)}`);
    }
  }
  if (expectation.output_equals !== undefined && output !== expectation.output_equals) {
    failures.push(`GITHUB_OUTPUT: expected ${JSON.stringify(expectation.output_equals)}, got ${JSON.stringify(output)}`);
  }

  if (expectation.trace_equals) {
    const actual = lines(result.trace);
    if (JSON.stringify(actual) !== JSON.stringify(expectation.trace_equals)) {
      failures.push(
        `call sequence: expected ${JSON.stringify(expectation.trace_equals)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  if (expectation.environment_keys) {
    const environment = environmentMap(result.environment);
    for (const key of expectation.environment_keys) {
      if (!environment[key]) {
        failures.push(`GITHUB_ENV is missing a non-empty ${key}`);
      }
    }
  }

  let verdict = 'pass';
  if (failures.length > 0) {
    verdict = 'fail';
  } else if (expectation.outcome === 'known_limitation') {
    verdict = 'known_limitation';
  }

  return {...result, verdict, failures};
}

function summarize(results) {
  const assessed = results.map(assessResult);
  const failed = assessed.filter(result => result.verdict === 'fail');
  const known = assessed.filter(result => result.verdict === 'known_limitation');
  const passed = assessed.filter(result => result.verdict === 'pass');

  return {
    assessed,
    summary: {
      total: assessed.length,
      passed: passed.length,
      known_limitations: known.length,
      failed: failed.length,
      verdict: failed.length > 0 ? 'fail' : 'pass',
      exit_code: failed.length > 0 ? 1 : 0,
      failed_ids: failed.map(result => result.id),
      known_limitation_ids: known.map(result => result.id),
    },
  };
}

function buildReport({results, scope, startedAt, fixtures}) {
  const {assessed, summary} = summarize(results);
  return {
    timestamp: startedAt || new Date().toISOString(),
    scope,
    node: process.version,
    fixtures,
    summary,
    results: assessed,
  };
}

function writeReport(report, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
}

function formatSummary(report) {
  const summary = report.summary;
  const output = [
    `Forge smoke verdict: ${summary.verdict.toUpperCase()} ` +
      `(${summary.total} scenarios: ${summary.passed} passed, ` +
      `${summary.known_limitations} known limitations, ${summary.failed} failed)`,
  ];
  for (const result of report.results) {
    if (result.verdict === 'fail') {
      output.push(`  FAIL ${result.id}: ${result.failures.join('; ')}`);
    }
  }
  for (const result of report.results) {
    if (result.verdict === 'known_limitation') {
      output.push(`  KNOWN LIMITATION ${result.id}: ${result.expectation.limitation}`);
    }
  }
  return output.join('\n');
}

// Assess the collected results, always persist the report, and return the
// process exit code: 0 only when no expectation mismatched. The report is
// written before the caller exits, including on a failing verdict.
function finalizeRun({
  results,
  outputPath,
  scope,
  fixtures,
  startedAt,
  log = report => console.log(formatSummary(report)),
}) {
  const report = buildReport({results, scope, startedAt, fixtures});
  writeReport(report, outputPath);
  log(report);
  return report.summary.exit_code;
}

module.exports = {
  FIXTURE_PREFIX,
  assessResult,
  buildReport,
  createFixtureRoot,
  finalizeRun,
  formatSummary,
  removeFixtureRoot,
  summarize,
  writeReport,
};
