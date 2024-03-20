# @rushstack/tree-pattern

This is a simple, fast pattern matcher for JavaScript tree structures.  It was designed for ESLint rules and
transforms that match parse trees such as produced by [Esprima](https://esprima.org/). However, it can be used
with any JSON-like data structure.

## Usage

Suppose we are fixing up obsolete `Promise` calls, and we need to match an input like this:

```ts
Promise.fulfilled(123);
```

The parsed subtree looks like this:
```js
{
  "type": "Program",
  "body": [
    {
      "type": "ExpressionStatement",
      "expression": {  // <---- expressionNode
        "type": "CallExpression",
        "callee": {
          "type": "MemberExpression",
          "object": {
            "type": "Identifier",
            "name": "Promise"
          },
          "property": {
            "type": "Identifier",
            "name": "fulfilled"
          },
          "computed": false,
          "optional": false
        },
        "arguments": [
          {
            "type": "Literal",
            "value": 123,
            "raw": "123"
          }
        ],
        "optional": false
      }
    }
  ],
  "sourceType": "module"
}
```

Throwing away the details that we don't care about, we can specify a pattern expression with the parts
that need to be present:
```js
const pattern1: TreePattern = new TreePattern({
  type: 'CallExpression',
  callee: {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'Promise'
    },
    property: {
      type: 'Identifier',
      name: 'fulfilled'
    },
    computed: false
  }
});
```

Then when our visitor encounters an `ExpressionStatement`, we can match the `expressionNode` like this:
```js
if (pattern1.match(expressionNode)) {
  console.log('Success!');
}
```

## Capturing matched subtrees

Suppose we want to generalize this to match any API such as `Promise.thing(123);` or `Promise.otherThing(123);`.
We can use a "tag" to extract the matching identifier:

```js
const pattern2: TreePattern = new TreePattern({
  type: 'CallExpression',
  callee: {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'Promise'
    },
    property: TreePattern.tag('promiseMethod', {
      type: 'Identifier'
    }),
    computed: false
  }
});
```

On a successful match, the tagged `promiseMethod` subtree can be retrieved like this:
```ts
interface IMyCaptures {
  // Captures the "promiseMethod" tag specified using TreePattern.tag()
  promiseMethod?: { name?: string }; // <--- substitute your real AST interface here
}

const captures: IMyCaptures = {};

if (pattern2.match(node, captures)) {
  // Prints: "Matched fulfilled"
  console.log('Matched ' + captures?.promiseMethod?.name);
}
```

## Alternative subtrees

The `oneOf` API enables you to write patterns that match alternative subtrees.

```ts
const pattern3: TreePattern = new TreePattern({
  animal: TreePattern.oneOf([
    { kind: 'dog', bark: 'loud' },
    { kind: 'cat', meow: 'quiet' }
  ])
});

if (pattern3.match({ animal: { kind: 'dog', bark: 'loud' } })) {
  console.log('I can match dog.');
}

if (pattern3.match({ animal: { kind: 'cat', meow: 'quiet' } })) {
  console.log('I can match cat, too.');
}
```

For example, maybe we want to match `Promise['fulfilled'](123);` as well as `Promise.fulfilled(123);`.
If the structure of the expressions is similar enough, `TreePattern.oneOf` avoids having to create two
separate patterns.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/tree-pattern/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/tree-pattern/)

`@rushstack/tree-pattern` is part of the [Rush Stack](https://rushstack.io/) family of projects.
