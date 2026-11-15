-- Banco do radar (D1 ativos-radar). Tudo aqui é público: ativo, alvo e como o alvo foi definido.
-- Anotações e preço de entrada são do dono e ficam só na carteira privada.
CREATE TABLE IF NOT EXISTS radar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simbolo TEXT NOT NULL UNIQUE,       -- símbolo no Yahoo (PETR4.SA, VOO, ASML.AS, BTC-USD)
  codigo TEXT NOT NULL,               -- como aparece (PETR4, BTC)
  nome TEXT,
  tipo TEXT NOT NULL,                 -- acao, etf, fii, cripto
  mercado TEXT NOT NULL,              -- BR ou EXT
  moeda TEXT,
  preco_alvo REAL,                    -- na moeda do ativo
  alvo_explicacao TEXT,               -- aparece no "?" do cartão
  alvo_auto TEXT,                     -- JSON do alvo calculado (Gemini ou termômetro do BTC); NULL = digitado
  adicionado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  -- "balanço novo desde o teto" (functions/_balancos.js): fim do último trimestre publicado, trimestre
  -- que o teto levou em conta, e o dia da última conferência no Yahoo
  balanco_ultimo TEXT,
  teto_balanco TEXT,
  balanco_conferido_em TEXT
);
-- (banco criado antes de 15/nov/2026 à noite: ALTER TABLE radar ADD COLUMN balanco_ultimo / teto_balanco / balanco_conferido_em)

-- Marcas do dia (ex.: alvos conferidos) e resultado do último recálculo.
CREATE TABLE IF NOT EXISTS cache (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  atualizado_em INTEGER
);
