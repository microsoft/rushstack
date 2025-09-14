// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import yaml = require('js-yaml');
import { FileSystem } from '@rushstack/node-core-library';
import type { ApiItem } from '@microsoft/api-extractor-model';
import {
  MarkdownDocumenterFeature,
  type IMarkdownDocumenterFeatureOnBeforeWritePageArgs,
  type IMarkdownDocumenterFeatureOnFinishedArgs
} from '@microsoft/api-documenter';

interface INavigationNode {
  title: string;
  url?: string;
  subitems?: INavigationNode[];
}
interface INavigationFile {
  api_nav: INavigationNode[];
}

export class RushStackFeature extends MarkdownDocumenterFeature {
  private _apiItemsWithPages: Set<ApiItem> = new Set<ApiItem>();

  public onInitialized(): void {
    // eslint-disable-next-line no-console
    console.log('RushStackFeature: onInitialized()');
  }

  public onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void {
    // Add the Jekyll header
    const header: string = [
      '---',
      'layout: page',
      'navigation_source: api_nav',
      'improve_this_button: false',
      '---',
      ''
    ].join('\n');
    eventArgs.pageContent = header + eventArgs.pageContent;

    this._apiItemsWithPages.add(eventArgs.apiItem);
  }

  public onFinished(eventArgs: IMarkdownDocumenterFeatureOnFinishedArgs): void {
    const navigationFile: INavigationFile = {
      api_nav: [
        {
          title: 'API Reference',
          url: '/pages/api/'
        }
      ]
    };
    this._buildNavigation(navigationFile.api_nav, this.context.apiModel);

    const navFilePath: string = path.join(this.context.outputFolder, '..', 'api_nav.yaml');
    const navFileContent: string = yaml.dump(navigationFile, { lineWidth: 120 });

    FileSystem.writeFile(navFilePath, navFileContent, { ensureFolderExists: true });
  }

  private _buildNavigation(parentNodes: INavigationNode[], parentApiItem: ApiItem): void {
    for (const apiItem of parentApiItem.members) {
      if (this._apiItemsWithPages.has(apiItem)) {
        const newNode: INavigationNode = {
          title: apiItem.displayName,
          url: path.posix
            .join('/pages/api/', this.context.documenter.getLinkForApiItem(apiItem)!)
            .replace(/\.md$/, '')
        };
        parentNodes.push(newNode);

        const newNodeSubitems: INavigationNode[] = [];
        this._buildNavigation(newNodeSubitems, apiItem);
        if (newNodeSubitems.length > 0) {
          newNode.subitems = newNodeSubitems;
        }
      } else {
        this._buildNavigation(parentNodes, apiItem);
      }
    }
  }
}
