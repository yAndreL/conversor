# SPEC: conversor de JSON para TXT

Contrato do conversor em lote. A inspeção que o sustenta está em [INSPECAO.md](INSPECAO.md). A migração está em [SPEC-MIGRACAO.md](SPEC-MIGRACAO.md). O contrato da interface web está em [SPEC-WEB.md](SPEC-WEB.md). A D-UUID foi aprovada: o RF-14 abaixo é o contrato vigente.

Cada teste futuro cita o RF ou o CA que cobre. Mudou o comportamento, esta SPEC muda antes do código.

## Identidade do documento

O `documentId` do exemplo é `doc_mvfof1t1_d3596db72381c296`.

- `mvfof1t1` em base36 é o instante `2026-10-19T19:57:48.133Z`, igual a `updatedAt` e a `audit.savedAt`. É timestamp de gravação.
- O sufixo `d3596db72381c296` não é prefixo nem trecho de SHA-256, SHA-1 ou MD5 de `title`, `originalName`, `slug`, `contentHtml`, `source`, `audit`, `eduno`, `replicaSequence` nem do arquivo. Também não aparece em `source.sha256`.

A inspeção não demonstrou uma chave de origem estável. O UUID do txt é aleatório, versão 4, conforme RF-14.

## Contrato de entrada e saída

Entrada: pasta informada por `--entrada`. Entram todos os `.json` em profundidade. Link simbólico de arquivo ou de diretório não é seguido. A ordem é a ordem lexicográfica do caminho relativo com barras `/`.

Cada documento convertido usa `blocks` e `codigoDisciplina`. `documentId` não entra na identidade nem no nome.

Saída: pasta plana `--saida`, default `output/`. A pasta é criada se ainda não existir. Não recria subpastas da entrada.

- `{uuid}az{codigoSanitizado}.txt` em UTF-8, sem BOM. Os fragmentos sanitizados são unidos por `\n`. Se essa string não é vazia, o arquivo termina com um `\n` a mais. O txt não leva `<html>`, `<body>`, o código nem o UUID no corpo.
- `relacao.csv`, reescrito do zero, na ordem dos convertidos. Colunas: `codigoDisciplina`, `uuid`. Um registro por arquivo `convertido`. O cabeçalho não entra nessa conta. Erro, `sem_codigo` e colisão não entram.
- `resultado.csv`, reescrito do zero, na mesma ordem dos arquivos de entrada. Colunas: `codigoDisciplina`, `uuid`, `arquivo_origem`, `arquivo_saida`, `status`. Uma linha por JSON. O mesmo código pode ocupar várias linhas. `arquivo_origem` é o caminho relativo com `/`. `arquivo_saida` é só o nome do txt. A coluna `codigoDisciplina` guarda a string usada na conversão, antes da limpeza de nome de arquivo. Para um inteiro, essa string é a representação decimal.
- `erros.log`, reescrito do zero. Cada linha é `referencia`, tabulação, `motivo`. A referência de um JSON é o caminho relativo. A de um órfão é o nome do arquivo.

Status: `convertido`, `sem_codigo`, `erro`. Em `sem_codigo` e `erro`, `uuid` e `arquivo_saida` ficam vazios e não há txt.

Stdout, seis linhas, nesta ordem:

```
lidos: N
convertidos: N
erros: N
sem_codigo: N
codigos_repetidos: N
orfaos: N
```

`codigos_repetidos` conta códigos distintos com mais de uma linha `convertido`. `orfaos` conta os arquivos descritos em RF-27.

Interface de linha de comando: `conversor --entrada DIR --saida DIR [--limpar] [--estrito]`.

Identificadores de código em inglês. Comentários, documentação e os nomes `resultado.csv` e `erros.log` em português. Os campos do schema permanecem como estão (`codigoDisciplina`, `documentId`, `blocks`).

Motivos do log: `leitura`, `json_invalido`, `blocks_invalidos`, `sem_codigo`, `tipo_codigo`, `bloco_ignorado:{tipo}`, `tela_navegador`, `colisao`, `orfao`. `tela_navegador` não muda o status.

## Decisões fechadas

