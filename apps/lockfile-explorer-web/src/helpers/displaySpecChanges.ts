// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ISpecChange } from '../parsing/compareSpec.ts';

export const displaySpecChanges = (specChanges: Map<string, ISpecChange>, dep: string): string => {
  switch (specChanges.get(dep)?.type) {
    case 'add':
      return '[Added by .pnpmfile.cjs]';
    case 'diff':
      return `[Changed from ${specChanges.get(dep)?.from}]`;
    case 'remove':
      return '[Deleted by .pnpmfile.cjs]';
    default:
      return 'No Change';
  }
};
