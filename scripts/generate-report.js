#!/usr/bin/env node
// Merges Newman's --reporter-json-export output from one or more stages into
// one Markdown report: request-by-request flow plus pass/fail percentages.
// Usage: node generate-report.js <out.md> <stage-name>=<report.json> [<stage-name>=<report.json> ...]

const fs = require('fs');

const [outPath, ...stageArgs] = process.argv.slice(2);
if (!outPath || stageArgs.length === 0) {
  console.error('Usage: generate-report.js <out.md> <stage-name>=<report.json> [...]');
  process.exit(2);
}

function formatUrl(url) {
  if (!url) return '';
  const host = (url.host || []).join('.');
  const port = url.port ? `:${url.port}` : '';
  const path = '/' + (url.path || []).join('/');
  const query = (url.query || []).length
    ? '?' + url.query.map((q) => `${q.key}=${q.value}`).join('&')
    : '';
  return `${url.protocol}://${host}${port}${path}${query}`;
}

const stages = stageArgs.map((arg) => {
  const eq = arg.indexOf('=');
  const name = arg.slice(0, eq);
  const path = arg.slice(eq + 1);
  const data = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
  return { name, data };
});

let totalAssertions = 0;
let failedAssertions = 0;
let totalRequests = 0;
let failedRequests = 0;
const header = ['# API Test Report', '', `Generated: ${new Date().toISOString()}`];
const flowLines = [];
const failureLines = [];

for (const stage of stages) {
  if (!stage.data) {
    flowLines.push(`## ${stage.name}`);
    flowLines.push('');
    flowLines.push('_Skipped — no report file found for this stage._');
    flowLines.push('');
    continue;
  }

  flowLines.push(`## ${stage.name}`);
  flowLines.push('');

  stage.data.run.executions.forEach((ex, i) => {
    totalRequests += 1;
    const assertions = ex.assertions || [];
    const failed = assertions.filter((a) => a.error);
    const passed = assertions.length - failed.length;
    if (failed.length > 0) failedRequests += 1;
    totalAssertions += assertions.length;
    failedAssertions += failed.length;

    const status = ex.response ? ex.response.code : 'ERR';
    const icon = failed.length === 0 ? '✅' : '❌';
    const name = ex.item?.name ?? `request ${i + 1}`;
    const method = ex.request?.method ?? '';
    const url = formatUrl(ex.request?.url);

    flowLines.push(`${i + 1}. ${icon} **${name}** — \`${method} ${url}\` — ${status} (${passed}/${assertions.length} assertions)`);
    for (const a of assertions) {
      const mark = a.error ? '✗' : '✓';
      flowLines.push(`   - ${mark} ${a.assertion}`);
      if (a.error) {
        failureLines.push(`- **${stage.name} / ${name}** — ${a.assertion}: ${a.error.message}`);
      }
    }
  });
  flowLines.push('');
}

const requestPassRate = totalRequests ? (((totalRequests - failedRequests) / totalRequests) * 100).toFixed(1) : '0.0';
const assertionPassRate = totalAssertions ? (((totalAssertions - failedAssertions) / totalAssertions) * 100).toFixed(1) : '0.0';

const summary = [
  '## Summary',
  '',
  '| Metric | Value |',
  '|---|---|',
  `| Requests | ${totalRequests - failedRequests}/${totalRequests} passed (${requestPassRate}%) |`,
  `| Assertions | ${totalAssertions - failedAssertions}/${totalAssertions} passed (${assertionPassRate}%) |`,
  '',
];

const failuresSection = [
  '## Failures',
  '',
  failureLines.length ? failureLines.join('\n') : '_None._',
  '',
];

const report = [...header, '', ...summary, ...flowLines, ...failuresSection].join('\n');

fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, report);

console.log(`Requests:   ${totalRequests - failedRequests}/${totalRequests} passed (${requestPassRate}%)`);
console.log(`Assertions: ${totalAssertions - failedAssertions}/${totalAssertions} passed (${assertionPassRate}%)`);
console.log(`Report written to ${outPath}`);

process.exit(failedAssertions > 0 ? 1 : 0);
