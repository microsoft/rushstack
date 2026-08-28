# Direct Rush reporter demo

Build the three reporter projects, then run the self-checking direct invocation demo:

```sh
rush build --to @microsoft/rush
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
