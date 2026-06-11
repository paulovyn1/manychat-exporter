# ManyChat Flow Exporter

Extensão para Chrome (Manifest V3) que exporta fluxos do **ManyChat** em **JSON** ou **HTML Visual** (canvas interativo), e permite **importar** blocos de volta para o editor.

## Funcionalidades

- **Exportar JSON** — dados brutos do fluxo, prontos para versionar ou reimportar
- **Exportar HTML Visual** — canvas interativo com blocos e conexões, replicando o visual do editor do ManyChat
- **Importar fluxo** — cola um JSON (formato `batch.contents`) e insere os blocos diretamente no fluxo aberto no editor

## Como instalar (modo desenvolvedor)

1. Baixe ou clone este repositório
2. Abra `chrome://extensions` no Chrome
3. Ative o **Modo desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação** e selecione a pasta do repositório
5. Abra um fluxo no editor do ManyChat (`app.manychat.com`) e clique no ícone da extensão na barra do Chrome

> **Importante:** após qualquer alteração nos arquivos da extensão, clique no botão **↺ (recarregar)** na página `chrome://extensions` e dê **F5** na aba do ManyChat para que o novo `injected.js` seja carregado.

## Como usar

1. Abra o fluxo desejado no editor do ManyChat
2. Clique no ícone da extensão
3. Escolha **JSON** (dados brutos) ou **HTML Visual** (canvas interativo) para baixar o fluxo
4. Para importar blocos, cole o JSON (formato `batch.contents`) no campo de importação e clique em **Inserir no Canvas**

## Estrutura do projeto

```
manychat-exporter/
├── manifest.json       # Manifest V3
├── icons/
└── src/
    ├── content.js      # Content script — injeta injected.js na página
    ├── injected.js      # Roda no contexto real da página (window.__INIT__, fetch, XHR)
    ├── background.js    # Service worker
    ├── popup.html        # UI do popup
    └── popup.js          # Lógica do popup + gerador do HTML visual
```

## Documentação técnica

Veja [CLAUDE.md](CLAUDE.md) para detalhes sobre arquitetura, formato dos dados do fluxo e regras de versionamento, e [MODELO_JSON_IMPORTACAO.md](MODELO_JSON_IMPORTACAO.md) para o formato do JSON de importação.
