// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PerformanceEntry } from 'node:perf_hooks';
import { performance } from 'node:perf_hooks';
import type { ITerminal } from '@rushstack/terminal/lib/ITerminal';

export function markStart(name: string): void {
  performance.mark(`zipsync:${name}:start`);
}
export function markEnd(name: string): void {
  const base: string = `zipsync:${name}`;
  performance.mark(`${base}:end`);
  performance.measure(base, `${base}:start`, `${base}:end`);
}
export function getDuration(name: string): number {
  const measures: PerformanceEntry[] = performance.getEntriesByName(
    `zipsync:${name}`
  ) as unknown as PerformanceEntry[];
  if (measures.length === 0) return 0;
  return measures[measures.length - 1].duration;
}
export function formatDuration(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms.toFixed(2) + 'ms';
}
export function emitSummary(operation: 'pack' | 'unpack', term: ITerminal): void {
  const totalName: string = `${operation}.total`;
  // Ensure total is measured
  markEnd(totalName);
  const totalDuration: number = getDuration(totalName);
  const prefix: string = `zipsync:${operation}.`;
  const measures: PerformanceEntry[] = performance.getEntriesByType(
    'measure'
  ) as unknown as PerformanceEntry[];
  const rows: Array<{ name: string; dur: number }> = [];
  for (const m of measures) {
    if (!m.name.startsWith(prefix)) continue;
    if (m.name === `zipsync:${totalName}`) continue;
    // Extract segment name (remove prefix)
    const segment: string = m.name.substring(prefix.length);
    rows.push({ name: segment, dur: m.duration });
  }
  rows.sort((a, b) => b.dur - a.dur);
  const lines: string[] = rows.map((r) => {
    const pct: number = totalDuration ? (r.dur / totalDuration) * 100 : 0;
    return `  ${r.name}: ${formatDuration(r.dur)} (${pct.toFixed(1)}%)`;
  });
  lines.push(`  TOTAL ${operation}.total: ${formatDuration(totalDuration)}`);
  term.writeVerboseLine(`Performance summary (${operation}):\n` + lines.join('\n'));
  // Cleanup marks/measures to avoid unbounded growth
  performance.clearMarks();
  performance.clearMeasures();
}
