# SPEC: conversor de JSON para TXT

Contrato do conversor em lote. A inspeção que o sustenta está em [INSPECAO.md](INSPECAO.md).

Cada teste futuro cita o RF ou o CA que cobre. Mudou o comportamento, esta SPEC muda antes do código.

## Identidade do documento

O `documentId` do exemplo é `doc_mvfof1t1_d3596db72381c296`.

- `mvfof1t1` em base36 é o instante `2026-10-19T19:57:48.133Z`, igual a `updatedAt` e a `audit.savedAt`. É timestamp de gravação.
- O sufixo `d3596db72381c296` não é prefixo nem trecho de SHA-256, SHA-1 ou MD5 de `title`, `originalName`, `slug`, `contentHtml`, `source`, `audit`, `eduno`, `replicaSequence` nem do arquivo. Também não aparece em `source.sha256`.

A inspeção não demonstrou uma chave de origem estável. A chave do UUID é o SHA-256 do HTML final sanitizado.

## Contrato de entrada e saída

Entrada: pasta informada por `--entrada`. Entram todos os `.json` em profundidade. Link simbólico de arquivo ou de diretório não é seguido. A ordem é a ordem lexicográfica do caminho relativo com barras `/`.

Cada documento convertido usa `blocks` e `codigoDisciplina`. `documentId` não entra na identidade nem no nome.

Saída: pasta plana `--saida`, default `output/`. A pasta é criada se ainda não existir. Não recria subpastas da entrada.

- `{codigoSanitizado}_{uuid}.txt` em UTF-8, sem BOM. Os fragmentos sanitizados são unidos por `\n`. Se essa string não é vazia, o arquivo termina com um `\n` a mais. Esse `\n` final não entra na chave do UUID. O txt não leva `<html>`, `<body>` nem o UUID.
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

Interface: `python -m conversor --entrada DIR --saida DIR [--limpar] [--estrito]`.

Identificadores de código em inglês. Comentários, documentação e os nomes `resultado.csv` e `erros.log` em português. Os campos do schema permanecem como estão (`codigoDisciplina`, `documentId`, `blocks`).

Motivos do log: `leitura`, `json_invalido`, `blocks_invalidos`, `sem_codigo`, `tipo_codigo`, `bloco_ignorado:{tipo}`, `colisao`, `orfao`.

## Decisões fechadas

- O heading `SUMÁRIO` sai como heading. Os 17 parágrafos de sumário saem como qualquer parágrafo. O `<a>` é desembrulhado: `href` interno e `id` somem. O texto fica, inclusive a tabulação entre o título e o número da página.
- Quando o texto visível do link é a própria URL, a URL permanece no txt.
- A chave do UUID é o SHA-256 do HTML sanitizado. Não usa `documentId` nem timestamp. O default de D-13 deixa `codigoDisciplina` fora da chave: trocar o código muda só o prefixo do nome, e mudar o conteúdo muda o UUID.
- `tbody` permanece na allowlist, como em `ideia/prompt.md`.
- Inteiro que não é booleano vira string decimal e é aceito. `float`, `bool`, lista e objeto ficam `erro`.
- No fim da execução, órfãos são listados e contados. Nada é apagado, salvo com `--limpar`.
- `--estrito` devolve 1 quando existe linha `erro`.
- `txt`, `resultado.csv` e `erros.log` são gravados em arquivo temporário na pasta de destino e renomeados por cima do destino.

## Requisitos

