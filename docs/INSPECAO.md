# Inspeção do exemplo

Arquivo: `Exemplo/DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4 - DESENVOLVIMENTO.json`.

Um único documento, cerca de 6 MB, schema `json-convert.document.v4`. A raiz é um objeto. As strings longas abaixo estão truncadas.

## Chaves da raiz

`schema`, `documentId`, `codigoDisciplina`, `eduno`, `title`, `slug`, `originalName`, `sourceType`, `generatedAt`, `converter`, `source`, `options`, `toc`, `headings`, `counts`, `blocks`, `images`, `contentHtml`, `warnings`, `replicaSequence`, `updatedAt`, `audit`.

`converter`: nome `JSON CONVERT`, versão `1.3.0`, engine `Mammoth.js 1.13.0`. `sourceType` é `docx`.

## Campos abertos para a identidade

- `originalName`: `DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4.docx`
- `slug`: `desenvolvimento-afetivo-familia-e-aprendizagem-nota-4`
- `title`: `DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4`
- `replicaSequence`: `0`
- `eduno`: `lookupCode` = `DESENVOLVIMENTO`; `apiPath` = `/api/eduno/code/DESENVOLVIMENTO`
- `source`: MIME de DOCX, `sizeBytes` = `10725276`, `sha256` = `936f768a3bb608460d333d2c713e427fe6463ea3136d3c6e24c0abf776ad86ff`
- `audit`: `createdBy` = `usr_gestor_bootstrap`, `createdByUsername` = `gestor`, `role` = `manager`, `savedAt` = `2026-10-19T19:57:48.133Z`
- `generatedAt` = `2026-10-19T19:57:46.965Z`
- `updatedAt` = `2026-10-19T19:57:48.133Z`

## documentId

Valor: `doc_mvfof1t1_d3596db72381c296`. Não é um UUID.

O trecho `mvfof1t1`, em base36, vale `1792439868133` milissegundos, isto é `2026-10-19T19:57:48.133Z`. É o mesmo instante de `updatedAt` e de `audit.savedAt`. `generatedAt` é anterior, `19:57:46.965Z`. O prefixo muda a cada gravação do JSON.

O sufixo depois do último `_` é `d3596db72381c296` (16 hexadecimais). Foi comparado como prefixo e como ocorrência interna de SHA-256, SHA-1 e MD5, em UTF-8, sobre:

- o arquivo inteiro
- `title`, `originalName`, `slug`, `contentHtml`, `documentId`, `codigoDisciplina`
- `replicaSequence`, `eduno`, `audit`, `source` e os subcampos de cada um, inclusive `source.sha256`
- o JSON compacto, o JSON padrão e o JSON com chaves ordenadas desses objetos

Nenhuma combinação começa com esse sufixo nem o contém. `source.sha256` também não o contém. O campo parece o hash do DOCX de origem, mas a inspeção não mostrou que o `documentId` deriva dele.

Conclusão usada na SPEC: não há chave de origem estável demonstrada. O UUID do conversor usa o SHA-256 do HTML sanitizado.

## codigoDisciplina

Valor: `DESENVOLVIMENTO`. É igual a `eduno.lookupCode` e ao sufixo do nome do arquivo. É a primeira palavra do título, sem dígitos. Está preenchido e tem cara de placeholder. Com um arquivo só não dá para ver repetição entre documentos.

## Blocos

`blocks` tem 224 itens, índices 1 a 224, já em ordem. Não existe tipo `list`.

- `paragraph` (194): `index`, `type`, `tag` (`p`), `text`, `html`. O `html` é o miolo, sem o `<p>` externo. Exemplo: `<strong>DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM</strong>`. Em 0 de 194 o texto plano diverge do HTML sem tags. Tags no miolo: `strong`, `a`, `em`. Há 17 links de sumário (`href` interno; o texto traz título, tabulação e número de página) e 2 âncoras cuja URL e cujo texto são `https://www.youtube.com/watch?v=cYefPOPuHOE`. O bloco 21 é vazio: `html` = `<a id="_Toc146571594"></a>`, `text` = `""`.
- `heading` (18): `index`, `type`, `tag`, `level`, `id`, `text`. Não há `html`. São 11 `h1` e 7 `h2`; `tag` coincide com `level`. Exemplo: `h2`, nível 2, id `sumario`, texto `SUMÁRIO`.
- `table` (1): `index`, `type`, `tag` `table`, `rows`, `html`. O `html` já traz o elemento externo e começa com `<table><tbody><tr><td><p><strong>FAMÍLIA</strong></p></td>...`. Cada célula de `rows` é `{tag, text, colspan, rowspan}`: 2 linhas, 3 colunas, todas `td`, `colspan` 1, `rowspan` 1. O `text` perde `<strong>` e as listas. O `html` preserva `<strong>`, `<p>` e 3 `<ul>`.
- `imageGroup` (10): `index`, `type`, `tag` `p`, `images[]` com `index`, `src`, `alt`, `normalizedFrom`. Cada grupo tem uma imagem. `src` é `data:image/jpeg;base64,...`, com 54.587 a 1.285.995 caracteres. `alt` é sempre `Imagem extraida do DOCX`. Nove têm `normalizedFrom` = `png`.
- `aside` (1): `index`, `type`, `tag` `aside`, `role` `texto-recuperado-caixa-texto`, `text` com 343 caracteres, começando por `Assista o vídeo a seguir`. Não há `html`.

## O que duplica o corpo

`toc` e `headings` repetem os 18 headings em texto, id, nível e tag. `contentHtml` (cerca de 2 MB) repete o documento renderizado e embute as imagens. `images` repete as 10 imagens dos `imageGroup`. Esses quatro ficam de fora da saída. O sumário que permanece é o que está em `blocks`: o heading `SUMÁRIO` e os 17 parágrafos.

## Totais de `counts`

- `blocks` 224 = 224 blocos.
- `headings` 18 = 18 blocos `heading` = 18 itens de `headings`.
- `images` 10 = 10 `imageGroup` = 10 itens de `images`.
- `tables` 1 = 1 bloco `table`.
- `lists` 3 = 3 `<ul>` dentro da única tabela. Não há bloco de lista.
- `paragraphs` 207 não é a contagem de blocos `paragraph` (194). Bate com as tags `<p>` de `contentHtml`: 194 parágrafos + 10 imagens embrulhadas em `<p>` + 3 `<p>` no cabeçalho da tabela.
