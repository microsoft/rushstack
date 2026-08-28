# Direct Rush reporter demo

For the complete control, compatibility, privacy, and troubleshooting reference, see the
[experimental Rush reporter guide](../../../../../../docs/rush/reporter.md).

From a clean checkout, install dependencies, build the reporter path, and run the self-checking direct
invocation demo:

```sh
node common/scripts/install-run-rush.js install
node common/scripts/install-run-rush.js build --to @microsoft/rush
node apps/rush/src/test/sandbox/reporter-demo/run.mjs
```

The script runs the same `rush build --only @rushstack/rush-reporter` operation stream through legacy,
plaintext, JSON, AI, file, and quiet modes, plus parser failure, help, and command-specific JSON cases.
It verifies payload-only machine stdout, one visible writer, ordered/lossless plaintext grouping from a
same-invocation JSON sidecar, final artifact completeness, owner-only log permissions, failure flushing,
AI parser-error context, command-JSON ownership, CI plaintext output, cache-path output, normalized
`RUSH_TEMP_FOLDER` log placement, matching purge-path selection, and the `RUSH_REPORTER=legacy` rollback
transcript. Captured stdout/stderr files are written to a temporary folder.

For an individual invocation:

```sh
# Interactive TTY only
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=default

node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=plaintext
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json --log-level=debug
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=ai
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=file
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=plaintext --log-level=quiet
RUSH_REPORTER=legacy node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json
node apps/rush/bin/rush list --json --reporter=file
```

Repositories can opt in without a command-line flag by setting `"useRushReporter": true` in
`common/config/rush/experiments.json`. Remove that setting or use `RUSH_REPORTER=legacy` for immediate
rollback.

The expected output is shape-based:

- legacy keeps the existing Rush banner, operation blocks, and final status sections;
- `default` uses a width-aware three-row live region and leaves a short final summary;
- explicit `plaintext` groups ordered output under `project (phase)` and prints the absolute full-log path;
- JSON stdout contains only NDJSON event envelopes;
- AI stdout contains `ai.status` and bounded `ai.final` records;
- file mode leaves stdout empty and writes the full-log path to stderr;
- quiet mode retains only the final result and full-log path.

The intentional missing-project AI failure preserves an actionable diagnostic and complete log reference.
Structured remediation is included when the producing diagnostic supplies it; this parser failure does not
currently provide a remediation action.

Inspect the latest complete log with:

```sh
ls -lt common/temp/rush-logs
sed -n '1,120p' common/temp/rush-logs/latest.log
```
