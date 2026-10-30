# CleanTXT

Converte em lote os JSON `json-convert.document.v4` para TXT com HTML sanitizado. O contrato está em [docs/SPEC.md](docs/SPEC.md).

## Uso

```bash
corepack pnpm install
corepack pnpm dev      # API
corepack pnpm dev:web  # interface
corepack pnpm --filter @conversor/core exec conversor --entrada pasta_json --saida output
```

Para subir o conversor, rode os dois ao mesmo tempo, cada um no seu terminal. `corepack pnpm dev` sobe a API em `http://127.0.0.1:8765`. `corepack pnpm dev:web` abre a interface em `http://127.0.0.1:5173` e encaminha `/api` para a API. Se a API usar outra porta, defina `API_ALVO` ao subir o Vite. `HOST` e `PORT` mudam o endereço da API. O padrão é só a própria máquina. Se `HOST` for `0.0.0.0` ou um IP da rede, qualquer pessoa nessa rede alcança a ferramenta: não há login.

## Testes

```bash
corepack pnpm test
```
