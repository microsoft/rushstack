// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from './api/Rush';

const rushVersion: string = Rush.version;
Rush.launch(rushVersion, { isManaged: false });
