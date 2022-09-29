import axios from 'axios';

export const readCJS = async () => {
  try {
    const cjsFile = (await axios.get('http://localhost:8091/loadCJS')).data;
    return cjsFile;
  } catch (e) {
    console.error('Could not load cjs file: ', e);
  }
};

export const readPackageJSON = async () => {
  try {
    const cjsFile = (await axios.get('http://localhost:8091/loadPackageJSON')).data;
    return JSON.stringify(cjsFile, null, 2);
  } catch (e) {
    console.error('Could not load package json file: ', e);
  }
};

export const readParsedCJS = async () => {
  try {
    const parsedPackageJSON = (await axios.get('http://localhost:8091/parsedCJS')).data;
    console.log('package file: ', parsedPackageJSON);

    return JSON.stringify(parsedPackageJSON, null, 2);
  } catch (e) {
    console.error('Could not load cjs file: ', e);
  }
};
