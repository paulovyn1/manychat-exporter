# ManyChat Flow Exporter — Contexto do Projeto

## O que é

Extensão Chrome (Manifest V3) que exporta fluxos do ManyChat em dois formatos:
- **JSON** — dados brutos da API
- **HTML Visual** — canvas interativo que replica o visual do editor do ManyChat

O usuário abre um fluxo no editor do ManyChat, clica no ícone da extensão na barra do Chrome, e baixa o arquivo.

---

## Estrutura de arquivos

```
manychat-exporter/
├── manifest.json          # Manifest V3, versão atual: 1.8.0
├── CLAUDE.md              # Este arquivo
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── content.js         # Content script — injeta injected.js no contexto real da página
    ├── injected.js        # Roda no contexto REAL da página (acesso ao window.__INIT__, XHR, fetch)
    ├── interceptor.js     # Legado — ainda declarado mas a lógica real foi para injected.js
    ├── background.js      # Service worker mínimo
    ├── popup.html         # UI do popup da extensão
    └── popup.js           # Toda a lógica do popup + gerador HTML do canvas
```

---

## Como funciona — fluxo técnico

### 1. Injeção no contexto da página
`content.js` é um content script (roda em contexto isolado). Ele injeta `injected.js` como uma tag `<script>` diretamente no DOM, o que faz ele rodar **no contexto real da página** com acesso ao `window` do ManyChat.

```js
// content.js
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.js');
(document.head || document.documentElement).appendChild(script);
```

Isso é necessário porque content scripts têm um `window` isolado e não enxergam `window.__INIT__`, `window.STATIC_VERSION`, nem conseguem interceptar os XHR/fetch da página.

### 2. Captura do fluxo (injected.js)
`injected.js` faz duas coisas em paralelo:

**A) Intercepta XHR e fetch** — quando o ManyChat carrega um fluxo, ele faz uma requisição XHR para:
```
GET https://app.manychat.com/fb{pageId}/flow/getFlowData?ns={namespace}
```
O injected intercepta essa resposta e salva em `window.__manychatFlowData`.

**B) Fetch ativo** — quando o popup é aberto e não há cache, `window.__manychatFetchFlow()` é chamada. Ela:
1. Extrai `pageId` e `ns` da URL atual
2. Pega `window.__INIT__['app.csrf_token']` e `window.STATIC_VERSION` (necessários nos headers)
3. Faz o fetch direto para o endpoint correto com os headers obrigatórios:
   - `x-csrf-token: {token}`
   - `x-frontend-bundle: {STATIC_VERSION}`
   - `X-Requested-With: XMLHttpRequest`

### 3. Popup
`popup.js` chama `chrome.scripting.executeScript` para ler `window.__manychatFlowData` da página ou executar `window.__manychatFetchFlow()`. Com os dados em mãos, oferece dois botões de exportação.

---

## Estrutura do JSON do ManyChat

O endpoint retorna:
```json
{
  "flow": {
    "name": "Nome do fluxo",
    "contents": [...],     // array de blocos
    "coordinates": {...},  // posições no canvas por OID
    "flow_stats": {...}
  }
}
```

### Tipos de blocos em `contents`
| `type` | Descrição |
|---|---|
| `instagram` | Mensagem Instagram (texto + botões) |
| `facebook` | Mensagem Facebook |
| `action_group` | Grupo de ações (tags, campos, notificações) |
| `multi_condition` | Condição/bifurcação |
| `goto` | Redireciona para outro fluxo |

### Cada bloco tem:
```json
{
  "content_id": 123,
  "caption": "Nome do bloco",
  "type": "instagram",
  "data": {
    "_oid": "uuid-do-bloco",        // chave usada em coordinates
    "messages": [...],               // para tipo instagram/facebook
    "actions": [...],                // para tipo action_group
    "conditions": [...],             // para tipo multi_condition
    "target": { "_content_oid": "uuid" },          // conexão direta
    "content_target": { "_content_oid": "uuid" },  // usado em goto
    "default_target": { "_content_oid": "uuid" }   // fallback em conditions
  },
  "stats": { "sent_total": 175, "sent_unq": 175, ... }
}
```

### Mensagens (`data.messages`)
```json
[
  { "type": "delay", "time": 3 },
  {
    "type": "text",
    "content": { "text": "Texto da mensagem" },
    "keyboard": [
      {
        "_oid": "uuid-botao",
        "type": "content",         // ou "url"
        "caption": "Texto do botão",
        "_content_oid": "uuid-destino"  // OID do bloco destino
      }
    ]
  }
]
```

