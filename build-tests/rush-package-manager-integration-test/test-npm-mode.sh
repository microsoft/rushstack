#!/bin/bash
# Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
# See LICENSE in the project root for license information.

# Integration test for Rush npm mode with tar 7.x
# This script verifies that temp project tarballs work correctly with npm package manager

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEST_REPO_DIR="$SCRIPT_DIR/temp/npm-test-repo"
RUSHSTACK_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

echo "=========================================="
echo "Rush NPM Mode Integration Test"
echo "=========================================="
echo ""
echo "This test verifies that tar 7.x changes work correctly with npm package manager"
echo "by creating temp project tarballs and extracting them during rush install."
echo ""

# Clean up previous test runs
if [ -d "$TEST_REPO_DIR" ]; then
  echo "Cleaning up previous test run..."
  rm -rf "$TEST_REPO_DIR"
fi

# Create test repo directory
echo "Creating test repository at $TEST_REPO_DIR..."
mkdir -p "$TEST_REPO_DIR"
cd "$TEST_REPO_DIR"

# Use locally built rush to initialize the repo
echo "Initializing Rush repo with npm mode..."
node "$RUSHSTACK_ROOT/apps/rush/lib/start.js" init --overwrite-existing

# Configure rush.json to use npm
echo "Configuring rush.json for npm mode..."
cat > rush.json << 'EOF'
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush.schema.json",
  "rushVersion": "5.166.0",
  "npmVersion": "8.19.4",
  "nodeSupportedVersionRange": ">=18.0.0",
  "projectFolderMinDepth": 1,
  "projectFolderMaxDepth": 2,
  "projects": [
    {
      "packageName": "test-project-a",
      "projectFolder": "projects/test-project-a"
    },
    {
      "packageName": "test-project-b",
      "projectFolder": "projects/test-project-b"
    }
  ]
}
EOF

# Create project A (dependency)
echo "Creating test-project-a..."
mkdir -p projects/test-project-a
cat > projects/test-project-a/package.json << 'EOF'
{
  "name": "test-project-a",
  "version": "1.0.0",
  "main": "lib/index.js",
  "scripts": {
    "build": "node -e \"require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { greet: () => \\\"Hello from A\\\" };');\""
  },
  "dependencies": {
    "lodash": "^4.17.21"
  }
}
EOF

# Create project B (depends on A)
echo "Creating test-project-b..."
mkdir -p projects/test-project-b
cat > projects/test-project-b/package.json << 'EOF'
{
  "name": "test-project-b",
  "version": "1.0.0",
  "main": "lib/index.js",
  "scripts": {
    "build": "node -e \"const a = require('test-project-a'); require('fs').mkdirSync('lib', {recursive: true}); require('fs').writeFileSync('lib/index.js', 'module.exports = { test: () => \\\"Using: \\\" + require(\\'test-project-a\\').greet() };');\""
  },
  "dependencies": {
    "test-project-a": "1.0.0",
    "moment": "^2.29.4"
  }
}
EOF

# Run rush update (this will create temp project tarballs using tar.create)
echo ""
echo "Running 'rush update' (creates temp project tarballs using tar 7.x)..."
node "$RUSHSTACK_ROOT/apps/rush/lib/start.js" update

# Verify temp project tarballs were created
echo ""
echo "Verifying temp project tarballs were created..."
if [ ! -f "common/temp/projects/test-project-a.tgz" ]; then
  echo "ERROR: test-project-a.tgz was not created!"
  exit 1
fi
if [ ! -f "common/temp/projects/test-project-b.tgz" ]; then
  echo "ERROR: test-project-b.tgz was not created!"
  exit 1
fi
echo "✓ Temp project tarballs created successfully"

# Run rush install (this will extract temp project tarballs using tar.extract)
echo ""
echo "Running 'rush install' (extracts temp project tarballs using tar 7.x)..."
node "$RUSHSTACK_ROOT/apps/rush/lib/start.js" install

# Verify node_modules were populated correctly
echo ""
echo "Verifying node_modules structure..."
if [ ! -d "projects/test-project-a/node_modules/lodash" ]; then
  echo "ERROR: lodash not installed in test-project-a!"
  exit 1
fi
if [ ! -L "projects/test-project-b/node_modules/test-project-a" ]; then
  echo "ERROR: test-project-a not linked in test-project-b!"
  exit 1
fi
echo "✓ Dependencies installed correctly"

# Run rush build to verify everything works end-to-end
echo ""
echo "Running 'rush build'..."
node "$RUSHSTACK_ROOT/apps/rush/lib/start.js" build

# Verify build outputs
echo ""
echo "Verifying build outputs..."
if [ ! -f "projects/test-project-a/lib/index.js" ]; then
  echo "ERROR: test-project-a build output not found!"
  exit 1
fi
if [ ! -f "projects/test-project-b/lib/index.js" ]; then
  echo "ERROR: test-project-b build output not found!"
  exit 1
fi
echo "✓ Build completed successfully"

# Test that the built code actually works
echo ""
echo "Testing built code..."
cd projects/test-project-b
node -e "const b = require('./lib/index.js'); console.log(b.test());" | grep -q "Using: Hello from A"
if [ $? -eq 0 ]; then
  echo "✓ Built code executes correctly"
else
  echo "ERROR: Built code did not execute as expected!"
  exit 1
fi

echo ""
echo "=========================================="
echo "✓ NPM Mode Integration Test PASSED"
echo "=========================================="
echo ""
echo "The tar 7.x changes work correctly with npm mode:"
echo "  - Temp project tarballs created successfully"
echo "  - Tarballs extracted correctly during install"
echo "  - Dependencies linked properly"
echo "  - Build completed successfully"
echo ""
