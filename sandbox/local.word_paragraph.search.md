[Home](./index) &gt; [local](local.md) &gt; [Word\_Paragraph](local.word_paragraph.md) &gt; [search](local.word_paragraph.search.md)

# Word\_Paragraph.search method

Performs a search with the specified searchOptions on the scope of the paragraph object. The search results are a collection of range objects. 

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

