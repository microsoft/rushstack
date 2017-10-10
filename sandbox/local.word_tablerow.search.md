[Home](./index) &gt; [local](local.md) &gt; [Word\_TableRow](local.word_tablerow.md) &gt; [search](local.word_tablerow.search.md)

# Word\_TableRow.search method

Performs a search with the specified searchOptions on the scope of the row. The search results are a collection of range objects. 

 \[Api set: WordApi 1.3\]

**Signature:**
```javascript
search(searchText: string, searchOptions?: Word.SearchOptions | {
            ignorePunct?: boolean;
            ignoreSpace?: boolean;
            matchCase?: boolean;
            matchPrefix?: boolean;
            matchSuffix?: boolean;
            matchWholeWord?: boolean;
            matchWildcards?: boolean;
        }): Word.RangeCollection;
```
**Returns:** `Word.RangeCollection`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `searchText` | `string` |  |
|  `searchOptions` | `Word.SearchOptions | {
            ignorePunct?: boolean;
            ignoreSpace?: boolean;
            matchCase?: boolean;
            matchPrefix?: boolean;
            matchSuffix?: boolean;
            matchWholeWord?: boolean;
            matchWildcards?: boolean;
        }` |  |

