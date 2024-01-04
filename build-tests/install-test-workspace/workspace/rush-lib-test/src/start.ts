// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('rush-lib-test loading Rush configuration...');

// Important: Since we're calling an internal API, we need to use the unbundled .d.ts files
// instead of the normal .d.ts rollup
import { RushConfiguration } from '@microsoft/rush-lib/lib/';

const config = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);

console.log('Calling an internal API...');

// Use a path-based import to access an internal API (do so at your own risk!)
import { VersionMismatchFinder } from '@microsoft/rush-lib/lib/logic/versionMismatch/VersionMismatchFinder';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/node-core-library';

const terminal = new Terminal(new ConsoleTerminalProvider());
VersionMismatchFinder.ensureConsistentVersions(config, terminal);
