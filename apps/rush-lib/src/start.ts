// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('start.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);

import { Rush } from './api/Rush';
console.log('start.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);

Rush.launch(Rush.version, { isManaged: false });
console.log('start.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
