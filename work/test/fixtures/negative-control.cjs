'use strict';

// Negative control for the smoke assessment pipeline. It feeds the real
// reporting/exit-code path a synthetic regression and exits with the verdict
// code, proving that a mismatch becomes a real non-zero process exit without
// losing the report. It never runs Forge, AI, API or git operations.

const {finalizeRun} = require('../../lib/forge-smoke.cjs');

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('usage: node negative-control.cjs <report-path>');
  process.exit(2);
}

const result = {
  id: 'negative-control',
  duration_ms: 1,
  exit_code: 1,
  signal: null,
  timed_out: false,
  error: null,
  stdout: 'simulated regression: required step exited 42',
  stderr: '',
  output: '',
  environment: '',
  trace: 'validate-github-token',
  expectation: {
    outcome: 'expected',
    description: 'simulated regression must be detected',
    exit_code: 0,
    stdout_includes: ['Workflow completed successfully'],
  },
};

process.exitCode = finalizeRun({
  results: [result],
  outputPath,
  scope: 'negative-control fixture; no Forge, AI, API or git calls',
  startedAt: new Date().toISOString(),
  log: () => {},
});
