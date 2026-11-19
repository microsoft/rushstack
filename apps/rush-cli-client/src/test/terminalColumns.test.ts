// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getTerminalColumns } from '../terminalColumns';

describe(getTerminalColumns.name, () => {
  it('keeps a real terminal width', () => {
    expect(getTerminalColumns({ columns: 123 })).toBe(123);
  });

  it.each([0, -1, 1.5, Number.NaN])('treats %p columns as unknown', (columns) => {
    expect(getTerminalColumns({ columns })).toBeUndefined();
  });

  it('treats a stream without a width as unknown', () => {
    expect(getTerminalColumns({})).toBeUndefined();
  });
});
