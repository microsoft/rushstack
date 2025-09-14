// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IYamlItem,
  IYamlApiFile,
  IYamlSyntax,
  IYamlReferenceSpec,
  IYamlReference
} from '../yaml/IYamlApiFile';
import type {
  PackageYamlModel,
  EnumYamlModel,
  TypeAliasYamlModel,
  TypeYamlModel,
  FieldYamlModel,
  FunctionYamlModel,
  CommonYamlModel
} from '../yaml/ISDPYamlFile';
import path from 'path';
import { FileSystem, Encoding, NewlineKind } from '@rushstack/node-core-library';
import yaml = require('js-yaml');

export function convertUDPYamlToSDP(folderPath: string): void {
  convert(folderPath, folderPath);
}

function convert(inputPath: string, outputPath: string): void {
  console.log();
  if (!FileSystem.exists(inputPath)) {
    console.error(`input path: ${inputPath} is not exist`);
    return;
  }

  FileSystem.readFolderItemNames(inputPath).forEach((name) => {
    const fpath: string = path.join(inputPath, name);
    if (FileSystem.getStatistics(fpath).isFile()) {
      // only convert yaml
      if (!name.endsWith('.yml')) {
        return;
      }
      // parse file
      const yamlContent: string = FileSystem.readFile(fpath, { encoding: Encoding.Utf8 });
      // only convert universalreference yaml
      const isLegacyYaml: boolean = yamlContent.startsWith('### YamlMime:UniversalReference');
      if (!isLegacyYaml) {
        return;
      }

      console.log(`convert file ${fpath} from udp to sdp`);

      const file: IYamlApiFile = yaml.load(yamlContent) as IYamlApiFile;
      const result: { model: CommonYamlModel; type: string } | undefined = convertToSDP(file);
      if (result && result.model) {
        const stringified: string = `### YamlMime:TS${result.type}\n${yaml.dump(result.model, {
          lineWidth: 120
        })}`;
        FileSystem.writeFile(`${outputPath}/${name}`, stringified, {
          convertLineEndings: NewlineKind.CrLf,
          ensureFolderExists: true
        });
      } else {
        console.log('not target file ', fpath);
      }
    } else {
      // read contents
      convert(fpath, path.join(outputPath, name));
    }
  });
}

function convertToPackageSDP(transfomredClass: IYamlApiFile): PackageYamlModel {
  const element: IYamlItem = transfomredClass.items[0];
  const packageModel: PackageYamlModel = {
    uid: element.uid,
    name: element.name!,
    type: 'package'
  };
  if (element.summary) {
    packageModel.summary = element.summary;
  } else {
    packageModel.summary = '';
  }

  // search in children
  if (element.children) {
    element.children.forEach((child) => {
      if (child.endsWith(':class')) {
        assignPackageModelFields(packageModel, 'classes', child);
      } else if (child.endsWith(':interface')) {
        assignPackageModelFields(packageModel, 'interfaces', child);
      } else if (child.endsWith(':enum')) {
        assignPackageModelFields(packageModel, 'enums', child);
      } else if (child.endsWith(':type')) {
        assignPackageModelFields(packageModel, 'typeAliases', child);
      } else {
        // console.log("other type: ", child)
      }
    });
  }

  for (let i: number = 1; i < transfomredClass.items.length; i++) {
    const ele: IYamlItem = transfomredClass.items[i];
    switch (ele.type) {
      case 'typealias':
        // need generate typeAlias file for this
        break;
      case 'function':
        if (!packageModel.functions) {
          packageModel.functions = [];
        }
        packageModel.functions.push(convertToFunctionSDP(ele, element.uid, transfomredClass));
        break;
      default:
        // console.log(transfomredClass.items[0].name)
        console.log('[warning] not applied type(package): ', ele.type);
    }
  }

  return packageModel;
}

function assignPackageModelFields(
  packageModel: PackageYamlModel,
  name: 'classes' | 'interfaces' | 'enums' | 'typeAliases',
  uid: string
): void {
  if (!packageModel[name]) {
    packageModel[name] = [];
  }
  packageModel[name]!.push(uid);
}

function convertToSDP(transfomredClass: IYamlApiFile): { model: CommonYamlModel; type: string } | undefined {
  const element: IYamlItem = transfomredClass.items[0];
  switch (element.type) {
    case 'class':
    case 'interface':
      return {
        model: convertToTypeSDP(transfomredClass, element.type === 'class'),
        type: 'Type'
      };
    case 'enum':
      if (transfomredClass.items.length < 2) {
        console.log(`[warning] enum ${element.uid}/${element.name} does not have fields`);
        return undefined;
      }
      return { model: convertToEnumSDP(transfomredClass), type: 'Enum' };
    case 'typealias':
      return { model: convertToTypeAliasSDP(element, transfomredClass), type: 'TypeAlias' };
    case 'package':
      return {
        model: convertToPackageSDP(transfomredClass),
        type: 'Package'
      };
    default:
      console.log('not applied type: ', element.type);
      return undefined;
  }
}

function convertToEnumSDP(transfomredClass: IYamlApiFile): EnumYamlModel {
  const element: IYamlItem = transfomredClass.items[0];
  const fields: FieldYamlModel[] = [];
  for (let i: number = 1; i < transfomredClass.items.length; i++) {
    const ele: IYamlItem = transfomredClass.items[i];
    const field: FieldYamlModel = {
      name: ele.name!,
      uid: ele.uid,
      package: element.package!
    };

    if (ele.summary) {
      field.summary = ele.summary;
    } else {
      field.summary = '';
    }

    if (ele.numericValue) {
      field.value = ele.numericValue;
    }
    fields.push(field);
  }

  const result: EnumYamlModel = {
    ...convertCommonYamlModel(element, element.package!, transfomredClass),
    fields: fields
  };
  return result;
}

