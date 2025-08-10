function toCurl(payload) {
  if (!payload) return '';
  const parts = [
    'curl',
    `-X ${payload.method || 'POST'}`,
    `'${payload.url}'`
  ];
  const headers = payload.headers || {};
  for (const [k, v] of Object.entries(headers)) {
    if (!k) continue;
    parts.push(`-H '${k}: ${String(v).replace(/'/g, "'\\''")}'`);
  }
  const body = payload.body || '';
  if (body) parts.push(`--data '${String(body).replace(/'/g, "'\\''")}'`);
  return parts.join(' ');
}

async function refresh() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FB_GET_CAPTURE' }, (resp) => {
      const out = document.getElementById('output');
      if (!resp || !resp.payload) {
        out.value = 'لا يوجد طلبات مُلتقطة بعد';
        return resolve(null);
      }
      out.value = JSON.stringify(resp.payload, null, 2);
      resolve(resp.payload);
    });
  });
}

document.getElementById('refresh').addEventListener('click', () => { refresh(); });

document.getElementById('copy-json').addEventListener('click', async () => {
  const payload = await refresh();
  if (!payload) return;
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
});

document.getElementById('copy-curl').addEventListener('click', async () => {
  const payload = await refresh();
  if (!payload) return;
  const curl = toCurl(payload);
  await navigator.clipboard.writeText(curl);
});

// initial load
refresh(); 