- RF-01. Ler todos os `.json` sob `--entrada`, em profundidade, sem seguir link simbólico de arquivo nem de diretório, em ordem lexicográfica do caminho relativo com `/`.
- RF-02. Arquivo ilegível, JSON inválido, ou `blocks` ausente ou de outro tipo que não seja lista: status `erro`, motivo `leitura`, `json_invalido` ou `blocks_invalidos`. O lote segue.
- RF-03. Montar o corpo só a partir de `blocks`, na ordem do array. Ignorar `toc`, `headings`, `contentHtml`, `images`, `counts` e o restante dos metadados. O sumário que estiver dentro de `blocks` é emitido.
- RF-04. `paragraph`: se `html` for string, esse é o miolo; senão, `text` entra como texto. Embrulhar em `<p>` antes da sanitização única. Texto vazio, medido depois do `nh3` sobre o texto já decodificado: remover tabulação, quebras de linha, U+00A0, os demais espaços Unicode, U+200B, U+200C, U+200D, U+2060 e U+FEFF; se nada restar, o texto está vazio. Remover o `<p>` com texto vazio e sem `<br>`. Esses caracteres continuam no txt quando o parágrafo tem outro texto.
- RF-05. `heading`: emitir `<h1>` a `<h6>`. Usar `level` quando estiver entre 1 e 6; senão, usar `tag` quando for `h1` a `h6`. O `text` entra como texto. Level e tag inválidos: não emitir, motivo `bloco_ignorado:heading`, seguir com o arquivo. Depois da sanitização, remover o heading com texto vazio pela definição de RF-04.
- RF-06. `table`: no exemplo, `html` já contém o `<table>` externo e começa com `<table><tbody>`. Se `html` for string não vazia e, sem espaços à esquerda e sem distinção de maiúsculas, começar com `<table`, usar o fragmento como está. Se `html` for string não vazia e não trouxer esse elemento externo, embrulhar uma vez em `<table>`. Sem `html`, montar `<table>` a partir de `rows`: célula `th` ou `td`, qualquer outra tag vira `td`, texto como texto, `colspan` e `rowspan` só quando forem inteiros maiores que 1.
- RF-07. `aside`: emitir `<p>` com `text` como texto. Ignorar `role`. Texto vazio pela definição de RF-04: não emitir.
- RF-08. `imageGroup`: não emitir fragmento e não copiar `src`, `alt` nem Base64.
- RF-09. Tipo de bloco ausente ou desconhecido: não emitir, motivo `bloco_ignorado:{tipo}`, seguir. O arquivo continua `convertido` se o código for válido.
- RF-10. Montar o documento inteiro e passar essa string uma única vez em `nh3.clean`. Tags permitidas: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`. Nenhum atributo, exceto `colspan` e `rowspan` em `th` e `td`. `clean_content_tags`: `script`, `style`, `iframe`, `object`, `embed`. Tag fora da allowlist e fora dessa lista é desembrulhada, e o conteúdo interno fica.
- RF-11. `<a>` sai e o texto interno fica. `href` e `id` somem. A URL fica somente quando ela é o texto visível.
- RF-12. `img` e qualquer URI `data:` saem. `script`, `style`, `iframe`, `object` e `embed` saem junto com o conteúdo interno.
- RF-13. A limpeza de `<p>` e de `h1`–`h6` vazios acontece depois do `nh3.clean`. O marcador `<a id="..."></a>` cai nessa regra.
- RF-14. UUID versão 5, namespace fixo `d1698526-798c-54c8-b0e5-cfba1794bddb` (`uuid5(NAMESPACE_URL, "json-convert.document.v4")`). A chave é o SHA-256 hexadecimal em minúsculas dos bytes UTF-8 dos fragmentos já sanitizados e já unidos por `\n`, sem o `\n` extra do fim do arquivo. O nome do `uuid5` é essa chave. Ela não inclui timestamp nem `documentId`. Pelo default de D-13, também não inclui `codigoDisciplina`: trocar o código mantém o UUID e muda o prefixo do nome. Mudar o HTML sanitizado muda o UUID. O UUID não aparece no txt.
- RF-15. Nome do arquivo: `{codigoSanitizado}_{uuid}.txt`. O UUID é o canônico em minúsculas, 36 caracteres, com hífens.
- RF-16. `codigoSanitizado`, nesta ordem: remover `\ / : * ? " < > |`, todo espaço em branco, caracteres de controle e DEL; remover pontos finais; cortar em 80 caracteres e remover de novo um ponto que tenha ficado no fim. Manter acentos, vírgula e os demais sinais. Não normalizar Unicode. Se o resultado, sem distinção de maiúsculas, for `CON`, `PRN`, `AUX`, `NUL`, `COM0` a `COM9` ou `LPT0` a `LPT9`, tratá-lo como vazio.
- RF-17. `codigoDisciplina` ausente, nulo, string vazia ou reduzido a vazio por RF-16: não gerar txt, status `sem_codigo`, motivo `sem_codigo`.
- RF-18. `int` que não seja `bool` é aceito e convertido para a representação decimal, sem `.0`. `float`, `bool`, lista e objeto: status `erro`, motivo `tipo_codigo`, sem txt.
- RF-19. `resultado.csv` com as colunas, a cardinalidade 1:N e a ordem deste contrato, reescrito a cada execução.
- RF-20. `erros.log` recebe leitura, JSON inválido, `blocks` inválido, `sem_codigo`, tipo inválido, bloco ignorado, colisão e órfão. Um arquivo com erro não interrompe o lote.
- RF-21. Imprimir o resumo no formato deste contrato.
- RF-22. Duas execuções com a mesma entrada e o mesmo estado inicial de `--saida` produzem os mesmos nomes, os mesmos bytes dos txt, do CSV e do `erros.log`.
- RF-23. Caminho com espaço, acento e vírgula é lido, e o caminho relativo aparece em `arquivo_origem`.
- RF-24. Na mesma execução, dois resultados com o mesmo nome: o primeiro fica `convertido` e o txt permanece; o segundo fica `erro`, motivo `colisao`, sem sobrescrever o txt. Pelo default de D-13, o mesmo conteúdo e o mesmo código caem nesta regra. Reexecutar o mesmo conjunto grava de novo os mesmos bytes.
- RF-26. Documento com código válido e corpo sanitizado vazio gera txt vazio, de zero bytes, e status `convertido`. A chave do UUID é o SHA-256 da string vazia.
- RF-27. No fim, cada arquivo diretamente em `--saida` cujo nome casa com `^.+_[0-9a-f-]{36}\.txt$` e que não foi gerado nesta execução entra em `erros.log` com motivo `orfao` e na contagem `orfaos`. Por padrão, o arquivo permanece.
- RF-28. `--limpar` apaga só os órfãos de RF-27. Qualquer outro arquivo da pasta permanece, inclusive txt gerado nesta execução e arquivo que não casa com a expressão.
- RF-29. Cada txt, o CSV e o log são escritos num arquivo temporário na própria `--saida`, com sufixo `.tmp`, e só então renomeados para o nome final. Depois de uma execução bem-sucedida não resta `.tmp`. Falha ao publicar um txt: aquele arquivo fica `erro`. Falha ao publicar o CSV ou o log: a execução termina com código 1.
- RF-30. `--estrito`: código de saída 1 se houver ao menos uma linha `erro`. `sem_codigo` e `orfao`, sozinhos, não acionam `--estrito`.

