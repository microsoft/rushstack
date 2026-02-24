'use strict';

const { FileSystem, Async, AsyncQueue } = require('@rushstack/node-core-library');

const JS_FILE_EXTENSION = '.js';

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
    // in the webpack bundle.
    //
    // A limitation of this approach is that only modules that contain runtime code end up in the Webpack
    // bundle, so only modules that contain runtime code get stubs. This
    // creates a problem when a `.d.ts` file references a module that doesn't have runtime code (i.e. -
    // a `.ts` file that only contains types).
    //
    // This script looks through the `lib-intermediate-esm` folder for `.js` files that were produced by the TypeScript
    // compiler from `.ts` files that contain no runtime code and generates stub `.js` files for them in the
    // `lib-commonjs` folder. This ensures that all modules have corresponding JS stubs. This is tested by the
    // `rush-lib-declaration-paths-test` project in the `build-tests`

    function stripCommentsFromJsFile(jsFileText) {
      const lines = jsFileText.split('\n');
      const resultLines = [];
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('//')) {
          continue;
        }

        resultLines.push(trimmedLine);
      }

      return resultLines.join('\n');
    }

    const jsInFolderPath = `${buildFolderPath}/lib-intermediate-esm`;
    const outCjsFolderPath = `${buildFolderPath}/lib-commonjs`;
    const emptyModuleBuffer = Buffer.from('module.exports = {};', 'utf8');
    const folderPathQueue = new AsyncQueue([undefined]);

    await Async.forEachAsync(
      folderPathQueue,
      async ([relativeFolderPath, callback]) => {
        const folderPath = relativeFolderPath ? `${jsInFolderPath}/${relativeFolderPath}` : jsInFolderPath;
        const folderItems = await FileSystem.readFolderItemsAsync(folderPath);
        for (const folderItem of folderItems) {
          const itemName = folderItem.name;
          const relativeItemPath = relativeFolderPath ? `${relativeFolderPath}/${itemName}` : itemName;

          if (folderItem.isDirectory()) {
            folderPathQueue.push(relativeItemPath);
          } else if (folderItem.isFile() && itemName.endsWith(JS_FILE_EXTENSION)) {
            const jsInPath = `${jsInFolderPath}/${relativeItemPath}`;
            const jsFileText = await FileSystem.readFileAsync(jsInPath);
            const strippedJsFileText = stripCommentsFromJsFile(jsFileText);
            if (strippedJsFileText === 'export {};') {
              const outJsPath = `${outCjsFolderPath}/${relativeItemPath}`;
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
