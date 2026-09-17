// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function mainAsync(): Promise<void> {
  fs.appendFileSync(path.join(process.cwd(), 'parents'), `${process.ppid}\n`);
  fs.writeFileSync(
    path.join(process.cwd(), 'launcher-options'),
    JSON.stringify({ cwd: process.cwd(), argument: process.argv[2], environment: process.env.FIXTURE_VALUE })
  );
  const child = spawn(process.execPath, [path.join(__dirname, 'daemon.js'), process.argv[3]], {
    stdio: 'inherit'
  });
  const [code] = await once(child, 'close');
  process.exitCode = code ?? 1;
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
