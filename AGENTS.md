## Learned User Preferences

- Imagens já presentes em Base64 no JSON (`imageGroup` e `image`, com `src` no formato `data:image/<mime>;base64,...`) devem ser convertidas para HTML `<img>`, não descartadas.

## Learned Workspace Facts

- O repositório é `https://github.com/yAndreL/conversor.git`, em `c:\dev\conversor` na branch `master`. É um monorepo pnpm: conversão em `@conversor/core`, API em `@conversor/server` (porta padrão 8765, variável `PORT`) e interface em `@conversor/web` (Vite na porta padrão 5173, proxy `API_ALVO`).
- Os JSON de exemplo ficam em `Exemplo/`. A conversão grava HTML em arquivos `{uuid}az{codigoSanitizado}.txt`.
- O UUID do txt é aleatório, versão 4. O código da disciplina entra só no sufixo do nome, depois de `az`, já limpo para nome de arquivo. Exemplo: `3f1c2a80-7b4e-4d2a-8c11-0a1b2c3d4e5faz70132.txt`. Dois JSON com o mesmo texto geram dois txt.
- Blocos emitidos no HTML: `paragraph`, `heading`, `table`, `aside`, `list`, `imageGroup` e `image`. `imageGroup` e `image` com `src` Base64 válido viram `<p><img src="..." alt="...">` (`alt` só se a string não for vazia). `src` fora de `data:image/<mime>;base64,<carga>` não entra; um bloco `image` sem URI válida gera `bloco_ignorado:image`.
- Um bloco `type: list` vira `<ol>` quando `ordered` é o booleano verdadeiro e `<ul>` nos demais casos. Cada item string de `items` vira `<li>` com o texto escapado. Item que não é string não entra. Sem item string, o bloco não gera HTML e não registra `bloco_ignorado:list`.
- Tags removidas com o conteúdo interno: `script`, `style`, `iframe`, `object` e `embed`. Qualquer outra tag fora da lista permitida perde só a marcação e o texto interno fica. Permanecem `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1` a `h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote` e `img` (o `img` só com `src` Base64 de imagem).
