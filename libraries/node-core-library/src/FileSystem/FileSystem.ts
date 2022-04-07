// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ===============
// COMMON OPERATIONS
// ===============

export { exists } from './exists';
export { existsAsync } from './existsAsync';

export { getStatistics } from './getStatistics';
export { getStatisticsAsync } from './getStatisticsAsync';

export { updateTimes } from './updateTimes';
export { updateTimesAsync } from './updateTimesAsync';

export { changePosixModeBits } from './changePosixModeBits';
export { changePosixModeBitsAsync } from './changePosixModeBitsAsync';

export { getPosixModeBits } from './getPosixModeBits';
export { getPosixModeBitsAsync } from './getPosixModeBitsAsync';

export { formatPosixModeBits } from './formatPosixModeBits';

export { move } from './move';
export { moveAsync } from './moveAsync';

// ===============
// FOLDER OPERATIONS
// ===============

export { ensureFolder } from './ensureFolder';
export { ensureFolderAsync } from './ensureFolderAsync';

export { readFolderItemNames, readFolderItemNames as readFolder } from './readFolderItemNames';
export {
  readFolderItemNamesAsync,
  readFolderItemNamesAsync as readFolderAsync
} from './readFolderItemNamesAsync';

export { readFolderItems } from './readFolderItems';
export { readFolderItemsAsync } from './readFolderItemsAsync';

export { deleteFolder } from './deleteFolder';
export { deleteFolderAsync } from './deleteFolderAsync';

export { ensureEmptyFolder } from './ensureEmptyFolder';
export { ensureEmptyFolderAsync } from './ensureEmptyFolderAsync';

// ===============
// FILE OPERATIONS
// ===============

export { writeFile } from './writeFile';
export { writeFileAsync } from './writeFileAsync';

export { appendToFile } from './appendToFile';
export { appendToFileAsync } from './appendToFileAsync';

export { readFile } from './readFile';
export { readFileAsync } from './readFileAsync';

export { readFileToBuffer } from './readFileToBuffer';
export { readFileToBufferAsync } from './readFileToBufferAsync';

export { copyFile } from './copyFile';
export { copyFileAsync } from './copyFileAsync';

export { copyFiles } from './copyFiles';
export { copyFilesAsync } from './copyFilesAsync';

export { deleteFile } from './deleteFile';
export { deleteFileAsync } from './deleteFileAsync';

// ===============
// LINK OPERATIONS
// ===============

export { getLinkStatistics } from './getLinkStatistics';
export { getLinkStatisticsAsync } from './getLinkStatisticsAsync';

export { readLink } from './readLink';
export { readLinkAsync } from './readLinkAsync';

export { createSymbolicLinkJunction } from './createSymbolicLinkJunction';
export { createSymbolicLinkJunctionAsync } from './createSymbolicLinkJunctionAsync';

export { createSymbolicLinkFile } from './createSymbolicLinkFile';
export { createSymbolicLinkFileAsync } from './createSymbolicLinkFileAsync';

export { createSymbolicLinkFolder } from './createSymbolicLinkFolder';
export { createSymbolicLinkFolderAsync } from './createSymbolicLinkFolderAsync';

export { createHardLink } from './createHardLink';
export { createHardLinkAsync } from './createHardLinkAsync';

export { getRealPath } from './getRealPath';
export { getRealPathAsync } from './getRealPathAsync';

// ===============
// UTILITY FUNCTIONS
// ===============
export { isExistError } from './isExistError';
export { isNotExistError } from './isNotExistError';
export { isFileDoesNotExistError } from './isFileDoesNotExistError';
export { isFolderDoesNotExistError } from './isFolderDoesNotExistError';
export { isUnlinkNotPermittedError } from './isUnlinkNotPermittedError';
export { isErrnoException } from './isErrnoException';
