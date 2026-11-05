# Produto

## Para quem

Investidor pessoa física brasileiro que quer entender quanto os ativos renderam em dólar e em
real, e quanto risco a própria carteira carrega. Público do letabuild.com: gosta de ferramentas
gratuitas, de código aberto e que respeitam a privacidade.

## Páginas

### 1. Início (`/`)
Três cartões com links para as páginas e a data dos dados.

### 2. Ações e ETFs (`/acoes-etfs/`)
- Gráfico de "quanto valeria cada 100", barras de retorno anual e tabela de risco.
- Filtros: período (desde 2004, 15 anos, desde o DIVO11, 10 anos, 5 anos), moeda (dólar ou
  real), escala (linear ou logarítmica), ativos (um a um, ou ações e ETFs em grupo).
- O endereço guarda os filtros (`#periodo=10a&moeda=BRL&escala=log`).
- "Adicionar ativo": qualquer um dos 169 do catálogo (busca por código ou nome). A escolha fica
  guardada só no navegador (`analises-carteira:comparador`); o × tira.
- O texto de abertura é **gerado a partir dos números**: maiores retornos anuais, S&P 500 e
  QQQ, melhor e pior ação brasileira, CDI, dólar. Assim ele não fica errado quando os dados mudam.
- Mostra "Dados até dd/mm/aaaa" e avisa quando o mês corrente é parcial.

### 3. Simulador (`/simulador/`)
- Seis categorias (renda fixa Brasil e exterior, ouro, alternativos, renda variável exterior e
  Brasil), cada uma com um substituto de mercado. Rebalanceamento mensal.
- Métricas: volatilidade em reais e em dólar, retorno anual, maior queda, pior janela de
  12 meses, meses negativos, anos de crise.
- Exemplos prontos: Conservadora, Moderada, Arrojada. Se houver carteira salva no navegador,
  aparece o botão com o nome dela e ela vira a referência de comparação.
- "Salvar como carteira" cria uma carteira nova (por categoria) no navegador.
- Aceita pesos pelo endereço: `#pesos=rfbr:40,rfex:15,...&pat=1.2` (usado pela Minha carteira).

### 4. Minha carteira (`/carteira/`)
- Várias carteiras com nome; criar, renomear, duplicar, apagar.
- **Por categoria**: patrimônio e percentual de cada categoria.
- **Por ativo**: linhas com código, nome, categoria, quantidade, valor e moeda.
  - Ativo da base de preços (os 16 do comparador e os 169 do catálogo): basta a quantidade; o
    valor sai do último preço e a categoria vem preenchida. O risco usa a série do próprio ativo.
  - Outros (Tesouro, CDB, fundos): informa o valor.
  - Importa CSV (vírgula ou ponto e vírgula; aceita decimal com vírgula), exporta CSV,
    baixa um modelo.
- Análise: patrimônio em R$ e US$, pizza por categoria, Brasil x exterior, métricas de risco
  e desempenho de 12 meses e 5 anos de cada ativo da base.
- Backup: baixa um arquivo com todas as carteiras, com senha opcional (AES-256 no navegador);
  restaura em outro aparelho.
- Onde guardar: neste navegador (padrão, salva sozinho no IndexedDB) ou só no arquivo (nada
  fica no aparelho; abre o arquivo a cada visita e baixa de novo quando muda).
- Instalável na Tela de Início (abre direto na Minha carteira).
- Compara a carteira com o CDI e com a carteira Moderada (crescimento e quedas).

## Critérios de aceite (todas as páginas)

- Carrega em menos de 2 s numa conexão 4G (tudo estático, JSON pequeno).
- Funciona em 390 px de largura e no modo escuro.
- Nenhuma requisição para outro domínio.
- Sem erros no console.
- Sem dados: mensagem clara ("Não foi possível carregar os dados agora...").

## Fora do escopo (por enquanto)

- Conta de usuário, login, sincronização entre aparelhos pelo servidor.
- Leitura automática de extratos de corretora (PDF).
- Cotações intradiárias.

## Ideias para depois (não fazer sem pedir)

- Sincronização opcional cifrada de ponta a ponta (ex.: frase de 12 palavras ou Nostr com NIP-44).
- Histórico da carteira: guardar fotos mensais para ver a evolução real.
- Histórico automático da carteira (versão gravada a cada edição; gráfico mensal reconstruído).
