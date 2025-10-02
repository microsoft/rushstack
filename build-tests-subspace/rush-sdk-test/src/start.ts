// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

console.log('rush-sdk-test loading Rush configuration...');

// Important: Since we're calling an internal API, we need to use the unbundled .d.ts files
// instead of the normal .d.ts rollup
// eslint-disable-next-line import/order
import { RushConfiguration } from '@rushstack/rush-sdk/lib/index';

const config: RushConfiguration = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);

console.log('Calling an internal API...');

// Use a path-based import to access an internal API (do so at your own risk!)
import * as GitEmailPolicy from '@rushstack/rush-sdk/lib/logic/policy/GitEmailPolicy';
console.log(GitEmailPolicy.getEmailExampleLines(config));
