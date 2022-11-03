import { IPackageJson } from '../types/IPackageJson';

export const readPnpmfile = async (): Promise<string> => {
  try {
    const response = await fetch(`http://localhost:8091/api/pnpmfile`);
    return await response.text();
  } catch (e) {
    console.error('Could not load cjs file: ', e);
    return 'Missing CJS';
  }
};

export const readPackageJson = async (projectPath: string): Promise<IPackageJson | undefined> => {
  try {
    const response = await fetch(`http://localhost:8091/api/package-json`, {
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
    const response = await fetch(`http://localhost:8091/api/package-spec`, {
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
