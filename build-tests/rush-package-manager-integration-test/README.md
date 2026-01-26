# Rush Package Manager Integration Tests

This directory contains integration tests for verifying Rush works correctly with different package managers after the tar 7.x upgrade.

## Background

Rush's npm and yarn modes use temp project tarballs (stored in `common/temp/projects/`) to simulate package installations. The tar library is used to:
1. **Create** tarballs from temp project folders (`TempProjectHelper.createTempProjectTarball`)
2. **Extract** tarballs during the linking process (`NpmLinkManager._linkProjectAsync`)

These tests ensure the tar 7.x upgrade works correctly with these workflows.

## Tests

### test-npm-mode.sh
Tests Rush npm mode by:
- Initializing a Rush repo with `npmVersion` configured
- Creating two projects with dependencies
- Running `rush update` (creates tarballs)
- Running `rush install` (extracts tarballs)
- Running `rush build` (verifies everything works end-to-end)

### test-yarn-mode.sh
Tests Rush yarn mode by:
- Initializing a Rush repo with `yarnVersion` configured
- Creating two projects with dependencies
- Running `rush update` (creates tarballs)
- Running `rush install` (extracts tarballs)
- Running `rush build` (verifies everything works end-to-end)

## Prerequisites

Before running these tests:
1. Build Rush locally: `rush build --to rush`
2. Ensure you have Node.js 18+ installed

## Running the Tests

### Run all tests:
```bash
cd build-tests/rush-package-manager-integration-test
./run-all-tests.sh
```

### Run individual tests:
```bash
# Test npm mode
./test-npm-mode.sh

# Test yarn mode
./test-yarn-mode.sh
```

## What Gets Tested

These integration tests verify:
- ✓ Temp project tarballs are created correctly using tar 7.x
- ✓ Tarballs are extracted correctly during `rush install`
- ✓ File permissions are preserved (tar filter function works)
- ✓ Dependencies are linked properly between projects
- ✓ The complete workflow (update → install → build) succeeds
- ✓ Built code executes correctly

## Test Output

Each test creates a temporary Rush repository in the `temp/` directory:
- `temp/npm-test-repo/` - npm mode test repository
- `temp/yarn-test-repo/` - yarn mode test repository

These directories are cleaned up at the start of each test run.

## Related Code

The tar library is used in:
- `libraries/rush-lib/src/logic/TempProjectHelper.ts` - Creates tarballs
- `libraries/rush-lib/src/logic/npm/NpmLinkManager.ts` - Extracts tarballs

## Troubleshooting

If tests fail:
1. Check that Rush built successfully: `rush build --to rush`
2. Verify Node.js version: `node --version` (should be 18+)
3. Look for error messages in the test output
4. Inspect the temp test repo: `ls -la temp/npm-test-repo/common/temp/projects/`
