// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rushell } from '../Rushell.ts';

test('Rushell', () => {
  const rushell: Rushell = new Rushell();

  expect(rushell.execute('npm version').value).toContain('@microsoft/rushell');
});
