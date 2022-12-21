'ues strict';

const { FileSystem } = require('@rushstack/node-core-library');

const JS_FILE_EXTENSION = '.js';
const DTS_FILE_EXTENSION = '.d.ts';

module.exports = {
  runAsync: async ({ scopedLogger: { terminal }, heftConfiguration: { buildFolder } }) => {
    // This script looks through the `lib-esnext` folder for modules that only
    // contain types, and copies them to the `lib` folder

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

    const jsInFolderPath = `${buildFolder}/lib-esnext`;
    const dtsInFolderPath = `${buildFolder}/lib-commonjs`;
    const outFolderPath = `${buildFolder}/lib`;
    async function searchAsync(relativeFolderPath) {
      const folderItems = await FileSystem.readFolderItemsAsync(
        relativeFolderPath ? `${jsInFolderPath}/${relativeFolderPath}` : jsInFolderPath
      );
      for (const folderItem of folderItems) {
        const itemName = folderItem.name;
        const relativeItemPath = relativeFolderPath ? `${relativeFolderPath}/${itemName}` : itemName;

        if (folderItem.isDirectory()) {
          await searchAsync(relativeItemPath);
        } else if (folderItem.isFile() && itemName.endsWith(JS_FILE_EXTENSION)) {
          const jsInPath = `${jsInFolderPath}/${relativeItemPath}`;
          const jsFileText = await FileSystem.readFileAsync(jsInPath);
          const strippedJsFileText = stripCommentsFromJsFile(jsFileText);
          if (strippedJsFileText === 'export {};') {
            await FileSystem.ensureFolderAsync(`${outFolderPath}/${relativeFolderPath}`);
            const outJsPath = `${outFolderPath}/${relativeItemPath}`;
            terminal.writeVerboseLine(`Writing stub to ${outJsPath}`);
            await FileSystem.writeFileAsync(outJsPath, 'module.exports = {};');

            const relativeDtsPath = relativeItemPath.slice(0, -JS_FILE_EXTENSION.length) + DTS_FILE_EXTENSION;
            const inDtsPath = `${dtsInFolderPath}/${relativeDtsPath}`;
            const outDtsPath = `${outFolderPath}/${relativeDtsPath}`;
            terminal.writeVerboseLine(`Copying ${inDtsPath} to ${outDtsPath}`);
            await FileSystem.copyFileAsync({ sourcePath: inDtsPath, destinationPath: outDtsPath });
          }
        }
      }
    }

    await searchAsync(undefined);
  }
};
