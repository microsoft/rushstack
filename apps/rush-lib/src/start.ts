// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from './api/Rush';
import { Logging } from '@microsoft/node-core-library';

Logging.registerConsoleLogging();

Rush.launch(Rush.version, false);
