// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The warm daemon connect path must not load the @microsoft/rush-lib bundle (hundreds of milliseconds).
// Modules that depend on it are loaded here on demand, only by fallback, rushx, startup and version selection.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type * as RushLibModule from '@microsoft/rush-lib';
import type * as MinimalRushConfigurationModule from '@microsoft/rush/lib/MinimalRushConfiguration';
import type * as VersionSelectedDaemonLauncherModule from '@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher';

export function loadRushLib(): typeof RushLibModule {
  return require('@microsoft/rush-lib');
}

export function loadMinimalRushConfiguration(): typeof MinimalRushConfigurationModule {
  return require('@microsoft/rush/lib/MinimalRushConfiguration');
}

export function loadVersionSelectedDaemonLauncher(): typeof VersionSelectedDaemonLauncherModule {
  return require('@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher');
}

/** Equals `Rush.version`. */
export function getBundledRushVersion(): string {
  return (require('@microsoft/rush-lib/package.json') as { version: string }).version;
}

/** Same search as `RushConfiguration.tryFindRushJsonLocation({ startingFolder })`. */
export function tryFindRushJsonLocation(startingFolder: string): string | undefined {
  let currentFolder: string = startingFolder;
  let parentFolder: string = path.dirname(currentFolder);
  while (parentFolder && parentFolder !== currentFolder) {
    const rushJsonFilename: string = path.join(currentFolder, 'rush.json');
    if (fs.existsSync(rushJsonFilename)) return rushJsonFilename;
    currentFolder = parentFolder;
    parentFolder = path.dirname(currentFolder);
  }
  return undefined;
}
