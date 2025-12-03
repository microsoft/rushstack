// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, type FileSystemStats, Sort } from '@rushstack/node-core-library';

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
 * Represents a symbolic link.
 *
 * @public
 */
export interface ILinkInfo {
  /**
   * The type of link that was encountered.
   */
  kind: 'fileLink' | 'folderLink';

  /**
   * The path to the link, relative to the root of the extractor output folder.
   */
  linkPath: string;

  /**
   * The target that the link points to.
   */
  targetPath: string;
}

export interface ISymlinkAnalyzerOptions {
  requiredSourceParentPath?: string;
}

export interface IAnalyzePathOptions {
  inputPath: string;
  preserveLinks?: boolean;
  shouldIgnoreExternalLink?: (path: string) => boolean;
}

export class SymlinkAnalyzer {
  private readonly _requiredSourceParentPath: string | undefined;

  // The directory tree discovered so far
  private readonly _nodesByPath: Map<string, PathNode> = new Map<string, PathNode>();

  // The symlinks that we encountered while building the directory tree
  private readonly _linkInfosByPath: Map<string, ILinkInfo> = new Map<string, ILinkInfo>();

  public constructor(options: ISymlinkAnalyzerOptions = {}) {
    this._requiredSourceParentPath = options.requiredSourceParentPath;
  }

  public async analyzePathAsync(
    options: IAnalyzePathOptions & { shouldIgnoreExternalLink: (path: string) => boolean }
  ): Promise<PathNode | undefined>;
  public async analyzePathAsync(
    options: IAnalyzePathOptions & { shouldIgnoreExternalLink?: never }
  ): Promise<PathNode>;
  public async analyzePathAsync(options: IAnalyzePathOptions): Promise<PathNode | undefined> {
    const { inputPath, preserveLinks = false, shouldIgnoreExternalLink } = options;

    // First, try to short-circuit the analysis if we've already analyzed this path
    const resolvedPath: string = path.resolve(inputPath);
    const existingNode: PathNode | undefined = this._nodesByPath.get(resolvedPath);
    if (existingNode) {
      return existingNode;
    }

    // Postfix a '/' to the end of the path. This will get trimmed off later, but it
    // ensures that the last path component is included in the loop below.
    let targetPath: string = `${resolvedPath}${path.sep}`;
    let targetPathIndex: number = -1;
    let currentNode: PathNode | undefined;

    while ((targetPathIndex = targetPath.indexOf(path.sep, targetPathIndex + 1)) >= 0) {
      if (targetPathIndex === 0) {
        // Edge case for a Unix path like "/folder/file" --> [ "", "folder", "file" ]
        continue;
      }

      const currentPath: string = targetPath.slice(0, targetPathIndex);
      currentNode = this._nodesByPath.get(currentPath);
      if (currentNode === undefined) {
        const linkStats: FileSystemStats = await FileSystem.getLinkStatisticsAsync(currentPath);
        if (linkStats.isSymbolicLink()) {
          // Link target paths can be relative or absolute, so we need to resolve them
          const linkTargetPath: string = await FileSystem.readLinkAsync(currentPath);
          const resolvedLinkTargetPath: string = path.resolve(path.dirname(currentPath), linkTargetPath);

          // Do a check to make sure that the link target path is not outside the source folder
          if (this._requiredSourceParentPath) {
            const relativeLinkTargetPath: string = path.relative(
              this._requiredSourceParentPath,
              resolvedLinkTargetPath
            );
            if (relativeLinkTargetPath.startsWith('..')) {
              // Symlinks that link outside of the source folder may be ignored. Check to see if we
              // can ignore this one and if so, return undefined.
              if (shouldIgnoreExternalLink?.(currentPath)) {
                return undefined;
              }
              throw new Error(
                `Symlink targets not under folder "${this._requiredSourceParentPath}": ` +
                  `${currentPath} -> ${resolvedLinkTargetPath}`
              );
            }
          }

          currentNode = {
            kind: 'link',
            nodePath: currentPath,
            linkStats,
            linkTarget: resolvedLinkTargetPath
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

      if (!preserveLinks) {
        while (currentNode?.kind === 'link') {
          const targetNode: PathNode = await this.analyzePathAsync({
            inputPath: currentNode.linkTarget,
            preserveLinks: true
          });

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

          const nodeTargetPath: string = targetNode.nodePath;
          const remainingPath: string = targetPath.slice(targetPathIndex);
          targetPath = path.join(nodeTargetPath, remainingPath);
          targetPathIndex = nodeTargetPath.length;
          currentNode = targetNode;
        }
      }

      if (targetPath.length === targetPathIndex + 1) {
        // We've reached the end of the path
        break;
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
