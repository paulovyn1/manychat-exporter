// popup.js
// ManyChat Flow Exporter — © Paulo Vinicio (@paulovyn1)
// Repositório oficial: https://github.com/paulovyn1/manychat-exporter
// Redistribuição ou modificação não autorizada é proibida.

const AUTHOR = 'Paulo Vinicio (@paulovyn1)';
const REPO   = 'https://github.com/paulovyn1/manychat-exporter';
const WA_SUPPORT = '5584987811023';

let flowData = null;

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isManyChat(url) {
  return url && url.includes('app.manychat.com');
}

async function fetchFlowData(tabId) {
  // 1. Tenta cache do injected (capturado via XHR/fetch interceptado)
  try {
    const r1 = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__manychatFlowData || window.__mcFlowDataBridge || null
    });
    if (r1?.[0]?.result?.flow) return r1[0].result;
  } catch (e) {}

  // 2. Fetch ativo via função exposta pelo injected.js
  try {
    const r2 = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        if (typeof window.__manychatFetchFlow === 'function') {
          return await window.__manychatFetchFlow();
        }
        return { error: 'Função __manychatFetchFlow não encontrada. Recarregue a página (F5).' };
      }
    });
    const result = r2?.[0]?.result;
    if (result?.flow) return result;
    if (result?.error) window.__lastFetchError = result;
  } catch (e) {
    window.__lastFetchError = { error: e.message };
  }

  return null;
}

async function getLogs(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const logs = window.__mcLogs || [];
        const xhrUrls = window.__mcXhrUrls || [];
        // Adiciona URLs XHR como entradas de log extras para debug
        if (xhrUrls.length > 0) {
          logs.push({ time: new Date().toISOString(), msg: '── URLs XHR capturadas ──', data: null });
          xhrUrls.forEach(u => logs.push({ time: '', msg: u, data: null }));
        }
        return logs;
      }
    });
    return r?.[0]?.result || [];
  } catch (e) { return []; }
}

function setStatus(state, name) {
  const dot = document.getElementById('status-dot');
  const nameEl = document.getElementById('flow-name');
  dot.className = 'status-dot ' + state;
  nameEl.textContent = name;
}

function showHint(id) {
  document.querySelectorAll('.hint').forEach(h => h.classList.remove('visible'));
  if (id) document.getElementById(id)?.classList.add('visible');
}

function enableButtons(enabled) {
  document.getElementById('btn-json').disabled = !enabled;
  document.getElementById('btn-html').disabled = !enabled;
}

function updateStats(data) {
  if (!data?.flow) return;
  const flow = data.flow;
  const contents = flow.contents || [];
  const msgBlocks = contents.filter(c => c.type === 'instagram' || c.type === 'facebook');

  document.getElementById('stats-row').style.display = 'flex';
  document.getElementById('stat-blocks').textContent = contents.length;
  document.getElementById('stat-sent').textContent = flow.flow_stats?.sent_unq || '—';
  document.getElementById('stat-channel').textContent =
    flow.has_instagram_channel ? 'IG' :
    flow.has_fb_channel ? 'FB' :
    flow.has_whatsapp_channel ? 'WA' : '—';
}

async function init() {
  const vEl = document.getElementById('ext-version');
  if (vEl) vEl.textContent = chrome.runtime.getManifest().version;

  const tab = await getCurrentTab();

  if (!isManyChat(tab.url)) {
    document.getElementById('not-manychat').style.display = 'block';
    return;
  }

  document.getElementById('main-content').style.display = 'block';
  setStatus('loading', 'Verificando...');

  flowData = await fetchFlowData(tab.id);

  if (flowData?.flow) {
    setStatus('found', flowData.flow.name || 'Fluxo sem nome');
    enableButtons(true);
    updateStats(flowData);
    showHint(null);
    hideLogs();
  } else {
    setStatus('error', 'Nenhum fluxo detectado');
    enableButtons(false);
    showHint('hint-no-flow');
    const logs = await getLogs(tab.id);
    showLogs(logs);
  }

  document.getElementById('refresh-btn').addEventListener('click', async () => {
    setStatus('loading', 'Recarregando...');
    hideLogs();
    flowData = await fetchFlowData(tab.id);
    if (flowData?.flow) {
      setStatus('found', flowData.flow.name || 'Fluxo sem nome');
      enableButtons(true);
      updateStats(flowData);
      showHint(null);
    } else {
      setStatus('error', 'Nenhum fluxo detectado');
      enableButtons(false);
      showHint('hint-no-flow');
      const logs = await getLogs(tab.id);
      showLogs(logs);
    }
  });

  document.getElementById('btn-json').addEventListener('click', exportJSON);
  document.getElementById('btn-html').addEventListener('click', exportHTML);
  document.getElementById('btn-import').addEventListener('click', importFlow);
}

