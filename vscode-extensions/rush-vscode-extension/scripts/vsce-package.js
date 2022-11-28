/* eslint-env es6 */

Error.stackTraceLimit = 500;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// const packageJson = require('../package.json');

// const newPackageJson = { ...packageJson };
// vsce package throws error if dependencies and devDependencies are present in package.json
// So, delete them here and use a new package.json for packaging
// delete newPackageJson.dependencies;
// delete newPackageJson.devDependencies;
const vscePath = path.resolve(__dirname, '../node_modules/.bin/vsce');
// const packageJsonPath = path.resolve(__dirname, '../package.json');

const PACKAGE_NAME = 'rushstack';

const getPackageVersion = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear().toString().slice(2);
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const version = `${year}_${month}_${date}_${hour}_${min}`;
  return version;
};
const PACKAGE_VERSION = getPackageVersion();

const disposes = [];

if (!fs.existsSync(vscePath)) {
  console.error('vsce not found');
  process.exit(1);
}

// backup current package.json
// const backupPackageJsonPath = path.resolve(__dirname, '../package.json.backup');
// const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
// fs.writeFileSync(backupPackageJsonPath, packageJsonContent);

console.log('packaging...');
// mimic package.json for vsce
// fs.writeFileSync(packageJsonPath, JSON.stringify(newPackageJson, null, 2) + '\n');
// console.log('package.json for vsce ready');

// disposes.push(() => {
//   fs.writeFileSync(packageJsonPath, packageJsonContent);
//   fs.unlinkSync(backupPackageJsonPath);
// });

// node_modules back and forth
// const nodeModulesPath = path.resolve(__dirname, '../node_modules');
// const nodeModulesBackupPath = path.resolve(__dirname, '../node_modules.backup');
// fs.renameSync(nodeModulesPath, nodeModulesBackupPath);
// disposes.push(() => {
//   // fs.unlinkSync(nodeModulesPath);
//   fs.renameSync(nodeModulesBackupPath, nodeModulesPath);
// });

const outFilename = `${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix`;

try {
  execSync(`${vscePath} package --no-dependencies --out ${outFilename}`, {
    stdio: 'inherit'
  });
  console.log('vsce package successfully');
} catch (err) {
  if (err) {
    console.error('vsce package error: ', err);
  }
} finally {
  disposes.forEach((fn) => fn());
}