- O sumário que estiver em `blocks` não sai. É título de sumário o bloco cujo texto visível, sem acento e sem distinção de maiúsculas, é `sumario`, ou cujo `id` normalizado é `sumario`. Na sequência contínua depois dele, também não saem os parágrafos de entrada: miolo formado só por âncoras com `href` interno (`#...`), ou texto visível que termina em tabulação ou pontilhado seguido do número da página. O bloco seguinte, inclusive a âncora vazia `<a id="_Toc..."></a>`, permanece. Essas entradas não saem no txt. O `<a>` que não for sumário continua desembrulhado: `href` e `id` somem, e o texto fica.
- Quando o texto visível do link é a própria URL, a URL permanece no txt.
- O UUID é aleatório. O nome do txt junta esse UUID, o literal `az` e o código sanitizado. Dois conteúdos iguais geram dois arquivos.
- O número de `UNIDADE` ou `CAPÍTULO` define o nível dos títulos numerados que o continuam, conforme RF-05. Título sem número, título numerado antes da primeira unidade e número que não continua a unidade aberta conservam `level` e `tag`. Essa troca não muda o UUID.
- `tbody` permanece na allowlist, como em `ideia/prompt.md`.
- Inteiro que não é booleano vira string decimal e é aceito. `float`, `bool`, lista e objeto ficam `erro`.
- No fim da execução, órfãos são listados e contados. Nada é apagado, salvo com `--limpar`.
- `--estrito` devolve 1 quando existe linha `erro`.
- `txt`, `relacao.csv`, `resultado.csv` e `erros.log` são gravados em arquivo temporário na pasta de destino e renomeados por cima do destino.

## Requisitos

