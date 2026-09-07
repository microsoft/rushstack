// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

// A preload observes actual process startup; the successor still runs the installed rushd entrypoint.
const controlFolder: string | undefined = process.env.RUSHD_MUTATION_TEST_CONTROL;
if (!controlFolder) throw new Error('The successor observation fixture needs its control folder.');
fs.appendFileSync(path.join(controlFolder, 'events.txt'), 'successor-process-started\n');