## Sanitização

O documento é montado e sanitizado uma vez. Heading e aside entram como texto: na serialização, `<`, `>`, `&` e aspas são escapados para o `nh3` recebê-los como texto. Parágrafo e tabela entram como HTML. Não há segunda passagem de escape.

| Situação | Efeito |
| --- | --- |
| `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `h1`–`h6`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote` | Tag e conteúdo permanecem |
| `colspan`, `rowspan` em `th` e `td` | Atributos permanecem |
| Qualquer outro atributo | Sai |
| `a` e outra tag fora da allowlist e fora de `clean_content_tags` | A tag sai e o conteúdo interno fica |
| `script`, `style`, `iframe`, `object`, `embed` | Tag e conteúdo interno saem |
| `img` e URI `data:` | Saem |
| `imageGroup` | Não entra no documento |
| `p` ou `h1`–`h6` com texto vazio e, no caso do `p`, sem `br` | Sai depois do `nh3` |

## Erros e código de saída

Pasta de entrada inexistente, ilegível, ou pasta de saída que não pode ser criada: a execução para com código 1.

Sem `--estrito`, um lote que terminou devolve 0, mesmo com linhas `erro` ou `sem_codigo`.

Com `--estrito`, o lote devolve 1 se existir linha `erro`.

## Critérios de aceitação

