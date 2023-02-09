#!/usr/bin/env bash

echo "🚀 Setting up Rushstack codespace..."

echo "🔑 Setting up GitHub user config..."
node ./.devcontainer/setGitConfigUserName.js ${GITHUB_USER}

# Install Rush and Heft Dependencies
echo "📦 Installing Rush, Heft, & Prettier dependencies..."
npm install -g @microsoft/rush @rushstack/heft prettier

# Install Rush Dependencies
echo "📦 Installing monorepo dependencies..."
rush install

echo "🚀 Codespace setup complete! "
echo "🙏 Thank you for contributing to Rushstack! "