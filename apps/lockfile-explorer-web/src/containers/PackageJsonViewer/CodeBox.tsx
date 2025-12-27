// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import { Highlight, themes } from 'prism-react-renderer';

// Generate this list by doing console.log(Object.keys(Prism.languages))
// BUT THEN DELETE the APIs that are bizarrely mixed into this namespace:
// "extend", "insertBefore", "DFS"
export type PrismLanguage =
  | 'plain'
  | 'plaintext'
  | 'text'
  | 'txt'
  | 'markup'
  | 'html'
  | 'mathml'
  | 'svg'
  | 'xml'
  | 'ssml'
  | 'atom'
  | 'rss'
  | 'regex'
  | 'clike'
  | 'javascript'
  | 'js'
  | 'actionscript'
  | 'coffeescript'
  | 'coffee'
  | 'javadoclike'
  | 'css'
  | 'yaml'
  | 'yml'
  | 'markdown'
  | 'md'
  | 'graphql'
  | 'sql'
  | 'typescript'
  | 'ts'
  | 'jsdoc'
  | 'flow'
  | 'n4js'
  | 'n4jsd'
  | 'jsx'
  | 'tsx'
  | 'swift'
  | 'kotlin'
  | 'kt'
  | 'kts'
  | 'c'
  | 'objectivec'
  | 'objc'
  | 'reason'
  | 'rust'
  | 'go'
  | 'cpp'
  | 'python'
  | 'py'
  | 'json'
  | 'webmanifest';

export const CodeBox = (props: { code: string; language: PrismLanguage }): React.ReactElement => {
  return (
    <Highlight theme={themes.vsLight} code={props.code} language={props.language}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
};
