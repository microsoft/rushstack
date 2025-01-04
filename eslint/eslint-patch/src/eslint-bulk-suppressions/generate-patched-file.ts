// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import {
  ESLINT_BULK_FORCE_REGENERATE_PATCH_ENV_VAR_NAME,
  ESLINT_BULK_PATCH_PATH_ENV_VAR_NAME
} from './constants';

/**
 * Dynamically generate file to properly patch many versions of ESLint
 * @param inputFilePath - Must be an iteration of https://github.com/eslint/eslint/blob/main/lib/linter/linter.js
 * @param outputFilePath - Some small changes to linter.js
 */
export function generatePatchedLinterJsFileIfDoesNotExist(
  inputFilePath: string,
  outputFilePath: string
): void {
  const generateEnvVarValue: string | undefined =
    process.env[ESLINT_BULK_FORCE_REGENERATE_PATCH_ENV_VAR_NAME];
  if (generateEnvVarValue !== 'true' && generateEnvVarValue !== '1' && fs.existsSync(outputFilePath)) {
    return;
  }

  const inputFile: string = fs.readFileSync(inputFilePath).toString();

  let inputIndex: number = 0;

  /**
   * Extract from the stream until marker is reached.  When matching marker,
   * ignore whitespace in the stream and in the marker.  Return the extracted text.
   */
  function scanUntilMarker(marker: string): string {
    const trimmedMarker: string = marker.replace(/\s/g, '');

    let output: string = '';
    let trimmed: string = '';

    while (inputIndex < inputFile.length) {
      const char: string = inputFile[inputIndex++];
      output += char;
      if (!/^\s$/.test(char)) {
        trimmed += char;
      }
      if (trimmed.endsWith(trimmedMarker)) {
        return output;
      }
    }

    throw new Error('Unexpected end of input while looking for ' + JSON.stringify(marker));
  }

  function scanUntilToken(token: string, required: boolean): string {
    const tokenIndex: number = inputFile.indexOf(token, inputIndex);
    if (tokenIndex < 0) {
      if (required) {
        throw new Error('Unexpected end of input while looking for new line');
      } else {
        return scanUntilEnd();
      }
    }

    inputIndex = tokenIndex + token.length;
    return inputFile.slice(inputIndex, tokenIndex);
  }

  function scanUntilNewline(): string {
    return scanUntilToken('\n', true);
  }

  function scanUntilEnd(): string {
    const output: string = inputFile.slice(inputIndex);
    inputIndex = inputFile.length;
    return output;
  }

  let outputFile: string = '';

  // Match this:
  //    //------------------------------------------------------------------------------
  //    // Requirements
  //    //------------------------------------------------------------------------------
  outputFile += scanUntilMarker('// Requirements');
  outputFile += scanUntilMarker('//--');
  outputFile += scanUntilNewline();

  outputFile += `
// --- BEGIN MONKEY PATCH ---
const bulkSuppressionsPatch = require(process.env.${ESLINT_BULK_PATCH_PATH_ENV_VAR_NAME});
const requireFromPathToLinterJS = bulkSuppressionsPatch.requireFromPathToLinterJS;
`;

  // Match this:
  //    //------------------------------------------------------------------------------
  //    // Typedefs
  //    //------------------------------------------------------------------------------
  const requireSection: string = scanUntilMarker('// Typedefs');

  // Match something like this:
  //
  //    const path = require('path'),
  //    eslintScope = require('eslint-scope'),
  //    evk = require('eslint-visitor-keys'),
  //
  // Convert to something like this:
  //
  //    const path = require('path'),
  //    eslintScope = requireFromPathToLinterJS('eslint-scope'),
  //    evk = requireFromPathToLinterJS('eslint-visitor-keys'),
  //
  outputFile += requireSection.replace(/require\s*\((?:'([^']+)'|"([^"]+)")\)/g, (match, p1, p2) => {
    const importPath: string = p1 ?? p2 ?? '';

    if (importPath !== 'path') {
      if (p1) {
        return `requireFromPathToLinterJS('${p1}')`;
      }
      if (p2) {
        return `requireFromPathToLinterJS("${p2}")`;
      }
    }

    // Keep as-is
    return match;
  });
  outputFile += `--- END MONKEY PATCH ---
`;

  // Match this:
  // ```
  //      if (reportTranslator === null) {
  //        reportTranslator = createReportTranslator({
  //            ruleId,
  //            severity,
  //            sourceCode,
  //            messageIds,
  //            disableFixes
  //        });
  //    }
  //    const problem = reportTranslator(...args);
  //
  //    if (problem.fix && !(rule.meta && rule.meta.fixable)) {
  //        throw new Error("Fixable rules must set the `meta.fixable` property to \"code\" or \"whitespace\".");
  //    }
  // ```
  //
  // Convert to something like this:
  // ```
  //      if (reportTranslator === null) {
  //        reportTranslator = createReportTranslator({
  //            ruleId,
  //            severity,
  //            sourceCode,
  //            messageIds,
  //            disableFixes
  //        });
  //    }
  //    const problem = reportTranslator(...args);
  //    // --- BEGIN MONKEY PATCH ---
  //    bulkSuppressionsPatch.setAstNodeForProblem(problem, currentNode);
  //    // --- END MONKEY PATCH ---
  //
  //    if (problem.fix && !(rule.meta && rule.meta.fixable)) {
  //        throw new Error("Fixable rules must set the `meta.fixable` property to \"code\" or \"whitespace\".");
  //    }
  // ```
  outputFile += scanUntilMarker('const problem = reportTranslator(...args);');
  outputFile += `
                        // --- BEGIN MONKEY PATCH ---
                        bulkSuppressionsPatch.setAstNodeForProblem(problem, currentNode);
                        // --- END MONKEY PATCH ---
`;

  outputFile += scanUntilMarker('nodeQueue.forEach(traversalInfo => {');
  outputFile += scanUntilMarker('});');
  outputFile += scanUntilNewline();
  outputFile += scanUntilMarker('const internalSlotsMap');
  outputFile += ` = /* --- BEGIN MONKEY PATCH --- */{
    get(key) {
      return bulkSuppressionsPatch.getLinterInternalSlots(key);
    },
    set(key) {
      // Do nothing; constructor is unused
    }
  } /* --- END MONKEY PATCH --- */;`;
  const newlineIndex: number = inputFile.indexOf('\n', inputIndex);
  if (newlineIndex < 0) {
    throw new Error('Unexpected end of input while looking for new line');
  }
  inputIndex = newlineIndex;
  outputFile += scanUntilEnd();

  fs.writeFileSync(outputFilePath, outputFile);
}