- RF-01. Ler todos os `.json` sob `--entrada`, em profundidade, sem seguir link simbólico de arquivo nem de diretório, em ordem lexicográfica do caminho relativo com `/`.
- RF-02. Arquivo ilegível, JSON inválido, ou `blocks` ausente ou de outro tipo que não seja lista: status `erro`, motivo `leitura`, `json_invalido` ou `blocks_invalidos`. O lote segue.
- RF-03. Montar o corpo só a partir de `blocks`, na ordem do array. Ignorar `toc`, `headings`, `contentHtml`, `images`, `counts` e o restante dos metadados. O sumário que estiver dentro de `blocks` é omitido, junto com as entradas contínuas descritas na decisão fechada. O restante do corpo é emitido. A mesma omissão vale para o txt.
- RF-04. `paragraph`: se `html` for string, esse é o miolo; senão, `text` entra como texto. Embrulhar em `<p>` antes da sanitização única. Texto vazio, medido depois do sanitizador sobre o texto já decodificado: remover tabulação, quebras de linha, U+00A0, os demais espaços Unicode, U+200B, U+200C, U+200D, U+2060 e U+FEFF; se nada restar, o texto está vazio. Remover o `<p>` com texto vazio e sem `<br>`. Esses caracteres continuam no txt quando o parágrafo tem outro texto.
- RF-05. `heading`: emitir `<h1>` a `<h6>`. Usar `level` quando estiver entre 1 e 6; senão, usar `tag` quando for `h1` a `h6`. O `text` entra como texto. Level e tag inválidos: não emitir, motivo `bloco_ignorado:heading`, seguir com o arquivo. Depois da sanitização, remover o heading com texto vazio pela definição de RF-04. O nível da tag segue o número da unidade, na ordem dos headings válidos com texto não vazio, depois da omissão do sumário. O texto é comparado sem acento, sem distinção de maiúsculas e com espaços colapsados. `UNIDADE` ou `CAPÍTULO` seguido de número arábico ou romano (`UNIDADE I`, `UNIDADE 2`, `CAPÍTULO IV`) abre esse número no nível 1 e vale até a próxima unidade ou capítulo numerado. Um título numerado que continua o número aberto desce uma casa por parte além dele, no máximo `h6`: sob `UNIDADE I`, `1.1.` é `h2` e `1.1.1.` é `h3`. O título cujo número é exatamente o da unidade, como `1. Introdução da unidade` sob `UNIDADE I`, é filho dela (`h2`); o `1.1.` seguinte continua esse título e vira `h3`. A tag de origem não importa para esses títulos numerados: um `h6` escrito `1.1.` sob a unidade sai no nível calculado. Título sem numeração permanece no nível de origem. Título numerado antes da primeira unidade, ou cujo número não continua a unidade aberta, permanece no nível de origem. A troca de nível não altera a chave do UUID.
- RF-06. `table`: no exemplo, `html` já contém o `<table>` externo e começa com `<table><tbody>`. Se `html` for string não vazia e, sem espaços à esquerda e sem distinção de maiúsculas, começar com `<table`, usar o fragmento como está. Se `html` for string não vazia e não trouxer esse elemento externo, embrulhar uma vez em `<table>`. Sem `html`, montar `<table>` a partir de `rows`: célula `th` ou `td`, qualquer outra tag vira `td`, texto como texto, `colspan` e `rowspan` só quando forem inteiros maiores que 1.
- RF-07. `aside`: emitir `<p>` com `text` como texto. Ignorar `role`. Texto vazio pela definição de RF-04: não emitir.
- RF-32. `list`: emitir `<ol>` quando `ordered` for o booleano verdadeiro; caso contrário, `<ul>`. Cada item string de `items` vira `<li>` com o texto escapado, na ordem do array. Item que não é string não entra. Sem nenhum item string, não emitir HTML e não registrar `bloco_ignorado`.
- RF-08. `imageGroup`: emitir `<p>` com um `<img>` por item de `images` cujo `src` seja `data:image/<mime>;base64,<carga>`. A carga só pode ter o alfabeto Base64. `alt` string não vazia entra no atributo `alt`. `src` que não seja essa URI não entra. O mesmo vale para o bloco `image`, lendo `src` e `alt` do próprio bloco; sem URI válida, o motivo é `bloco_ignorado:image`.
- RF-33. JPEG `data:image/jpeg;base64` ou `data:image/jpg;base64`, em paisagem e com largura de pelo menos 800 px, cuja faixa inferior destoa da faixa de cima, gera o motivo `tela_navegador` uma vez por arquivo. A imagem permanece no txt e o status continua `convertido`.
- RF-09. Tipo de bloco ausente ou desconhecido: não emitir, motivo `bloco_ignorado:{tipo}`, seguir. O arquivo continua `convertido` se o código for válido.
- RF-10. Montar o documento inteiro e passar essa string uma única vez no sanitizador. Tags permitidas: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`. Nenhum atributo, exceto `colspan` e `rowspan` em `th` e `td`. Descartar tag e miolo de `script`, `style`, `iframe`, `object` e `embed`. Tag fora da allowlist e fora dessa lista é desembrulhada, e o conteúdo interno fica.
- RF-11. `<a>` sai e o texto interno fica. `href` e `id` somem. A URL fica somente quando ela é o texto visível.
- RF-12. `<img>` com `src` `data:image/...;base64,...` permanece, com `alt` quando existir. `<img>` sem essa URI sai. Outra URI `data:` sai. `script`, `style`, `iframe`, `object` e `embed` saem junto com o conteúdo interno.
- RF-13. A limpeza de `<p>` e de `h1`–`h6` vazios acontece depois do sanitizador. O marcador `<a id="..."></a>` cai nessa regra.
- RF-14. O UUID é a versão 4, aleatória, em minúsculas, 36 caracteres, com hífens. Cada arquivo convertido recebe um UUID novo. O conteúdo, o `codigoDisciplina`, o `documentId` e o nome do JSON não entram no UUID. O UUID não aparece no txt.
- RF-15. Nome do arquivo: `{uuid}az{codigoSanitizado}.txt`. `codigoSanitizado` é o de RF-16. Exemplo: `3f1c2a80-7b4e-4d2a-8c11-0a1b2c3d4e5faz70132.txt`.
- RF-16. `codigoSanitizado`, nesta ordem: remover `\ / : * ? " < > |`, todo espaço em branco, caracteres de controle e DEL; remover pontos finais; cortar em 80 caracteres e remover de novo um ponto que tenha ficado no fim. Manter acentos, vírgula e os demais sinais. Não normalizar Unicode. Se o resultado, sem distinção de maiúsculas, for `CON`, `PRN`, `AUX`, `NUL`, `COM0` a `COM9` ou `LPT0` a `LPT9`, tratá-lo como vazio.
- RF-17. `codigoDisciplina` ausente, nulo, string vazia ou reduzido a vazio por RF-16: não gerar txt, status `sem_codigo`, motivo `sem_codigo`.
- RF-18. `int` que não seja `bool` é aceito e convertido para a representação decimal, sem `.0`. `float`, `bool`, lista e objeto: status `erro`, motivo `tipo_codigo`, sem txt.
- RF-19. `resultado.csv` com as colunas, a cardinalidade 1:N e a ordem deste contrato, reescrito a cada execução.
- RF-31. `relacao.csv` com as colunas `codigoDisciplina` e `uuid`, um registro por status `convertido`, na ordem do lote. O número de registros é o número de arquivos convertidos. Reescrito a cada execução.
- RF-20. `erros.log` recebe leitura, JSON inválido, `blocks` inválido, `sem_codigo`, tipo inválido, bloco ignorado, colisão e órfão. Um arquivo com erro não interrompe o lote.
- RF-21. Imprimir o resumo no formato deste contrato.
- RF-22. Duas execuções com a mesma entrada produzem o mesmo corpo de cada txt. O UUID e o nome mudam a cada execução. O CSV muda nesses dois campos.
- RF-23. Caminho com espaço, acento e vírgula é lido, e o caminho relativo aparece em `arquivo_origem`.
- RF-24. Na mesma execução, dois resultados com o mesmo nome de txt: o primeiro fica `convertido` e o txt permanece; o segundo fica `erro`, motivo `colisao`, sem sobrescrever o txt. Conteúdos iguais não caem nesta regra, porque cada arquivo recebe um UUID aleatório.
- RF-26. Documento com código válido e corpo sanitizado vazio gera txt vazio, de zero bytes, e status `convertido`.
- RF-27. No fim, cada arquivo diretamente em `--saida` cujo nome casa com `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:az.+)?\.txt$` e que não foi gerado nesta execução entra em `erros.log` com motivo `orfao` e na contagem `orfaos`. Por padrão, o arquivo permanece.
- RF-28. `--limpar` apaga só os órfãos de RF-27. Qualquer outro arquivo da pasta permanece, inclusive txt gerado nesta execução e arquivo que não casa com a expressão.
- RF-29. Cada txt, os CSV e o log são escritos num arquivo temporário na própria `--saida`, com sufixo `.tmp`, e só então renomeados para o nome final. Depois de uma execução bem-sucedida não resta `.tmp`. Falha ao publicar um txt: aquele arquivo fica `erro`. Falha ao publicar um CSV ou o log: a execução termina com código 1.
- RF-30. `--estrito`: código de saída 1 se houver ao menos uma linha `erro`. `sem_codigo` e `orfao`, sozinhos, não acionam `--estrito`.

