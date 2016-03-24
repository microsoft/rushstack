# Description
`gulp-core-build-webpack` is a plugin for gulp-core-build which introduces the ability to bundle various source files into a set of bundles, using webpack. 

# Tasks
## WebpackTask

### Description
This task invokes webpack using a consumer-specified `webpack.config.js` on a package.

### Command Line Options
If the `--initwebpack` flag is passed to the command line, this task will initialize a `webpack.config.js` which bundles `lib/index.js` into `dist/{packagename}.js as a UMD module.

### Config
```typescript
interface IWebpackConfig {
  configPath: string;
}
```
* **configPath** used to specify the local package relative path to a `webpack.config.js`

Usage:
```typescript
build.webpack.setConfig({
  configPath: "./webpack.config.js"
})
```
