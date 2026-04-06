# API Local Tunnel (NestJS + Fastify + Docker)

Aplicacao para expor sua API local via URL HTTPS publica e configuravel.

## Objetivo

- Subir a API NestJS com Fastify em Docker.
- Definir porta local por variavel.
- Definir a URL desejada via subdominio (`TUNNEL_SUBDOMAIN`).
- Manter o tunnel ativo enquanto o container existir.

## Stack

- NestJS 11 + TypeScript
- Fastify (`@nestjs/platform-fastify`)
- Docker + Docker Compose
- PNPM
- localtunnel

## Configuracao

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Variaveis principais:

- `APP_HOST`: host de bind da API (`0.0.0.0` recomendado em container)
- `APP_PORT`: porta da API no container e no host
- `TUNNEL_PORT`: porta que o tunnel vai encaminhar para a API
- `TUNNEL_SUBDOMAIN`: subdominio desejado para URL HTTPS
- `TUNNEL_HOST`: servidor do localtunnel

URL desejada:

`https://<TUNNEL_SUBDOMAIN>.localtunnel.me`

Observacao: o subdominio depende de disponibilidade no servidor de tunnel.

## Executando com Docker

```bash
pnpm run docker:up
```

Para encerrar:

```bash
pnpm run docker:down
```

## Executando local (sem Docker)

```bash
pnpm install
pnpm run start:dev
```

## Tunnel estilo ngrok (qualquer porta)

O script `pnpm tunnel` usa um wrapper em `scripts/tunnel-cli.cjs` que remove o separador `--`
que o PNPM costuma repassar ao binario. Sem isso, o CLI do localtunnel nao reconhece `--port`
e aparece `Missing required argument: port`.

Comando (pode usar `--` antes dos flags do tunnel):

```bash
pnpm tunnel -- --port 3334 --subdomain minha-api-3334
```

Ou, equivalente:

```bash
pnpm run tunnel -- --port 3334 --subdomain minha-api-3334
```

Nome amigavel via `--url` (vira `--subdomain` depois de normalizar):

```bash
pnpm tunnel -- --port 3334 --url api.sandbox.confea-local
```

Exemplos:

```bash
# Porta 3000
pnpm tunnel -- --port 3000 --subdomain minha-api-3000

# Porta 3334
pnpm tunnel -- --port 3334 --subdomain minha-api-3334
```

Observacoes:

- Enquanto o processo estiver ativo, a URL HTTPS permanece ativa.
- URL publica do localtunnel: `https://<subdomain>.localtunnel.me`
- O `<subdomain>` e um unico rotulo DNS (sem pontos). Valores com pontos sao normalizados
  para hifens (ex.: `api.sandbox.confea-local` -> `api-sandbox-confea-local`).
- Se o subdominio estiver em uso, escolha outro nome.

## Endpoints

- `GET /`: retorna informacoes de runtime (URL local e URL HTTPS solicitada)

## Testes e lint

```bash
pnpm run lint
pnpm run test
pnpm run test:e2e
```
