// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const fs = require('node:fs');
const path = require('node:path');

fs.writeFileSync(
  path.join(process.cwd(), 'custom-reporter-flag-args.json'),
  `${JSON.stringify(process.argv.slice(2), undefined, 2)}\n`
);
