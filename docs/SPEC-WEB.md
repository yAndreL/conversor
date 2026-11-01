# SPEC: interface web

Contrato da API e das duas telas. A conversão continua em [SPEC.md](SPEC.md). A arquitetura está em [SPEC-MIGRACAO.md](SPEC-MIGRACAO.md). O visual está em [Design/DESIGN.md](../Design/DESIGN.md) e em `apps/web/src/estilos.css`. O desenho do lote único está em [superpowers/specs/2026-10-28-lote-unico-design.md](superpowers/specs/2026-10-28-lote-unico-design.md).

A ferramenta é interna: sem login, sem banco e sem histórico persistente. O lote aceita só `.json`. Zip de entrada fica para uma evolução. Uma planilha `.xlsx` de alunos não entra no lote: na mesma tela, o navegador monta o JSON e baixa o arquivo.

Cada critério cita o RW que cobre. Mudou o contrato, esta SPEC muda antes do código. A linha de comando não muda.

## API

O identificador do lote é um UUID v4. O corpo de erro é sempre JSON `{ "erro": string, "mensagem": string }`.

Códigos de `erro`:

| HTTP | `erro` | Quando |
| --- | --- | --- |
| 400 | `lote_invalido` | Corpo inválido, `envioId` ausente ou inválido, fechar fora de `recebendo`, motivo de falha desconhecido |
| 413 | `limite_excedido` | Estourou teto de envio, de arquivo, de lotes ativos ou de espaço livre |
| 413 | `limite_lote` | O envio inteiro faria o lote passar de 5.000 arquivos ou de 40 GiB. Nada desse envio é gravado |
| 409 | `lote_ocupado` | Fechar ou descartar enquanto há envio em voo, ou descartar enquanto `processando` |
| 409 | `envio_em_andamento` | Outro pedido com o mesmo `envioId` ainda está gravando |
| 404 | `lote_inexistente` | Lote desconhecido ou TTL vencido |
| 404 | `arquivo_inexistente` | Nome ausente no lote, ou nome rejeitado por path traversal |

Path traversal e lote expirado respondem 404, sem indicar se o caminho existiria fora da pasta do lote.

Objeto `limites`, o mesmo em `GET /api/limites` e em `POST /api/lotes`:

```json
{
  "maxArquivosEnvio": 200,
  "maxBytesEnvio": 536870912,
  "maxBytesArquivo": 33554432,
  "maxArquivosLote": 5000,
  "maxBytesLote": 42949672960,
  "maxArquivosSelecao": 2500,
  "maxLotesAtivos": 3,
  "minBytesLivres": 1073741824,
  "overheadPorArquivo": 1024,
  "overheadEnvelope": 8192
}
```

### GET /api/limites

Resposta `200` com o objeto `limites`. A página de conversão lê isto ao abrir e monta os envios com esses números.

### POST /api/lotes

Sem arquivo. Cria o lote em `recebendo` e responde `202`:

```json
{ "id": "uuid", "limites": {} }
```

Multipart neste caminho responde 400 `lote_invalido`. O lote não converte neste POST. Com `LOTE_MAX_ATIVOS` lotes já em `recebendo` ou `processando`, responde 413 `limite_excedido`, não cria pasta, e a mensagem é `Já há 1 lote em recebimento ou conversão.` ou `Já há N lotes em recebimento ou conversão.` O N usa agrupamento pt-BR.

### POST /api/lotes/{id}/arquivos

`multipart/form-data` com o campo `envioId` (UUID) e o campo repetível `arquivos`. A página envia um envio depois do outro. O servidor não interpreta o JSON: não há `JSON.parse` nem sanitização nesta rota. Cada parte é gravada em `staging/{envioId}/`.

A checagem do `envioId` vem antes da checagem de status:

1. Lote desconhecido ou expirado: 404.
2. Esse `envioId` está sendo gravado agora: 409 `envio_em_andamento`. O pedido que já grava segue até o fim.
3. O `envioId` já está em `meta/envios/`: responde 200 com o manifesto guardado, em qualquer status, e descarta o corpo novo. Não cria `duplicado`.
4. Status diferente de `recebendo`: 400 `lote_invalido`.
5. Caso contrário, o envio é novo.

Ordem do commit:

1. Gravar os bytes no staging.
2. Escrever o manifesto desse `envioId`. Cada aceito traz `arquivo_origem`, `nomeDisco` e o tamanho. O `nomeDisco` nasce aqui e não muda.
3. Mover os aceitos para `entrada/`.
4. Publicar o manifesto em `meta/envios/{envioId}.json`.
5. Apagar o staging.
6. Responder.

`maxBytesEnvio` limita a soma dos bytes dos arquivos. O multipart soma cabeçalhos e boundaries em cima disso. O teto do `Content-Length` é `maxBytesRequisicao` = `maxBytesEnvio` + `maxArquivosEnvio` × `overheadPorArquivo` + `overheadEnvelope`. Com os defaults, a margem é 200 × 1024 + 8192 bytes. A página monta o envio pela soma dos arquivos, até `maxBytesEnvio`, e não reduz essa soma por causa do overhead. Um envio cuja soma dos arquivos é exatamente `maxBytesEnvio` passa, desde que o `Content-Length` caiba na margem.

`Content-Length` acima de `maxBytesRequisicao` responde 413 `limite_excedido` antes de criar staging. Se o cabeçalho vier, o espaço livre do volume precisa ser pelo menos essa quantidade mais `minBytesLivres`; se não vier, o servidor confere o livre enquanto grava e, ao cruzar o piso, apaga o staging e responde 413. Durante a leitura, parte acima de `maxBytesArquivo`, ou soma dos arquivos acima de `maxBytesEnvio`, apaga o staging, não move nada e responde 413 `limite_excedido`. O estouro padrão do multipart não deixa arquivo parcial em `entrada/`.

O arquivo em `entrada/` não usa o nome enviado. O manifesto guarda `arquivo_origem` e o servidor grava `entrada/{nomeDisco}`, com `nomeDisco` um UUID v4 seguido de `.json`. Isso separa `A.json` de `a.json` em volume sem distinção de caixa, e afasta path traversal, nome reservado do Windows e nome longo demais para o sistema de arquivos. Nome com mais de 255 bytes UTF-8, vazio, `.` ou `..` é recusado só ele, motivo `nome_invalido`, frase `O nome do arquivo não pode ser gravado.` Os outros do envio seguem. O worker lê `nomeDisco` e usa `arquivo_origem` só como rótulo.

Falha antes de mover qualquer arquivo apaga o staging e deixa `entrada/` como estava. Falha depois que um arquivo já foi movido conserva o manifesto no staging. `entrada/` só muda no passo 3, e o passo 3 só ocorre com o manifesto do staging já escrito.