## Sanitização

O documento é montado e sanitizado uma vez. Heading, aside e item de lista entram como texto: na serialização, `<`, `>`, `&` e aspas são escapados para o sanitizador recebê-los como texto. Parágrafo e tabela entram como HTML. Não há segunda passagem de escape.

| Situação | Efeito |
| --- | --- |
| `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1`–`h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote` | Tag e conteúdo permanecem |
| `colspan`, `rowspan` em `th` e `td` | Atributos permanecem |
| Qualquer outro atributo | Sai |
| `a` e outra tag fora da allowlist e fora de `clean_content_tags` | A tag sai e o conteúdo interno fica |
| `script`, `style`, `iframe`, `object`, `embed` | Tag e conteúdo interno saem |
| `img` com `src` `data:image/...;base64,...` | Permanece, com `alt` |
| `img` sem essa URI, e outra URI `data:` | Saem |
| `imageGroup` e `image` com `src` Base64 válido | Entram como `<p><img src="..." alt="..."></p>` |
| `list` com ao menos um item string | Entra como `<ul>` ou `<ol>`, com um `<li>` por item string |
| `p` ou `h1`–`h6` com texto vazio e, no caso do `p`, sem `br` | Sai depois do sanitizador |

## Erros e código de saída

Pasta de entrada inexistente, ilegível, ou pasta de saída que não pode ser criada: a execução para com código 1.

Sem `--estrito`, um lote que terminou devolve 0, mesmo com linhas `erro` ou `sem_codigo`.

