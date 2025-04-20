'use strict';

const { FileSystem, Async, AsyncQueue } = require('@rushstack/node-core-library');

const JS_FILE_EXTENSION = '.js';
const DTS_FILE_EXTENSION = '.d.ts';

module.exports = {
  runAsync: async ({
    heftTaskSession: {
      logger: { terminal }
    },
    heftConfiguration: { buildFolderPath }
  }) => {
    // We're using a Webpack plugin called `@rushstack/webpack-deep-imports-plugin` to
    // examine all of the modules that are imported by the entrypoints (index, and the start* scripts)
    // to `rush-lib` and generate stub JS files in the `lib` folder that reference the original modules
    // in the webpack bundle. The plugin also copies the `.d.ts` files for those modules to the `lib` folder.
    //
    // A limitation of this approach is that only modules that contain runtime code end up in the Webpack
    // bundle, so only modules that contain runtime code get stubs and have their `.d.ts` files copied. This
    // creates a problem when a `.d.ts` file references a module that doesn't have runtime code (i.e. -
    // a `.d.ts` file that only contains types).
    //
    // This script looks through the `lib-esm` folder for `.js` files that were produced by the TypeScript
    // compiler from `.ts` files that contain no runtime code and generates stub `.js` files for them in the
    // `lib` folder and copies the corresponding `.d.ts` files to the `lib`. This ensures that the `.d.ts`
    // files that end up in the `lib` folder don't have any unresolved imports. This is tested by the
    // `rush-lib-declaration-paths-test` project in the `build-tests`

    function stripCommentsFromJsFile(jsFileText) {
      jsFileText = jsFileText.replace(/^\s*\/\/.*$/gm, '');
      jsFileText = jsFileText.replace(/\/\*.*\*\//gs, '');
      return jsFileText;
    }

    const inFolderPath = `${buildFolderPath}/lib-esm`;
    const outFolderPath = `${buildFolderPath}/lib`;
    const emptyModuleBuffer = Buffer.from('module.exports = {};', 'utf8');
    const folderPathQueue = new AsyncQueue([undefined]);

    await Async.forEachAsync(
      folderPathQueue,
      async ([relativeFolderPath, callback]) => {
        const folderPath = relativeFolderPath ? `${inFolderPath}/${relativeFolderPath}` : inFolderPath;
        const folderItems = await FileSystem.readFolderItemsAsync(folderPath);
        for (const folderItem of folderItems) {
          const itemName = folderItem.name;
          if (itemName === 'IRushPlugin.js') {
            debugger;
          }

          const relativeItemPath = relativeFolderPath ? `${relativeFolderPath}/${itemName}` : itemName;

          if (folderItem.isDirectory()) {
            folderPathQueue.push(relativeItemPath);
          } else if (folderItem.isFile() && itemName.endsWith(JS_FILE_EXTENSION)) {
            const jsInPath = `${inFolderPath}/${relativeItemPath}`;
            const jsFileText = await FileSystem.readFileAsync(jsInPath);
            const strippedJsFileText = stripCommentsFromJsFile(jsFileText);
            if (strippedJsFileText.match(/^\s*export\s+\{\s*\}\s*;?\s*$/gs)) {
              const outJsPath = `${outFolderPath}/${relativeItemPath}`;
              terminal.writeVerboseLine(`Writing stub to ${outJsPath}`);
              await FileSystem.writeFileAsync(outJsPath, emptyModuleBuffer, {
                ensureFolderExists: true
              });
            }
          }
        }
        callback();
      },
      { concurrency: 10 }
    );
  }
};