Repetir um `envioId` cujo manifesto já está em `meta/envios/` devolve o mesmo JSON. O servidor lê e descarta o corpo novo, para a conexão terminar, e não cria linha `duplicado`. Repetir um `envioId` cujo manifesto ainda está no staging completa os moves que faltam, publica o meta e devolve esse manifesto, também sem `duplicado` para os nomes que o manifesto já listou.

Resposta `200`:

```json
{
  "aceitos": 1,
  "recusados": [
    {
      "arquivo_origem": "nota.json#2",
      "motivo": "duplicado",
      "diagnostico": "Já existe outro arquivo com o mesmo nome neste lote."
    }
  ]
}
```

Cada arquivo do envio é julgado sozinho, sem ler o JSON como documento:

- Nome que não termina em `.json`: recusa `nao_json`. Os outros do envio seguem.
- `arquivo_origem` já presente no lote, vindo de outro `envioId`: recusa `duplicado`, com `arquivo_origem` `{basename}#{n}`. Os bytes não ficam. `n` é a próxima ocorrência. A comparação é por code points, então `A.json` e `a.json` são dois arquivos.
- A soma do envio inteiro, se aceita, faria o lote passar de `maxArquivosLote` ou de `maxBytesLote`: 413 `limite_lote`, staging apagado, nada desse envio movido. O que já estava no lote permanece. A mensagem é a frase de arquivos ou a de bytes, conforme o teto estourado.

Tamanho igual a `maxBytesArquivo` entra. Tamanho igual a `maxBytesEnvio`, com quantidade dentro do teto, entra num envio só. O arquivo seguinte abre outro envio. O arquivo de número `maxArquivosEnvio` entra; o seguinte abre outro envio.

### POST /api/lotes/{id}/fechar

Corpo JSON. `falhas` pode ser omitido ou vazio.

```json
{
  "falhas": [
    {
      "arquivo_origem": "nota.json#2",
      "motivo": "duplicado",
      "diagnostico": "Já existe outro arquivo com o mesmo nome neste lote."
    }
  ]
}
```

Motivos aceitos no corpo: `limite`, `duplicado`, `nao_json`, `envio`, `limite_lote`. Outro motivo, ou `arquivo_origem` vazio ou com `/` ou `\`, responde 400 `lote_invalido`.

Lote desconhecido ou expirado: 404 `lote_inexistente`, mensagem `Lote inexistente ou expirado.` Com envio em voo: 409 `lote_ocupado`, mensagem `Ainda há envio em andamento.` O fechamento não bloqueia esperando o envio. Fora de `recebendo`: 400 `lote_invalido`, mensagem `O lote não está recebendo arquivos.`

Antes de passar a `processando`, o fechamento conclui os moves dos stagings que já têm manifesto e apaga os stagings sem manifesto. Manifesto presente significa que todos os bytes daquele envio já foram gravados. Bytes em staging sem manifesto não entram no lote.

`arquivo_origem` igual a uma linha que o lote já guardou: a linha guardada permanece e a falha repetida é ignorada. `nota.json` e `nota.json#2` são linhas diferentes. As duas entram no CSV.

O POST responde 202 e o status passa a `processando`. A conversão corre em blocos de 32, numa fila global. O lote na fila já está `processando`, com `processados` 0 e `total` igual à quantidade de linhas, inclusive falhas. `total` não cresce depois disso.

### DELETE /api/lotes/{id}

Descarta o lote: apaga a pasta e o job. Resposta 204. Em `recebendo`, `concluido` ou `erro`. Em `processando`, ou com envio em voo: 409 `lote_ocupado`. Desconhecido: 404.

### GET /api/lotes/{id}

```json
{
  "id": "uuid",
  "status": "recebendo",
  "total": 0,
  "processados": 0,
  "contagens": {
    "convertidos": 0,
    "erros": 0,
    "sem_codigo": 0,
    "codigos_repetidos": 0,
    "orfaos": 0
  },
  "expiraEm": "2026-10-27T22:41:00.000Z"
}
```

`status` é `recebendo`, `processando`, `concluido` ou `erro`. A resposta não traz o array `arquivos`.

`recebendo` é o lote aberto, aceitando envios, ainda sem conversão. `processando` é a fila ou a conversão. `concluido` significa que o lote terminou, mesmo com linhas `erro` ou `sem_codigo`. `erro` é falha do lote inteiro, por exemplo ao publicar `resultado.csv` ou `erros.log`. `expiraEm` é o instante UTC em que a pasta será removida, exceto durante `processando`, em que o varredor não remove o lote.

`total` é a quantidade de linhas conhecidas pelo servidor. `processados` é a quantidade cujo status já não é `convertendo`. Durante `recebendo`, `processados` é a quantidade de recusas já decididas. As contagens acompanham esses finais e não esperam o fim do lote.

### GET /api/lotes/{id}/linhas

Disponível em `recebendo`, `processando` e `concluido`. Query `q`, `pagina` e `tamanho`. Default: `pagina` 1 e `tamanho` 50. `pagina` menor que 1 ou `tamanho` fora de 1 a 200 responde 400 `lote_invalido`.

`q` é filtro por substring, sem distinção de maiúsculas, em `codigoDisciplina`, `arquivo_origem`, `arquivo_saida`, `uuid`, `status` e `diagnostico`. Vazio devolve todas as linhas.

```json
{
  "total": 1,
  "pagina": 1,
  "tamanho": 50,
  "linhas": [
    {
      "codigoDisciplina": "",
      "uuid": "",
      "arquivo_origem": "nota.json",
      "arquivo_saida": "",
      "status": "convertendo",
      "diagnostico": ""
    }
  ]
}
```

`status` da linha é `convertendo`, `convertido`, `sem_codigo` ou `erro`. `convertendo` existe na API enquanto o arquivo aguarda o worker. O CSV não grava `convertendo`. `diagnostico` é a frase em português, vazia quando não há frase.

`total` é a quantidade depois do filtro. A ordem é a ordem de code points de `arquivo_origem`. A posição da linha não muda quando o status sai de `convertendo`.

### GET /api/lotes/{id}/arquivos/{nome}

O `{nome}` chega em percent-encoding. `#`, `%`, acento e vírgula precisam funcionar. Depois de decodificar, o servidor recusa o nome quando ele contém `/` ou `\`, é vazio, é `.` ou `..`, ou difere do próprio basename. O arquivo tem de estar na pasta do lote. `arquivo_origem` com sufixo `#n` não é caminho de download. O download do txt usa `arquivo_saida`.

Resposta `200`, `Content-Type: text/plain; charset=utf-8` para txt e `text/csv; charset=utf-8` para csv, `X-Content-Type-Options: nosniff`, e `Content-Disposition: attachment` com `filename` e `filename*` (RFC 5987).

### DELETE /api/lotes/{id}/linhas

Corpo JSON `{ "arquivo_origem": string }`. Só com o lote `concluido`. Remove a linha desse arquivo, apaga o txt quando existir, reescreve `resultado.csv` e `relacao.csv`, e tira do `erros.log` as linhas cuja referência é esse arquivo. A resposta é o lote atualizado, no formato de `GET /api/lotes/{id}`. `total` passa a ser a quantidade de linhas que restaram. A reescrita dos CSV aplica o prefixo de fórmula desta SPEC.

