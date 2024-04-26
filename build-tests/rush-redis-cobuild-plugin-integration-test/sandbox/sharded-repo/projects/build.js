/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

const shardIndex = args.findIndex((e) => e.includes('--shard'));
const shard = shardIndex >= 0 ? args[shardIndex].replace('--shard=', '') : undefined;

const outputDirectory = args.findIndex((e) => e.includes('--output-directory'));
const outputDir = outputDirectory >= 0 ? args[outputDirectory].replace('--output-directory=', '') : undefined;

setTimeout(() => {
  const outputFolder = shard ? path.resolve(outputDir) : path.resolve('dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, `Hello world! ${args.join(' ')}`);
}, 500);
