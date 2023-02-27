# webpack-embedded-dependencies-plugin

## Installation

`npm install @rushstack/webpack-embedded-dependencies-plugin --save`

## Overview

A webpack plugin for generating a list of embedded dependencies. Embedded dependencies are third-party packages which are being
bundled into your released code and are oftentimes subject to license, security, and other legal requirements. This plugin
aims to make it easier to generate a list of embedded dependencies and their associated metadata, so they can be analyzed by additional tools.

The plugin also includes the ability to generate a secondary asset which contains the license text for each embedded dependency into a single file called
THIRD-PARTY-NOTICES.html. This is a common legal requirement when deploying services or products containing open-source code.

## Plugin

```typescript
// webpack.config.js
import EmbeddedDependenciesWebpackPlugin from '@rushstack/webpack-embedded-dependencies-plugin';

export default () => {
  /*...*/
  plugins: [
    new EmbeddedDependenciesWebpackPlugin( /* options */ )
  ]
}
```

## Options

### `outputFileName`: `string`

Name of the file to be generated. Defaults to embedded-dependencies.json

```typescript
new EmbeddedDependenciesWebpackPlugin({
  outputFileName: 'my-custom-file-name.json'
})
```

### `generateLicenseFile`: `boolean`

Whether to generate a license file. Defaults to false and will only generate the embedded-dependencies.json file

```typescript
new EmbeddedDependenciesWebpackPlugin({
  generateLicenseFile: true
})
```

### `generateLicenseFileFunction`: `LicenseFileGeneratorFunction`

Function that generates the license file. Defaults to the plugin's internal default generator function but allows you to override it.

```typescript
new EmbeddedDependenciesWebpackPlugin({
  generateLicenseFile: true,
  generateLicenseFileFunction: (packages: IPackageData[]): string => {
    return packages
      .map((pkg) => {
        return `<h2>${pkg.name}</h2><p>${pkg.license}</p>`;
      }).join('');
  }
})
```

### `generatedLicenseFilename`: `LicenseFileName`

```typescript
new EmbeddedDependenciesWebpackPlugin({
  generateLicenseFile: true,
  generatedLicenseFilename: 'custom-license-file-name.html'
})
```

Name of the generated license file. Defaults to THIRD-PARTY-NOTICES.html but can be customized to any name you want.

### `packageFilterPredicate`: `(packageJson: IPackageData, filePath: string) => boolean`

Function that allows you to filter out packages that you don't want to include in any generated files.

```typescript
new EmbeddedDependenciesWebpackPlugin({
  packageFilterPredicate: (packageJson: IPackageData, filePath: string): boolean => {
    return packageJson.name !== 'my-package-to-exclude';
  }
})
```

## Types

### `LicenseFileGeneratorFunction`

`export declare type LicenseFileGeneratorFunction = (packages: IPackageData[]) => string;`

Function type that generates the license file.

```ts
const licenseFileGenerator: LicenseFileGeneratorFunction = (packages: IPackageData[]): string => {
  return packages
    .map((pkg) => {
      return `<h2>${pkg.name}</h2><p>${pkg.license}</p>`;
    }).join('');
}
```

### `LicenseFileName`

``export declare type LicenseFileName = `${string}.${'html' | 'md' | 'txt'}`;``

Loose string type that represents the name of the generated license file. The string must have at least one character and must end with one of the following file extensions: html, md, or txt or else you'll receive a TypeScript error.

```ts
const licenseFileName: LicenseFileName = 'custom-license-file-name.html';
const licenseMarkdownFileName: LicenseFileName = 'custom-license-file-name.md';
const licenseTextFileName: LicenseFileName = 'custom-license-file-name.txt';
```


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/webpack/webpack-embedded-dependencies-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/webpack-embedded-dependencies-plugin` is part of the [Rush Stack](https://rushstack.io/) family of projects.