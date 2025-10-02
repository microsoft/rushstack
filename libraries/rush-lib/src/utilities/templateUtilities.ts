// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, InternalError, NewlineKind } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { Rush } from '../api/Rush';

// Matches a well-formed BEGIN macro starting a block section.
// Example:  /*[BEGIN "DEMO"]*/
//
// Group #1 is the indentation spaces before the macro
// Group #2 is the section name
const BEGIN_MARCO_REGEXP: RegExp = /^(\s*)\/\*\[BEGIN "([A-Z]+)"\]\s*\*\/\s*$/;

// Matches a well-formed END macro ending a block section.
// Example:  /*[END "DEMO"]*/
//
// Group #1 is the indentation spaces before the macro
// Group #2 is the section name
const END_MACRO_REGEXP: RegExp = /^(\s*)\/\*\[END "([A-Z]+)"\]\s*\*\/\s*$/;

// Matches a well-formed single-line section, including the space character after it
// if present.
// Example:  /*[LINE "HYPOTHETICAL"]*/
//
// Group #1 is the section name
const LINE_MACRO_REGEXP: RegExp = /\/\*\[LINE "([A-Z]+)"\]\s*\*\/\s?/;

// Matches a variable expansion.
// Example:  [%RUSH_VERSION%]
//
// Group #1 is the variable name including the dollar sign
const VARIABLE_MACRO_REGEXP: RegExp = /\[(%[A-Z0-9_]+%)\]/;

// Matches anything that starts with "/*[" and ends with "]*/"
// Used to catch malformed macro expressions
const ANY_MACRO_REGEXP: RegExp = /\/\*\s*\[.*\]\s*\*\//;

// Copy the template from sourcePath, transform any macros, and write the output to destinationPath.
//
// We implement a simple template engine.  "Single-line section" macros have this form:
//
//     /*[LINE "NAME"]*/ (content goes here)
//
// ...and when commented out will look like this:
//
//     // (content goes here)
//
// "Block section" macros have this form:
//
//     /*[BEGIN "NAME"]*/
//     (content goes
//     here)
//     /*[END "NAME"]*/
//
// ...and when commented out will look like this:
//
//     // (content goes
//     // here)
//
// Lastly, a variable expansion has this form:
//
//     // The value is [%NAME%].
//
// ...and when expanded with e.g. "123" will look like this:
//
//     // The value is 123.
//
// The section names must be one of the predefined names used by "rush init".
// A single-line section may appear inside a block section, in which case it will get
// commented twice.
export async function copyTemplateFileAsync(
  sourcePath: string,
  destinationPath: string,
  overwrite: boolean,
  demo: boolean = false
): Promise<void> {
  const destinationFileExists: boolean = await FileSystem.existsAsync(destinationPath);

  if (!overwrite) {
    if (destinationFileExists) {
      // eslint-disable-next-line no-console
      console.log(Colorize.yellow('Not overwriting already existing file: ') + destinationPath);
      return;
    }
  }

  if (destinationFileExists) {
    // eslint-disable-next-line no-console
    console.log(Colorize.yellow(`Overwriting: ${destinationPath}`));
  } else {
    // eslint-disable-next-line no-console
    console.log(`Generating: ${destinationPath}`);
  }

  const outputLines: string[] = [];
  const lines: string[] = (
    await FileSystem.readFileAsync(sourcePath, { convertLineEndings: NewlineKind.Lf })
  ).split('\n');

  let activeBlockSectionName: string | undefined = undefined;
  let activeBlockIndent: string = '';

  for (const line of lines) {
    let match: RegExpMatchArray | null;

    // Check for a block section start
    // Example:  /*[BEGIN "DEMO"]*/
    match = line.match(BEGIN_MARCO_REGEXP);
    if (match) {
      if (activeBlockSectionName) {
        // If this happens, please report a Rush bug
        throw new InternalError(
          `The template contains an unmatched BEGIN macro for "${activeBlockSectionName}"`
        );
      }

      activeBlockSectionName = match[2];
      activeBlockIndent = match[1];
      // Remove the entire line containing the macro
      continue;
    }

    // Check for a block section end
    // Example:  /*[END "DEMO"]*/
    match = line.match(END_MACRO_REGEXP);
    if (match) {
      if (activeBlockSectionName === undefined) {
        // If this happens, please report a Rush bug
        throw new InternalError(
          `The template contains an unmatched END macro for "${activeBlockSectionName}"`
        );
      }

      if (activeBlockSectionName !== match[2]) {
        // If this happens, please report a Rush bug
        throw new InternalError(
          `The template contains an mismatched END macro for "${activeBlockSectionName}"`
        );
      }

      if (activeBlockIndent !== match[1]) {
        // If this happens, please report a Rush bug
        throw new InternalError(
          `The template contains an inconsistently indented section "${activeBlockSectionName}"`
        );
      }

      activeBlockSectionName = undefined;

      // Remove the entire line containing the macro
      continue;
    }

    let transformedLine: string = line;

    // Check for a single-line section
    // Example:  /*[LINE "HYPOTHETICAL"]*/
    match = transformedLine.match(LINE_MACRO_REGEXP);
    if (match) {
      const sectionName: string = match[1];
      const replacement: string = _isSectionCommented(sectionName, demo) ? '// ' : '';
      transformedLine = transformedLine.replace(LINE_MACRO_REGEXP, replacement);
    }

    // Check for variable expansions
    // Example:  [%RUSH_VERSION%]
    while ((match = transformedLine.match(VARIABLE_MACRO_REGEXP))) {
      const variableName: string = match[1];
      const replacement: string = _expandMacroVariable(variableName);
      transformedLine = transformedLine.replace(VARIABLE_MACRO_REGEXP, replacement);
    }

    // Verify that all macros were handled
    match = transformedLine.match(ANY_MACRO_REGEXP);
    if (match) {
      // If this happens, please report a Rush bug
      throw new InternalError(
        'The template contains a malformed macro expression: ' + JSON.stringify(match[0])
      );
    }

    // If we are inside a block section that is commented out, then insert the "//" after indentation
    if (activeBlockSectionName !== undefined) {
      if (_isSectionCommented(activeBlockSectionName, demo)) {
        // Is the line indented properly?
        if (transformedLine.substr(0, activeBlockIndent.length).trim().length > 0) {
          // If this happens, please report a Rush bug
          throw new InternalError(
            `The template contains inconsistently indented lines inside` +
              ` the "${activeBlockSectionName}" section`
          );
        }

        // Insert comment characters after the indentation
        const contentAfterIndent: string = transformedLine.substr(activeBlockIndent.length);
        transformedLine = activeBlockIndent + '// ' + contentAfterIndent;
      }
    }

    outputLines.push(transformedLine);
  }

  // Write the output
  await FileSystem.writeFileAsync(destinationPath, outputLines.join('\n'), {
    ensureFolderExists: true
  });
}

function _isSectionCommented(sectionName: string, demo: boolean): boolean {
  // The "HYPOTHETICAL" sections are always commented out by "rush init".
  // They are uncommented in the "assets" source folder so that we can easily validate
  // that they conform to their JSON schema.
  if (sectionName === 'HYPOTHETICAL') return true;
  if (sectionName === 'DEMO') return demo;
  // If this happens, please report a Rush bug
  throw new InternalError(`The template references an undefined section name ${sectionName}`);
}

function _expandMacroVariable(variableName: string): string {
  switch (variableName) {
    case '%RUSH_VERSION%':
      return Rush.version;
    default:
      throw new InternalError(`The template references an undefined variable "${variableName}"`);
  }
}
