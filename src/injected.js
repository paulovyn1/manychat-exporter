// ManyChat Exporter - injected.js v1.6
// Roda no contexto REAL da página — tem acesso ao window.__INIT__, XHR, fetch
(function () {
  window.__mcLogs = [];
  window.__mcXhrUrls = [];
  window.__manychatFlowData = null;

  function log(msg, data) {
    const entry = { time: new Date().toISOString().split('T')[1].split('.')[0], msg, data: data || null };
    window.__mcLogs.push(entry);
  }

  log('Injected script carregado');

  // ── Intercepta XHR ──────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._mcUrl = url;
    if (url && !url.includes('analytics') && !url.includes('sentry') && !url.includes('collect')) {
      window.__mcXhrUrls.push(url);
      if (window.__mcXhrUrls.length > 60) window.__mcXhrUrls.shift();
    }
    return origOpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      if (this._mcUrl && this._mcUrl.includes('getFlowData')) {
        log('XHR getFlowData capturado', { url: this._mcUrl, status: this.status });
        try {
          const data = JSON.parse(this.responseText);
          if (data?.flow) {
            window.__manychatFlowData = data;
            log('Fluxo salvo via XHR!', { name: data.flow.name });
            window.dispatchEvent(new CustomEvent('__mc_flow_ready', { detail: data }));
          }
        } catch (e) { log('XHR parse error', { error: e.message }); }
      }
    });
    return origSend.apply(this, args);
  };

  // ── Intercepta fetch ────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    return origFetch.apply(this, arguments).then(response => {
      if (url.includes('getFlowData')) {
        log('fetch getFlowData capturado', { url, status: response.status });
        response.clone().json().then(data => {
          if (data?.flow) {
            window.__manychatFlowData = data;
            log('Fluxo salvo via fetch!', { name: data.flow.name });
            window.dispatchEvent(new CustomEvent('__mc_flow_ready', { detail: data }));
          }
        }).catch(e => log('fetch parse error', { error: e.message }));
      }
      return response;
    });
  };

  // ── Fetch ativo usando credenciais reais da página ───────────
  window.__manychatFetchFlow = async function () {
    const url = window.location.href;
    log('Tentando fetch ativo');

    // CSRF e bundle — agora com acesso real ao window
    const csrfToken = window.__INIT__?.['app.csrf_token'] || window.__INIT__?.['csrf_token'] || '';
    const frontendBundle = String(window.STATIC_VERSION || '');
    log('Credenciais', {
      csrf: csrfToken ? csrfToken.substring(0, 8) + '...' : 'NÃO ENCONTRADO',
      bundle: frontendBundle || 'NÃO ENCONTRADO'
    });

    const nsMatch = url.match(/--([^/]+?)(?:\/|$)/) || url.match(/\/cms\/files\/([^/]+)/);
    const pageMatch = url.match(/\/(?:fb)?(\d{4,})\//);
    if (!nsMatch || !pageMatch) return { error: 'URL não reconhecida' };

    const ns = nsMatch[1].replace(/^\d+--/, '');
    const pageId = pageMatch[1];
    log('Extraído', { ns, pageId });

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    if (frontendBundle) headers['x-frontend-bundle'] = frontendBundle;

    const endpoint = `https://app.manychat.com/fb${pageId}/flow/getFlowData?ns=${ns}`;
    log('Chamando endpoint', { endpoint, headers: Object.keys(headers) });

    try {
      const resp = await origFetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers
      });
      log('Resposta', { status: resp.status, ok: resp.ok });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.flow) {
          window.__manychatFlowData = data;
          log('Fluxo obtido com sucesso!', { name: data.flow.name });
          return data;
        }
        log('Retornou 200 mas sem flow', { keys: Object.keys(data || {}) });
        return { error: 'Resposta sem flow', data };
      } else {
        const text = await resp.text();
        log('Erro HTTP', { status: resp.status, body: text.substring(0, 150) });
        return { error: `HTTP ${resp.status}` };
      }
    } catch (e) {
      log('Erro no fetch', { error: e.message });
      return { error: e.message };
    }
  };

  // ── Importa fluxo via patchDraft ────────────────────────────
  window.__manychatImportFlow = async function (jsonString) {
    log('Iniciando importação de fluxo');

    let payload;
    try {
      payload = JSON.parse(jsonString);
    } catch (e) {
      log('JSON inválido', { error: e.message });
      return { error: 'JSON inválido: ' + e.message };
    }

    if (!payload.batch?.contents || !Array.isArray(payload.batch.contents)) {
      log('Payload sem batch.contents');
      return { error: 'JSON inválido: falta batch.contents' };
    }

    const url = window.location.href;
    const nsMatch = url.match(/--([^/]+?)(?:\/|$)/) || url.match(/\/cms\/files\/([^/]+)/);
    const pageMatch = url.match(/\/(?:fb)?(\d{4,})\//);
    if (!nsMatch || !pageMatch) {
      log('URL não reconhecida para importação');
      return { error: 'URL não reconhecida. Abra um fluxo no editor do ManyChat.' };
    }

    // Formato novo do ManyChat pode ser "{id}--content{...}" — extrai só o content{...}
    const rawNs = nsMatch[1];
    const ns = rawNs.replace(/^\d+--/, '');
    const pageId = pageMatch[1];
    log('Contexto de importação', { rawNs, ns, pageId });

    const csrfToken = window.__INIT__?.['app.csrf_token'] || window.__INIT__?.['csrf_token'] || '';
    const frontendBundle = String(window.STATIC_VERSION || '');

    if (!csrfToken) {
      log('CSRF token ausente');
      return { error: 'CSRF token não encontrado. Recarregue a página do ManyChat.' };
    }

    // Substitui namespace em todos os blocos pelo ns do fluxo aberto
    payload.ns = ns;
    payload.client_id = crypto.randomUUID();
    payload.batch.contents = payload.batch.contents.map(block => ({ ...block, namespace: ns }));

    log('Payload pronto', { blocks: payload.batch.contents.length, client_id: payload.client_id });

    const endpoint = `https://app.manychat.com/fb${pageId}/flow/patchDraft`;

    try {
      const resp = await origFetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'x-csrf-token': csrfToken,
          'x-frontend-bundle': frontendBundle,
        },
        body: JSON.stringify(payload)
      });

      log('Resposta patchDraft', { status: resp.status, ok: resp.ok });

      if (resp.ok) {
        const data = await resp.json();
        const apiStatus = data?.status;
        log('Importação concluída!', { apiStatus, data });
        if (apiStatus && apiStatus !== 'success') {
          return { error: `API recusou (status: "${apiStatus}"): ${JSON.stringify(data).substring(0, 150)}` };
        }
        return { success: true, apiStatus, debug: { ns, pageId }, rawResponse: JSON.stringify(data).substring(0, 300) };
      } else {
        const text = await resp.text();
        log('Erro HTTP patchDraft', { status: resp.status, body: text.substring(0, 200) });
        return { error: `Erro HTTP ${resp.status}: ${text.substring(0, 150)}` };
      }
    } catch (e) {
      log('Erro no fetch patchDraft', { error: e.message });
      return { error: e.message };
    }
  };

  log('Injected pronto', {
    csrf: !!window.__INIT__?.['app.csrf_token'],
    bundle: window.STATIC_VERSION
  });
})();
