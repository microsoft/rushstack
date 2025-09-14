// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ISpecChange } from '../parsing/compareSpec';
import type { LockfileEntry } from '../parsing/LfxGraph';

export const isEntryModified = (
  entry: LockfileEntry | undefined,
  specChanges: Map<string, ISpecChange>
): boolean => {
  if (!entry) return false;
  for (const dep of entry.dependencies) {
    if (specChanges.has(dep.name)) {
      return true;
    }
  }
  return false;
};
