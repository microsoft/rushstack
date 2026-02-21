// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from './api/Rush.ts';

performance.mark('rush:start');

Rush.launch(Rush.version, { isManaged: false });

// Rush.launch has async side effects, so no point ending the measurement.