Arquivo que não está no lote responde 404 `arquivo_inexistente`. Lote que não está `concluido` responde 400 `lote_invalido`. Corpo sem `arquivo_origem` responde 400 `lote_invalido`.

### GET /api/lotes/{id}/download

Zip com `relacao.csv`, os `.txt` gerados, `resultado.csv` e `erros.log`. `Content-Type: application/zip` e `Content-Disposition: attachment`. O zip é gerado em fluxo e não reside inteiro na memória. `relacao.csv` entra primeiro, depois `resultado.csv` e `erros.log`, depois os txt.

A query `arquivo` pode repetir. Cada valor é o `arquivo_saida` de uma linha do lote. Com ao menos um `arquivo`, o zip traz só esses txt, sem `relacao.csv`, sem `resultado.csv` e sem `erros.log`. Nome vazio, inseguro ou que não está no lote responde 404 `arquivo_inexistente`. Sem a query, o zip continua completo. Download só com `concluido`.

## Identidade, ordem e frases

O basename é o nome do arquivo, sem pasta. Na seleção, a ordem de ocorrência é a ordem da lista entregue pelo seletor ou pelo soltar. O primeiro daquele basename é a ocorrência 1 e segue para um envio, com `arquivo_origem` igual ao basename. Da segunda em diante, a página não envia o arquivo. No `fechar`, a falha leva `arquivo_origem` `{basename}#{n}`, com `n` começando em 2.

A ordenação do lote, na página e no servidor, compara a sequência de code points Unicode como inteiros, em ordem crescente. O comparador percorre os code points. Não usa `<`, `>` nem o `sort` padrão do JavaScript, que comparam unidades UTF-16. Não usa `localeCompare`. Não aplica NFC nem NFD. `Buffer.compare` sobre os bytes UTF-8 vale, porque essa ordem coincide com a dos code points em texto bem formado. Se uma string é prefixo da outra, a mais curta vem antes. Com isso, `A.json` vem antes de `a.json`, e `a.json` vem antes de `á.json`. `nota.json` vem antes de `nota.json#2`. O nome com U+E000 vem antes do nome com U+1F600. A comparação por unidades UTF-16 inverteria esse par. Essa ordem é a mesma da `str` do Python 3.

A página ordena por essa regra os arquivos que vai enviar e corta um envio quando ele já tem `maxArquivosEnvio` arquivos ou quando o próximo arquivo faria a soma passar de `maxBytesEnvio`.

| Situação | Código | Frase |
| --- | --- | --- |
| Arquivo maior que o teto por arquivo | `limite` | `O arquivo passa de 32 MiB.` quando o teto é 33554432. Com outro teto, o número é esse teto em MiB, inteiro quando fecha, senão uma casa pt-BR |
| Nome vazio, `.`, `..` ou com mais de 255 bytes UTF-8 | `nome_invalido` | `O nome do arquivo não pode ser gravado.` |
| Basename repetido | `duplicado` | `Já existe outro arquivo com o mesmo nome neste lote.` |
| Não termina em `.json` | `nao_json` | `O arquivo não é um JSON.` |
| Passou do teto de arquivos do lote | `limite_lote` | `O lote passou de 5.000 arquivos.` quando o teto é 5000. O número usa agrupamento pt-BR |
| Passou do teto de bytes do lote | `limite_lote` | `O lote passou de 40 GiB.` quando o teto é 42949672960. A unidade é GiB, com a mesma regra de casa do MiB |
| Não chegou ao servidor | `envio` | `Não foi possível enviar o arquivo.` |
| Leitura UTF-8 | `leitura` | `Não foi possível ler o arquivo.` |
| JSON inválido com posição N | `json_invalido` | `JSON inválido: token inesperado na posição N.` |
| JSON inválido sem posição | `json_invalido` | `JSON inválido.` |
| `blocks` ausente, ou raiz que não é objeto | `blocks_invalidos` | `O campo blocks está ausente.` |
| `blocks` de outro tipo | `blocks_invalidos` | `O campo blocks não é uma lista.` |
| Código ausente ou nulo | `sem_codigo` | `codigoDisciplina ausente.` |
| Código vazio depois da limpeza do nome | `sem_codigo` | `codigoDisciplina vazio.` |
| Tipo de código inválido | `tipo_codigo` | `codigoDisciplina com tipo inválido.` |
| Colisão de txt | `colisao` | `Outro arquivo deste lote já gerou o mesmo txt.` |
| Bloco ignorado | `bloco_ignorado:{tipo}` | `Bloco ignorado: {tipo}.` |

A posição N sai da mensagem do `JSON.parse` (`position` ou `posição`). Várias frases no mesmo arquivo se juntam com `; ` em `diagnostico`. No `erros.log` do lote web, cada código fica numa linha `referencia`, tabulação, código e, quando há frase, outra tabulação e a frase daquele código. Na referência e na frase, tabulação, CR e LF são gravados como barra invertida seguida da letra t, r ou n. Os demais controles U+0000 a U+001F e U+007F saem como barra invertida, a letra u e quatro dígitos hexadecimais. Assim a linha continua com as colunas separadas por tabulação de verdade. A CLI grava só referência e código, sem a terceira coluna e sem essa substituição.

As frases de conteúdo são produzidas no fechamento, nos workers. O upload não as produz.

## CSV, log e zip

Os três arquivos são escritos uma vez, no fechamento, na pasta `saida/`.

- `relacao.csv`. A primeira linha é o cabeçalho `codigoDisciplina,uuid` e não é um registro. Cada registro seguinte é uma linha de status `convertido`. O número de registros é o número de convertidos. A ordem dos registros é a ordem de code points do `arquivo_origem` dessas linhas, a mesma ordem em que esses convertidos aparecem no `resultado.csv`.
- `resultado.csv`. Uma linha por arquivo do conjunto, inclusive recusa e falha de envio, na ordem de code points de `arquivo_origem`. Colunas: `codigoDisciplina`, `uuid`, `arquivo_origem`, `arquivo_saida`, `status`. Status no CSV: `convertido`, `sem_codigo`, `erro`.
- `erros.log` do lote web, no formato da seção de frases. Controle na referência ou na frase segue a substituição dessa seção.

Em `resultado.csv`, o prefixo de fórmula vale só para `arquivo_origem`. Se o primeiro caractere é `=`, `+`, `-`, `@`, tabulação ou CR, o campo ganha um apóstrofo `'` antes dele. `codigoDisciplina`, `uuid`, `arquivo_saida` e `status` não ganham esse prefixo: `arquivo_saida` tem de ser o mesmo nome do txt no zip. `relacao.csv` não ganha prefixo: `codigoDisciplina` `-1` ou `=cmd` sai como foi lido, para a importação no banco. O quoting de aspas, vírgula e quebra de linha continua o do núcleo nas duas tabelas. A reescrita feita ao excluir uma linha aplica a mesma regra. A CLI não prefixa apóstrofo.

