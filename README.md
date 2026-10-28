# CleanTXT

Converte em lote os JSON `json-convert.document.v4` para TXT com HTML sanitizado. O contrato está em [docs/SPEC.md](docs/SPEC.md).

## Uso

```bash
corepack pnpm install
corepack pnpm --filter @conversor/core exec conversor --entrada pasta_json --saida output
corepack pnpm dev
```

A interface local abre em `http://127.0.0.1:8765`. Em desenvolvimento, o Vite (`corepack pnpm dev:web`) encaminha `/api` para essa porta. Se a API usar outra porta, defina `API_ALVO` ao subir o Vite. `HOST` e `PORT` mudam o endereço. O padrão é só a própria máquina. Se `HOST` for `0.0.0.0` ou um IP da rede, qualquer pessoa nessa rede alcança a ferramenta: não há login.

## Testes

```bash
corepack pnpm test
```
