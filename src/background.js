chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_FLOW_DATA') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => window.__manychatFlowData
    }).then(results => {
      const data = results?.[0]?.result;
      sendResponse({ data });
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});
