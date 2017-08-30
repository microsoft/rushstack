<!-- docId=sp-webpart-base.baseclientsidewebpart.canopenpopuponrender -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.canOpenPopupOnRender property

This property indicates whether a web part can open a popup on initial render. In some environments the host re-renders the web parts frequently, and therefor, opening popups during render will cause popups to open repeatedly and hence poor user experience. As an example, the classic SharePoint pages perform postbacks and hence page re-render on all button clicks. If a web part needs to open a popup on render, it should use this API before opening the popup. If this API returns false, the web part should not open popup on initial render. Some web parts that open popups during render are the document embed web part that pops up the file picker on initial render, embedded video web part that pops up the PropertyPane on initial render.

**Signature:**
```javascript
canOpenPopupOnRender: boolean
```
