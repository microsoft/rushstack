/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

const getArgument = (argumentName) => {
  const index = args.findIndex((e) => e.includes(argumentName));
  return index >= 0 ? args[index].replace(`${argumentName}=`, '') : undefined;
};

const shard = getArgument('--shard');

const outputDir = getArgument('--output-directory');

const shardOutputDir = getArgument('--shard-output-directory');

const outputDirectory = shard ? shardOutputDir ?? outputDir : undefined;

setTimeout(() => {
  const outputFolder = shard ? path.resolve(outputDirectory) : path.resolve('dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, `Hello world! ${args.join(' ')}`);
}, 500);
