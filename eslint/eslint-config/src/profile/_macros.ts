// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a workaround for the @typescript-eslint/naming-convention rule, whose options currently
// support a "selector" field that cannot match multiple selectors. This function receives an input
// array such as:
//
// [
//   {
//     selectors: ['class', 'typeAlias', 'enum'],
//     format: ['PascalCase']
//   },
//   . . .
// ]
//
// ...and transforms "selectors" -> "selector, returning an array with expanded entries like this:
//
// [
//   {
//     selector: 'class',
//     format: ['PascalCase']
//   },
//   {
//     selector: 'typeAlias',
//     format: ['PascalCase']
//   },
//   {
//     selector: 'enum',
//     format: ['PascalCase']
//   },
//   . . .
// ]
//
// It also supports a "enforceLeadingUnderscoreWhenPrivate" macro that expands this:
//
// [
//   {
//     selectors: ['property'],
//     enforceLeadingUnderscoreWhenPrivate: true,
//     format: ['camelCase']
//   },
//   . . .
// ]
//
// ...to produce this:
//
// [
//   {
//     selector: 'property',
//
//     leadingUnderscore: 'allow',
//     format: ['camelCase']
//   },
//   {
//     selector: 'property',
//     modifiers: ['private'],
//
//     leadingUnderscore: 'require',
//     format: ['camelCase']
//   },
//   . . .
// ]
interface INamingConventionSelectorMacroBlock {
  selectors: string[];
  enforceLeadingUnderscoreWhenPrivate?: boolean;
  modifiers?: string[];
  [optionName: string]: unknown;
}

interface INamingConventionSelectorBlock {
  selector: string;
  selectors?: string[];
  enforceLeadingUnderscoreWhenPrivate?: boolean;
  modifiers?: string[];
  [optionName: string]: unknown;
}

function expandNamingConventionSelectors(
  inputBlocks: INamingConventionSelectorMacroBlock[]
): INamingConventionSelectorBlock[] {
  const firstPassBlocks: INamingConventionSelectorBlock[] = [];

  // Expand "selectors" --> "selector"
  for (const block of inputBlocks) {
    for (const selector of block.selectors) {
      const expandedBlock: INamingConventionSelectorBlock = { ...block, selector: selector };
      delete expandedBlock.selectors;
      firstPassBlocks.push(expandedBlock);
    }
  }

  // Expand "enforceLeadingUnderscoreWhenPrivate" --> "leadingUnderscore"
  const secondPassBlocks: INamingConventionSelectorBlock[] = [];
  for (const block of firstPassBlocks) {
    if (block.enforceLeadingUnderscoreWhenPrivate) {
      const expandedBlock1: INamingConventionSelectorBlock = {
        ...block,
        leadingUnderscore: 'allow'
      };
      delete expandedBlock1.enforceLeadingUnderscoreWhenPrivate;
      secondPassBlocks.push(expandedBlock1);

      const expandedBlock2: INamingConventionSelectorBlock = {
        ...block,
        modifiers: [...(block.modifiers ?? []), 'private'],
        leadingUnderscore: 'require'
      };
      delete expandedBlock2.enforceLeadingUnderscoreWhenPrivate;
      secondPassBlocks.push(expandedBlock2);
    } else {
      secondPassBlocks.push(block);
    }
  }

  return secondPassBlocks;
}

export { expandNamingConventionSelectors };
