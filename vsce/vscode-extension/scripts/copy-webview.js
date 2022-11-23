const fs = require('fs');
const path = require('path');

const rushCommandViewPackageJsonPath = require.resolve('@rushstack/vsce-rush-command-webview/package.json');

const rushCommandViewPackageFolder = path.dirname(rushCommandViewPackageJsonPath);

const sourceFolder = path.join(rushCommandViewPackageFolder, 'dist');

const cwd = process.cwd();

const targetFolder = path.join(cwd, 'webview', 'rush-command-webview');

fs.mkdirSync(targetFolder, { recursive: true });

const files = fs.readdirSync(sourceFolder);

files.forEach((file) => {
  const sourceFile = path.join(sourceFolder, file);
  const targetFile = path.join(targetFolder, file);
  fs.copyFileSync(sourceFile, targetFile);
  console.log(`Copied ${sourceFile} -> ${targetFile}`);
});
