(function() {
  function post(type, payload) {
    try { window.postMessage({ source: 'fb-capture', type, payload }, '*'); } catch {}
  }
  function toFormBody(body) {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body && typeof body === 'object') { try { return new URLSearchParams(body).toString(); } catch {} }
    return '';
  }
  function baseMeta() {
    const u = new URL(location.href);
    const asset_id = u.searchParams.get('asset_id') || null;
    return {
      pageUrl: location.href,
      asset_id,
      ua: navigator.userAgent,
      lang: navigator.language
    };
  }
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    const headers = {};
    if (init && init.headers) { try { for (const [k,v] of Object.entries(init.headers)) headers[String(k).toLowerCase()] = String(v); } catch {} }
    const reqBody = init && init.body ? init.body : undefined;
    const bodyText = typeof reqBody === 'string' ? reqBody : toFormBody(reqBody);
    const resp = await origFetch.apply(this, arguments);
    if (/\/api\/graphql\//.test(url)) try {
      const clone = resp.clone();
      const text = await clone.text().catch(() => '');
      post('CAPTURE', { ...baseMeta(), url, method, headers, body: bodyText, status: resp.status, responseText: text });
    } catch {}
    return resp;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._fb_url = url; this._fb_method = method; this._fb_req_headers = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
    try { this._fb_req_headers[String(k).toLowerCase()] = String(v); } catch {}
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const url = this._fb_url || ''; const method = this._fb_method || 'GET';
    const headers = this._fb_req_headers || {};
    const bodyText = typeof body === 'string' ? body : toFormBody(body);
    const xhr = this;
    xhr.addEventListener('load', function() {
      try { post('CAPTURE', { ...baseMeta(), url, method, headers, body: bodyText, status: xhr.status, responseText: xhr.responseText }); } catch {}
    });
    return origSend.apply(this, arguments);
  };
})(); 