Com `--estrito`, o lote devolve 1 se existir linha `erro`.

## Critérios de aceitação

- CA-01 (RF-04, RF-10). Dado um parágrafo com `<strong>` e `class`. Quando converter. Então o txt contém `<p><strong>...</strong></p>` e o atributo sai.
- CA-02 (RF-05). Dado um heading `h2`. Quando converter. Então a saída contém `<h2>` com o texto escapado.
- CA-30 (RF-05, RF-14). Dado INTRODUÇÃO, `UNIDADE I`, `1.1.`, `1.1.1.`, um título sem número e CONSIDERAÇÕES FINAIS, todos `h1`. Quando converter. Então as tags são `h1`, `h1`, `h2`, `h3`, `h1` e `h1`. Dado o mesmo texto com todos os headings em `h3`. Quando converter. Então `UNIDADE I` sai `h1`, `1.1.` sai `h2`, `1.1.1.` sai `h3`, os títulos sem número permanecem `h3` e o UUID coincide. Dado `1. Introdução da unidade`, `1.1.` e `1.1.1.` sob `UNIDADE I`. Quando converter. Então saem `h2`, `h3` e `h4`. Dado um `h6` em `1.2.` entre títulos da mesma unidade. Quando converter. Então esse `1.2.` sai no mesmo nível dos irmãos `1.1.` e `1.3.`. Dado `1. Capítulo` em `h2` antes de qualquer unidade. Quando converter. Então permanece `h2`. Dado só `1.1`, `1.2` e `1.1.1`, sem unidade. Quando converter. Então os três permanecem no nível de origem. Um heading vazio ou inválido não entra na conta.
- CA-03 (RF-11, RF-13). Dado um link com `href` e um `<a id>` vazio. Quando converter. Então o texto do link permanece, `href` e `id` somem, e o parágrafo vazio não aparece.
- CA-04 (RF-06, RF-10). Dado um `html` de tabela que já começa com `<table><tbody>`, tem `style` e `colspan="2"`, e uma célula com lista. Quando converter. Então existe um único `<table>`, o `tbody` permanece, `style` sai, `colspan="2"` fica e a lista fica como `ul`/`li`. Dado um `html` só com o miolo. Quando converter. Então um `<table>` externo é acrescentado.
- CA-05 (RF-08, RF-12). Dado um `imageGroup` com `src` `data:image/jpeg;base64,AAAA`, um `<img src="AAAA">` e um `<img src="data:image/png;base64,BBBB">` dentro de parágrafos. Quando converter. Então os dois `src` Base64 permanecem em `<img>` e o `src` `AAAA` sai.
- CA-06 (RF-10, RF-12). Dado `script`, `style`, `iframe`, `object` e `embed`, cada um com texto interno próprio. Quando converter. Então as cinco tags e os cinco textos internos saem.
- CA-07 (RF-07). Dado um aside com texto. Quando converter. Então esse texto aparece dentro de `<p>`.
- CA-08 (RF-14, RF-22). Dado o mesmo JSON duas vezes, com a mesma pasta de saída inicial. Quando converter duas vezes. Então o UUID e os bytes do txt coincidem, e o UUID não está no txt.
- CA-09 (RF-16, RF-17, RF-18). Dado código ausente, vazio, só com caracteres removidos por RF-16, nome reservado do Windows ou só um ponto final. Quando converter. Então não há txt e o status é `sem_codigo`. Dado `float`, `bool`, lista ou objeto. Quando converter. Então o status é `erro`. Dado o inteiro `42`. Quando converter. Então há txt, a coluna `codigoDisciplina` é `42` e o nome é `{uuid}az42.txt`.
- CA-10 (RF-19, RF-22). Dado dois JSON com o mesmo código e corpos diferentes, na mesma pasta de saída inicial. Quando converter duas vezes. Então o CSV tem duas linhas, os UUIDs diferem e a segunda execução repete os bytes da primeira.
- CA-11 (RF-02, RF-20). Dado um JSON inválido no meio de um lote válido. Quando converter. Então os válidos geram txt e o inválido fica `erro` com motivo `json_invalido`.
- CA-12 (RF-23). Dado um caminho com espaço, acento e vírgula. Quando converter. Então o arquivo é lido e o caminho aparece em `arquivo_origem`.
- CA-13 (RF-03). Dado `toc`, `headings` e `contentHtml` com texto que não está em `blocks`. Quando converter. Então só o conteúdo de `blocks` aparece.
- CA-14 (RF-08, RF-14, RF-26). Dado um JSON cujo único bloco é `imageGroup` com `src` Base64 válido. Quando converter. Então o txt contém o `<img>` e o status é `convertido`. Dado outro `src` Base64. Quando converter. Então o UUID muda. O mesmo `src` mantém o UUID.
- CA-15 (RF-03, RF-11, RF-14). Dado um título `SUMÁRIO` ou `Sumário`, entradas com `href` `#_Toc` ou `#_bookmark`, uma linha `REFERÊNCIAS` pontilhada e, depois, o mesmo corpo. Quando converter. Então o sumário não aparece, o corpo aparece, a URL visível permanece e os dois arquivos ficam `convertido`, cada um com o seu txt.
- CA-16 (RF-11). Dado um link cujo texto e cujo `href` são `https://www.youtube.com/watch?v=cYefPOPuHOE`. Quando converter. Então a URL permanece como texto e o `href` sai.
- CA-17 (RF-14). Dado o mesmo `blocks` com dois `documentId` diferentes. Quando converter. Então o UUID é o mesmo.
- CA-18 (RF-14). Dado dois textos visíveis diferentes. Quando converter. Então os UUIDs diferem. Dado o mesmo texto visível com marcações diferentes. Quando converter. Então o UUID é o mesmo.
- CA-19 (RF-14, RF-15). Dado o mesmo corpo com dois `codigoDisciplina` diferentes. Quando converter. Então os dois ficam `convertido`, os UUIDs diferem e os nomes terminam em `az` seguido do código sanitizado.
- CA-20 (RF-14, RF-15). Dado dois JSON com o mesmo código e o mesmo corpo na mesma execução. Quando converter. Então os dois ficam `convertido`, cada um com o seu txt.
- CA-21 (RF-27, RF-28). Dado um txt antigo que casa com a expressão de órfão e um arquivo `notas.txt` na pasta de saída. Quando converter sem `--limpar`. Então os dois permanecem, o log tem uma linha `orfao` e o resumo conta 1. Quando converter com `--limpar`. Então só o órfão sai e `notas.txt` permanece.
- CA-22 (RF-01). Dado um `.json` em subpasta, um `.json` apontado por link simbólico e um diretório apontado por link simbólico. Quando converter. Então o arquivo da subpasta entra, os dois links não entram, e a ordem dos caminhos relativos é lexicográfica.
- CA-23 (RF-02). Dado um JSON sem `blocks` e outro em que `blocks` é um objeto. Quando converter. Então os dois ficam `erro` com motivo `blocks_invalidos` e o lote segue.
- CA-24 (RF-09). Dado um bloco de tipo desconhecido junto de um parágrafo válido. Quando converter. Então o parágrafo aparece, o bloco desconhecido não aparece, o status é `convertido` e o log contém `bloco_ignorado:{tipo}`.
- CA-32 (RF-33). Dado um JPEG paisagem com faixa inferior escura. Quando converter. Então o `<img>` sai, o status é `convertido` e o log contém `tela_navegador`.
- CA-31 (RF-32). Dado um `list` com `ordered` falso, itens string e um item que não é string, outro `list` com `ordered` verdadeiro e um `list` sem item string. Quando converter. Então o primeiro sai `<ul>` com o texto escapado, o segundo sai `<ol>`, o terceiro não gera HTML, o status é `convertido` e o log não contém `bloco_ignorado:list`.
- CA-25 (RF-15). Dado um convertido de código `ADS001`. Quando olhar o nome. Então ele é `{uuid}azADS001.txt`, com UUID versão 4 em minúsculas, 36 caracteres e hífens.
- CA-26 (RF-21). Dado um lote com convertidos, erro, sem código, código repetido e um órfão. Quando converter. Então o stdout tem as seis linhas do contrato, com os números desse lote.
- CA-27 (D-08, RF-30). Dado `--entrada` inexistente. Quando converter. Então o código de saída é 1. Dado um lote com uma linha `erro`. Quando converter sem `--estrito`. Então o código é 0. Quando converter com `--estrito`. Então o código é 1. Dado um lote só com `sem_codigo` e `--estrito`. Quando converter. Então o código é 0.
- CA-28 (RF-04, RF-13). Dado um parágrafo só com espaços, outro só com `&nbsp;` e outro só com U+200B. Quando converter. Então os três não aparecem. Dado um parágrafo só com `<br>`. Quando converter. Então ele permanece.
- CA-29 (RF-29). Dado um lote que termina bem. Quando a execução acaba. Então a pasta de saída não contém arquivo com sufixo `.tmp`.

