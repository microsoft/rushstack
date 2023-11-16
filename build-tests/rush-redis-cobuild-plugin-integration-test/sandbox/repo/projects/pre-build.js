/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

setTimeout(() => {
  const outputFolder = path.resolve(process.cwd(), 'dist');
  const outputFile = path.resolve(outputFolder, 'pre-build');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, `Hello world!`);
  console.log('done');
}, 2000);
