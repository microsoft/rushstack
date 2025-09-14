// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '../types/IPackageJson';
import type { ILfxWorkspace } from '../types/lfxProtocol';

const SERVICE_URL: string = window.appContext.serviceUrl;

export async function checkAliveAsync(): Promise<boolean> {
  try {
    await fetch(`${SERVICE_URL}/api/health`);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read the contents of a text file under the workspace directory.
 * @param relativePath - a file path that is relative to the working directory.
 */
export async function readWorkspaceConfigAsync(): Promise<ILfxWorkspace> {
  let response: Response;

  try {
    response = await fetch(`${SERVICE_URL}/api/workspace`);
    if (!response.ok) {
      const responseText: string = await response.text();
      const error = new Error(
        'The operation failed: ' + (responseText.trim() || 'An unknown error occurred')
      );
      // eslint-disable-next-line no-console
      console.error('readWorkspaceConfigAsync() failed: ', error);
      throw error;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Network error in readWorkspaceConfigAsync(): ', e);
    throw new Error('Network error: ' + (e.message || 'An unknown error occurred'));
  }

  const responseJson: ILfxWorkspace = await response.json();
  return responseJson;
}

/**
 * Fetches a projects configuration files from the local file system
 *
 * @returns a json object representing a package.json or a text file to be rendered (in the case of readPnpmfile)
 */
export async function readPnpmfileAsync(): Promise<string> {
  try {
    const response = await fetch(`${SERVICE_URL}/api/pnpmfile`);
    return await response.text();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Could not load cjs file: ', e);
    return 'Missing CJS';
  }
}

export async function readPackageJsonAsync(projectPath: string): Promise<IPackageJson | undefined> {
  try {
    const response = await fetch(`${SERVICE_URL}/api/package-json`, {
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
    const response = await fetch(`${SERVICE_URL}/api/package-spec`, {
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
