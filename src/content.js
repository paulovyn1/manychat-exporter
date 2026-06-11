// Injeta o script no contexto REAL da página (acesso ao window.__INIT__, XHR, fetch)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Escuta mensagens do injected.js via CustomEvent e repassa para o popup via postMessage
window.addEventListener('__mc_flow_ready', (e) => {
  window.__mcFlowDataBridge = e.detail;
});
