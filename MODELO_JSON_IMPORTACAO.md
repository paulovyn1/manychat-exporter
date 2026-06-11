# Modelo JSON para Importação de Fluxos ManyChat

Formato aceito pela extensão **ManyChat Flow Exporter** para importar fluxos diretamente no canvas.
Use este documento como referência ao pedir para uma IA gerar um fluxo completo.

---

## Estrutura raiz

```json
{
  "batch": {
    "contents": [ ]
  },
  "coordinates": {
    "uuid-do-bloco": { "x": 1000, "y": 1000 }
  }
}
```

> `ns` e `client_id` são preenchidos automaticamente pela extensão — não inclua.

---

## Regras gerais

1. Todo `_oid` deve ser um **UUID v4 único** — formato `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
2. Cada bloco, mensagem, botão e ação tem seu próprio `_oid` diferente
3. Conexões entre blocos são feitas via `_content_oid` apontando para o `_oid` do bloco destino
4. O campo `namespace` dentro de cada bloco deve ser `"PLACEHOLDER"` — a extensão substitui automaticamente
5. Coordenadas: use incrementos de ~450px horizontalmente e ~300px verticalmente entre blocos

---

## Tipos de blocos

### 1. `instagram` — Mensagem Instagram

```json
{
  "type": "instagram",
  "_oid": "UUID-DO-BLOCO",
  "namespace": "PLACEHOLDER",
  "caption": "Nome visível no canvas",
  "content_id": null,
  "removed": false,
  "target": null,
  "private_reply": null,
  "one_time_notify_reason_id": null,
  "$fbMessagingType": "INSIDE_24_HOURS",
  "quick_replies": {
    "buttons": [],
    "settings": {
      "validation_message": null,
      "skip_button_caption": null,
      "limit_failed": null,
      "timeout": null
    }
  },
  "messages": [
    {
      "_oid": "UUID-DO-DELAY",
      "type": "delay",
      "time": 2,
      "show_typing": false,
      "keyboard": []
    },
    {
      "_oid": "UUID-DA-MENSAGEM",
      "type": "text",
      "content": { "text": "Texto da mensagem" },
      "keyboard": [
        {
          "_oid": "UUID-DO-BOTAO",
          "type": "content",
          "caption": "Texto do botão",
          "_content_oid": "UUID-DO-BLOCO-DESTINO",
          "is_smart_link": false,
          "target": null,
          "webview_size": null,
          "do_not_track": false
        }
      ]
    }
  ]
}
```

**Tipos de botão dentro de `keyboard`:**

| `type` | Campos obrigatórios | Descrição |
|--------|---------------------|-----------|
| `content` | `_content_oid: "uuid"` | Navega para outro bloco do fluxo |
| `url` | `url: "https://..."` | Abre link externo (sem `_content_oid`) |

Um bloco pode ter múltiplos `messages`. Cada `text` pode ter múltiplos botões em `keyboard`.
Se não houver botões, use `"keyboard": []`.

---

### 2. `action_group` — Grupo de Ações

```json
{
  "type": "action_group",
  "_oid": "UUID-DO-BLOCO",
  "namespace": "PLACEHOLDER",
  "caption": "Nome visível no canvas",
  "content_id": null,
  "removed": false,
  "target": { "_content_oid": "UUID-DO-PROXIMO-BLOCO" },
  "actions": [
    {
      "_oid": "UUID-DA-ACAO",
      "type": "add_tag",
      "tag_id": 123456
    }
  ]
}
```

**Tipos de ação disponíveis em `actions`:**

| `type` | Campos adicionais | Descrição |
|--------|-------------------|-----------|
| `add_tag` | `tag_id: number` | Adiciona tag ao contato |
| `remove_tag` | `tag_id: number` | Remove tag do contato |
| `set_custom_field_value` | `field_id: number`, `value: string` | Define campo customizado |
| `notify_admin` | `text: string` | Envia notificação para o admin |
| `open_conversation` | — | Abre atendimento humano |
| `set_instagram_optin` | — | Ativa opt-in de notificações Instagram |
| `assign_conversation` | `user_id: number` | Atribui conversa a um atendente |

> `target` é obrigatório no `action_group` — é assim que ele aponta para o próximo bloco.

---

### 3. `multi_condition` — Condição / Bifurcação

```json
{
  "type": "multi_condition",
  "_oid": "UUID-DO-BLOCO",
  "namespace": "PLACEHOLDER",
  "caption": "Nome visível no canvas",
  "content_id": null,
  "removed": false,
  "target": null,
  "default_target": { "_content_oid": "UUID-BLOCO-ELSE" },
  "conditions": [
    {
      "_oid": "UUID-DA-CONDICAO",
      "target": { "_content_oid": "UUID-BLOCO-SE-VERDADEIRO" },
      "filter": {
        "groups": [
          {
            "items": [
              {
                "field": "tag",
                "operator": "contains",
                "value": "nome_da_tag"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

- `conditions[]` — cada item é um ramo "SE"
- `default_target` — ramo "SENÃO" (fallback)
- Múltiplas condições = múltiplos ramos

---

### 4. `goto` — Redirecionar para outro fluxo

```json
{
  "type": "goto",
  "_oid": "UUID-DO-BLOCO",
  "namespace": "PLACEHOLDER",
  "caption": "Nome visível no canvas",
  "content_id": null,
  "removed": false,
  "target": { "flow_ns": "namespace-do-fluxo-destino" },
  "content_target": { "_content_oid": "UUID-PRIMEIRO-BLOCO-DO-FLUXO-DESTINO" }
}
```

---

## Coordenadas

```json
"coordinates": {
  "UUID-BLOCO-1": { "x": 1000, "y": 1000 },
  "UUID-BLOCO-2": { "x": 1450, "y": 1000 },
  "UUID-BLOCO-3": { "x": 1900, "y": 800 },
  "UUID-BLOCO-4": { "x": 1900, "y": 1300 }
}
```

- Blocos em sequência: aumente `x` em ~450 por coluna
- Blocos paralelos (ramificações): mesmo `x`, varie `y` em ~300–400
- Comece sempre em `x: 1000, y: 1000` para que os blocos fiquem visíveis no canvas

---

## Exemplo completo — Fluxo de qualificação de lead

Fluxo com 4 blocos: boas-vindas → botões (sim/não) → ação de tag → mensagens de confirmação.

```json
{
  "batch": {
    "contents": [
      {
        "type": "instagram",
        "_oid": "11111111-1111-4111-a111-111111111111",
        "namespace": "PLACEHOLDER",
        "caption": "Boas-vindas",
        "content_id": null,
        "removed": false,
        "target": null,
        "private_reply": null,
        "one_time_notify_reason_id": null,
        "$fbMessagingType": "INSIDE_24_HOURS",
        "quick_replies": {
          "buttons": [],
          "settings": { "validation_message": null, "skip_button_caption": null, "limit_failed": null, "timeout": null }
        },
        "messages": [
          {
            "_oid": "11111111-1111-4111-a111-111111111112",
            "type": "delay",
            "time": 2,
            "show_typing": false,
            "keyboard": []
          },
          {
            "_oid": "11111111-1111-4111-a111-111111111113",
            "type": "text",
            "content": { "text": "Olá! 👋 Temos uma oferta especial para você.\nDeseja saber mais detalhes?" },
            "keyboard": [
              {
                "_oid": "11111111-1111-4111-a111-111111111114",
                "type": "content",
                "caption": "Sim, quero saber!",
                "_content_oid": "22222222-2222-4222-a222-222222222221",
                "is_smart_link": false,
                "target": null,
                "webview_size": null,
                "do_not_track": false
              },
              {
                "_oid": "11111111-1111-4111-a111-111111111115",
                "type": "content",
                "caption": "Não, obrigado",
                "_content_oid": "44444444-4444-4444-a444-444444444441",
                "is_smart_link": false,
                "target": null,
                "webview_size": null,
                "do_not_track": false
              }
            ]
          }
        ]
      },
      {
        "type": "action_group",
        "_oid": "22222222-2222-4222-a222-222222222221",
        "namespace": "PLACEHOLDER",
        "caption": "Tag: lead interessado",
        "content_id": null,
        "removed": false,
        "target": { "_content_oid": "33333333-3333-4333-a333-333333333331" },
        "actions": [
          {
            "_oid": "22222222-2222-4222-a222-222222222222",
            "type": "add_tag",
            "tag_id": 999999
          }
        ]
      },
      {
        "type": "instagram",
        "_oid": "33333333-3333-4333-a333-333333333331",
        "namespace": "PLACEHOLDER",
        "caption": "Confirmação positiva",
        "content_id": null,
        "removed": false,
        "target": null,
        "private_reply": null,
        "one_time_notify_reason_id": null,
        "$fbMessagingType": "INSIDE_24_HOURS",
        "quick_replies": {
          "buttons": [],
          "settings": { "validation_message": null, "skip_button_caption": null, "limit_failed": null, "timeout": null }
        },
        "messages": [
          {
            "_oid": "33333333-3333-4333-a333-333333333332",
            "type": "text",
            "content": { "text": "Perfeito! 🎉 Nossa equipe vai entrar em contato em breve com todos os detalhes." },
            "keyboard": []
          }
        ]
      },
      {
        "type": "instagram",
        "_oid": "44444444-4444-4444-a444-444444444441",
        "namespace": "PLACEHOLDER",
        "caption": "Confirmação negativa",
        "content_id": null,
        "removed": false,
        "target": null,
        "private_reply": null,
        "one_time_notify_reason_id": null,
        "$fbMessagingType": "INSIDE_24_HOURS",
        "quick_replies": {
          "buttons": [],
          "settings": { "validation_message": null, "skip_button_caption": null, "limit_failed": null, "timeout": null }
        },
        "messages": [
          {
            "_oid": "44444444-4444-4444-a444-444444444442",
            "type": "text",
            "content": { "text": "Sem problema! 😊 Estamos aqui sempre que precisar." },
            "keyboard": []
          }
        ]
      }
    ]
  },
  "coordinates": {
    "11111111-1111-4111-a111-111111111111": { "x": 1000, "y": 1000 },
    "22222222-2222-4222-a222-222222222221": { "x": 1450, "y": 800 },
    "33333333-3333-4333-a333-333333333331": { "x": 1900, "y": 800 },
    "44444444-4444-4444-a444-444444444441": { "x": 1450, "y": 1200 }
  }
}
```

---

## Prompt pronto para IA

Copie e cole o texto abaixo para qualquer IA (ChatGPT, Claude, Gemini etc.) antes de pedir o fluxo:

---

```
Você vai gerar um fluxo de ManyChat no formato JSON para importação direta no canvas.

REGRAS OBRIGATÓRIAS:
1. Retorne APENAS o JSON — sem explicações, sem markdown, sem texto antes ou depois
2. Todo _oid deve ser um UUID v4 válido e único (formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
3. O campo "namespace" de cada bloco deve ser sempre "PLACEHOLDER"
4. Não inclua os campos "ns" nem "client_id" na raiz
5. Coordenadas: comece em x:1000, y:1000 e aumente x em ~450 por coluna; para ramificações paralelas, varie y em ~350

ESTRUTURA OBRIGATÓRIA:
{
  "batch": { "contents": [ ...blocos... ] },
  "coordinates": { "uuid-do-bloco": { "x": number, "y": number } }
}

TIPOS DE BLOCO DISPONÍVEIS:

1. instagram — mensagem com texto e botões
{
  "type": "instagram",
  "_oid": "UUID",
  "namespace": "PLACEHOLDER",
  "caption": "Nome do bloco",
  "content_id": null, "removed": false, "target": null,
  "private_reply": null, "one_time_notify_reason_id": null,
  "$fbMessagingType": "INSIDE_24_HOURS",
  "quick_replies": { "buttons": [], "settings": { "validation_message": null, "skip_button_caption": null, "limit_failed": null, "timeout": null } },
  "messages": [
    { "_oid": "UUID", "type": "delay", "time": 2, "show_typing": false, "keyboard": [] },
    {
      "_oid": "UUID", "type": "text", "content": { "text": "..." },
      "keyboard": [
        { "_oid": "UUID", "type": "content", "caption": "Texto botão", "_content_oid": "UUID-DESTINO", "is_smart_link": false, "target": null, "webview_size": null, "do_not_track": false }
      ]
    }
  ]
}

2. action_group — executa ações (tags, campos, notificações)
{
  "type": "action_group",
  "_oid": "UUID", "namespace": "PLACEHOLDER", "caption": "Nome",
  "content_id": null, "removed": false,
  "target": { "_content_oid": "UUID-PROXIMO-BLOCO" },
  "actions": [
    { "_oid": "UUID", "type": "add_tag", "tag_id": 123456 }
  ]
}

3. multi_condition — bifurcação por condição
{
  "type": "multi_condition",
  "_oid": "UUID", "namespace": "PLACEHOLDER", "caption": "Nome",
  "content_id": null, "removed": false, "target": null,
  "default_target": { "_content_oid": "UUID-ELSE" },
  "conditions": [
    { "_oid": "UUID", "target": { "_content_oid": "UUID-SE-VERDADEIRO" },
      "filter": { "groups": [ { "items": [ { "field": "tag", "operator": "contains", "value": "nome_tag" } ] } ] } }
  ]
}

CONEXÕES:
- Botão "content": campo "_content_oid" aponta para o _oid do bloco destino
- action_group: campo "target._content_oid" aponta para o próximo bloco
- multi_condition: cada condição tem "target._content_oid", mais "default_target._content_oid"

Agora gere o seguinte fluxo:
[DESCREVA SEU FLUXO AQUI]
```

---

> **Dica:** Substitua `[DESCREVA SEU FLUXO AQUI]` pela descrição do fluxo que você quer. Exemplo:
> *"Fluxo de boas-vindas para novos seguidores com 3 perguntas de qualificação, bifurcação por interesse e mensagem final personalizada."*