function convertToTypeAliasSDP(element: IYamlItem, transfomredClass: IYamlApiFile): TypeAliasYamlModel {
  const result: TypeAliasYamlModel = {
    ...convertCommonYamlModel(element, element.package!, transfomredClass)
  } as TypeAliasYamlModel;

  if (element.syntax) {
    result.syntax = element.syntax.content!;
  }
  return result;
}

function convertToTypeSDP(transfomredClass: IYamlApiFile, isClass: boolean): TypeYamlModel {
  const element: IYamlItem = transfomredClass.items[0];
  const constructors: CommonYamlModel[] = [];
  const properties: CommonYamlModel[] = [];
  const methods: CommonYamlModel[] = [];
  const events: CommonYamlModel[] = [];
  for (let i: number = 1; i < transfomredClass.items.length; i++) {
    const ele: IYamlItem = transfomredClass.items[i];
    const item: CommonYamlModel = convertCommonYamlModel(ele, element.package!, transfomredClass);
    if (ele.type === 'constructor') {
      // interface does not need this field
      if (isClass) {
        constructors.push(item);
      }
    } else if (ele.type === 'property') {
      properties.push(item);
    } else if (ele.type === 'method') {
      methods.push(item);
    } else if (ele.type === 'event') {
      events.push(item);
    } else {
      console.log(`[warning] ${ele.uid}#${ele.name} is not applied sub type ${ele.type} for type yaml`);
    }
  }
  const result: TypeYamlModel = {
    ...convertCommonYamlModel(element, element.package!, transfomredClass),
    type: isClass ? 'class' : 'interface'
  };
  delete result.syntax;

  if (constructors.length > 0) {
    result.constructors = constructors;
  }

  if (properties.length > 0) {
    result.properties = properties;
  }

  if (methods.length > 0) {
    result.methods = methods;
  }

  if (events.length > 0) {
    result.events = events;
  }

  if (element.extends && element.extends.length > 0) {
    result.extends = convertSelfTypeToXref(element.extends[0] as string, transfomredClass);
  }
  return result;
}

function convertToFunctionSDP(
  element: IYamlItem,
  packageName: string,
  transfomredClass: IYamlApiFile
): FunctionYamlModel {
  const model: CommonYamlModel = convertCommonYamlModel(element, packageName, transfomredClass);
  // don't need these fields
  delete model.fullName;
  return model;
}

function convertCommonYamlModel(
  element: IYamlItem,
  packageName: string,
  transfomredClass: IYamlApiFile
): CommonYamlModel {
  const result: CommonYamlModel = {
    name: element.name!,
    uid: element.uid,
    package: packageName
  };

  if (element.fullName) {
    result.fullName = element.fullName;
  }

  if (element.summary) {
    result.summary = element.summary;
  } else {
    result.summary = '';
  }

  // because mustache meet same variable in different level
  // such as: { "pre": true, "list": [{}]}
  // if item in list wants to use pre but the pre is not assigned, it will use outer pre field.
  // so, there need to set below variable explict

  if (element.remarks) {
    result.remarks = element.remarks;
  } else {
    result.remarks = '';
  }

  if (element.example) {
    result.example = element.example;
  } else {
    result.example = [];
  }

  result.isPreview = element.isPreview;
  if (!result.isPreview) {
    result.isPreview = false;
  }

  if (element.deprecated) {
    result.isDeprecated = true;
    result.customDeprecatedMessage = element.deprecated.content;
  } else {
    result.isDeprecated = false;
  }

  if (element.syntax) {
    result.syntax = {};

    const syntax: IYamlSyntax = element.syntax;
    result.syntax.content = syntax.content;
    if (syntax.parameters && syntax.parameters.length > 0) {
      syntax.parameters?.forEach((it) => {
        delete it.optional;
        delete it.defaultValue;
      });
      result.syntax.parameters = syntax.parameters.map((it) => {
        return {
          ...it,
          id: it.id!,
          type: convertSelfTypeToXref(escapeMarkdown(it.type![0] as string), transfomredClass)
        };
      });
    }

    if (syntax.return) {
      result.syntax.return = {
        ...syntax.return,
        type: convertSelfTypeToXref(escapeMarkdown(syntax.return.type![0] as string), transfomredClass)
      };
    }
  }

  return result;
}

function escapeMarkdown(name: string): string {
  // eg: [key: string]: string
  const markdownLinkRegEx: RegExp = /^\s*(\[.+\]):(.+)/g;
  return name.replace(markdownLinkRegEx, `$1\\:$2`);
}

function convertSelfTypeToXref(name: string, transfomredClass: IYamlApiFile): string {
  let result: string = name;

  // if complex type, need to get real type from references
  if (result.endsWith(':complex')) {
    const specs: IYamlReferenceSpec[] | undefined = transfomredClass.references?.find((item) => {
      return item.uid === name;
    })?.['spec.typeScript'];

    if (specs && specs.length > 0) {
      result = '';
      for (const spec of specs) {
        // start with ! will be node base type
        if (spec.uid && !spec.uid.startsWith('!')) {
          result += spec.uid;
        } else {
          result += spec.name;
        }
      }
    }
  } else if (result.startsWith('!')) {
    // uid: '!Object:interface'
    // name: Object
    // start with !, not complex type, use reference name directly
    const ref: IYamlReference | undefined = transfomredClass.references?.find((item) => {
      return item.uid === name;
    });
    if (ref && ref.name) {
      result = ref.name;
    }
  }
  // parse < >
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const uidRegEx: RegExp = /(@?[\w\d\-/!~\.]+\:[\w\d\-\(/]+)/g;

  return result.replace(uidRegEx, `<xref uid="$1" />`);
}
