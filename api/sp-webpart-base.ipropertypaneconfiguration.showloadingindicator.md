<!-- docId=sp-webpart-base.ipropertypaneconfiguration.showloadingindicator -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [IPropertyPaneConfiguration](./sp-webpart-base.ipropertypaneconfiguration.md)

# IPropertyPaneConfiguration.showLoadingIndicator property

Indicates whether the loading indicator should be displayed on top of the property pane or not. This feature is intended to be used when the user is waiting on a promise to resolve. If set to true, overlay loading indicator appears after 500ms (web part author can override this behavior by using overlayLoadingIndicator property). The reason why we are not showing it immediately is that our intent is to never show the loading indicator. But in real life async requests could take long and it becomes necessary to display a loading indicator to the end user.

**Signature:**
```javascript
showLoadingIndicator: boolean
```
