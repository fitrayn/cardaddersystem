let latestCapture = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'FB_CAPTURE') {
    latestCapture = msg.payload;
    chrome.storage.local.set({ latestCapture });
    sendResponse({ ok: true });
  }
  if (msg && msg.type === 'FB_GET_CAPTURE') {
    if (latestCapture) return sendResponse({ ok: true, payload: latestCapture });
    chrome.storage.local.get(['latestCapture'], (data) => {
      sendResponse({ ok: true, payload: data.latestCapture || null });
    });
    return true;
  }
}); 