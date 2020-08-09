// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.time('total time');
import { Rush } from './api/Rush';

Rush.launch(Rush.version, { isManaged: false }, () => {
  console.timeEnd('total time');
});
