# CleanTXT

Converte em lote os JSON `json-convert.document.v4` para TXT com HTML sanitizado. O contrato está em [docs/SPEC.md](docs/SPEC.md).

## Uso

```bash
pip install -r requirements.txt
python -m conversor --entrada pasta_json --saida output
python -m conversor.interface
```

A interface local abre em `http://127.0.0.1:8765`.

## Testes

```bash
python -m pytest
python -m pytest -m "not integration"
```
