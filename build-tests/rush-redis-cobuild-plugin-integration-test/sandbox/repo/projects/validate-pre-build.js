/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

const outputFolder = path.resolve(process.cwd(), 'dist');
const outputFile = path.resolve(outputFolder, 'pre-build');

if (!FileSystem.exists(outputFile)) {
  console.error(`${outputFile} does not exist.`);
  process.exit(1);
}

console.log(`${outputFile} exists`);
