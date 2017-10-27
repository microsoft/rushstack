// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CLI } from './cli/CLI';
import rushVersion from './rushVersion';

CLI.start(rushVersion, false);
