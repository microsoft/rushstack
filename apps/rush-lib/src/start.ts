// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

// check to ensure that we are using a supported version of NodeJS, otherwise write a warning
if (semver.satisfies(process.versions.node, '< 6.0.0')) {
  console.error(colors.red(`You are using an outdated version of Node ("${process.versions.node}").`
    + ` You should upgrade to Node 6 or Node 8.`));
  process.exit(1);
} else if (semver.satisfies(process.versions.node, '<= 6.4.0')) {
  console.warn(colors.yellow(`You are using an outdated version of Node ("${process.versions.node}").`
    + ` You should upgrade to Node >=6.5.0 or Node 8, as some Rush features may not work.`));
} else if (semver.satisfies(process.versions.node, '^7.0.0')) {
  console.warn(colors.yellow(`You are using a non-LTS version of Node ("${process.versions.node}").`
    + ` You should consider upgrading to Node 8 or downgrading to Node 6, as some Rush features may not work.`));
} else if (semver.satisfies(process.versions.node, '^9.0.0')) {
  console.warn(colors.yellow(`You are using a new, non-LTS version of Node ("${process.versions.node}").`
    + ` You should consider downgrading to Node 8, as some Rush features may not work.`));
}

import Rush from './Rush';

Rush.launch(Rush.version, false);