// ─── EXPORT JSON ───────────────────────────────────────────────
function exportJSON() {
  if (!flowData) return;
  const json = JSON.stringify(flowData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(flowData.flow.name) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showHint('hint-success');
  setTimeout(() => showHint(null), 2500);
}

// ─── EXPORT HTML VISUAL ────────────────────────────────────────
function exportHTML() {
  if (!flowData) return;
  const html = generateCanvasHTML(flowData.flow);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(flowData.flow.name) + '.html';
  a.click();
  URL.revokeObjectURL(url);
  showHint('hint-success');
  setTimeout(() => showHint(null), 2500);
}

// ─── GERADOR HTML CANVAS ───────────────────────────────────────
function generateCanvasHTML(flow) {
  const contents = flow.contents || [];
  const coords = flow.coordinates || {};

  // OID → bloco
  const blockByOid = {};
  contents.forEach(c => { if (c.data?._oid) blockByOid[c.data._oid] = c; });

  // Bounds
  const positions = Object.values(coords).filter(p => p.x !== undefined);
  if (!positions.length) return '<html><body>Sem coordenadas</body></html>';
  const BLOCK_W = 260;
  const PAD = 300;
  const minX = Math.min(...positions.map(p => p.x)) - PAD;
  const minY = Math.min(...positions.map(p => p.y)) - PAD;
  const maxX = Math.max(...positions.map(p => p.x)) + BLOCK_W + PAD;
  const maxY = Math.max(...positions.map(p => p.y)) + 800 + PAD;
  const canvasW = maxX - minX;
  const canvasH = maxY - minY;

  // posMap normalizado
  const posMap = {};
  Object.entries(coords).forEach(([oid, pos]) => {
    posMap[oid] = { x: pos.x - minX, y: pos.y - minY };
  });

  // Calcular alturas reais de cada bloco para posicionar botões
  const blockHeights = {};
  contents.forEach(c => {
    blockHeights[c.data?._oid] = estimateBlockHeight(c);
  });

  // Coletar todas as conexões com posições de origem precisas
  const connections = buildConnectionsV2(contents, posMap, blockHeights, BLOCK_W);

  // Blocos HTML
  const blocksHTML = contents.map(c => {
    const oid = c.data?._oid;
    const pos = posMap[oid] || { x: 0, y: 0 };
    return renderBlockV2(c, pos, BLOCK_W);
  }).join('\n');

  // Nó de início
  const startPos = posMap['startingStep'];
  const startHTML = startPos
    ? `<div class="start-node" style="left:${startPos.x + BLOCK_W/2 - 40}px;top:${startPos.y + 8}px;"></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(flow.name)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;background:#f0f2f5;font-family:'Inter',sans-serif;}

/* Toolbar */
.tb{position:fixed;top:0;left:0;right:0;height:44px;background:#fff;border-bottom:1px solid #e5e7eb;
  display:flex;align-items:center;gap:10px;padding:0 14px;z-index:1000;box-shadow:0 1px 3px rgba(0,0,0,.07);}
.tb-title{font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px;}
.tb-sp{flex:1;}
.tb-badge{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:5px;padding:3px 8px;
  font-size:11px;color:#6b7280;}
.tb-badge b{color:#111;}
.tb-hint{font-size:11px;color:#9ca3af;}

/* Canvas */
.cw{position:fixed;top:44px;left:0;right:0;bottom:0;overflow:hidden;cursor:grab;}
.cw.dragging{cursor:grabbing;}
.cv{position:absolute;transform-origin:0 0;}

/* Grid */
.cv::before{content:'';position:absolute;inset:0;
  background-image:radial-gradient(circle,#d1d5db 1px,transparent 1px);
  background-size:24px 24px;opacity:.5;}

/* SVG */
.svg-layer{position:absolute;top:0;left:0;overflow:visible;pointer-events:none;}

/* Start node */
.start-node{position:absolute;width:80px;height:24px;
  background:#6366f1;border-radius:12px;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;color:#fff;letter-spacing:.3px;}

/* Block */
.blk{position:absolute;width:${BLOCK_W}px;background:#fff;border-radius:10px;
  border:1.5px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.06);
  font-family:'Inter',sans-serif;}
.blk:hover{border-color:#6366f1;box-shadow:0 2px 16px rgba(99,102,241,.12);}

/* Block header */
.bh{display:flex;align-items:center;gap:7px;padding:8px 10px 7px;
  border-bottom:1px solid #f3f4f6;border-radius:10px 10px 0 0;}
.bh-icon{width:20px;height:20px;border-radius:5px;
  display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
.bh-type{font-size:10px;color:#9ca3af;font-weight:500;}
.bh-name{font-size:11px;font-weight:600;color:#374151;flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* Instagram header accent */
.blk-ig .bh{border-top:2.5px solid #e1306c;}
.blk-ig .bh-icon{background:#fce7f3;}
.blk-action .bh{border-top:2.5px solid #f59e0b;}
.blk-action .bh-icon{background:#fef3c7;}
.blk-condition .bh{border-top:2.5px solid #3b82f6;}
.blk-condition .bh-icon{background:#dbeafe;}
.blk-goto .bh{border-top:2.5px solid #10b981;}
.blk-goto .bh-icon{background:#d1fae5;}

/* Block body */
.bb{padding:8px 10px;}

/* Message bubble */
.msg{background:#f9fafb;border:1px solid #f3f4f6;border-radius:7px;
  padding:7px 9px;margin-bottom:5px;font-size:11px;line-height:1.5;
  color:#374151;white-space:pre-wrap;word-break:break-word;}
.msg:last-child{margin-bottom:0;}

/* Delay */
.delay{display:inline-flex;align-items:center;gap:4px;
  background:#fff;border:1px solid #e5e7eb;border-radius:20px;
  padding:2px 8px;font-size:10px;color:#6b7280;margin-bottom:5px;}
.delay svg{width:11px;height:11px;flex-shrink:0;}

/* Buttons */
.btn-row{margin-top:6px;border-top:1px solid #f3f4f6;padding-top:6px;}
.btn-item{display:flex;align-items:center;justify-content:space-between;
  padding:6px 9px;border:1px solid #e5e7eb;border-radius:7px;
  font-size:11px;color:#374151;font-weight:500;margin-bottom:4px;
  background:#fff;cursor:default;}
.btn-item:last-child{margin-bottom:0;}
.btn-item.url{border-color:#dbeafe;background:#eff6ff;color:#2563eb;}
.btn-dot-out{width:10px;height:10px;border-radius:50%;border:2px solid #d1d5db;flex-shrink:0;}

/* Action items */
.act{font-size:11px;color:#6b7280;padding:4px 0;border-bottom:1px solid #f3f4f6;
  display:flex;align-items:flex-start;gap:6px;}
.act:last-child{border-bottom:none;}
.act-tag{font-size:10px;background:#fef3c7;border:1px solid #fde68a;
  border-radius:4px;padding:1px 5px;color:#92400e;white-space:nowrap;flex-shrink:0;}
.act-val{color:#374151;font-size:11px;word-break:break-all;}

/* Condition */
.cond-if{font-size:11px;color:#2563eb;background:#eff6ff;
  border:1px solid #bfdbfe;border-radius:6px;padding:5px 8px;margin-bottom:4px;}
.cond-else{font-size:11px;color:#059669;background:#ecfdf5;
  border:1px solid #a7f3d0;border-radius:6px;padding:5px 8px;}

/* Goto */
.goto-val{font-size:11px;color:#059669;background:#ecfdf5;
  border:1px solid #a7f3d0;border-radius:6px;padding:5px 8px;word-break:break-all;}

/* Next step footer */
.bf{padding:5px 10px 8px;display:flex;align-items:center;justify-content:flex-end;gap:5px;}
.bf-label{font-size:10px;color:#9ca3af;}
.bf-dot{width:10px;height:10px;border-radius:50%;border:2px solid #d1d5db;}

/* Stats */
.bs{display:flex;gap:5px;padding:5px 10px 8px;border-top:1px solid #f3f4f6;flex-wrap:wrap;}
.bs-chip{font-size:10px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:4px;padding:2px 5px;}
.bs-chip b{color:#374151;}

/* Zoom */
.zc{position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;gap:3px;z-index:1000;}
.zb{width:30px;height:30px;border-radius:7px;background:#fff;border:1px solid #e5e7eb;
  color:#374151;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 1px 3px rgba(0,0,0,.08);}
.zb:hover{border-color:#6366f1;color:#6366f1;}
.zl{text-align:center;font-size:10px;color:#9ca3af;padding:2px 0;}
</style>
</head>
<body>

<div class="tb">
  <div class="tb-title">${escapeHtml(flow.name)}</div>
  <div class="tb-sp"></div>
  <div class="tb-badge">Blocos <b>${contents.length}</b></div>
  <div class="tb-badge">Enviados <b>${flow.flow_stats?.sent_unq || 0}</b></div>
  <div class="tb-badge">Lidos <b>${flow.flow_stats?.read_unq || 0}</b></div>
  <div class="tb-badge">Cliques <b>${flow.flow_stats?.clicked_unq || 0}</b></div>
  <div class="tb-hint">Scroll = zoom &nbsp;·&nbsp; Drag = mover</div>
</div>

<div class="cw" id="cw">
  <div class="cv" id="cv" style="width:${canvasW}px;height:${canvasH}px;">
    <svg class="svg-layer" id="svg-layer" width="${canvasW}" height="${canvasH}">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#9ca3af"/>
        </marker>
        <marker id="arr-purple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#6366f1"/>
        </marker>
        <marker id="arr-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#10b981"/>
        </marker>
        <marker id="arr-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6"/>
        </marker>
      </defs>
      ${connections}
    </svg>
    ${startHTML}
    ${blocksHTML}
  </div>
</div>

<div class="zc">
  <button class="zb" id="zi">+</button>
  <div class="zl" id="zl">100%</div>
  <button class="zb" id="zo">−</button>
  <button class="zb" id="zf" style="font-size:11px;">⊞</button>
</div>

<script>
(function(){
  const cw=document.getElementById('cw');
  const cv=document.getElementById('cv');
  const CW=${canvasW}, CH=${canvasH};
  let sc=1,tx=0,ty=0,drag=false,lx,ly;
  function apply(){
    cv.style.transform='translate('+tx+'px,'+ty+'px) scale('+sc+')';
    document.getElementById('zl').textContent=Math.round(sc*100)+'%';
  }
  function fit(){
    const vw=cw.clientWidth, vh=cw.clientHeight;
    sc=Math.min((vw-60)/CW,(vh-60)/CH,1);
    sc=Math.max(sc,0.04);
    tx=(vw-CW*sc)/2; ty=(vh-CH*sc)/2;
    apply();
  }
  window.addEventListener('load',fit); fit();
  cw.addEventListener('wheel',e=>{
    e.preventDefault();
    const d=e.deltaY>0?.88:1.12;
    const ns=Math.min(Math.max(sc*d,.03),4);
    const r=cw.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    tx=mx-(mx-tx)*(ns/sc); ty=my-(my-ty)*(ns/sc); sc=ns; apply();
  },{passive:false});
  cw.addEventListener('mousedown',e=>{if(e.button!==0)return;drag=true;lx=e.clientX;ly=e.clientY;cw.classList.add('dragging');});
  document.addEventListener('mousemove',e=>{if(!drag)return;tx+=e.clientX-lx;ty+=e.clientY-ly;lx=e.clientX;ly=e.clientY;apply();});
  document.addEventListener('mouseup',()=>{drag=false;cw.classList.remove('dragging');});
  document.getElementById('zi').onclick=()=>{const c=cw.clientWidth/2,d=cw.clientHeight/2;sc=Math.min(sc*1.25,4);tx=c-(c-tx)*1.25;ty=d-(d-ty)*1.25;apply();};
  document.getElementById('zo').onclick=()=>{const c=cw.clientWidth/2,d=cw.clientHeight/2;sc=Math.max(sc*.8,.03);tx=c-(c-tx)*.8;ty=d-(d-ty)*.8;apply();};
  document.getElementById('zf').onclick=fit;
})();
</script>
</body>
</html>`;
}

// Estima altura do bloco para calcular posição dos botões
// Medidas baseadas no CSS real: .bh=36, .bb padding=8top+8bot, .msg=17px/linha+14pad+5margin,
// .delay=28+5, .btn-row=13header, .btn-item=29px(25+4margin), .bf=23, .bs=28
function estimateBlockHeight(c) {
  const HEADER = 36;
  const BB_PAD = 16;   // bb: 8px top + 8px bottom
  const STATS_H = 28;
  const FOOTER_H = 23; // bf: 5px top + ~10px content + 8px bottom

  let h = HEADER;

  if (c.type === 'instagram' || c.type === 'facebook') {
    h += BB_PAD;
    const msgs = c.data?.messages || [];
    msgs.forEach(m => {
      if (m.type === 'delay') {
        h += 33; // delay chip ~28px + 5px margin
      } else if (m.type === 'text') {
        const text = m.content?.text || '';
        const textLines = Math.max(1, Math.ceil(text.length / 35));
        h += textLines * 17 + 21; // linhas + padding(7+7) + border(2) + margin(5)
        const btns = m.keyboard || [];
        if (btns.length) {
          h += 13; // btn-row: margin-top(6) + border(1) + padding-top(6)
          h += btns.length * 29 - 4; // cada botão 25px + 4px margin; último sem margin
        }
      }
    });
  } else if (c.type === 'action_group') {
    const acts = c.data?.actions || [];
    h += BB_PAD + Math.max(acts.length * 28, 20) + FOOTER_H;
  } else if (c.type === 'multi_condition') {
    const conds = c.data?.conditions || [];
    h += BB_PAD + conds.length * 38 + 38; // condições + else row (38px cada: 34+4margin)
  } else if (c.type === 'goto') {
    h += BB_PAD + 32 + FOOTER_H; // goto-val ~32px + footer
  } else {
    h += BB_PAD + 24;
  }

  if (c.stats?.sent_total > 0) h += STATS_H;
  return h;
}

function renderBlockV2(c, pos, W) {
  const typeClass = c.type === 'instagram' || c.type === 'facebook' ? 'blk-ig'
    : c.type === 'action_group' ? 'blk-action'
    : c.type === 'multi_condition' ? 'blk-condition'
    : c.type === 'goto' ? 'blk-goto' : 'blk-ig';

  const icon = c.type === 'instagram' ? '📷'
    : c.type === 'facebook' ? '💬'
    : c.type === 'action_group' ? '⚡'
    : c.type === 'multi_condition' ? '🔀'
    : c.type === 'goto' ? '↗️' : '📦';

  const typeName = c.type === 'instagram' ? 'Instagram'
    : c.type === 'facebook' ? 'Facebook'
    : c.type === 'action_group' ? 'Ação'
    : c.type === 'multi_condition' ? 'Condição'
    : c.type === 'goto' ? 'Iniciar Fluxo' : c.type;

  const body = renderBodyV2(c);
  const stats = renderStatsV2(c);
  const footer = needsFooter(c)
    ? `<div class="bf"><span class="bf-label">Próximo Passo</span><span class="bf-dot"></span></div>` : '';

  return `<div class="blk ${typeClass}" data-oid="${c.data?._oid||''}" style="left:${pos.x}px;top:${pos.y}px;">
  <div class="bh">
    <div class="bh-icon">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div class="bh-type">${typeName}</div>
      <div class="bh-name">${escapeHtml(c.caption||'')}</div>
    </div>
  </div>
  <div class="bb">${body}</div>
  ${stats}
  ${footer}
</div>`;
}

function needsFooter(c) {
  // Mostra "Próximo Passo" se tem target direto mas não tem botões
  if (c.type === 'action_group' || c.type === 'goto') return true;
  return false;
}

function renderBodyV2(c) {
  if (c.type === 'instagram' || c.type === 'facebook') {
    return renderMessagesV2(c.data?.messages || []);
  }
  if (c.type === 'action_group') return renderActionsV2(c.data?.actions || []);
  if (c.type === 'multi_condition') return renderConditionV2(c.data);
  if (c.type === 'goto') {
    const ns = c.data?.target?.flow_ns || c.data?.content_target?._content_oid || '';
    return `<div class="goto-val">↗ Fluxo: ${escapeHtml(ns)}</div>`;
  }
  return `<div style="font-size:11px;color:#9ca3af;">${escapeHtml(c.type)}</div>`;
}

function renderMessagesV2(messages) {
  let html = '';
  messages.forEach(m => {
    if (m.type === 'delay') {
      html += `<div class="delay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${m.time}s</div>`;
    } else if (m.type === 'text') {
      html += `<div class="msg">${escapeHtml(m.content?.text||'')}</div>`;
      const btns = m.keyboard || [];
      if (btns.length) {
        html += `<div class="btn-row">`;
        btns.forEach(btn => {
          const isUrl = btn.type === 'url';
          html += `<div class="btn-item${isUrl?' url':''}" data-btn-oid="${btn._oid||''}" data-target-oid="${btn._content_oid||''}">`
            + escapeHtml(btn.caption||'')
            + `<span class="btn-dot-out"></span></div>`;
        });
        html += `</div>`;
      }
    }
  });
  return html;
}

function renderActionsV2(actions) {
  return actions.map(a => {
    if (a.type === 'add_tag') return `<div class="act"><span class="act-tag">add_tag</span><span class="act-val">ID: ${a.tag_id}</span></div>`;
    if (a.type === 'set_custom_field_value') return `<div class="act"><span class="act-tag">set_field</span><span class="act-val">${a.field_id} = ${escapeHtml(String(a.value||''))}</span></div>`;
    if (a.type === 'notify_admin') return `<div class="act"><span class="act-tag">notify</span><span class="act-val">${escapeHtml(a.text||'')}</span></div>`;
    if (a.type === 'set_instagram_optin') return `<div class="act"><span class="act-tag">ig_optin</span></div>`;
    if (a.type === 'open_conversation') return `<div class="act"><span class="act-tag">open_conv</span></div>`;
    if (a.type === 'assign_conversation') return `<div class="act"><span class="act-tag">assign</span><span class="act-val">user: ${a.user_id}</span></div>`;
    if (a.type === 'custom_audience_user') return `<div class="act"><span class="act-tag">audience</span><span class="act-val">${a.action} / ${a.custom_audience_id||''}</span></div>`;
    return `<div class="act"><span class="act-tag">${escapeHtml(a.type)}</span></div>`;
  }).join('');
}

function renderConditionV2(data) {
  let html = '';
  (data?.conditions||[]).forEach(c => {
    const items = c.filter?.groups?.[0]?.items||[];
    const desc = items.map(i=>`${i.field} ${i.operator} ${i.value}`).join(' AND ');
    html += `<div class="cond-if">IF ${escapeHtml(desc)}</div>`;
  });
  html += `<div class="cond-else">ELSE → padrão</div>`;
  return html;
}

function renderStatsV2(c) {
  const s = c.stats;
  if (!s || s.sent_total === 0) return '';
  return `<div class="bs">
    <div class="bs-chip">Env <b>${s.sent_unq}</b></div>
    <div class="bs-chip">Lido <b>${s.read_unq}</b></div>
    ${s.clicked_total>0?`<div class="bs-chip">Click <b>${s.clicked_unq}</b></div>`:''}
  </div>`;
}

// ─── CONEXÕES V2 ───────────────────────────────────────────────
function buildConnectionsV2(contents, posMap, blockHeights, BLOCK_W) {
  const lines = [];
  const seen = new Set();

  function addLine(x1, y1, x2, y2, marker) {
    const key = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const dx = Math.abs(x2 - x1);
    const cx1 = x1 + Math.max(dx * 0.5, 60);
    const cx2 = x2 - Math.max(dx * 0.5, 60);
    lines.push(`<path d="M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}"
      fill="none" stroke="#9ca3af" stroke-width="1.5" opacity="0.7"
      marker-end="url(#${marker||'arr'})"/>`);
  }

  contents.forEach(c => {
    const fromOid = c.data?._oid;
    const fromPos = posMap[fromOid];
    if (!fromPos) return;

    const bh = blockHeights[fromOid] || 150;
    const fromX = fromPos.x + BLOCK_W; // saída pela direita do bloco

    // Para mensagens com botões: saída de cada botão individualmente
    if (c.type === 'instagram' || c.type === 'facebook') {
      let yOffset = 36; // altura do header
      let hasAnyButton = false;
      const msgs = c.data?.messages || [];
      msgs.forEach(m => {
        if (m.type === 'delay') { yOffset += 28; return; }
        if (m.type !== 'text') return;
        const lines2 = Math.ceil((m.content?.text||'').length / 36);
        yOffset += Math.max(lines2 * 17, 34) + 12;
        const btns = m.keyboard || [];
        if (btns.length) {
          yOffset += 10; // padding btn-row
          hasAnyButton = true;
          btns.forEach(btn => {
            const btnY = fromPos.y + yOffset + 17; // centro do botão
            const targetOid = btn._content_oid;
            if (targetOid) {
              const toPos = posMap[targetOid];
              if (toPos) {
                addLine(fromX, btnY, toPos.x, toPos.y + 36, 'arr');
              }
            }
            yOffset += 34;
          });
        }
      });
      // Só encerra se tinha botões — blocos sem botões caem para o target direto abaixo
      if (hasAnyButton) return;
    }

    // Target direto (action_group, goto via content_target, etc)
    const directTargets = [
      c.data?.target?._content_oid,
      c.data?.content_target?._content_oid,
    ].filter(Boolean);

    if (directTargets.length) {
      // action_group e goto: seta sai do ponto "Próximo Passo" no rodapé (23px do fim)
      const FOOTER_H = 23;
      const isFooterBlock = c.type === 'action_group' || c.type === 'goto';
      const fromY = isFooterBlock
        ? fromPos.y + bh - FOOTER_H / 2
        : fromPos.y + bh / 2;
      directTargets.forEach(targetOid => {
        const toPos = posMap[targetOid];
        if (toPos) addLine(fromX, fromY, toPos.x, toPos.y + 36, 'arr');
      });
    }

    // Conditions
    if (c.type === 'multi_condition') {
      let yOff = 36 + 8; // header + bb padding-top
      (c.data?.conditions||[]).forEach(cond => {
        const targetOid = cond.target?._content_oid;
        if (targetOid) {
          const toPos = posMap[targetOid];
          if (toPos) addLine(fromX, fromPos.y + yOff + 19, toPos.x, toPos.y + 36, 'arr-blue');
        }
        yOff += 38; // cond-if: ~34px + 4px margin
      });
      const defOid = c.data?.default_target?._content_oid;
      if (defOid) {
        const toPos = posMap[defOid];
        if (toPos) addLine(fromX, fromPos.y + yOff + 19, toPos.x, toPos.y + 36, 'arr-green');
      }
    }
  });

  return lines.join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(name) {
  return (name || 'flow').replace(/[^a-z0-9\-_\[\]() ]/gi, '_').trim();
}

function showLogs(logs) {
  let panel = document.getElementById('log-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'log-panel';
    panel.style.cssText = `
      margin-top: 10px;
      background: #0a0a0f;
      border: 1px solid #1e1e28;
      border-radius: 8px;
      overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px; border-bottom: 1px solid #1e1e28;
      font-size: 10px; font-family: monospace; color: #5a5a72;
      cursor: pointer;
    `;
    header.innerHTML = `<span>🪲 LOGS DE DEBUG</span><span id="log-toggle">▼</span>`;
    const body = document.createElement('div');
    body.id = 'log-body';
    body.style.cssText = `
      max-height: 160px; overflow-y: auto;
      padding: 6px 0;
      font-size: 10px; font-family: monospace; color: #6b6b80;
      line-height: 1.6;
    `;
    header.addEventListener('click', () => {
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? 'block' : 'none';
      document.getElementById('log-toggle').textContent = collapsed ? '▼' : '▶';
    });
    panel.appendChild(header);
    panel.appendChild(body);
    document.getElementById('main-content').appendChild(panel);
  }
  const body = document.getElementById('log-body');
  if (!logs || logs.length === 0) {
    body.innerHTML = '<div style="padding:4px 10px;color:#f87171;">Nenhum log — interceptor pode não ter carregado. Tente recarregar a página do ManyChat.</div>';
    return;
  }
  body.innerHTML = logs.map(l => {
    const time = l.time ? l.time.split('T')[1].split('.')[0] : '';
    const dataStr = l.data ? ' ' + JSON.stringify(l.data) : '';
    const color = l.msg.includes('erro') || l.msg.includes('Error') || l.msg.includes('falha') ? '#f87171' :
                  l.msg.includes('salvo') || l.msg.includes('obtido') ? '#4ade80' : '#6b6b80';
    return `<div style="padding:2px 10px;color:${color};">[${time}] ${escapeHtml(l.msg)}${escapeHtml(dataStr)}</div>`;
  }).join('');
  panel.style.display = 'block';
}

function hideLogs() {
  const panel = document.getElementById('log-panel');
  if (panel) panel.style.display = 'none';
}

// ─── IMPORT FLOW ───────────────────────────────────────────────
async function importFlow() {
  const tab = await getCurrentTab();
  const jsonStr = document.getElementById('import-json').value.trim();
  const btn = document.getElementById('btn-import');

  if (!jsonStr) {
    setImportStatus('error', 'Cole o JSON antes de importar.');
    return;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.batch?.contents) throw new Error('falta batch.contents');
  } catch (e) {
    setImportStatus('error', 'JSON inválido: ' + e.message);
    return;
  }

  setImportStatus('loading', 'Inserindo blocos...');
  btn.disabled = true;

  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (json) => {
        // Usa a função do injected.js se disponível
        if (typeof window.__manychatImportFlow === 'function') {
          return await window.__manychatImportFlow(json);
        }

        // Fallback inline — funciona mesmo sem recarregar a página
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (e) {
          return { error: 'JSON inválido: ' + e.message };
        }

        if (!payload.batch?.contents || !Array.isArray(payload.batch.contents)) {
          return { error: 'JSON inválido: falta batch.contents' };
        }

        const url = window.location.href;
        const nsMatch = url.match(/--([^/]+?)(?:\/|$)/) || url.match(/\/cms\/files\/([^/]+)/);
        const pageMatch = url.match(/\/(?:fb)?(\d{4,})\//);
        if (!nsMatch || !pageMatch) {
          return { error: 'URL não reconhecida. Abra um fluxo no editor do ManyChat.' };
        }

        // Formato novo do ManyChat pode ter múltiplos prefixos numéricos: "{id}--{id}--content{...}"
        const rawNs = nsMatch[1];
        const ns = rawNs.replace(/^(\d+--)+/, '');
        const pageId = pageMatch[1];
        const csrfToken = window.__INIT__?.['app.csrf_token'] || window.__INIT__?.['csrf_token'] || '';
        const frontendBundle = String(window.STATIC_VERSION || '');

        if (!csrfToken) {
          return { error: 'CSRF token não encontrado. Recarregue a página do ManyChat.' };
        }

        payload.ns = ns;
        payload.client_id = crypto.randomUUID();
        payload.batch.contents = payload.batch.contents.map(b => ({ ...b, namespace: ns }));

        try {
          const resp = await fetch(`https://app.manychat.com/fb${pageId}/flow/patchDraft`, {
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
          if (resp.ok) {
            const data = await resp.json();
            const apiStatus = data?.status;
            if (data?.state === false) {
              const errs = Array.isArray(data?.errors) ? data.errors.join(', ') : JSON.stringify(data).substring(0, 150);
              return { error: `API recusou: ${errs}` };
            }
            if (apiStatus && apiStatus !== 'success') {
              return { error: `API recusou (status: "${apiStatus}"): ${JSON.stringify(data).substring(0, 150)}` };
            }
            return { success: true, apiStatus, debug: { ns, pageId }, rawResponse: JSON.stringify(data).substring(0, 300) };
          }
          const text = await resp.text();
          return { error: `Erro HTTP ${resp.status}: ${text.substring(0, 150)}` };
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [jsonStr]
    });

    const result = r?.[0]?.result;
    if (result?.success) {
      const ns = result.debug?.ns ? result.debug.ns.substring(0, 25) + '…' : '?';
      const pageId = result.debug?.pageId || '?';
      setImportStatus('success',
        `✓ Inserido! pageId=${pageId} · ns=${ns}\n\nDê F5 e role o canvas. Se não aparecer, cole no chat:\n${result.rawResponse || ''}`
      );
    } else {
      const errMsg = result?.error || 'Erro desconhecido';
      const hint = errMsg.includes('não existe')
        ? '\n\n→ Dica: salve o fluxo pelo menos uma vez antes de importar (botão Salvar no ManyChat).'
        : '';
      setImportStatus('error', '✗ ' + errMsg + hint);
    }

    // Aguarda um instante para o ManyChat processar a resposta do patchDraft
    // (é nesse momento que erros como "unknown content type" aparecem) e
    // mostra os logs capturados, incluindo erros JS da página.
    await new Promise(res => setTimeout(res, 500));
    const logs = await getLogs(tab.id);
    showLogs(logs);
  } catch (e) {
    setImportStatus('error', '✗ ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function setImportStatus(type, msg) {
  const el = document.getElementById('import-status');
  el.className = 'import-status ' + type;

  if (type === 'error') {
    const version = chrome.runtime.getManifest().version;
    const waText = encodeURIComponent(
      `Olá Paulo! Encontrei um erro na extensão ManyChat Exporter v${version}.\n\nErro:\n${msg}`
    );
    el.innerHTML = escapeHtml(msg) +
      `<a class="wa-link" href="https://wa.me/${WA_SUPPORT}?text=${waText}" target="_blank">` +
      `📲 Reportar este erro no WhatsApp</a>`;
  } else {
    el.textContent = msg;
  }
}

init();
