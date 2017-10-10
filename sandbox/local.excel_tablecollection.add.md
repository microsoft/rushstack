[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableCollection](local.excel_tablecollection.md) &gt; [add](local.excel_tablecollection.add.md)

# Excel\_TableCollection.add method

Create a new table. The range object or source address determines the worksheet under which the table will be added. If the table cannot be added (e.g., because the address is invalid, or the table would overlap with another table), an error will be thrown. 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
add(address: Excel.Range | string, hasHeaders: boolean): Excel.Table;
```
**Returns:** `Excel.Table`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `address` | `Excel.Range | string` |  |
|  `hasHeaders` | `boolean` |  |