- CA-01 (RF-04, RF-10). Dado um parágrafo com `<strong>` e `class`. Quando converter. Então o txt contém `<p><strong>...</strong></p>` e o atributo sai.
- CA-02 (RF-05). Dado um heading `h2`. Quando converter. Então a saída contém `<h2>` com o texto escapado.
- CA-03 (RF-11, RF-13). Dado um link com `href` e um `<a id>` vazio. Quando converter. Então o texto do link permanece, `href` e `id` somem, e o parágrafo vazio não aparece.
- CA-04 (RF-06, RF-10). Dado um `html` de tabela que já começa com `<table><tbody>`, tem `style` e `colspan="2"`, e uma célula com lista. Quando converter. Então existe um único `<table>`, o `tbody` permanece, `style` sai, `colspan="2"` fica e a lista fica como `ul`/`li`. Dado um `html` só com o miolo. Quando converter. Então um `<table>` externo é acrescentado.
- CA-05 (RF-08, RF-12). Dado um `imageGroup` com `src` `AAAA` e um `<img>` dentro de parágrafo. Quando converter. Então o txt não contém `img`, `src` nem `AAAA`.
- CA-06 (RF-10, RF-12). Dado `script`, `style`, `iframe`, `object` e `embed`, cada um com texto interno próprio. Quando converter. Então as cinco tags e os cinco textos internos saem.
- CA-07 (RF-07). Dado um aside com texto. Quando converter. Então esse texto aparece dentro de `<p>`.
- CA-08 (RF-14, RF-22). Dado o mesmo JSON duas vezes, com a mesma pasta de saída inicial. Quando converter duas vezes. Então o UUID e os bytes do txt coincidem, e o UUID não está no txt.
- CA-09 (RF-16, RF-17, RF-18). Dado código ausente, vazio, só com caracteres removidos por RF-16, nome reservado do Windows ou só um ponto final. Quando converter. Então não há txt e o status é `sem_codigo`. Dado `float`, `bool`, lista ou objeto. Quando converter. Então o status é `erro`. Dado o inteiro `42`. Quando converter. Então há txt, a coluna `codigoDisciplina` é `42` e o nome começa com `42_`.
- CA-10 (RF-19, RF-22). Dado dois JSON com o mesmo código e corpos diferentes, na mesma pasta de saída inicial. Quando converter duas vezes. Então o CSV tem duas linhas, os UUIDs diferem e a segunda execução repete os bytes da primeira.
- CA-11 (RF-02, RF-20). Dado um JSON inválido no meio de um lote válido. Quando converter. Então os válidos geram txt e o inválido fica `erro` com motivo `json_invalido`.
- CA-12 (RF-23). Dado um caminho com espaço, acento e vírgula. Quando converter. Então o arquivo é lido e o caminho aparece em `arquivo_origem`.
- CA-13 (RF-03). Dado `toc`, `headings` e `contentHtml` com texto que não está em `blocks`. Quando converter. Então só o conteúdo de `blocks` aparece.
- CA-14 (RF-26). Dado um JSON cujo único bloco é `imageGroup` e o código é válido. Quando converter. Então existe um txt de zero bytes com status `convertido`.
- CA-15 (RF-03, RF-11). Dado o heading `SUMÁRIO` e um parágrafo `<a href="#_Toc199495875">INTRODUÇÃO\t3</a>`. Quando converter. Então a saída contém `<h2>SUMÁRIO</h2>` e `<p>INTRODUÇÃO\t3</p>`, sem `href` e sem `id`.
- CA-16 (RF-11). Dado um link cujo texto e cujo `href` são `https://www.youtube.com/watch?v=cYefPOPuHOE`. Quando converter. Então a URL permanece como texto e o `href` sai.
- CA-17 (RF-14). Dado o mesmo `blocks` com dois `documentId` diferentes. Quando converter. Então o UUID é o mesmo.
- CA-18 (RF-14). Dado dois corpos sanitizados diferentes. Quando converter. Então os UUIDs diferem.
- CA-19 (RF-14, RF-15). Dado o mesmo corpo com dois `codigoDisciplina` diferentes. Quando converter. Então o UUID é o mesmo e os prefixos dos nomes diferem.
- CA-20 (RF-24). Dado dois JSON com o mesmo código e o mesmo corpo na mesma execução. Quando converter. Então o primeiro fica `convertido`, o segundo fica `erro` com motivo `colisao`, e o txt do primeiro permanece.
- CA-21 (RF-27, RF-28). Dado um txt antigo que casa com a expressão de órfão e um arquivo `notas.txt` na pasta de saída. Quando converter sem `--limpar`. Então os dois permanecem, o log tem uma linha `orfao` e o resumo conta 1. Quando converter com `--limpar`. Então só o órfão sai e `notas.txt` permanece.
- CA-22 (RF-01). Dado um `.json` em subpasta, um `.json` apontado por link simbólico e um diretório apontado por link simbólico. Quando converter. Então o arquivo da subpasta entra, os dois links não entram, e a ordem dos caminhos relativos é lexicográfica.
- CA-23 (RF-02). Dado um JSON sem `blocks` e outro em que `blocks` é um objeto. Quando converter. Então os dois ficam `erro` com motivo `blocks_invalidos` e o lote segue.
- CA-24 (RF-09). Dado um bloco de tipo desconhecido junto de um parágrafo válido. Quando converter. Então o parágrafo aparece, o bloco desconhecido não aparece, o status é `convertido` e o log contém `bloco_ignorado:{tipo}`.
- CA-25 (RF-15). Dado um convertido. Quando olhar o nome. Então ele é `{codigoSanitizado}_{uuid}.txt`, com UUID em minúsculas, 36 caracteres e hífens.
- CA-26 (RF-21). Dado um lote com convertidos, erro, sem código, código repetido e um órfão. Quando converter. Então o stdout tem as seis linhas do contrato, com os números desse lote.
- CA-27 (D-08, RF-30). Dado `--entrada` inexistente. Quando converter. Então o código de saída é 1. Dado um lote com uma linha `erro`. Quando converter sem `--estrito`. Então o código é 0. Quando converter com `--estrito`. Então o código é 1. Dado um lote só com `sem_codigo` e `--estrito`. Quando converter. Então o código é 0.
- CA-28 (RF-04, RF-13). Dado um parágrafo só com espaços, outro só com `&nbsp;` e outro só com U+200B. Quando converter. Então os três não aparecem. Dado um parágrafo só com `<br>`. Quando converter. Então ele permanece.
- CA-29 (RF-29). Dado um lote que termina bem. Quando a execução acaba. Então a pasta de saída não contém arquivo com sufixo `.tmp`.

