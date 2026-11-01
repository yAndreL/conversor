# SPEC: migração para TypeScript

Contrato da migração do conversor em lote e da interface local. O comportamento vigente continua em [SPEC.md](SPEC.md). A interface nova está em [SPEC-WEB.md](SPEC-WEB.md). A inspeção de origem está em [INSPECAO.md](INSPECAO.md).

A remoção do código Python foi aprovada. O repositório não contém mais fonte Python.

## Estado congelado

A tag `python-final` aponta para o commit `b71f97d3c26de2365358ce457a3d40561fd7d0fc`, anterior a este arquivo. Ela guarda o snapshot histórico. O comportamento vigente é o TypeScript e os testes Vitest.

`Exemplo/` fica fora do git: os JSON reais passam de 50 MB e carregam Base64. O teste de integração é ignorado se o arquivo do exemplo não existir.

## Arquitetura

Monorepo pnpm workspaces. Node 24, com `engines` `>=24.22.0 <25` (a máquina de referência tem v24.22.1). pnpm 12.15.0, que é a versão entregue pelo corepack deste Node, fixada no campo `packageManager`. TypeScript em `strict`, sem `any`. Dependências com versão exata, gravada no lockfile.

| Pacote | Caminho | Papel |
| --- | --- | --- |
| `@conversor/core` | `packages/core` | Conversão e CLI |
| `@conversor/contratos` | `packages/contratos` | Schemas Zod da entrada e da API |
| `@conversor/server` | `apps/server` | Fastify, upload, jobs, workers, zip |
| `@conversor/web` | `apps/web` | Vite e React |

`@conversor/contratos` existe para o browser não importar o núcleo que lê disco. `@conversor/core` e `@conversor/server` dependem dele. `@conversor/web` depende só dele.

Identificadores de código em inglês. Comentários, documentação, textos de tela, `resultado.csv` e `erros.log` em português.

A CLI permanece sequencial e chama o núcleo no próprio processo. O servidor calcula os corpos em workers e publica na ordem lexicográfica do caminho relativo. O item "Paralelismo" em Fora de escopo da SPEC.md continua valendo para o resultado observável e para a CLI: a ordem do CSV e a colisão não mudam, e a API `eduno` continua fora de escopo.

Em produção o Fastify serve o build do front na mesma origem. Em desenvolvimento o Vite faz proxy de `/api` para o servidor.

## Mapa da origem removida para TypeScript

| Origem | Destino | Biblioteca |
| --- | --- | --- |
| `conversor/documento.py` | `packages/core` | `sanitize-html` no lugar de `nh3` |
| `conversor/lote.py` | `packages/core` | `uuid` v5 e `node:crypto` para o SHA-256 |
| `conversor/cli.py` | bin `conversor` em `@conversor/core` | argumentos `--entrada`, `--saida`, `--limpar`, `--estrito` |
| `conversor/interface.py` | `apps/server` e `apps/web` | não é porte linha a linha |
| `tests/test_conversao.py` | Vitest em `@conversor/core` | cita os mesmos CA |
| `tests/test_integracao.py` | Vitest opcional, ignorado sem o exemplo | mesmo critério de conteúdo |
| `tests/test_interface.py` | testes do servidor e do front | o fluxo novo está na SPEC-WEB |

Bibliotecas fechadas neste desenho:

- `sanitize-html` faz a allowlist. A configuração abaixo é obrigatória; o default da biblioteca não vale.
- `uuid` gera o UUID v5. O namespace continua `d1698526-798c-54c8-b0e5-cfba1794bddb`.
- Zod valida a estrutura do JSON de entrada e os corpos da API. Não há OpenAPI nem geração de código.
- `@fastify/multipart` grava o upload em disco por streaming.
- Piscina executa a conversão em `worker_threads`. O processo principal do servidor não sanitiza.
- `archiver` monta o zip em fluxo. `fflate` fica de fora: o lote pode ser grande e o zip não deve residir inteiro na memória.
- Vitest, Testing Library, MSW, Playwright, ESLint e Prettier cobrem núcleo, API e telas.

Pré-passo herdado de `_FECHO_VAZIO`: antes da sanitização, remover `embed` e `img` que tenham fecho explícito, porque o parser trata as duas como vazias e deixaria o miolo escapar. A expressão de referência é `<(embed|img)\b[^>]*>.*?</\1\s*>`, sem distinção de maiúsculas e atravessando linhas.

Configuração normativa do `sanitize-html`:

