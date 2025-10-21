// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { pairReactDomRenderUnmountRule } from '../pair-react-dom-render-unmount';

const ruleTester: RuleTester = getRuleTesterWithProject();

ruleTester.run('pair-react-dom-render-unmount', pairReactDomRenderUnmountRule, {
  invalid: [
    {
      code: [
        "import ReactDOM from 'react-dom';",
        'ReactDOM.render();',
        'ReactDOM.render();',
        'ReactDOM.render();',
        'ReactDOM.unmountComponentAtNode();',
        'ReactDOM.unmountComponentAtNode();'
      ].join('\n'),
      errors: [
        { messageId: 'error-pair-react-dom-render-unmount', line: 2 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 3 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 4 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 5 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 6 }
      ]
    },
    {
      code: ["import * as ReactDOM from 'react-dom';", 'ReactDOM.render();'].join('\n'),
      errors: [{ messageId: 'error-pair-react-dom-render-unmount', line: 2 }]
    },
    {
      code: ["import ReactDOM from 'react-dom';", 'ReactDOM.unmountComponentAtNode();'].join('\n'),
      errors: [{ messageId: 'error-pair-react-dom-render-unmount', line: 2 }]
    },
    {
      code: [
        "import { render, unmountComponentAtNode } from 'react-dom';",
        'render();',
        'unmountComponentAtNode();',
        'unmountComponentAtNode();'
      ].join('\n'),
      errors: [
        { messageId: 'error-pair-react-dom-render-unmount', line: 2 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 3 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 4 }
      ]
    },
    {
      code: [
        "import { render as ReactRender, unmountComponentAtNode as ReactUnmount } from 'react-dom';",
        'ReactRender();',
        'ReactUnmount();',
        'ReactUnmount();'
      ].join('\n'),
      errors: [
        { messageId: 'error-pair-react-dom-render-unmount', line: 2 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 3 },
        { messageId: 'error-pair-react-dom-render-unmount', line: 4 }
      ]
    }
  ],
  valid: [
    {
      code: [
        "import ReactDOM from 'react-dom';",
        'ReactDOM.render();',
        'ReactDOM.render();',
        'ReactDOM.render();',
        'ReactDOM.unmountComponentAtNode();',
        'ReactDOM.unmountComponentAtNode();',
        'ReactDOM.unmountComponentAtNode();'
      ].join('\n')
    },
    {
      code: [
        "import * as ReactDOM from 'react-dom';",
        'ReactDOM.render();',
        'ReactDOM.unmountComponentAtNode();'
      ].join('\n')
    },
    {
      code: [
        "import ReactDOM from 'react-dom';",
        'ReactDOM.render();',
        'ReactDOM.unmountComponentAtNode();'
      ].join('\n')
    },
    {
      code: [
        "import { render, unmountComponentAtNode } from 'react-dom';",
        'render();',
        'unmountComponentAtNode();'
      ].join('\n')
    },
    {
      code: [
        "import { render as ReactRender, unmountComponentAtNode as ReactUnmount } from 'react-dom';",
        'ReactRender();',
        'ReactUnmount();'
      ].join('\n')
    }
  ]
});
