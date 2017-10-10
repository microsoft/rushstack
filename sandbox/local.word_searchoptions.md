[Home](./index) &gt; [local](local.md) &gt; [Word\_SearchOptions](local.word_searchoptions.md)

# Word\_SearchOptions class

Specifies the options to be included in a search operation. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`ignorePunct`](local.word_searchoptions.ignorepunct.md) |  | `boolean` | Gets or sets a value that indicates whether to ignore all punctuation characters between words. Corresponds to the Ignore punctuation check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`ignoreSpace`](local.word_searchoptions.ignorespace.md) |  | `boolean` | Gets or sets a value that indicates whether to ignore all whitespace between words. Corresponds to the Ignore whitespace characters check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`matchCase`](local.word_searchoptions.matchcase.md) |  | `boolean` | Gets or sets a value that indicates whether to perform a case sensitive search. Corresponds to the Match case check box in the Find and Replace dialog box (Edit menu). <p/> \[Api set: WordApi 1.1\] |
|  [`matchPrefix`](local.word_searchoptions.matchprefix.md) |  | `boolean` | Gets or sets a value that indicates whether to match words that begin with the search string. Corresponds to the Match prefix check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`matchSuffix`](local.word_searchoptions.matchsuffix.md) |  | `boolean` | Gets or sets a value that indicates whether to match words that end with the search string. Corresponds to the Match suffix check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`matchWholeWord`](local.word_searchoptions.matchwholeword.md) |  | `boolean` | Gets or sets a value that indicates whether to find operation only entire words, not text that is part of a larger word. Corresponds to the Find whole words only check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`matchWildcards`](local.word_searchoptions.matchwildcards.md) |  | `boolean` | Gets or sets a value that indicates whether the search will be performed using special search operators. Corresponds to the Use wildcards check box in the Find and Replace dialog box. <p/> \[Api set: WordApi 1.1\] |
|  [`matchWildCards`](local.word_searchoptions.matchwildcards.md) |  | `boolean` |  |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.word_searchoptions.load.md) |  | `Word.SearchOptions` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`newObject(context)`](local.word_searchoptions.newobject.md) |  | `Word.SearchOptions` | Create a new instance of Word.SearchOptions object |
|  [`set(properties, options)`](local.word_searchoptions.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_searchoptions.tojson.md) |  | `{
            "ignorePunct": boolean;
            "ignoreSpace": boolean;
            "matchCase": boolean;
            "matchPrefix": boolean;
            "matchSuffix": boolean;
            "matchWholeWord": boolean;
            "matchWildcards": boolean;
        }` |  |

