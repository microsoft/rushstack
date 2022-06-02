const path = require('path');
const fs = require('fs');

const packageJsonPath = path.join(__dirname, '../package.json');

const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8');
const packageJson = JSON.parse(packageJsonRaw);
packageJson.name = `@rushstack/module-minifier-plugin`;
if (!packageJson.version.startsWith('5.')) {
  throw new Error(`Webpack 5 Module minifier plugin is expected to start with major version 5`);
}
const formatted = JSON.stringify(packageJson, undefined, 2);
fs.writeFileSync(packageJsonPath, formatted, 'utf8');
