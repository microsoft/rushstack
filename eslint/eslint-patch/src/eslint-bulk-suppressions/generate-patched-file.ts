// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

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
  outputFilePath: string,
  eslintPackageVersion: string
): void {
  const generateEnvVarValue: string | undefined =
    process.env[ESLINT_BULK_FORCE_REGENERATE_PATCH_ENV_VAR_NAME];
  if (generateEnvVarValue !== 'true' && generateEnvVarValue !== '1' && fs.existsSync(outputFilePath)) {
    return;
  }

  const [majorVersionString, minorVersionString] = eslintPackageVersion.split('.');
  const majorVersion: number = parseInt(majorVersionString, 10);
  const minorVersion: number = parseInt(minorVersionString, 10);

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

  function scanUntilNewline(): string {
    let output: string = '';

    while (inputIndex < inputFile.length) {
      const char: string = inputFile[inputIndex++];
      output += char;
      if (char === '\n') {
        return output;
      }
    }

    throw new Error('Unexpected end of input while looking for new line');
  }

  function scanUntilEnd(): string {
    const output: string = inputFile.substring(inputIndex);
    inputIndex = inputFile.length;
    return output;
  }

  const markerForStartOfClassMethodSpaces: string = '\n     */\n    ';
  const markerForStartOfClassMethodTabs: string = '\n\t */\n\t';
  function indexOfStartOfClassMethod(input: string, position?: number): { index: number; marker?: string } {
    let startOfClassMethodIndex: number = input.indexOf(markerForStartOfClassMethodSpaces, position);
    if (startOfClassMethodIndex === -1) {
      startOfClassMethodIndex = input.indexOf(markerForStartOfClassMethodTabs, position);
      if (startOfClassMethodIndex === -1) {
        return { index: startOfClassMethodIndex };
      }
      return { index: startOfClassMethodIndex, marker: markerForStartOfClassMethodTabs };
    }
    return { index: startOfClassMethodIndex, marker: markerForStartOfClassMethodSpaces };
  }

  /**
   * Returns index of next public method
   * @param fromIndex - index of inputFile to search if public method still exists
   * @returns -1 if public method does not exist or index of next public method
   */
  function getIndexOfNextMethod(fromIndex: number): { index: number; isPublic?: boolean } {
    const rest: string = inputFile.substring(fromIndex);

    const endOfClassIndex: number = rest.indexOf('\n}');

    const { index: startOfClassMethodIndex, marker: startOfClassMethodMarker } =
      indexOfStartOfClassMethod(rest);

    if (
      startOfClassMethodIndex === -1 ||
      !startOfClassMethodMarker ||
      startOfClassMethodIndex > endOfClassIndex
    ) {
      return { index: -1 };
    }

    const afterMarkerIndex: number = startOfClassMethodIndex + startOfClassMethodMarker.length;

    const isPublicMethod: boolean =
      rest[afterMarkerIndex] !== '_' &&
      rest[afterMarkerIndex] !== '#' &&
      !rest.substring(afterMarkerIndex, rest.indexOf('\n', afterMarkerIndex)).includes('static') &&
      !rest.substring(afterMarkerIndex, rest.indexOf('\n', afterMarkerIndex)).includes('constructor');

    return { index: fromIndex + afterMarkerIndex, isPublic: isPublicMethod };
  }

  function scanUntilIndex(indexToScanTo: number): string {
    const output: string = inputFile.substring(inputIndex, indexToScanTo);
    inputIndex = indexToScanTo;
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

  if (majorVersion >= 9) {
    if (minorVersion >= 37) {
      outputFile += scanUntilMarker('const visitor = new SourceCodeVisitor();');
    } else {
      outputFile += scanUntilMarker('const emitter = createEmitter();');
    }

    outputFile += `
      // --- BEGIN MONKEY PATCH ---
      let currentNode = undefined;
      // --- END MONKEY PATCH ---`;
  }

  // Match this (9.25.1):
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
  // Or this (9.37.0):
  // ```
  //    const problem = report.addRuleMessage(
  //      ruleId,
  //      severity,
  //      ...args,
  //    );
  //
  //    if (problem.fix && !(rule.meta && rule.meta.fixable)) {
  //      throw new Error(
  //        'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
  //      );
  //    }
  // ```
  //
  // Convert to something like this (9.25.1):
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
  //    if (bulkSuppressionsPatch.shouldBulkSuppress({ filename, currentNode: args[0]?.node ?? currentNode, ruleId, problem })) return;
  //    // --- END MONKEY PATCH ---
  //
  //    if (problem.fix && !(rule.meta && rule.meta.fixable)) {
  //        throw new Error("Fixable rules must set the `meta.fixable` property to \"code\" or \"whitespace\".");
  //    }
  // ```
  // Or this (9.37.0):
  // ```
  //    const problem = report.addRuleMessage(
  //      ruleId,
  //      severity,
  //      ...args,
  //    );
  //    // --- BEGIN MONKEY PATCH ---
  //    if (bulkSuppressionsPatch.shouldBulkSuppress({ filename, currentNode: args[0]?.node ?? currentNode, ruleId, problem })) return;
  //    // --- END MONKEY PATCH ---
  //
  //    if (problem.fix && !(rule.meta && rule.meta.fixable)) {
  //      throw new Error(
  //        'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
  //      );
  //    }
  // ```
  if (majorVersion > 9 || (majorVersion === 9 && minorVersion >= 37)) {
    outputFile += scanUntilMarker('const problem = report.addRuleMessage(');
    outputFile += scanUntilMarker('ruleId,');
    outputFile += scanUntilMarker('severity,');
    outputFile += scanUntilMarker('...args,');
    outputFile += scanUntilMarker(');');
  } else {
    outputFile += scanUntilMarker('const problem = reportTranslator(...args);');
  }

  outputFile += `
    // --- BEGIN MONKEY PATCH ---`;
  if (majorVersion > 9 || (majorVersion === 9 && minorVersion >= 37)) {
    outputFile += `
    if (bulkSuppressionsPatch.shouldBulkSuppress({ filename, currentNode: args[0]?.node ?? currentNode, ruleId, problem })) {
      problem.suppressions ??= []; problem.suppressions.push({kind:"bulk",justification:""});
    }`;
  } else {
    outputFile += `
    if (bulkSuppressionsPatch.shouldBulkSuppress({ filename, currentNode: args[0]?.node ?? currentNode, ruleId, problem })) return;`;
  }

  outputFile += `
    // --- END MONKEY PATCH ---`;

  //
  // Match this:
  // ```
  //    Object.keys(ruleListeners).forEach(selector => {
  //      ...
  //    });
  // ```
  //
  // Convert to something like this (9.25.1):
  // ```
  //    Object.keys(ruleListeners).forEach(selector => {
  //      // --- BEGIN MONKEY PATCH ---
  //      emitter.on(selector, (...args) => { currentNode = args[args.length - 1]; });
  //      // --- END MONKEY PATCH ---
  //      ...
  //    });
  // ```
  // Or this (9.37.0):
  // ```
  //    Object.keys(ruleListeners).forEach(selector => {
  //      // --- BEGIN MONKEY PATCH ---
  //      visitor.add(selector, (...args) => { currentNode = args[args.length - 1]; });
  //      // --- END MONKEY PATCH ---
  //      ...
  //    });
  // ```
  if (majorVersion >= 9) {
    outputFile += scanUntilMarker('Object.keys(ruleListeners).forEach(selector => {');
    outputFile += `
      // --- BEGIN MONKEY PATCH ---
`;
    if (minorVersion >= 37) {
      outputFile += `visitor.add(selector, (...args) => { currentNode = args[args.length - 1]; });`;
    } else {
      outputFile += `emitter.on(selector, (...args) => { currentNode = args[args.length - 1]; });`;
    }

    outputFile += `
      // --- END MONKEY PATCH ---`;
  }

  outputFile += scanUntilMarker('class Linter {');
  outputFile += scanUntilNewline();
  outputFile += `
    // --- BEGIN MONKEY PATCH ---
    /**
     * We intercept ESLint execution at the .eslintrc.js file, but unfortunately the Linter class is
     * initialized before the .eslintrc.js file is executed. This means the internalSlotsMap that all
     * the patched methods refer to is not initialized. This method checks if the internalSlotsMap is
     * initialized, and if not, initializes it.
     */
    _conditionallyReinitialize({ cwd, configType } = {}) {
        if (internalSlotsMap.get(this) === undefined) {
            internalSlotsMap.set(this, {
              cwd: normalizeCwd(cwd),
              flags: [],
              lastConfigArray: null,
              lastSourceCode: null,
              lastSuppressedMessages: [],
              configType, // TODO: Remove after flat config conversion
              parserMap: new Map([['espree', espree]]),
              ruleMap: new Rules()
            });

            this.version = pkg.version;
        }
    }
    // --- END MONKEY PATCH ---
`;

  const privateMethodNames: string[] = [];
  let { index: indexOfNextMethod, isPublic } = getIndexOfNextMethod(inputIndex);

  while (indexOfNextMethod !== -1) {
    outputFile += scanUntilIndex(indexOfNextMethod);
    if (isPublic) {
      // Inject the monkey patch at the start of the public method
      outputFile += scanUntilNewline();
      outputFile += `        // --- BEGIN MONKEY PATCH ---
        this._conditionallyReinitialize();
        // --- END MONKEY PATCH ---
`;
    } else if (inputFile[inputIndex] === '#') {
      // Replace the '#' private method with a '_' private method, so that our monkey patch
      // can still call it. Otherwise, we get the following error during execution:
      // TypeError: Receiver must be an instance of class Linter
      const privateMethodName: string = scanUntilMarker('(');
      // Remove the '(' at the end and stash it, since we need to escape it for the regex later
      privateMethodNames.push(privateMethodName.slice(0, -1));
      outputFile += `_${privateMethodName.slice(1)}`;
    }

    const indexResult: { index: number; isPublic?: boolean } = getIndexOfNextMethod(inputIndex);
    indexOfNextMethod = indexResult.index;
    isPublic = indexResult.isPublic;
  }

  outputFile += scanUntilEnd();

  // Do a second pass to find and replace all calls to private methods with the patched versions.
  if (privateMethodNames.length) {
    const privateMethodCallRegex: RegExp = new RegExp(`\.(${privateMethodNames.join('|')})\\(`, 'g');
    outputFile = outputFile.replace(privateMethodCallRegex, (match, privateMethodName) => {
      // Replace the leading '#' with a leading '_'
      return `._${privateMethodName.slice(1)}(`;
    });
  }

  fs.writeFileSync(outputFilePath, outputFile);
}
