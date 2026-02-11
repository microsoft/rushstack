const path = require('path');
const { JsonFile } = require('@rushstack/node-core-library');

const packageJsonPath = path.join(__dirname, '../package.json');

const packageJson = JsonFile.load(packageJsonPath);
delete packageJson['publishOnlyDependencies'];
packageJson.dependencies['@rushstack/rush-amazon-s3-build-cache-plugin'] = packageJson.version;
packageJson.dependencies['@rushstack/rush-azure-storage-build-cache-plugin'] = packageJson.version;
packageJson.dependencies['@rushstack/rush-http-build-cache-plugin'] = packageJson.version;
packageJson.dependencies['@rushstack/rush-npm-publish-plugin'] = packageJson.version;

JsonFile.save(packageJson, packageJsonPath, { updateExistingFile: true });
