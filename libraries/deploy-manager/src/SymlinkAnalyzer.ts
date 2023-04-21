// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, FileSystemStats, Sort } from '@rushstack/node-core-library';

import * as path from 'path';

export interface IPathNodeBase {
  kind: 'file' | 'folder' | 'link';
  nodePath: string;
  linkStats: FileSystemStats;
}

/**
 * Represents a file object analyzed by {@link SymlinkAnalyzer}.
 */
export interface IFileNode extends IPathNodeBase {
  kind: 'file';
}

/**
 * Represents a folder object analyzed by {@link SymlinkAnalyzer}.
 */
export interface IFolderNode extends IPathNodeBase {
  kind: 'folder';
}

/**
 * Represents a symbolic link analyzed by {@link SymlinkAnalyzer}.
 */
export interface ILinkNode extends IPathNodeBase {
  kind: 'link';

  /**
   * The immediate target that the symlink resolves to.
   */
  linkTarget: string;
}

export type PathNode = IFileNode | IFolderNode | ILinkNode;

/**
 * Represents a symbolic link reported by {@link SymlinkAnalyzer.reportSymlinks}.
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

  public async analyzePathAsync(inputPath: string, preserveLinks: boolean = false): Promise<PathNode> {
    // First, try to short-circuit the analysis if we've already analyzed this path
    const resolvedPath: string = path.resolve(inputPath);
    const existingNode: PathNode | undefined = this._nodesByPath.get(resolvedPath);
    if (existingNode) {
      return existingNode;
    }

    let currentNode: PathNode | undefined;
    let pathSegments: string[] = resolvedPath.split(path.sep);

    for (let i: number = 0; i < pathSegments.length; i++) {
      if (!preserveLinks) {
        while (currentNode?.kind === 'link') {
          const targetNode: PathNode = await this.analyzePathAsync(currentNode.linkTarget, true);

          // Have we created an ILinkInfo for this link yet?
          if (!this._linkInfosByPath.has(currentNode.nodePath)) {
            // Follow any symbolic links to determine whether the final target is a directory
            const targetStats: FileSystemStats = await FileSystem.getStatisticsAsync(targetNode.nodePath);
            const targetIsDirectory: boolean = targetStats.isDirectory();
            const linkInfo: ILinkInfo = {
              kind: targetIsDirectory ? 'folderLink' : 'fileLink',
              linkPath: currentNode.nodePath,
              targetPath: targetNode.nodePath
            };
            this._linkInfosByPath.set(currentNode.nodePath, linkInfo);
          }

          const targetSegments: string[] = targetNode.nodePath.split(path.sep);
          const remainingSegments: string[] = pathSegments.slice(i);
          pathSegments = [...targetSegments, ...remainingSegments];
          i = targetSegments.length;
          currentNode = targetNode;
        }
      }

      const currentPath: string = pathSegments.slice(0, i + 1).join(path.sep);
      if (currentPath === '') {
        // Edge case for a Unix path like "/folder/file" --> [ "", "folder", "file" ]
        continue;
      }

      currentNode = this._nodesByPath.get(currentPath);
      if (currentNode === undefined) {
        const linkStats: FileSystemStats = await FileSystem.getLinkStatisticsAsync(currentPath);
        if (linkStats.isSymbolicLink()) {
          const linkTargetPath: string = await FileSystem.readLinkAsync(currentPath);
          currentNode = {
            kind: 'link',
            nodePath: currentPath,
            linkTarget: linkTargetPath,
            linkStats
          };
        } else if (linkStats.isDirectory()) {
          currentNode = {
            kind: 'folder',
            nodePath: currentPath,
            linkStats
          };
        } else if (linkStats.isFile()) {
          currentNode = {
            kind: 'file',
            nodePath: currentPath,
            linkStats
          };
        } else {
          throw new Error('Unknown object type: ' + currentPath);
        }
        this._nodesByPath.set(currentPath, currentNode);
      }
    }

    if (!currentNode) {
      throw new Error('Unable to analyze path: ' + inputPath);
    }

    return currentNode;
  }

  /**
   * Returns a summary of all the symbolic links encountered by {@link SymlinkAnalyzer.analyzePathAsync}.
   */
  public reportSymlinks(): ILinkInfo[] {
    const list: ILinkInfo[] = [...this._linkInfosByPath.values()];
    Sort.sortBy(list, (x) => x.linkPath);
    return list;
  }
}