- `allowedTags`: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`.
- `allowedAttributes`: `colspan` e `rowspan` só em `th` e `td`.
- `disallowedTagsMode`: `discard`, para desembrulhar o restante e manter o texto.
- `nonTextTags`: exatamente `script`, `style`, `iframe`, `object`, `embed`. Essa lista substitui o default da biblioteca, que também descarta `textarea`, `option` e `noscript`. O teste da CA-06 cobre as cinco tags e o miolo de cada uma.

Depois dessa passagem única, o núcleo poda `p` e `h1`–`h6` vazios pela regra da SPEC.md e resserializa no estilo de `_serializar`: `<br>` sem barra, entidades já decodificadas, escape de `<`, `>` e `&` no texto, aspas escapadas nos atributos. Essa resserialização aproxima os bytes. O critério de paridade entre Python e TypeScript é a forma canônica, descrita na estratégia de equivalência.

## Chave antiga

Na tag `python-final`, o UUID era `uuid5` do namespace fixo, e o nome era o SHA-256 hexadecimal em minúsculas dos bytes UTF-8 do corpo já sanitizado, podado e resserializado, unido por `\n`, sem o `\n` extra do arquivo. Corpo vazio usava o SHA-256 da string vazia. `codigoDisciplina` e `documentId` ficavam fora.

Essa chave depende do serializador: `nh3` (html5ever) e, em seguida, `html.parser`. `sanitize-html` (htmlparser2) não reproduz entidades, aspas, `tbody` implícito nem `&nbsp;` da mesma forma. Manter o hash do HTML sanitizado mudaria os UUIDs de modo imprevisível a cada diferença de biblioteca.

A inspeção não demonstrou campo de origem estável. `documentId` embute o instante de gravação. `source.sha256` é o hash do DOCX e a SPEC.md o deixa fora da identidade.

## D-UUID

Status: fechada. O default abaixo foi aprovado e o RF-14 da SPEC.md é o contrato vigente.

Default aprovado:

- O namespace e a forma `uuid5(namespace, sha256hex)` permanecem. O nome do `uuid5` é o hexadecimal em minúsculas, não os bytes da string canônica.
- A string canônica começa por `conteudo-v1` e uma quebra de linha `\n`.
- Cada bloco objeto entra na ordem do array, exceto `imageGroup`, `image` e bloco que não é objeto. `image` entra na exclusão junto com `imageGroup`: o `src` é Base64 e não pode participar da chave. No corpus há 4 blocos `image` e 37 `imageGroup`.
- O registro é `tipo + U+001F + texto + U+001E`.
- Entram `paragraph`, `heading`, `table`, `aside`, `list` e qualquer outro tipo objeto. `list` entra mesmo sem ser emitido no txt. Há 26 blocos `list` no corpus (`ordered` e `items` de strings). Incluir `list` é subdecisão deste default.
- `paragraph`: se `html` for string, o texto é o texto visível desse HTML; senão, o campo `text` se for string; senão, vazio.
- `table`: se `html` for string e, sem espaços à esquerda, não for vazia, o texto é o texto visível desse HTML; senão, o `text` de cada célula de `rows`, com U+0009 entre células e `\n` entre linhas. Célula que não é objeto contribui string vazia. Linha que não é lista é ignorada.
- `heading`, `aside` e outro tipo: o campo `text` se for string; senão, vazio. Em `list`, o texto é `1` ou `0` conforme `ordered` seja o booleano verdadeiro, uma quebra de linha, e os `items` que são string unidos por `\n`.
- Normalização do texto visível: sem NFC, sem trim, sem colapsar espaço. A tabulação permanece.
- `codigoDisciplina` e `documentId` continuam fora da chave.

Texto visível, algoritmo próprio, sem `sanitize-html`:

1. Remover comentários `<!-- ... -->`.
2. Remover `script`, `style`, `iframe`, `object` e `embed`, tag e miolo, sem distinção de maiúsculas. A contagem de profundidade é por nome de tag. Sem fecho, a remoção vai até o fim da string.
3. Remover `img` e `embed` com fecho explícito e também a tag `img` vazia.
4. Remover as tags restantes.
5. Decodificar, numa passagem, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`, `&#39;`, `&#` decimal `;` e `&#x` hexadecimal `;`. Os nomes são sensíveis a maiúsculas. Entidade sem ponto e vírgula permanece.

No documento da FAMÍLIA, 194 parágrafos têm `text` e `html`. 162 batem com o HTML sem tags. 17 trocam a tabulação do sumário por espaço no campo `text`. 15 perdem um espaço final que o `html` conserva. Por isso o default lê o `html` quando ele existe: a saída do conversor também sai do `html`. O sumário, inclusive a tabulação das entradas, deixa de ir para a saída.

Consequências registradas:

