[Home](./index) &gt; [local](local.md) &gt; [Word\_ContentControl](local.word_contentcontrol.md) &gt; [search](local.word_contentcontrol.search.md)

# Word\_ContentControl.search method

Performs a search with the specified searchOptions on the scope of the content control object. The search results are a collection of range objects. 

 \[Api set: WordApi 1.1\]

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

