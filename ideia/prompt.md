Você é um engenheiro Python sênior. Quero construir um conversor em lote de arquivos JSON para arquivos .txt. Siga as etapas na ordem e NÃO escreva o conversor antes de concluir a Etapa 1.

## Contexto
- Os JSONs seguem (aparentemente) o schema "json-convert.document.v4", gerado a partir de DOCX via Mammoth.
- Campos que conheço: schema, documentId, codigoDisciplina, title, sourceType, toc, headings e blocks.
- Cada item de blocks tem ao menos index, type (ex.: "imageGroup"), tag (ex.: "p") e, em blocos de imagem, images[].src com Base64 gigante.
- Serão milhares de arquivos, processados em lote, uma única vez (reexecuções devem ser seguras).
- Não sei ainda se os blocks trazem HTML pronto ou texto estruturado. Isso precisa ser verificado.

## Objetivo
Para cada JSON de entrada, gerar um .txt contendo SOMENTE o conteúdo do documento em HTML sanitizado, e registrar a relação codigoDisciplina ↔ UUID.

## Etapa 1: Inspeção (obrigatória, antes de codar)
Analise os JSONs de exemplo que eu fornecer e me reporte:
1. Quais campos cada tipo de block possui (parágrafo, heading, lista, tabela, imageGroup, outros), com um exemplo curto de cada, truncando qualquer Base64.
2. Se o conteúdo textual vem como HTML (string com tags) ou como estrutura (runs, itens, células). Isso define se preciso de um sanitizador de HTML ou de um montador de HTML a partir dos blocos.
3. Se toc e headings duplicam o conteúdo de blocks (devem ser ignorados se duplicarem).
4. Se documentId é um UUID válido.
5. Os valores de codigoDisciplina nos exemplos. "DESENVOLVIMENTO" pode ser um valor padrão provisório e não um código real. Sinalize se parecer placeholder, estiver vazio ou se repetir entre arquivos.
6. Se os totais declarados no JSON (blocks, headings, paragraphs, images, tables, lists) são coerentes com o conteúdo real do array blocks.
Pare aqui e aguarde minha confirmação das decisões em aberto antes de seguir.

## Etapa 2: Regras do conversor (após minha confirmação)
**Fonte do conteúdo**
- Use apenas blocks. Ignore toc, headings e demais metadados, para não duplicar conteúdo.
- Preserve a ordem original dos blocks.

**Sanitização (allowlist, não blocklist)**
- Tags permitidas: p, br, strong, b, em, i, u, h1–h6, ul, ol, li, table, thead, tbody, tr, th, td, blockquote.
- Descarte TODOS os atributos (class, style, id, href, src etc.). Exceção: colspan e rowspan em th/td.
- <a>: remover a tag e manter o texto (unwrap).
- <img> e qualquer referência a Base64/data URI: remover por completo. Blocos do tipo imageGroup não entram no .txt.
- script, style, iframe, object, embed: remover junto com o conteúdo.
- Use uma biblioteca de sanitização por allowlist (preferência: nh3; alternativa: bleach ou BeautifulSoup/lxml com allowlist explícita). Não use apenas str(soup) com unwrap de <a>, pois isso deixa class, style e src nas demais tags.
- Remova parágrafos que fiquem vazios após a sanitização.

**Identificador (UUID)**
- Gere o UUID de forma determinística (uuid5), para que reexecutar o conversor não crie arquivos duplicados.
- Base: documentId, se for estável e único; caso contrário, o hash do conteúdo sanitizado. Defina um namespace UUID fixo no código.
- Não coloque o UUID dentro do conteúdo do .txt.

**Nome do arquivo**
- Formato exato: {codigoDisciplina}_{uuid}.txt (ex.: ADS001_550e8400-e29b-41d4-a716-446655440000.txt).
- Sanitize codigoDisciplina para uso em nome de arquivo (remover /, \, :, *, ?, ", <, >, |, espaços e caracteres de controle; limitar o tamanho).
- Se codigoDisciplina estiver ausente ou vazio, NÃO invente um valor: registre o arquivo como erro/pendente no relatório e não gere o .txt.

**Relação código ↔ UUID**
- Gere resultado.csv com as colunas: codigoDisciplina, uuid, arquivo_origem, arquivo_saida, status.
- Um mesmo codigoDisciplina pode aparecer em vários arquivos. Trate como 1:N e não sobrescreva linhas.

**Execução em lote**
- Processe todos os .json de uma pasta de entrada (pathlib), gravando em output/ em UTF-8.
- Mantenha o pipeline sequencial e simples. Só adicione concurrent.futures se eu pedir depois de medir a performance.
- Um arquivo com erro não derruba o lote: registre o erro (arquivo + motivo) em erros.log e continue.
- Ao final, imprima um resumo: total lido, convertido, com erro, sem codigoDisciplina, e quantos códigos se repetem.

## Entregáveis
- converter.py (ou pacote pequeno, se fizer sentido), requirements.txt e README curto com instruções de uso.
- Testes (pytest) cobrindo: parágrafo, heading, lista, tabela, bloco de imagem (deve sumir), link (mantém só o texto), atributos removidos, idempotência do UUID, codigoDisciplina ausente e nome de arquivo com caracteres inválidos.

## Restrições
- Python 3.10+, dependências mínimas.
- Não presuma campos que eu não tenha confirmado na Etapa 1. Se algo for ambíguo, pergunte.