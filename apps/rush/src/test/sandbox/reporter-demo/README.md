# Direct Rush reporter demo

Build the three reporter projects, then run the self-checking direct invocation demo:

```sh
rush build --to @microsoft/rush
node apps/rush/src/test/sandbox/reporter-demo/run.mjs
```

The script runs the same `rush build --only @rushstack/rush-reporter` operation stream through legacy,
plaintext, JSON, and AI modes. It verifies JSON/AI payload-only stdout, confirms the plaintext result
contains an existing absolute full-log path, and writes captured stdout/stderr files to a temporary folder.

For an individual invocation:

```sh
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=plaintext
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json --log-level=debug
node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=ai
RUSH_REPORTER=legacy node apps/rush/bin/rush build --only @rushstack/rush-reporter --reporter=json
```

Repositories can opt in without a command-line flag by setting `"useRushReporter": true` in
`common/config/rush/experiments.json`. Remove that setting or use `RUSH_REPORTER=legacy` for immediate
rollback.