Depois de publicar os três arquivos, o servidor apaga `entrada/`. Se essa limpeza falha e os três arquivos já estão em `saida/`, o status continua `concluido`.

A colisão de txt usa a ordem de code points do lote inteiro. Um bloco de 32 só é publicado quando todos os preparos desse bloco existem. A ordem em que os workers terminam não escolhe o vencedor. O último bloco pode ter menos de 32. O texto convertido do bloco é solto da memória antes do bloco seguinte.

## Jobs e limites

O mapa de jobs vive em memória e é reconstruído do disco. Cada lote tem uma pasta e um `lote.json`, reescrito com arquivo temporário e rename em toda transição: criação, envio confirmado, início do fechamento, bloco publicado, `concluido` e `erro`. Ao subir, o servidor varre `LOTE_DIR`. Pasta sem `lote.json` é apagada. Pasta com `lote.json` volta a ser job. Em `recebendo`, a subida conclui staging com manifesto e apaga staging sem manifesto. Em `processando`, o prazo não corre; linha já gravada no `lote.json` não é convertida de novo, e o que falta segue a fila. `concluido` e `erro` voltam até o TTL.

Um varredor remove a pasta e o job quando `expiraEm` passa e o status não é `processando`. Default do TTL: 6 horas, variável `LOTE_TTL_HORAS`. Cada envio confirmado renova o prazo. Ao sair de `processando` para `concluido` ou `erro`, o prazo recomeça a partir desse instante.

Variáveis, com default:

- `LOTE_MAX_ARQUIVOS`: 200, por envio
- `LOTE_MAX_BYTES_ARQUIVO`: 33554432 (32 MiB)
- `LOTE_MAX_BYTES_TOTAL`: 536870912 (512 MiB), por envio
- `LOTE_MAX_ARQUIVOS_LOTE`: 5000
- `LOTE_MAX_BYTES_LOTE`: 42949672960 (40 GiB)
- `LOTE_MAX_ARQUIVOS_SELECAO`: 2500
- `LOTE_MAX_ATIVOS`: 3, contando `recebendo` e `processando`
- `LOTE_ESPACO_LIVRE_MINIMO`: 1073741824 (1 GiB), livre no volume depois de aceitar o envio
- `LOTE_OVERHEAD_POR_ARQUIVO`: 1024
- `LOTE_OVERHEAD_ENVELOPE`: 8192

O maior JSON visto em `Exemplo/` tem cerca de 12 MiB. O default de 32 MiB cabe esse arquivo.

Antes de criar staging, se o espaço livre ficaria abaixo do mínimo, a resposta é 413 e o staging não fica.

A pasta base é `LOTE_DIR`. Sem ela, o servidor usa um diretório temporário do sistema operacional.

`HOST` default `127.0.0.1`. `PORT` default `8765`.

Com `HOST` em `127.0.0.1`, só a máquina local alcança o serviço. Com `0.0.0.0` ou um IP da rede, qualquer pessoa nessa rede envia JSON e baixa o resultado, porque não há login. O README da implementação registra essa diferença. O default permanece `127.0.0.1`.

Há uma Piscina no processo, `LOTE_WORKERS` default 2. Esses workers preparam o bloco do lote que está na frente da fila. A fila é global: um lote converte por vez. Lote aguardando a vez permanece `processando` com `processados` 0 e `total` N. O processo que atende o polling não sanitiza.

## Telas

Duas rotas de página: Converter e Arquivos Processados. A marca é CleanTXT. A fonte é Plus Jakarta Sans. A cor de ação é `#E53935`, com hover `#D32F2F` e active `#B71C1C`. Fundo `#F8F9FA`, cartão `#FFFFFF`, texto `#1E293B`, borda `1px solid #E2E8F0`. O foco visível usa o contorno `#E53935`, sem halo externo.

Nenhum texto vindo dos dados entra como HTML. A regra de lint proíbe `dangerouslySetInnerHTML`.

A zona de upload é operável por teclado: o rótulo do seletor abre o diálogo, e Enter ou Espaço na zona fazem o mesmo. Soltar arquivos só acrescenta a seleção. O envio acontece no clique em "Converter agora".

Na interface, o pedaço transportado se chama envio. Lote é o conjunto inteiro. Números visíveis usam agrupamento pt-BR. Tamanho usa B, KiB, MiB e GiB, base 1024, uma casa decimal em KiB, MiB e GiB.

### Converter

O selo é "CONVERSOR LOCAL". O subtítulo fala do produto: enviar os JSON e baixar o texto convertido, e também da planilha de alunos. A tela não descreve sanitização, blocks, links nem UUID. Os botões "+ Selecionar arquivos" e "Converter agora" ficam na mesma linha. O seletor usa a cor secundária `#475569`. Com arquivos na seleção, o botão de envio mostra a quantidade, como "Converter agora (9)".

Se a seleção inteira é `.xlsx`, o clique não chama a API. O navegador lê a primeira aba em fluxo, agrupa as linhas em aluno, depois em curso, depois em disciplina, e baixa `{nome}.json`. O nome troca só a extensão. Célula vazia ou `NULL` vira `null`. `datanasc`, `data_inicio`, `data_limite` e `cert_emissao` saem como `AAAA-MM-DD`. Nota e frequência numéricas saem como número. Cabeçalhos equivalentes entram nos mesmos campos: `aluno` em `name`, `empresa` em `codempresa`, `aproveitamento` em `notaobtida`, `data_termino_limite` em `data_limite`, `opcao_estagio` em `opcaoestagio`, `stado_civil` em `estado_civil` e `ert_emissao` em `cert_emissao`. `modulo`, `frequencia` e `carga_horaria` ficam na disciplina. `sistec_codigo` fica no curso. Aluno repetido junta pelo CPF; curso repetido do mesmo aluno junta pelo nome; disciplina idêntica no mesmo curso entra uma vez. Disciplina com o mesmo nome e módulo, status, nota, frequência ou carga horária diferentes entra de novo. A mensagem conta alunos, cursos e disciplinas. JSON e `.xlsx` na mesma seleção não enviam e não baixam: a tela pede para separar. O botão, nesse caso, continua "Converter agora (N)".

A seleção acima de `maxArquivosSelecao` não substitui a seleção atual. A mensagem é `A seleção passa de 2.500 arquivos.` quando o teto é 2500, com o número em pt-BR para outro teto.

Até 50 arquivos, a tabela tem as colunas Arquivo e Tamanho. A partir de 51, a tabela some e o resumo tem quantidade, tamanho total e quantidade de envios, no formato `2.500 arquivos, 9,8 GiB, 20 envios`. Um envio só usa `1 envio`.

Estados:

- Vazio. Nenhum arquivo na seleção. "Converter agora" fica desabilitado e a tela não chama a API.
- Selecionado. O botão lê "Converter agora (N)", com N igual ao tamanho da seleção. Ainda não há pedido.
- Enviando. O botão fica inativo. O texto é `Enviando 3 de 20`, com os dois números em pt-BR. O 20 é a quantidade de envios HTTP, não a de arquivos.
- Envios retidos. Só falha de rede ou resposta 5xx, depois de uma tentativa automática extra com o mesmo `envioId`. Resposta 4xx não repete e não fica retida. Um arquivo num envio: `1 arquivo não entrou. Reenvie esse envio ou feche com o que chegou.` Vários arquivos num envio: `8 arquivos não entraram. Reenvie esse envio ou feche com o que chegou.` Dois ou mais envios retidos: `8 arquivos não entraram. Reenvie esses envios ou feche com o que chegou.` Botões: `Reenviar envios`, `Fechar com o que chegou`, `Descartar lote`.
- Lote cheio. Resposta 413 `limite_lote`. A página para os envios que ainda não saíram. Os arquivos do envio recusado e os que ainda não foram enviados entram no `fechar` como `limite_lote`, com a frase da resposta. Botões: `Fechar com o que chegou` e `Descartar lote`. Não há `Reenviar envios`.
- Aceito. O fechamento devolveu 202. A tela abre `/arquivos/{id}`.
- Erro. A mensagem visível é a `mensagem` do JSON de erro, ou a falha de rede. A seleção permanece para um novo clique. 4xx de um envio cai aqui, sem retry.

`Reenviar envios` repete só os envios retidos por rede ou 5xx, cada um com o mesmo `envioId`. `Fechar com o que chegou` chama `fechar` com as falhas separadas na página (`limite`, `duplicado`, `nao_json`), com os arquivos dos envios retidos em motivo `envio` e, no caso de lote cheio, com os arquivos que não couberam em motivo `limite_lote`. `Descartar lote` chama `DELETE /api/lotes/{id}`. 409 `lote_ocupado` no fechamento é tentado de novo: o envio em voo ainda vai terminar. 409 `envio_em_andamento` não é tentado de novo.

Recarregar a página perde os `File`. O reenvio não sobrevive a essa visita.

### Arquivos Processados

A tela lê o lote cujo `id` está na rota. O último `id` aberto na aba fica guardado nela. A rota `/arquivos`, o atalho Arquivos Processados, o início, Converter e Novo upload não apagam esse `id`: sem `id` na rota, a tela reabre o último lote. Se a aba ainda não tem lote, a página permanece vazia.

A cada 1 segundo, enquanto `status` é `recebendo` ou `processando`, a tela consulta `GET /api/lotes/{id}` para as métricas e `GET /api/lotes/{id}/linhas` da página visível para a tabela. As métricas lidos, convertidos, erros e sem código saem de `total` e `contagens`, não da página visível. Durante `processando`, o texto de progresso é `Convertendo 400 de 2.500`.

A tabela mostra 200 linhas por página. Os controles são `Página anterior`, `Próxima página` e o indicador `Página 2 de 13`, com números em pt-BR. A busca volta para a página 1. A coluna Motivo mostra `diagnostico`. A coluna Saída, durante `processando` e `recebendo`, mostra o nome como texto, sem link. Com o lote `concluido`, o link de saída aponta para `GET /api/lotes/{id}/arquivos/{nome}` com o nome em percent-encoding. O txt se chama `{uuid}az{codigoSanitizado}.txt`. Sem busca, na página 1, a primeira linha é `relacao.csv` e não consome uma das 200. Cada linha de arquivo tem um checkbox antes do arquivo original. O checkbox do cabeçalho marca ou desmarca as linhas visíveis. A marca sobrevive à troca de página.

`Baixar zip do lote` fica habilitado com o lote `concluido` e baixa o zip completo, sem query `arquivo` e sem exigir marca. `Baixar seleção` fica habilitado com ao menos uma linha marcada, inclusive fora da página visível, e baixa só os txt dessas linhas.

Em `recebendo`, a tela mostra `Fechar com o que chegou` e `Descartar lote`. Esse fechamento envia `falhas` vazio: entram as linhas que o servidor já tem. Não há zip nem reenvio, porque os `File` não estão nesta visita.

No fim de cada linha concluída há uma lixeira. O clique abre uma confirmação com o título "Excluir arquivo", a pergunta "Excluir {nome}?" em uma linha e o aviso de que o arquivo sai do lote na linha de baixo. Uma linha separa o título do texto e outra separa o texto dos botões; as duas ficam recuadas da borda do cartão. Cancelar fecha sem mudar o lote. Excluir chama `DELETE /api/lotes/{id}/linhas` com `arquivo_origem`. Excluir todos chama o mesmo caminho com `{ todos: true }` e tira todas as linhas do lote, não só a página visível. Uma consulta seguinte não volta ao texto "Carregando".

Os rótulos visíveis são Convertendo, Convertido, Sem código e Erro. A classe da pílula continua sendo a `situacao` ou o `status` da linha.

Estados:

- Vazio. Lote sem linhas, ou página aberta sem lote. Texto "Nenhum JSON convertido ainda."
- Carregando. Primeiro pedido do lote em curso.
- Com dados. Métricas e tabela preenchidas, inclusive com arquivos ainda em `convertendo`.
- Busca sem resultado. A tabela mostra que o filtro não achou linha. As métricas do lote permanecem.
- Erro. Lote inexistente, expirado, falha do lote ou falha de rede, com a `mensagem` do servidor quando ela existir. O polling para.

## Requisitos

