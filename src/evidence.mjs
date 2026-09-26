// Imported reports are separate from execution verdicts and agent assertions.
// A test-name fingerprint supports grouping, not proof of identical test code.
export function evidenceVerdict(report) {
  if (report.failures || report.errors) return 'failed';
  return report.passed ? 'passed' : 'inconclusive';
}
export function runEvidence(run) {
  const reports = Object.values(run.testReports || {});
  return { reports, truncated: Boolean(run.evidenceTruncated) };
}
export function aggregateEvidence(runs) {
  const sets = new Map(); let coveredRuns = 0, unusableRuns = 0;
  for (const run of runs) {
    const { reports, truncated } = runEvidence(run);
    if (truncated) { unusableRuns++; continue; }
    if (!reports.length) continue;
    coveredRuns++;
    const perRun = new Map(), rank = { passed: 0, inconclusive: 1, failed: 2 };
    for (const report of reports) {
      const verdict = evidenceVerdict(report), previous = perRun.get(report.suiteHash);
      // Copies/overlapping reports with the same test identities count once per
      // run. A passing copy cannot conceal another report's failure.
      if (!previous || rank[verdict] > rank[previous.verdict]) perRun.set(report.suiteHash, { verdict, tests: report.tests });
    }
    for (const [suiteHash, { verdict, tests }] of perRun) {
      if (!sets.has(suiteHash)) sets.set(suiteHash, { suiteHash, tests, passed: 0, failed: 0, inconclusive: 0 });
      sets.get(suiteHash)[verdict]++;
    }
  }
  return { coveredRuns, missingRuns: runs.length - coveredRuns - unusableRuns, unusableRuns,
    sets: [...sets.values()].sort((a, b) => a.suiteHash.localeCompare(b.suiteHash)) };
}
