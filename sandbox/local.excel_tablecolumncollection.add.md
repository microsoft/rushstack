[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableColumnCollection](local.excel_tablecolumncollection.md) &gt; [add](local.excel_tablecolumncollection.add.md)

# Excel\_TableColumnCollection.add method

Adds a new column to the table. 

 \[Api set: ExcelApi 1.1 requires an index smaller than the total column count; 1.4 allows index to be optional (null or -1) and will append a column at the end; 1.4 allows name parameter at creation time.\]

**Signature:**
```javascript
add(index?: number, values?: Array<Array<boolean | string | number>> | boolean | string | number, name?: string): Excel.TableColumn;
```
**Returns:** `Excel.TableColumn`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `index` | `number` |  |
|  `values` | `Array<Array<boolean | string | number>> | boolean | string | number` |  |
|  `name` | `string` |  |

