import ApiItem, { IApiItemOptions } from './ApiItem';

/**
  * This is an abstract base class for ApiPackage, ApiEnum, and ApiStructuredType,
  * which all act as containers for other ApiItem definitions.
  */
abstract class ApiItemContainer extends ApiItem {
  protected memberItems: ApiItem[] = [];

  constructor(options: IApiItemOptions) {
    super(options);
  }

  /**
   * Return a list of the child items for this container, sorted alphabetically.
   */
  public getSortedMemberItems(): ApiItem[] {
    return this.memberItems
      .sort((a: ApiItem, b: ApiItem) => a.name.localeCompare(b.name));
  }

  /**
   * Add a child item to the container.
   */
  protected addMemberItem(apiItem: ApiItem): void {
    this.memberItems.push(apiItem);
  }
}

export default ApiItemContainer;