- RW-01. `POST /api/lotes` sem arquivo cria um lote `recebendo` e responde 202 com `{id, limites}`. Não converte. Multipart nesse caminho responde 400 `lote_invalido`.
- RW-02. No envio, arquivo que não termina em `.json`, nome que não pode ser gravado, ou `arquivo_origem` já presente vindo de outro `envioId`, recusa só esse arquivo, com `motivo` e `diagnostico`. Os outros do mesmo envio ficam gravados sob `nomeDisco`. O JSON não é interpretado. O teto do lote recusa o envio inteiro.
- RW-03. Quantidade e bytes por envio, bytes por arquivo, quantidade e bytes por lote, lotes ativos e espaço livre obedecem às variáveis desta SPEC. Estouro de envio, arquivo, ativos ou espaço responde 413 `limite_excedido`. Estouro do lote responde 413 `limite_lote` e não move nada daquele envio. Staging de um envio recusado é apagado. Arquivo já aceito no lote permanece. Tamanho igual ao teto de arquivo entra. A soma dos arquivos igual a `maxBytesEnvio` entra, e o `Content-Length` pode passar de `maxBytesEnvio` até `maxBytesRequisicao`. Um arquivo além do teto do envio abre outro envio, quando a página monta a seleção. No servidor, a requisição que ultrapassa `maxBytesRequisicao` ou a soma dos arquivos responde 413 e não move arquivo.
- RW-04. `GET /api/lotes/{id}` devolve status, total, processados, contagens e `expiraEm`. Não devolve `arquivos`.
- RW-05. `GET /api/lotes/{id}/linhas` é paginado, inclui `diagnostico`, aceita status `convertendo` e filtra por `q` nos seis campos. Vale em `recebendo`, `processando` e `concluido`.
- RW-06. `GET /api/lotes/{id}/arquivos/{nome}` devolve `text/plain; charset=utf-8` para txt e `text/csv; charset=utf-8` para csv, com `nosniff` e `Content-Disposition`. O nome é validado contra path traversal.
- RW-07. `GET /api/lotes/{id}/download` devolve o zip em fluxo com `relacao.csv`, `resultado.csv`, `erros.log` e os `.txt`. Com a query `arquivo`, devolve só os txt pedidos.
- RW-08. Lote desconhecido ou expirado, e arquivo fora do lote, respondem 404 no formato desta SPEC.
- RW-09. Cada lote tem pasta própria e um `lote.json`. Lotes simultâneos não se atropelam. Ao subir, a varredura restaura os jobs e aplica a regra de staging. O TTL default é 6 horas e não remove lote `processando`. Ao sair de `processando`, o prazo recomeça. Pasta sem `lote.json` é apagada na subida.
- RW-10. A tela Arquivos Processados consulta o lote a cada 1 segundo em `recebendo` e `processando`. As métricas saem desse GET. A tabela sai de `/linhas`, 200 por página, também durante `processando`.
- RW-11. Soltar arquivos na zona só altera a seleção. "Converter agora" é o único início de envio. A seleção acima de `maxArquivosSelecao` não altera a seleção atual.
- RW-12. As telas Converter e Arquivos Processados reproduzem o visual de DESIGN.md e os estados desta SPEC.
- RW-13. Foco visível, rótulo no seletor e zona de upload operável por teclado.
- RW-14. Nenhum texto dos dados é inserido como HTML. A lint proíbe `dangerouslySetInnerHTML`.
- RW-15. `HOST` default `127.0.0.1` e `PORT` default `8765`. Em produção o Fastify serve o build na mesma origem. Em desenvolvimento o Vite faz proxy de `/api`.
- RW-16. O README registra o que muda ao escutar na rede interna.
- RW-17. O nome com `#`, `%`, acento ou vírgula sobrevive ao encoding do link e ao download do txt ou do csv. O sufixo `#n` de `arquivo_origem` é texto de linha, não caminho de arquivo.
- RW-18. `DELETE /api/lotes/{id}/linhas` remove uma linha concluída pelo `arquivo_origem`, apaga o txt e atualiza `resultado.csv`, `relacao.csv`, o log, as contagens e o `total`. O prefixo de fórmula continua só em `arquivo_origem`. Com `{ todos: true }`, remove todas as linhas concluídas, apaga os txt e reescreve os três arquivos. A resposta traz o lote com `total` 0.
- RW-19. `POST /api/lotes/{id}/arquivos` olha o `envioId` antes do status. Grava em staging com `nomeDisco` e só então move. A repetição de um `envioId` confirmado devolve a mesma resposta em qualquer status e não cria `duplicado`. Repetição enquanto o primeiro pedido grava responde 409 `envio_em_andamento`. Falha antes do commit não deixa arquivo novo em `entrada/`.
- RW-20. `POST /api/lotes/{id}/fechar` responde 202 em `recebendo`, 400 fora de `recebendo`, 404 se o lote não existe e 409 `lote_ocupado` com envio em voo. Antes do 202, conclui staging com manifesto e apaga staging sem manifesto. As `falhas` entram no CSV. `arquivo_origem` distinto, inclusive `{basename}#{n}`, não é descartado por já existir o basename sem sufixo. 4xx de envio não é repetido nem retido. Rede e 5xx têm uma repetição e depois podem ficar retidos. 413 `limite_lote` interrompe os envios que faltam, e a página manda esses arquivos no `fechar`.
- RW-21. `DELETE /api/lotes/{id}` responde 204 e remove pasta e job em `recebendo`, `concluido` ou `erro`. Em `processando` ou com envio em voo, responde 409.
- RW-22. A ocorrência 1 segue a ordem de entrada na seleção. Ocorrências seguintes vão ao fechamento como `{basename}#{n}` com motivo `duplicado` e aparecem no `resultado.csv` e no `erros.log`.
- RW-23. A ordenação da página e a do servidor percorre code points. Não usa a comparação UTF-16 de `<` nem o `sort` sem comparador. O par U+E000 e U+1F600 segue a ordem da `str` do Python 3.
- RW-24. O upload não interpreta JSON. Frase de conteúdo, colisão e bloco ignorado saem no fechamento, nos workers. O `erros.log` da CLI não ganha a terceira coluna nem o escape de controle.
- RW-25. A Piscina é global. Um lote converte por vez, em blocos de 32. Lote na fila fica `processando` com 0 de N. A publicação do bloco espera todos os preparos do bloco e segue a ordem de code points.
- RW-26. O arquivo em `entrada/` se chama `{uuid}.json` gerado pelo servidor. O manifesto liga esse nome a `arquivo_origem`. Depois de publicar os três arquivos, `entrada/` é apagada. O zip é gerado em fluxo.
- RW-27. Em `resultado.csv`, o prefixo `'` vale só para `arquivo_origem` e só quando o primeiro caractere é `=`, `+`, `-`, `@`, tabulação ou CR. `relacao.csv`, `codigoDisciplina`, `uuid` e `arquivo_saida` não recebem o prefixo. O `erros.log` do lote web escapa tabulação, CR e LF na referência e na frase. A CLI não prefixa e não escapa.
- RW-28. `GET /api/limites` devolve os tetos que a página usa para cortar envios e para recusar a seleção.
- RW-29. Os textos de envio, progresso, retenção e paginação são os desta SPEC, com singular e plural e com números pt-BR. A unidade visível de tamanho é MiB ou GiB.
- RW-30. `relacao.csv` tem cabeçalho fora da contagem. Os registros são os convertidos, na ordem de code points do `arquivo_origem`.

## Critérios de aceitação

