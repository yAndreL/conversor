# Lote único para milhares de JSON

Data: 2026-10-28. Segunda revisão incorporada.

A pessoa escolhe os JSON e clica uma vez. A página envia esse conjunto em envios sequenciais para um único lote. No fim existem um `relacao.csv`, um `resultado.csv`, um `erros.log` e um zip.

O contrato normativo, com RW e critérios Dado/Quando/Então, está em [SPEC-WEB.md](../../SPEC-WEB.md). A linha de comando não muda.

## Decisões desta revisão

Margem do `Content-Length`. `maxBytesEnvio` é a soma dos arquivos, 512 MiB. O multipart acrescenta cabeçalhos. O servidor aceita `Content-Length` até `maxBytesEnvio` + 200 × 1024 + 8192. A página não encolhe a soma dos arquivos por causa disso. Um envio cheio, com os boundaries, passa.

Nome em disco. `entrada/` guarda `{uuid}.json` gerado no manifesto (`nomeDisco`). `arquivo_origem` fica só no manifesto e no CSV. `A.json` e `a.json` ocupam dois arquivos. Path traversal, nome reservado e limite do sistema de arquivos não usam o nome da pessoa.

Retry. No `POST` de arquivos, 4xx não é repetido nem retido. Rede e 5xx têm uma repetição automática e, se falhar de novo, ficam retidos. `envioId` repetido enquanto o primeiro pedido grava: 409 `envio_em_andamento`. `envioId` já confirmado: 200 com o manifesto guardado, e essa checagem vem antes da checagem de status. Depois do fechamento, repetir o envio commitado não vira 400.

Teto do lote. Se o envio inteiro não cabe nos 5.000 arquivos ou nos 40 GiB, a resposta é 413 `limite_lote` e o staging inteiro é descartado. A página para os envios que faltam, não oferece reenvio, e manda esses arquivos no `fechar` com motivo `limite_lote`.

Staging e reinício. Manifesto escrito só depois de todos os bytes. `fechar` e a subida do servidor concluem o move desses stagings e apagam staging sem manifesto. Cada transição grava `lote.json`. Ao subir, pasta sem esse arquivo é apagada; `recebendo` e `processando` são restaurados. Bloco já registrado não é convertido de novo.

CSV. O apóstrofo de fórmula fica só em `arquivo_origem` no `resultado.csv`, e os gatilhos são `=`, `+`, `-`, `@`, tabulação e CR. `relacao.csv` e `arquivo_saida` saem limpos, para o código `-1` importar e o nome do txt bater com o zip. No `erros.log` do lote web, tabulação, CR e LF da referência e da frase viram sequências escapadas. A CLI não faz nada disso.

Ordenação. O comparador percorre code points. Não usa `<` nem o `sort` padrão, que comparam unidades UTF-16. O nome com U+E000 vem antes do nome com U+1F600, que é a ordem da `str` do Python 3 e o inverso da ordem UTF-16.

Outra aba. Com envio em voo, `fechar` responde 409. Sem gravação em voo, a outra aba fecha o lote. Um `envioId` novo depois disso responde 400. Um `envioId` já confirmado responde 200.

## O que a implementação ainda não faz

O código e os testes atuais seguem o contrato anterior. Eles passam a citar os RW e CW quando a implementação começar, depois desta revisão aprovada.
