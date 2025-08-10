(function() {
  function inject() {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      (document.head || document.documentElement).appendChild(s);
      s.onload = () => { try { s.remove(); } catch {} };
    } catch {}
  }

  function scrapeTokens() {
    const html = document.documentElement.innerHTML || '';
    const res = {};
    try {
      const dtsgMatch = html.match(/name=\"fb_dtsg\"\s+value=\"([^\"]+)\"/);
      if (dtsgMatch) res.fb_dtsg = dtsgMatch[1];
      const lsdMatch = html.match(/name=\"lsd\"\s+value=\"([^\"]+)\"/);
      if (lsdMatch) res.lsd = lsdMatch[1];
      const spinR = html.match(/\"__spin_r\"\s*:\s*(\d+)/);
      const spinT = html.match(/\"__spin_t\"\s*:\s*(\d+)/);
      const spinB = html.match(/\"__spin_b\"\s*:\s*\"([^\"]+)\"/);
      if (spinR) res.__spin_r = spinR[1];
      if (spinT) res.__spin_t = spinT[1];
      if (spinB) res.__spin_b = spinB[1];
    } catch {}
    return res;
  }

  function toFormBody(body) {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body && typeof body === 'object') {
      try { return new URLSearchParams(body).toString(); } catch {}
    }
    return '';
  }

  function captureRequest(url, method, headers, body, status, responseText) {
    if (!/\/api\/graphql\//.test(url)) return;
    const tokens = scrapeTokens();
    const payload = {
      url, method, headers, body,
      status, responseText,
      tokens,
      at: Date.now()
    };
    chrome.runtime.sendMessage({ type: 'FB_CAPTURE', payload });
  }

  // Intercept fetch
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init && init.method) || 'GET';
      const headers = {};
      if (init && init.headers) {
        for (const [k, v] of Object.entries(init.headers)) headers[k.toLowerCase()] = String(v);
      }
      const reqBody = init && init.body ? init.body : undefined;
      const bodyText = typeof reqBody === 'string' ? reqBody : toFormBody(reqBody);
      const resp = await origFetch.apply(this, arguments);
      if (/\/api\/graphql\//.test(url)) {
        const clone = resp.clone();
        const text = await clone.text().catch(() => '');
        captureRequest(url, method, headers, bodyText, resp.status, text);
      }
      return resp;
    } catch (e) {
      return origFetch.apply(this, arguments);
    }
  };

  // Intercept XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._fb_url = url;
    this._fb_method = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const url = this._fb_url || '';
    const method = this._fb_method || 'GET';
    const bodyText = typeof body === 'string' ? body : toFormBody(body);
    const xhr = this;
    xhr.addEventListener('load', function() {
      try {
        const headers = {};
        const raw = xhr.getAllResponseHeaders().split('\n');
        raw.forEach(line => {
          const idx = line.indexOf(':');
          if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx+1).trim();
        });
        captureRequest(url, method, headers, bodyText, xhr.status, xhr.responseText);
      } catch {}
    });
    return origSend.apply(this, arguments);
  };

  window.addEventListener('message', (e) => {
    try {
      if (!e || !e.data || e.data.source !== 'fb-capture' || e.data.type !== 'CAPTURE') return;
      const payload = e.data.payload || {};
      const tokens = scrapeTokens();
      payload.tokens = tokens;
      chrome.runtime.sendMessage({ type: 'FB_CAPTURE', payload });
    } catch {}
  });

  inject();
})(); 