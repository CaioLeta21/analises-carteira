# Deploy no Cloudflare Pages

## 1. Criar o projeto

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Escolha o repositório.
3. Configuração do build:
   - Framework preset: **None**
   - Build command: *(vazio)*
   - Build output directory: `public`
   - Production branch: `main`
4. Salve e publique. O endereço provisório é `<projeto>.pages.dev`.

O Pages lê `public/_headers` automaticamente (CSP, cache).

## 2. Domínio

Se `letabuild.com` já está no Cloudflare:
0. `ativos.letabuild.com` hoje aponta para o app Streamlit antigo (servidor Oracle, porta 8502;
   código em `CaioLeta21/letabuild-ativos`). Apague esse registro DNS antes, senão o Pages
   recusa o domínio. Depois, desligue o app no servidor (nginx e serviço).
1. No projeto do Pages → **Custom domains** → **Set up a domain** → `ativos.letabuild.com`.
2. O Cloudflare cria o registro DNS sozinho.

Se o DNS estiver em outro lugar, crie um `CNAME analises → <projeto>.pages.dev` e confirme no Pages.

## 3. Privacidade no Cloudflare

- **Web Analytics:** deixe desligado no projeto do Pages.
- Não ative "Rocket Loader", "Zaraz" nem injeção de scripts: eles quebram a CSP e colocam
  código de terceiros na página.
- "Always Use HTTPS": ligado.

## 4. Atualização diária

- O Action `.github/workflows/atualizar-dados.yml` roda às 23:30 UTC e faz commit em `main`.
- Cada commit dispara um deploy no Pages (cerca de 1 minuto).
- `public/data/*.json` tem cache de 15 minutos; as páginas pedem com `cache: 'no-cache'`.

## 5. Conferir

```bash
curl -sI https://ativos.letabuild.com/ | grep -i -E "content-security|referrer"
curl -s https://ativos.letabuild.com/data/status.json
```

## 6. Voltar atrás

- Deploy ruim: no Pages → **Deployments** → escolha um anterior → **Rollback**.
- Dado ruim: `git revert` do commit do Action e rode o Action de novo depois de corrigir a fonte.
