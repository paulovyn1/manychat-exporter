// ManyChat Exporter - Interceptor v1.2
(function () {
  window.__mcLogs = [];
  function log(msg, data) {
    const entry = { time: new Date().toISOString(), msg, data: data || null };
    window.__mcLogs.push(entry);
    console.log('[MCExporter]', msg, data || '');
  }

  log('Interceptor carregado', { url: window.location.href });

  // ── Intercepta XHR ──────────────────────────────────────────
  window.__mcXhrUrls = [];
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._mcUrl = url;
    // Registra todas as URLs para debug (exceto ruído)
    if (url && !url.includes('analytics') && !url.includes('sentry') && !url.includes('collect')) {
      window.__mcXhrUrls.push(url);
      if (window.__mcXhrUrls.length > 60) window.__mcXhrUrls.shift();
    }
    return originalOpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      if (this._mcUrl && this._mcUrl.includes('getFlowData')) {
        log('XHR getFlowData capturado', { url: this._mcUrl, status: this.status });
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.flow) {
            window.__manychatFlowData = data;
            log('Fluxo salvo via XHR', { name: data.flow.name });
          } else {
            log('XHR retornou mas sem flow', { keys: Object.keys(data || {}) });
          }
        } catch (e) {
          log('XHR parse error', { error: e.message });
        }
      }
    });
    return originalSend.apply(this, args);
  };

  // ── Intercepta fetch ────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    return originalFetch.apply(this, arguments).then(response => {
      if (url.includes('getFlowData')) {
        log('fetch getFlowData capturado', { url, status: response.status });
        const clone = response.clone();
        clone.json().then(data => {
          if (data?.flow) {
            window.__manychatFlowData = data;
            log('Fluxo salvo via fetch', { name: data.flow.name });
          } else {
            log('fetch retornou mas sem flow', { keys: Object.keys(data || {}) });
          }
        }).catch(e => log('fetch parse error', { error: e.message }));
      }
      return response;
    });
  };

  // ── Fetch ativo ──────────────────────────────────────────────
  window.__manychatFetchFlow = async function () {
    const url = window.location.href;
    log('Tentando obter fluxo', { url });

    const nsMatch = url.match(/--([^/]+?)(?:\/|$)/);
    const pageMatch = url.match(/\/(?:fb)?(\d{4,})\//);
    if (!nsMatch || !pageMatch) {
      log('URL não reconhecida');
      return { error: 'URL não reconhecida' };
    }
    const ns = nsMatch[1];
    const pageId = pageMatch[1];
    log('Extraído', { ns, pageId });

    // Pega o CSRF token do window.__INIT__
    let csrfToken = '';
    try {
      csrfToken = window.__INIT__?.['app.csrf_token'] || window.__INIT__?.['csrf_token'] || '';
      log('CSRF token', { found: !!csrfToken, preview: csrfToken ? csrfToken.substring(0, 10) + '...' : 'não encontrado' });
    } catch(e) { log('Erro ao buscar CSRF', { error: e.message }); }

    // Pega o x-frontend-bundle do window.STATIC_VERSION
    let frontendBundle = '';
    try {
      frontendBundle = String(window.STATIC_VERSION || '');
      log('Frontend bundle', { value: frontendBundle });
    } catch(e) {}

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    if (frontendBundle) headers['x-frontend-bundle'] = frontendBundle;

    // Endpoint correto descoberto via Network tab
    const endpoint = `https://app.manychat.com/fb${pageId}/flow/getFlowData?ns=${ns}`;
    try {
      log('Tentando endpoint correto', { endpoint });
      const resp = await originalFetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers
      });
      log('Status', { status: resp.status, ok: resp.ok });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.flow) {
          window.__manychatFlowData = data;
          log('Fluxo obtido!', { name: data.flow.name });
          return data;
        }
        log('Retornou mas sem flow', { keys: Object.keys(data || {}) });
      } else {
        const text = await resp.text();
        log('Erro na resposta', { status: resp.status, body: text.substring(0, 200) });
      }
    } catch (e) {
      log('Erro no fetch', { error: e.message });
    }

    log('Falhou — mas o interceptor vai capturar quando a página recarregar');
    return { error: 'Recarregue a página (F5) com a extensão ativa e tente novamente.' };
  };

  log('Interceptor pronto');
})();
