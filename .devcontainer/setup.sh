#!/usr/bin/env bash

echo "🚀 Setting up Rushstack codespace..."

# Set local git config
echo "🔑 Setting up local git config..."
git config --local user.email ${GITHUB_USER}@users.noreply.github.com
git config --local user.name "$(git config --system user.name)"

# Install Rush and Heft Dependencies
echo "📦 Installing Rush, Heft, & Prettier dependencies..."
npm install -g @microsoft/rush @rushstack/heft prettier

# Install Rush Dependencies
echo "📦 Installing monorepo dependencies..."
rush install

echo "🚀 Codespace setup complete! "
echo "🙏 Thank you for contributing to Rushstack! "