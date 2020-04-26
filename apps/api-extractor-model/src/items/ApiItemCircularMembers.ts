import { ApiItem, ApiItemKind, IApiItemJson } from './ApiItem';
import { DeserializerContext } from '../model/DeserializerContext';
import { Deserializer } from '../model/Deserializer';
import { ApiParameterListMixin } from '../mixins/ApiParameterListMixin';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';

ApiItem.deserialize = (jsonObject: IApiItemJson, context: DeserializerContext): ApiItem => {
  return Deserializer.deserialize(context, jsonObject);
}

ApiItem.prototype.getMergedSiblings = function (): ReadonlyArray<ApiItem> {
  const parent: ApiItem | undefined = this._parent;
  if (parent && ApiItemContainerMixin.isBaseClassOf(parent)) {
    return parent._getMergedSiblingsForMember(this);
  }
  return [];
}

ApiItem.prototype.getScopedNameWithinPackage = function (): string {
  const reversedParts: string[] = [];

  for (let current: ApiItem | undefined = this; current !== undefined; current = current.parent) {
    if (current.kind === ApiItemKind.Model
      || current.kind === ApiItemKind.Package
      || current.kind === ApiItemKind.EntryPoint) {
      break;
    }
    if (reversedParts.length !== 0) {
      reversedParts.push('.');
    } else {
      switch (current.kind) {
        case ApiItemKind.CallSignature:
        case ApiItemKind.ConstructSignature:
        case ApiItemKind.Constructor:
        case ApiItemKind.IndexSignature:
          // These functional forms don't have a proper name, so we don't append the "()" suffix
          break;
        default:
          if (ApiParameterListMixin.isBaseClassOf(current)) {
            reversedParts.push('()');
          }
      }
    }
    reversedParts.push(current.displayName);
  }

  return reversedParts.reverse().join('');
}