### Coordinates
```json
{
  "uuid-do-bloco": { "x": 907, "y": -15 },
  "startingStep":  { "x": -2386, "y": -15 }
}
```
As coordenadas podem ser negativas. O HTML normaliza subtraindo o `minX`/`minY`.

---

## Mapeamento de conexões

As setas entre blocos vêm de:

1. **Botões** (`data.messages[].keyboard[]._content_oid`) — seta sai do botão específico
2. **Target direto** (`data.target._content_oid`) — usado em `action_group`
3. **Content target** (`data.content_target._content_oid`) — usado em `goto`
4. **Conditions** (`data.conditions[].target._content_oid`) — cada ramo da condição
5. **Default target** (`data.default_target._content_oid`) — ramo padrão da condição

**Bug que existia nas versões anteriores:** `goto` usava só `target.flow_ns` (namespace do fluxo externo) mas ignorava `content_target._content_oid` que aponta para o primeiro bloco do fluxo destino dentro do canvas. Corrigido na v1.8.

---

## HTML Visual — estado atual (v1.8)

O gerador está em `popup.js` na função `generateCanvasHTML()`. Produz um HTML standalone com:

- **Fundo cinza claro** (`#f0f2f5`), blocos brancos — visual próximo ao ManyChat
- **Toolbar** com nome do fluxo e stats
- **Canvas pan/zoom** com scroll e drag
- **Blocos posicionados** usando coordenadas normalizadas do JSON
- **Conexões SVG** com curvas bezier, setas nas pontas

### Problemas conhecidos / pendências na v1.8

1. **Altura dos blocos estimada, não real** — a função `estimateBlockHeight()` usa heurística para calcular onde cada botão está verticalmente. Isso faz as setas não saírem do lugar exato do botão em blocos muito longos. A solução correta é medir o DOM após renderizar (mas o HTML é gerado como string, não renderizado em tempo de geração).

2. **Visual não 100% fiel ao ManyChat** — faltam alguns detalhes visuais dos cards originais (ícones de canal, estilo dos delays, etc).

3. **Setas duplicadas** — quando múltiplos botões apontam para o mesmo destino, aparecem setas sobrepostas. O `seen` set usa coordenadas arredondadas para deduplicar mas pode falhar se as posições forem ligeiramente diferentes.

4. **Blocos sem OID em coordinates** — alguns blocos internos não têm entrada em `coordinates` e ficam em `left:0, top:0`. Raro mas acontece.

---

## Como instalar para desenvolvimento

1. Abrir `chrome://extensions`
2. Ativar **Modo desenvolvedor**
3. Clicar **Carregar sem compactação** → selecionar a pasta `manychat-exporter/`
4. Após qualquer alteração nos arquivos: botão **↺** na extensão ou recarregar

**Importante:** após atualizar a extensão, sempre fazer **F5 na aba do ManyChat** para que o novo `injected.js` seja carregado na página.

---

## Regras de versionamento

- Toda alteração nos arquivos da extensão deve incrementar a versão em `manifest.json`
- Formato: `MAJOR.MINOR.PATCH` onde:
  - PATCH = bugfix
  - MINOR = nova feature ou melhoria visual
  - MAJOR = mudança arquitetural
- Histórico: 1.0 → 1.1 → 1.2 (logs) → 1.3 → 1.4 → 1.5 (endpoint correto) → 1.6 (injeção real na página) → 1.7 (fit automático) → 1.8 (visual fiel + conexões corrigidas)

---

## Credenciais e headers necessários para a API

O endpoint `GET https://app.manychat.com/fb{pageId}/flow/getFlowData?ns={ns}` exige:

```
x-csrf-token: {window.__INIT__['app.csrf_token']}
x-frontend-bundle: {window.STATIC_VERSION}
X-Requested-With: XMLHttpRequest
credentials: include  (para enviar cookies de sessão)
```

Sem o `x-csrf-token`, a API retorna 400 com HTML de erro.

---

## Próximos passos sugeridos

- [ ] Melhorar precisão das setas — medir posição dos botões via DOM após render ou usar posições calculadas mais precisas
- [ ] Adicionar modo escuro/claro no HTML exportado
- [ ] Mostrar nome do botão na seta (label na conexão)
- [ ] Suporte a fluxos Facebook/WhatsApp (estrutura similar, cores diferentes)
- [ ] Exportar múltiplos fluxos de uma vez
- [ ] Melhorar bloco de condição — mostrar qual campo está sendo checado de forma legível