- Os UUIDs mudam uma única vez, na migração.
- Trocar `codigoDisciplina` não muda o UUID nem o nome do txt. O código fica em `relacao.csv`.
- Mudança só de marcação (`<strong>`, `class`, aspas de atributo) deixa de mudar o UUID. No Python ela muda, porque o hash é o HTML sanitizado.
- Dois documentos cujo texto visível coincide e cuja marcação difere passam a colidir pelo RF-24 quando o código sanitizado também coincide.
- Um documento só com `imageGroup` ou `image` tem a chave `conteudo-v1\n`. O UUID muda em relação ao SHA-256 da string vazia, e documentos nessa situação compartilham o UUID entre si, como hoje compartilham o UUID do corpo vazio.
- O bloco `list` entra no txt como `<ul>` ou `<ol>` (RF-32).

Riscos de divergência que a forma canônica dos testes absorve, e que não entram na chave:

- `tbody` implícito: o html5ever pode inserir; o htmlparser2, não. O exemplo real já traz `<tbody>`. Tabela montada por `rows` não traz.
- `&nbsp;` e outras entidades podem sair como caractere ou como entidade. O Python, depois do `nh3`, grava o caractere.
- `<br>` contra `<br />`, ordem de atributos, aspas e espaço entre tags.
- O default de `nonTextTags` descartaria `textarea`, `option` e `noscript`. A configuração normativa não deixa isso acontecer.

`list` entra no txt como `<ul>` ou `<ol>`. `image` sem `src` Base64 válido continua de fora, com motivo `bloco_ignorado:image`.

## Equivalência

Os testes Vitest em `packages/core/test` são o contrato executável. As fixtures ficam em `packages/core/test/fixtures/`.

- As saídas de referência das fixtures, quando versionadas, ficam em `packages/core/test/golden/`.
- Uma amostra de 50 a 100 JSON reais fica fora do git. `Exemplo/` tem 12 documentos únicos (o arquivo da FAMÍLIA está duplicado pelo nome sem acento, com o mesmo `documentId` e o mesmo `source.sha256`) e não substitui essa amostra. O caminho da amostra é informado na hora, sem entrar no repositório.

Paridade:

- O mesmo status por arquivo.
- O mesmo nome de saída, exceto o UUID, conforme a D-UUID.
- As mesmas colunas do CSV nas demais posições: `codigoDisciplina`, `arquivo_origem`, `arquivo_saida` só no que não depende do UUID, e `status`. O nome vigente é `{uuid}.txt`.
- O mesmo `erros.log`.
- HTML sanitizado equivalente.

HTML equivalente é a forma canônica, calculada por um helper só de teste: parse e resserialização determinística, com ordem de atributos estável, entidades decodificadas, `tbody` implícito inserido e tag vazia escrita como `<br>`. Divergência que sobrevive a essa forma é divergência de conteúdo.

Toda divergência de conteúdo entra num relatório com decisão proposta: corrigir o TypeScript, ou aceitar e registrar nesta SPEC. Divergência de fixture quebra o teste. O relatório da amostra externa fica fora do git e trunca qualquer trecho em 200 caracteres. Aceitar uma divergência altera esta SPEC antes de afrouxar o teste.

## Desempenho

Medir na amostra real, com a sanitização dentro do worker: tempo total do lote e pico de memória do processo. A comparação com o conversor antigo, se for feita, usa o checkout da tag `python-final` fora desta árvore.

Limite proposto na época da migração: tempo total até 2× o conversor da tag e pico de memória até 2×. Se a memória estourar esse limite, avaliar parsing em streaming que ignore imagens (`stream-json` ou equivalente), e só então. Não introduzir streaming antes da medição.

## Fases

1. D-UUID aprovada e RF-14 atualizado na SPEC.md antes dos testes novos.
2. Fase 1. Portar os testes do núcleo para Vitest em vermelho. Implementar `@conversor/core` e a CLI até verde. Códigos de saída iguais aos da SPEC.md.
3. Fase 2. As fixtures vivem em `packages/core/test/fixtures` e o Vitest confere status e conteúdo sem processo Python.
4. Fase 3. API e jobs da SPEC-WEB. A Piscina devolve os corpos na ordem de entrada.
5. Fase 4. As duas telas, os estados, a acessibilidade e a regra de lint que proíbe `dangerouslySetInnerHTML`.
6. Fase 5. Playwright no fluxo de converter e baixar. Medição de tempo e memória. Registrar os números ao lado do limite deste documento.
7. Remoção do Python, aprovada. Saíram `conversor/`, os testes pytest, `pytest.ini` e `requirements.txt`. A tag `python-final` permanece como histórico e não se move.

## Remoção

O código Python saiu do repositório. A tag `python-final` não se move.