O teste de integração com o exemplo real usa `@pytest.mark.integration` e é ignorado se o arquivo não existir. Ele confere ausência de Base64 e de `href`, presença de `<h2>SUMÁRIO</h2>` e de uma tabulação de sumário, e uma linha `convertido` no CSV.

As fixtures em `tests/fixtures/` são mínimas, com Base64 substituído por `AAAA`: uma por tipo real (`paragraph`, `heading`, `table`, `imageGroup`, `aside`) e uma sintética com `script`, `style`, `iframe`, `object`, `embed`, link, atributo inline, `colspan`, código ausente, vazio, inválido e inteiro.

## Decisões em aberto

O default de cada uma já está nos requisitos. Mudar o default altera esta SPEC antes do código.

- D-02. Aside fora da allowlist. Default: `<p>` com o texto (RF-07).
- D-03. Tabela com `html` e `rows`. Default: preferir `html` (RF-06).
- D-05. Tamanho máximo do código no nome. Default: 80 caracteres (RF-16).
- D-06. Subpastas. Default: leitura recursiva, sem link simbólico (RF-01).
- D-07. `sem_codigo` no log. Default: entra em `erros.log` e na contagem separada do resumo (RF-20, RF-21).
- D-08. Código de saída sem `--estrito`. Default: 0 se o lote terminou, inclusive com linhas `erro`; 1 se a pasta de entrada não puder ser lida ou a de saída não puder ser criada. `--estrito` é decisão fechada e está em RF-30.
- D-09. Colisão de nome na mesma execução. Default: o segundo arquivo fica `erro` e o primeiro txt permanece (RF-24).
- D-10. Bloco ou heading inválido. Default: pular, registrar e continuar o arquivo (RF-05, RF-09).
- D-11. Corpo vazio. Default: txt de zero bytes com status `convertido` (RF-26).
- D-12. Saída plana e CSV com o código antes da limpeza do nome. Default: não recriar subpastas; RF-16 vale só para o nome do txt.
- D-13. O mesmo conteúdo sob dois códigos. Default: o mesmo UUID, dois arquivos com prefixos distintos e duas linhas no CSV com o UUID repetido (RF-14, RF-19). O mesmo conteúdo e o mesmo código produzem o mesmo nome e caem em RF-24.

## Interface local

A interface é local e segue a linguagem visual de [Design/DESIGN.md](../Design/DESIGN.md) e as duas telas do Stitch: converter e arquivos processados. Ela não altera o contrato de conversão.

- `python -m conversor.interface` sobe em `http://127.0.0.1:8765`.
- A tela de conversão envia arquivos `.json` e executa o mesmo lote.
- A tela de arquivos lista o `resultado.csv` da pasta `output/`.
- As regras de sanitização são as deste contrato, sempre aplicadas. A tela não oferece preservar Markdown nem mostra métricas de compressão, que existem só no mockup.

## Fora de escopo

- Paralelismo e chamada à API `eduno`.
- Ler DOCX, baixar imagem ou reemitir Base64.
- Tratar a string `DESENVOLVIMENTO` como caso especial.
- Colocar o UUID dentro do txt.
- Exigir que `schema` seja `json-convert.document.v4`. A validação é estrutural.
- Usar `source.sha256` como chave. A inspeção não mostrou que o `documentId` deriva dele.

## Verificação estática

O pipeline é sequencial, sem `concurrent.futures`. Isso não tem critério de aceitação; a revisão do código confere.