- CW-01 (RW-01, RW-11). Dado um `.json` selecionado. Quando a pessoa solta outro `.json` na zona. Então a seleção passa a ter os dois e nenhum `POST` acontece. Quando clica em "Converter agora". Então `POST /api/lotes` responde 202 com `id` e `limites`, e os arquivos seguem em `POST /api/lotes/{id}/arquivos`.
- CW-02 (RW-02, RW-24, RW-26). Dado a zona vazia. Então "Converter agora" fica desabilitado e a tela não chama a API. Dado um envio com um `.json` e um `.txt`. Quando o servidor recebe. Então a resposta é 200, o `.txt` está em `recusados` com motivo `nao_json` e o `.json` está em `entrada/` sob `nomeDisco`, não sob o basename. Dado um envio cujo único arquivo é um JSON inválido. Quando o servidor responde. Então a resposta é 200, o arquivo está em `entrada/` sob `nomeDisco`, a linha fica `convertendo` e `diagnostico` vem vazio.
- CW-03 (RW-03, RW-19, RW-20). Dado um arquivo com um byte acima de `maxBytesArquivo` no meio de um envio que já tem arquivo aceito no lote. Quando o servidor lê essa parte. Então a resposta é 413 `limite_excedido`, a página não repete esse envio, o staging some e o arquivo aceito antes continua em `entrada/`. Dado `Content-Length` acima de `maxBytesRequisicao`. Quando a requisição chega. Então a resposta é 413 e nenhum staging é criado. Dado soma dos arquivos exatamente igual a `maxBytesEnvio` e `Content-Length` maior que essa soma só pelo overhead, dentro de `maxBytesRequisicao`. Quando o servidor recebe. Então a resposta é 200 e os arquivos entram.
- CW-04 (RW-04, RW-05, RW-10). Dado um lote `processando`. Quando Arquivos Processados está aberta. Então ela consulta o lote a cada 1 segundo. O GET do lote não contém `arquivos`. A tabela da página visível vem de `/linhas`.
- CW-05 (RW-05, RW-12). Dado um lote concluído com uma linha `convertido` e outra `erro`. Quando abre Arquivos Processados. Então as métricas batem com as contagens e a tabela lista as duas. Quando busca um texto que não está em nenhuma coluna, inclusive `diagnostico`. Então a tabela fica sem linha e as métricas permanecem.
- CW-06 (RW-06, RW-17). Dado um txt cujo nome contém `#`, `%`, acento ou vírgula. Quando baixa pela tabela. Então o corpo é `text/plain; charset=utf-8`, há `X-Content-Type-Options: nosniff` e `Content-Disposition`, e o arquivo abre. Dado um nome com `../`. Quando pede o arquivo. Então a resposta é 404 `arquivo_inexistente`.
- CW-07 (RW-07, RW-26). Dado um lote concluído. Quando baixa o zip sem query. Então ele contém `relacao.csv`, os `.txt`, `resultado.csv` e `erros.log`, e o corpo é enviado em fluxo. Quando baixa com query `arquivo`. Então o zip traz só esses txt.
- CW-08 (RW-08, RW-09, RW-25). Dado um `id` que não existe. Quando consulta o lote. Então a resposta é 404 `lote_inexistente`. Dado um lote cujo TTL venceu e que não está `processando`. Quando consulta. Então a resposta é a mesma. Dado um lote `processando` com `expiraEm` no passado. Quando o varredor roda. Então a pasta permanece. Dado dois lotes. Quando os dois recebem envios. Então cada pasta tem só os arquivos do próprio lote. Dado um lote já em conversão. Quando outro fecha. Então o segundo fica `processando`, com `processados` 0 e `total` N, até a fila chegar nele.
- CW-09 (RW-13, RW-14). Dado o teclado na zona de upload. Quando pressiona Enter. Então o seletor de arquivos abre. Dado um nome de arquivo com `<` e `>`. Quando a tabela renderiza. Então o texto aparece escapado e o DOM não contém elemento criado a partir desse nome.
- CW-10 (RW-15, RW-16). Dado o servidor sem variáveis. Quando sobe. Então escuta em `127.0.0.1:8765`. O README diz que outro `HOST` expõe a ferramenta, sem login, na rede alcançável.
- CW-11 (RW-19). Dado um envio confirmado. Quando a página repete o mesmo `envioId` porque a resposta se perdeu. Então a resposta é 200, o JSON repetido é o manifesto, a quantidade de `nomeDisco` em `entrada/` não muda e `recusados` não traz `duplicado` desses nomes. Dado o lote já em `processando` ou `concluido` e o mesmo `envioId` confirmado. Quando o POST chega. Então a resposta também é 200, e não 400. Dado um envio interrompido antes do manifesto. Quando a transferência cai. Então `entrada/` não ganha arquivo desse envio. Dado o manifesto escrito e um arquivo já movido, sem o meta final. Quando o mesmo `envioId` chega de novo e não há pedido em voo. Então a resposta é a do manifesto e o arquivo não vira `duplicado`. Dado o primeiro pedido desse `envioId` ainda gravando. Quando o segundo chega. Então a resposta é 409 `envio_em_andamento` e o primeiro segue até um único commit.
- CW-12 (RW-20, RW-22). Dado dois arquivos com o mesmo basename, o segundo acrescentado depois do primeiro. Quando a página fecha o lote. Então `resultado.csv` tem o basename com o resultado da conversão e `{basename}#2` com status `erro` e código `duplicado`. O `erros.log` tem a linha dessa referência.
- CW-13 (RW-20). Dado um envio ainda sendo gravado. Quando chega `fechar`. Então a resposta é 409 `lote_ocupado` e o status continua `recebendo`.
- CW-14 (RW-20, RW-21). Dado um lote `recebendo` com arquivo já em `entrada/` e a página recarregada, sem `File`. Quando a pessoa clica em "Fechar com o que chegou". Então `fechar` vai com `falhas` vazio e o lote passa a `processando` só com o que o servidor tem. Quando clica em "Descartar lote". Então `DELETE` responde 204 e a pasta some.
- CW-15 (RW-03, RW-28). Dado teto de arquivo injetado. Quando o arquivo tem exatamente esse tamanho. Então a página o inclui num envio e o servidor o grava sob `nomeDisco`. Quando a página vê um arquivo um byte acima. Então ela não o envia e o `fechar` recebe a falha `limite`. Quando esse byte a mais chega dentro de um envio. Então a resposta é 413 `limite_excedido`, a página não retém o envio, o staging some e o arquivo já aceito num envio anterior continua. Dado soma dos arquivos exatamente igual a `maxBytesEnvio` e quantidade dentro do teto. Quando a página monta os envios. Então essa soma forma um envio só, e o arquivo seguinte abre outro. Dado teto de 2 arquivos por envio. Quando a página envia 3. Então saem dois envios para o mesmo lote. Dado teto de 2 arquivos no lote e 2 já aceitos. Quando chega um envio com o terceiro. Então a resposta é 413 `limite_lote`, nada desse envio é movido e os dois permanecem. A página não repete o envio e inclui o terceiro no `fechar` como `limite_lote`. Dado teto de bytes do lote injetado. Quando um envio faria a soma passar. Então a resposta é 413 `limite_lote` e o que já cabia permanece. Dado `GET /api/limites` sem variáveis. Então os números são os defaults desta SPEC, inclusive seleção 2500, lote 5000 e 40 GiB, e a margem `overheadPorArquivo` 1024 e `overheadEnvelope` 8192.
- CW-16 (RW-23, RW-25). Dado dois JSON cujo preparo termina na ordem inversa da ordem de code points e cujo texto visível coincide. Quando o lote fecha. Então os dois ficam `convertido`, cada um com o seu txt. A ordem das linhas no `resultado.csv` é a ordem de code points.
- CW-17 (RW-23). Dado `A.json`, `a.json` e `á.json`. Quando o lote fecha. Então a ordem no `resultado.csv` é `A.json`, `a.json`, `á.json`. Dado um nome com U+E000 e outro com U+1F600. Quando o lote fecha. Então o U+E000 vem antes. Essa é a ordem da `str` do Python 3. A comparação por unidades UTF-16 inverteria o par.
- CW-18 (RW-11, RW-29). Dado 51 arquivos. Quando a seleção é exibida. Então o resumo aparece, com `envios` e unidade GiB ou MiB, e a tabela de nomes não aparece. Dado 50 arquivos. Então a tabela de nomes aparece. Dado um envio retido com um arquivo. Então o texto é `1 arquivo não entrou. Reenvie esse envio ou feche com o que chegou.` Dado a página 2 de 13. Então o indicador é `Página 2 de 13`. Dado progresso de conversão. Então o texto usa agrupamento pt-BR, como `Convertendo 1.000 de 2.500`. Dado uma resposta 413 `limite_excedido` num envio. Então a página não repete esse envio e não mostra `Reenviar envios` por causa dele.
- CW-19 (RW-08, RW-20). Dado um `id` ausente. Quando `fechar`. Então a resposta é 404 `lote_inexistente`. Dado um lote `concluido`. Quando `fechar`. Então a resposta é 400 `lote_invalido`.
- CW-20 (RW-11, RW-28). Dado uma seleção com um arquivo e teto de seleção 2500. Quando a pessoa escolhe 3000 arquivos. Então a seleção continua com um arquivo e a mensagem é `A seleção passa de 2.500 arquivos.` Dado a seleção vazia. Quando a pessoa escolhe 3000 arquivos. Então a seleção continua vazia e a mensagem é a mesma.
- CW-21 (RW-18, RW-27, RW-30). Dado `codigoDisciplina` `-1` e outro `=cmd`. Quando o lote web grava `relacao.csv`. Então os campos saem `-1` e `=cmd`, sem apóstrofo. Dado `arquivo_saida` de um convertido. Quando o zip é aberto. Então o nome dentro do zip é igual ao campo, sem apóstrofo. Dado `arquivo_origem` `=nota.json`. Quando `resultado.csv` é gravado. Então esse campo começa com `'=nota.json`. Dado `arquivo_origem` com tabulação. Quando `erros.log` é gravado. Então a tabulação da referência vira barra invertida seguida da letra t, e a linha continua com as colunas separadas por tabulação real. Dado o mesmo `=cmd` na CLI. Quando a CLI grava o CSV. Então o campo não ganha apóstrofo.
- CW-22 (RW-30). Dado dois convertidos. Quando o lote fecha. Então `relacao.csv` tem o cabeçalho e dois registros, nessa ordem de code points, e o cabeçalho não é contado como registro.
- CW-23 (RW-07, RW-10). Dado um lote `concluido`. Quando a pessoa clica em "Baixar zip do lote" sem marcar linha. Então o pedido não tem query `arquivo`. Quando marca uma linha e clica em "Baixar seleção". Então o pedido leva só o txt dessa linha.
- CW-27 (RW-18). Dado um lote concluído com duas linhas. Quando a pessoa confirma "Excluir todos". Então o pedido é `DELETE /api/lotes/{id}/linhas` com `{ todos: true }`, as duas linhas somem, os txt somem e `relacao.csv` fica só com o cabeçalho. Cancelar não chama o DELETE.
- CW-24 (RW-26). Dado `A.json` e `a.json` no mesmo envio, num volume sem distinção de caixa. Quando o envio confirma. Então `entrada/` tem dois `nomeDisco` diferentes, nenhum dos dois arquivos se chama `A.json` ou `a.json`, e os dois `arquivo_origem` aparecem no manifesto.
- CW-25 (RW-09, RW-20). Dado um staging com manifesto e outro sem manifesto. Quando `fechar` ou a subida do servidor trata um lote `recebendo`. Então o staging com manifesto é movido para `entrada/` e o staging sem manifesto some, sem deixar os bytes dele no lote. Dado uma pasta de lote sem `lote.json`. Quando o servidor sobe. Então a pasta é apagada. Dado um `lote.json` em `recebendo` com envio já confirmado. Quando o servidor sobe. Então o job volta com esses arquivos. Dado um `lote.json` em `processando` com um bloco já nas linhas. Quando o servidor sobe. Então esse bloco não é convertido de novo e o restante entra na fila.
- CW-26 (RW-20). Dado uma aba com envio em voo e outra aba no mesmo lote. Quando a outra aba fecha. Então a resposta é 409 `lote_ocupado` e o status continua `recebendo`. Dado nenhuma gravação em voo. Quando a outra aba fecha. Então a resposta é 202. Um `envioId` novo depois disso responde 400. Um `envioId` já confirmado responde 200.

