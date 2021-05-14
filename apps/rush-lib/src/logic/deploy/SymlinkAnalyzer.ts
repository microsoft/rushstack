// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileSystemStats, Sort, InternalError } from '@rushstack/node-core-library';

import * as path from 'path';

/**
 * Represents a file object analyzed by {@link SymlinkAnalyzer}.
 */
export interface IFileNode {
  kind: 'file';
  nodePath: string;
}

/**
 * Represents a folder object analyzed by {@link SymlinkAnalyzer}.
 */
export interface IFolderNode {
  kind: 'folder';
  nodePath: string;
}

/**
 * Represents a symbolic link analyzed by {@link SymlinkAnalyzer}.
 */
export interface ILinkNode {
  kind: 'link';
  nodePath: string;

  /**
   * The immediate target that the symlink resolves to.
   */
  linkTarget: string;
}

export type PathNode = IFileNode | IFolderNode | ILinkNode;

/**
 * Represents a symbolic link reported by {@link SymlinkAnalyzer.reportSymlinks()}.
 */
export interface ILinkInfo {
  kind: 'fileLink' | 'folderLink';

  /**
   * The path of the symbolic link.
   */
  linkPath: string;

  /**
   * The target that the link points to.
   */
  targetPath: string;
}

export class SymlinkAnalyzer {
  // The directory tree discovered so far
  private readonly _nodesByPath: Map<string, PathNode> = new Map<string, PathNode>();

  // The symlinks that we encountered while building the directory tree
  private readonly _linkInfosByPath: Map<string, ILinkInfo> = new Map<string, ILinkInfo>();

  public analyzePath(inputPath: string, preserveLinks: boolean = false): PathNode {
    let pathSegments: string[] = path.resolve(inputPath).split(path.sep);
    let pathSegmentsIndex: number = 0;

    for (;;) {
      const currentPath: string = pathSegments.slice(0, pathSegmentsIndex + 1).join(path.sep);

      if (currentPath === '') {
        // Edge case for a Unix path like "/folder/file" --> [ "", "folder", "file" ]
        ++pathSegmentsIndex;
        continue;
      }

      let currentNode: PathNode | undefined = this._nodesByPath.get(currentPath);
      if (currentNode === undefined) {
        const linkStats: FileSystemStats = FileSystem.getLinkStatistics(currentPath);

        if (linkStats.isSymbolicLink()) {
          const linkTargetPath: string = FileSystem.readLink(currentPath);
          const parentFolder: string = path.join(currentPath, '..');
          const resolvedLinkTargetPath: string = path.resolve(parentFolder, linkTargetPath);
          currentNode = {
            kind: 'link',
            nodePath: currentPath,
            linkTarget: resolvedLinkTargetPath
          };
        } else if (linkStats.isDirectory()) {
          currentNode = {
            kind: 'folder',
            nodePath: currentPath
          };
        } else if (linkStats.isFile()) {
          currentNode = {
            kind: 'file',
            nodePath: currentPath
          };
        } else {
          throw new Error('Unknown object type: ' + currentPath);
        }

        this._nodesByPath.set(currentPath, currentNode);
      }

      ++pathSegmentsIndex;

      if (!preserveLinks) {
        while (currentNode.kind === 'link') {
          const targetNode: PathNode = this.analyzePath(currentNode.linkTarget, true);

          // Have we created an ILinkInfo for this link yet?
          if (!this._linkInfosByPath.has(currentNode.nodePath)) {
            // Follow any symbolic links to determine whether the final target is a directory
            const targetIsDirectory: boolean = FileSystem.getStatistics(targetNode.nodePath).isDirectory();
            const linkInfo: ILinkInfo = {
              kind: targetIsDirectory ? 'folderLink' : 'fileLink',
              linkPath: currentNode.nodePath,
              targetPath: targetNode.nodePath
            };
            this._linkInfosByPath.set(currentNode.nodePath, linkInfo);
          }

          const targetSegments: string[] = targetNode.nodePath.split(path.sep);
          const remainingSegments: string[] = pathSegments.slice(pathSegmentsIndex);
          pathSegments = [...targetSegments, ...remainingSegments];
          pathSegmentsIndex = targetSegments.length;
          currentNode = targetNode;
        }
      }

      if (pathSegmentsIndex >= pathSegments.length) {
        // We reached the end
        return currentNode;
      }

      if (currentNode.kind !== 'folder') {
        // This should never happen, because analyzePath() is always supposed to receive complete paths
        // to real filesystem objects.
        throw new InternalError('The path ends prematurely at: ' + inputPath);
      }
    }
  }

  /**
   * Returns a summary of all the symbolic links encountered by {@link SymlinkAnalyzer.analyzePath}.
   */
  public reportSymlinks(): ILinkInfo[] {
    const list: ILinkInfo[] = [...this._linkInfosByPath.values()];
    Sort.sortBy(list, (x) => x.linkPath);
    return list;
  }
}
