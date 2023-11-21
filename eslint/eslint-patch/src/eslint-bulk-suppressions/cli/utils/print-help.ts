// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { wrapWordsToLines } from './wrap-words-to-lines';

export function printPruneHelp() {
  const help = `Usage: eslint-bulk prune [options] <path...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to delete all unused suppression entries in the local .eslint-bulk-suppressions.json file that correspond to the target files given as arguments.

Argument:
  <path...>
    Glob patterns for paths to suppress, same as eslint files argument. Should be relative to the project root.`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function printHelp() {
  const help = `eslint-bulk <command>

Usage:

eslint-bulk suppress --rule NAME1 [--rule NAME2...] PATH1 [PATH2...]
eslint-bulk suppress --all PATH1 [PATH2...]
eslint-bulk suppress --help

eslint-bulk prune PATH1 [PATH2...]
eslint-bulk prune --help

eslint-bulk --help

This command line tool is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to suppress or prune unused suppressions in the local .eslint-bulk-suppressions.json file.

Commands:
  eslint-bulk suppress [options] <path...>
    Please run "eslint-bulk suppress --help" to learn more.

  eslint-bulk prune <path...>
    Please run "eslint-bulk prune --help" to learn how to use this command.
`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function printSuppressHelp() {
  const help = `Usage: eslint-bulk suppress [options] <path...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to either generate a new .eslint-bulk-suppressions.json file or add suppression entries to the existing file. Specify the files and rules you want to suppress.

Argument:
  <path...>
    Glob patterns for paths to suppress, same as eslint files argument. Should be relative to the project root.

Options:
  -h, -H, --help
    Display this help message.

  -R, --rule
    The full name of the ESLint rule you want to bulk-suppress. Specify multiple rules with --rule NAME1 --rule NAME2.

  -A, --all
    Bulk-suppress all rules in the specified file patterns.`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}
