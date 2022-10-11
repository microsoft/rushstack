export const readCJS = async () => {
  try {
    const response = await fetch('http://localhost:8091/loadCJS');
    return await response.text();
  } catch (e) {
    console.error('Could not load cjs file: ', e);
    return 'Missing CJS';
  }
};

export const readPackageJSON = async () => {
  try {
    const response = await fetch('http://localhost:8091/loadPackageJSON');
    const cjsFile = await response.json();
    return JSON.stringify(cjsFile, null, 2);
  } catch (e) {
    console.error('Could not load package json file: ', e);
  }
};

export const readParsedCJS = async () => {
  try {
    const response = await fetch('http://localhost:8091/parsedCJS');
    const parsedPackageJSON = await response.json();

    return JSON.stringify(parsedPackageJSON, null, 2);
  } catch (e) {
    console.error('Could not load cjs file: ', e);
  }
};