O teste de integração com o exemplo real é ignorado se o arquivo não existir. Ele confere presença de Base64 das imagens, ausência de `href` e do sumário, presença do título do corpo, e uma linha `convertido` no CSV.

As fixtures em `tests/fixtures/` são mínimas, com Base64 substituído por `AAAA`: uma por tipo real (`paragraph`, `heading`, `table`, `imageGroup`, `aside`) e uma sintética com `script`, `style`, `iframe`, `object`, `embed`, link, atributo inline, `colspan`, código ausente, vazio, inválido e inteiro.

## Decisões em aberto

O default de cada uma já está nos requisitos. Mudar o default altera esta SPEC antes do código.

- D-02. Aside fora da allowlist. Default: `<p>` com o texto (RF-07).
- D-03. Tabela com `html` e `rows`. Default: preferir `html` (RF-06).
- D-05. Tamanho máximo do código sanitizado. Default: 80 caracteres (RF-16). O corte não entra no nome do txt.
- D-06. Subpastas. Default: leitura recursiva, sem link simbólico (RF-01).
- D-07. `sem_codigo` no log. Default: entra em `erros.log` e na contagem separada do resumo (RF-20, RF-21).
- D-08. Código de saída sem `--estrito`. Default: 0 se o lote terminou, inclusive com linhas `erro`; 1 se a pasta de entrada não puder ser lida ou a de saída não puder ser criada. `--estrito` é decisão fechada e está em RF-30.
- D-09. Colisão de nome na mesma execução. Default: o segundo arquivo fica `erro` e o primeiro txt permanece (RF-24).
- D-10. Bloco ou heading inválido. Default: pular, registrar e continuar o arquivo (RF-05, RF-09).
- D-11. Corpo vazio. Default: txt de zero bytes com status `convertido` (RF-26).
- D-12. Saída plana e CSV com o código antes da limpeza do nome. Default: não recriar subpastas. RF-16 decide `sem_codigo` e não compõe o nome do txt.
- D-13. O mesmo conteúdo sob dois códigos. Default: um UUID aleatório para cada arquivo e o nome `{uuid}az{codigoSanitizado}.txt` (RF-14, RF-15). Os dois ficam `convertido`. `relacao.csv` guarda os dois.