## Decisões em aberto

O default de cada uma já está nos requisitos. Mudar o default altera esta SPEC antes do código.

- DW-01. Tamanho máximo por arquivo. Default: 32 MiB (`LOTE_MAX_BYTES_ARQUIVO`).
- DW-02. Quantidade máxima por envio. Default: 200 (`LOTE_MAX_ARQUIVOS`).
- DW-03. Total máximo por envio. Default: 512 MiB (`LOTE_MAX_BYTES_TOTAL`).
- DW-04. Tamanho de página. Default: 50, máximo 200.
- DW-05. TTL. Default: 6 horas (`LOTE_TTL_HORAS`). Não corre durante `processando`.
- DW-06. Porta. Default: 8765 (`PORT`). O host `127.0.0.1` é decisão fechada.
- DW-07. Campo do multipart. Default: `arquivos`, mais `envioId`.
- DW-08. Intervalo de polling. Default: 1 segundo.
- DW-09. Quantidade máxima do lote. Default: 5000 (`LOTE_MAX_ARQUIVOS_LOTE`).
- DW-10. Total máximo do lote. Default: 40 GiB (`LOTE_MAX_BYTES_LOTE`).
- DW-11. Seleção máxima. Default: 2500 (`LOTE_MAX_ARQUIVOS_SELECAO`).
- DW-12. Lotes ativos. Default: 3 (`LOTE_MAX_ATIVOS`).
- DW-13. Espaço livre mínimo depois do envio. Default: 1 GiB (`LOTE_ESPACO_LIVRE_MINIMO`).
- DW-14. Bloco de conversão. Default: 32 arquivos.
- DW-15. Workers. Default: 2 (`LOTE_WORKERS`), numa fila global.
- DW-16. Overhead do multipart. Default: 1024 bytes por arquivo (`LOTE_OVERHEAD_POR_ARQUIVO`) e 8192 bytes de envelope (`LOTE_OVERHEAD_ENVELOPE`), somados a `maxBytesEnvio` só na hora de ler o `Content-Length`.
