// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const {
  formatAiReporterQualificationFailures,
  runAiReporterQualificationCorpusAsync
} = require('../lib-commonjs');

runAiReporterQualificationCorpusAsync()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
    if (!result.passed) {
      process.stderr.write(`${formatAiReporterQualificationFailures(result)}\n`);
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
