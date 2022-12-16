// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IPackageJson } from '../types/IPackageJson';

const serviceUrl: string = window.appContext.serviceUrl;

export const checkAlive = async (): Promise<boolean> => {
  try {
    await fetch(`${serviceUrl}/api/health`);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Fetches a projects configuration files from the local file system
 *
 * @returns a json object representing a package.json or a text file to be rendered (in the case of readPnpmfile)
 */
export const readPnpmfile = async (): Promise<string> => {
  try {
    const response = await fetch(`${serviceUrl}/api/pnpmfile`);
    return await response.text();
  } catch (e) {
    console.error('Could not load cjs file: ', e);
    return 'Missing CJS';
  }
};

export const readPackageJson = async (projectPath: string): Promise<IPackageJson | undefined> => {
  try {
    const response = await fetch(`${serviceUrl}/api/package-json`, {
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
    console.error('Could not load package json file: ', e);
    return undefined;
  }
};

export const readPackageSpec = async (projectPath: string): Promise<IPackageJson | undefined> => {
  try {
    const response = await fetch(`${serviceUrl}/api/package-spec`, {
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
    console.error('Could not load cjs file: ', e);
    return undefined;
  }
};