## Interface local

A interface é local e segue a linguagem visual de [Design/DESIGN.md](../Design/DESIGN.md) e as duas telas do Stitch: converter e arquivos processados. Ela não altera o contrato de conversão.

- A interface local sobe em `http://127.0.0.1:8765`.
- A tela de conversão envia arquivos `.json` e executa o mesmo lote.
- A tela de arquivos lista os txt gerados. Com o lote concluído, a primeira linha é `relacao.csv`.
- As regras de sanitização são as deste contrato, sempre aplicadas. A tela não oferece preservar Markdown nem mostra métricas de compressão, que existem só no mockup.

## Fora de escopo

- Paralelismo e chamada à API `eduno`.
- Ler DOCX ou baixar imagem. A imagem que já está em Base64 no bloco entra no HTML.
- Tratar a string `DESENVOLVIMENTO` como caso especial.
- Colocar o UUID dentro do txt.
- Exigir que `schema` seja `json-convert.document.v4`. A validação é estrutural.
- Usar `source.sha256` como chave. A inspeção não mostrou que o `documentId` deriva dele.

## Verificação estática

A ordem do lote é a ordem lexicográfica do caminho relativo, também quando o servidor calcula os corpos em workers. A publicação e a colisão seguem essa ordem. Isso não tem critério de aceitação; a revisão do código confere.
