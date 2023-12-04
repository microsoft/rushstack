// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IPathTreeNode<TLabel> {
  encounteredLabels: Set<TLabel>;
  label?: TLabel;
  paths: Record<string, IPathTreeNode<TLabel>>;
}

/**
 * This is a tool for determining if a set of paths overlap. For example 'lib' and 'lib/x' overlap,
 * 'lib/x' and 'lib/y' do not.
 */
export class OverlappingPathAnalyzer<TLabel> {
  private readonly _root: IPathTreeNode<TLabel> = {
    encounteredLabels: new Set<TLabel>(),
    paths: {}
  };

  public addPathAndGetFirstEncounteredLabels(path: string, label: TLabel): TLabel[] | undefined {
    const pathParts: string[] = path.split('/');
    let currentNode: IPathTreeNode<TLabel> = this._root;
    let currentNodeIsNew: boolean = false;
    let labelWasAlreadyPresentInCurrentNode: boolean = false;
    for (const pathPart of pathParts) {
      if (pathPart === '') {
        continue;
      }

      if (currentNode.label) {
        return [currentNode.label];
      }

      if (!currentNode.paths[pathPart]) {
        currentNodeIsNew = true;
        currentNode = currentNode.paths[pathPart] = {
          encounteredLabels: new Set<TLabel>(),
          paths: {}
        };
      } else {
        currentNodeIsNew = false;
        currentNode = currentNode.paths[pathPart];
      }

      labelWasAlreadyPresentInCurrentNode = currentNode.encounteredLabels.has(label);
      if (!labelWasAlreadyPresentInCurrentNode) {
        currentNode.encounteredLabels.add(label);
      }
    }

    if (currentNodeIsNew) {
      currentNode.label = label;
      return undefined;
    } else if (labelWasAlreadyPresentInCurrentNode) {
      return Array.from(currentNode.encounteredLabels);
    } else {
      const clonedEncounteredLabels: Set<TLabel> = new Set<TLabel>(currentNode.encounteredLabels);
      clonedEncounteredLabels.delete(label);
      return Array.from(clonedEncounteredLabels);
    }
  }
}
