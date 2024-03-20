// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '../types/IPackageJson';

const apiPath: string = `${window.appContext.serviceUrl}/api`;

export async function checkAliveAsync(): Promise<boolean> {
  try {
    await fetch(`${apiPath}/health`);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Fetches a projects configuration files from the local file system
 *
 * @returns a json object representing a package.json or a text file to be rendered (in the case of readPnpmfile)
 */
export async function readPnpmfileAsync(): Promise<string> {
  try {
    const response = await fetch(`${apiPath}/pnpmfile`);
    return await response.text();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Could not load cjs file: ', e);
    return 'Missing CJS';
  }
}

export async function readPackageJsonAsync(projectPath: string): Promise<IPackageJson | undefined> {
  try {
    const response = await fetch(`${apiPath}/package-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectPath
      })
    });
    return await response.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Could not load package json file: ', e);
    return undefined;
  }
}

export async function readPackageSpecAsync(projectPath: string): Promise<IPackageJson | undefined> {
  try {
    const response = await fetch(`${apiPath}/package-spec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectPath
      })
    });
    return await response.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Could not load cjs file: ', e);
    return undefined;
  }
}
