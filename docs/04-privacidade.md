# Privacidade

## A promessa

> Sua carteira fica só neste navegador. Nada é enviado para servidor nenhum, e o dono do site
> não tem como ver.

## Como ela é cumprida

| Camada | O que garante |
|---|---|
| Sem servidor de aplicação | O site é só arquivo estático. Não existe endpoint que receba dados. |
| IndexedDB | A carteira é gravada no armazenamento local do navegador, na origem do site. |
| CSP `connect-src 'self'` | O navegador bloqueia qualquer tentativa de script enviar dados a outro domínio. |
| CSP `script-src 'self'` | Só roda JS servido pelo próprio site; nada embutido, nada de terceiros. |
| Sem terceiros | Sem analytics, fontes externas ou CDNs. Bibliotecas copiadas em `assets/vendor/`. |
| `Referrer-Policy: no-referrer` | Links externos não revelam de onde o usuário veio. |
| Teste automático | `npm run e2e` falha se a página fizer qualquer requisição para fora. |
| Backup cifrado | AES-GCM 256, chave derivada da senha por PBKDF2-SHA256 com 600 mil iterações, tudo no navegador. |

## O que o dono do site vê

- Os logs padrão do Cloudflare (IP, página, horário), como em qualquer site. **Desligue o Web
  Analytics do Cloudflare Pages** para não coletar nem isso além do mínimo.
- Nada da carteira: nem ativos, nem valores, nem nomes de carteira.

## Limites (dizer com honestidade, inclusive na página se perguntarem)

- **Quem controla o código pode mudá-lo.** Um dono mal-intencionado poderia publicar uma versão
  que lê a carteira. A defesa é o código aberto (o usuário pode conferir) e a CSP versionada no
  repositório. Se o repositório for público, mencione isso na página.
- **Extensões do navegador** com permissão ampla conseguem ler a página.
- **Aparelho compartilhado:** quem usar o mesmo navegador vê a carteira. Não há senha local
  (pode ser uma melhoria: cifrar o IndexedDB com senha).
- **Perda:** limpar os dados do navegador apaga as carteiras. O site pede ao navegador para não
  apagar por falta de espaço (`navigator.storage.persist()`), mas isso não impede o usuário de
  limpar. Por isso o aviso de backup.

## Regras para quem mexer no código

1. Nunca enviar dado do usuário pela rede, nem "anônimo", nem "agregado".
2. Nunca colocar analytics, pixel, mapa de calor, chat ou fonte externa.
3. Não afrouxar `connect-src`, `script-src` ou `default-src` no `_headers`.
4. Dado de CSV, backup ou digitado é texto: `textContent`, nunca `innerHTML`.
5. Mudança no formato salvo (`versao` da carteira) precisa de migração que não perca dados.
