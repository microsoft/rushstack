// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstItem, IAstItemOptions } from './AstItem';

/**
  * This is an abstract base class for AstModule, AstEnum, and AstStructuredType,
  * which all act as containers for other AstItem definitions.
  */
export abstract class AstItemContainer extends AstItem {
  private _memberItems: Map<string, AstItem> = new Map<string, AstItem>();

  constructor(options: IAstItemOptions) {
    super(options);
  }

  /**
   * Find a member in this namespace by name and return it if found.
   *
   * @param memberName - the name of the exported AstItem
   */
  public getMemberItem(memberName: string): AstItem | undefined {
    return this._memberItems.get(memberName);
  }

  /**
   * Return a list of the child items for this container, sorted alphabetically.
   */
  public getSortedMemberItems(): AstItem[] {
    const astItems: AstItem[] = [];
    this._memberItems.forEach((astItem: AstItem) => {
      astItems.push(astItem);
    });

    return astItems
      .sort((a: AstItem, b: AstItem) => a.name.localeCompare(b.name));
  }

  /**
   * @virtual
   */
  public visitTypeReferencesForAstItem(): void {
    super.visitTypeReferencesForAstItem();

    this._memberItems.forEach((astItem) => {
      astItem.visitTypeReferencesForAstItem();
    });
  }

  /**
   * Add a child item to the container.
   */
  protected addMemberItem(astItem: AstItem): void {
    if (astItem.hasAnyIncompleteTypes()) {
      this.reportWarning(`${astItem.name} has incomplete type information`);
    } else {
      this.innerItems.push(astItem);
      this._memberItems.set(astItem.name, astItem);
      astItem.notifyAddedToContainer(this);
    }
  }
}
