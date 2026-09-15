# Leitor de WhatsApp

Primeira versão pessoal para navegador de iPhone: leitura de novas mensagens, perguntas à IA, reprodução do áudio original e rascunhos com autorização explícita de envio.

A base foi copiada de `../Whastagenda`, sem modificar o original. `backend/` preserva Node/TypeScript/Express/PostgreSQL e Unipile v1; `frontend/` preserva Next.js e o tema visual. Páginas antigas incompletas foram guardadas em `frontend/legacy-pages/` como referência fora das rotas ativas.

## Executar localmente

Requisitos: Node 20 ou superior, npm e PostgreSQL 15 ou superior. Redis/BullMQ permanecem no código legado de resumos, mas não são necessários para o assistente atual. Nenhum worker é iniciado pelo servidor atual.

1. Crie um banco PostgreSQL vazio para o app.
2. Em `backend/`, copie `.env.example` para `.env`. Preencha `DATABASE_URL` e `JWT_SECRET` (gere com `openssl rand -hex 32`). Não versione `.env`.
3. Execute:

```sh
cd backend
npm ci
npm run db:migrate
npm run build
npm start
```

Em outro terminal:

```sh
cd frontend
npm ci
npm run dev
```

Abra `http://localhost:3000`, crie uma conta local e entre. O Next encaminha `/api/*` ao backend em `127.0.0.1:3001`. Se precisar de outras portas, configure `PORT` no backend e `API_INTERNAL_URL` no frontend. Para build do frontend: `npm run build`; para servir esse build: `npm start`.

## Configurar WhatsApp e IA

No arquivo `backend/.env`:

- `UNIPILE_BASE_URL`: DSN HTTPS da sua conta Unipile **v1**, por exemplo `https://apiX.unipile.com:PORT`, sem `/api/v1` no final.
- `UNIPILE_API_KEY`: chave da conta Unipile.
- `UNIPILE_WEBHOOK_SECRET`: segredo aleatório exclusivo para receber eventos.
- `ANTHROPIC_API_KEY`: chave Anthropic.
- `ANTHROPIC_MODEL`: modelo acessível pela sua conta; padrão `claude-sonnet-4-6`.
- `JWT_SECRET`: segredo de pelo menos 32 caracteres para autenticação local.

No painel Unipile, configure webhooks de mensagens (`message_received`) e de estado da conta (`AccountStatus`) para `https://SEU_BACKEND/api/whatsapp/webhook`. Configure o header personalizado `X-Webhook-Secret` com o mesmo valor de `UNIPILE_WEBHOOK_SECRET`. O receptor também aceita HMAC SHA-256 dos bytes brutos em `X-Unipile-Signature`, se houver um intermediário que o produza. Sem segredo, todos os webhooks são rejeitados. A criação da conexão não cadastra webhooks automaticamente.

Abra Conexão → Gerar QR Code. No WhatsApp do iPhone: Configurações → Dispositivos conectados → Conectar dispositivo. Exiba o QR em outro aparelho/tela para escaneá-lo com esse iPhone. A tela verifica o estado a cada 5 segundos. Após o webhook de estado conectado, a caixa de entrada recebe novas mensagens.

O backend precisa de um endereço HTTPS alcançável pelo Unipile para os webhooks. O acesso pelo iPhone e o microfone do navegador também devem usar HTTPS confiável. Nenhum túnel, serviço externo ou deploy foi criado nesta tarefa.

Referências oficiais usadas para manter a integração v1:

- [Conexão WhatsApp](https://developer.unipile.com/docs/whatsapp)
- [Novas mensagens e payload](https://developer.unipile.com/docs/new-messages-webhook)
- [Estados da conta](https://developer.unipile.com/docs/account-lifecycle)
- [Áudio/anexos originais](https://developer.unipile.com/reference/messagescontroller_getattachment)
- [Envio em conversa existente](https://developer.unipile.com/reference/chatscontroller_sendmessageinchat)

## Uso e autorização

Selecione uma mensagem para perguntar sobre ela ou sugerir uma resposta. Sem seleção, a IA recebe até 80 mensagens dos últimos 7 dias, com no máximo 2.000 caracteres de texto por mensagem; a tela informa esse recorte. O histórico de conversa com a IA fica apenas na aba atual.

Para ouvir, selecione uma mensagem de áudio e toque em **Ouvir original**; também pode perguntar “toca o áudio”. O servidor busca o anexo usando a mensagem autenticada e nunca expõe a chave do provedor. O player toca o arquivo original, não uma voz gerada. O iPhone pode exigir um toque no player. Formatos não suportados ou anexos indisponíveis são informados.

O ditado usa reconhecimento de fala do navegador quando disponível. Caso contrário, use o microfone do teclado do iPhone. A fala preenche o campo para revisão e nunca aciona envio. Não há transcrição automática dos áudios recebidos nesta versão.

Para responder: selecione a mensagem → escreva/dite/cole a resposta → **Revisar rascunho** → confira conversa, destinatário e texto → **Autorizar e enviar agora**. Em grupos, o destinatário é o grupo, e não o remetente individual.

A autorização é vinculada no servidor ao usuário, conta Unipile, conversa e texto exatos, com validade de 10 minutos. Alterar a mensagem exige novo rascunho. O banco reivindica o rascunho antes do envio; cliques simultâneos não geram duas chamadas. Após timeout, o estado fica `unknown`, ou `sending` em caso de interrupção do processo, e não há repetição automática. Confira o WhatsApp antes de preparar outro envio.

A IA não possui ferramenta de envio. Entregas automáticas antigas por WhatsApp e e-mail foram removidas. Os endpoints legados de agendamento/resumos não estão expostos no servidor atual.

## Validação

```sh
cd backend
npm test
# Use SOMENTE banco descartável cujo nome termina em _test:
DATABASE_URL=postgresql://.../reader_test npm run test:integration
```

`backend/scripts/http-test.cjs` verifica autenticação, estado desconectado, falta de chaves, webhook, áudio persistido, deduplicação e rejeição de envio pela API. Use backend de teste sem chaves externas, `UNIPILE_WEBHOOK_SECRET=local-test-webhook`, banco terminado em `_test` e `TEST_API_URL` apontando para ele.

Passaram: builds TypeScript/Next; 5 testes unitários; testes de integração PostgreSQL com concorrência, troca de conta e timeout; teste HTTP local; login e layout em viewport 390×844. Dados de teste são fictícios, isolados e não constituem mensagens reais.

## Limites desta versão

- Conexão, IA, áudio real e envio real ainda precisam de credenciais e validação com a conta do usuário. Nenhuma mensagem real foi enviada.
- Apenas mensagens novas após conexão; sem importação de histórico. Caixa de entrada mostra até 80 mensagens recentes.
- Não migra para Unipile v2; requer disponibilidade da API v1 na conta.
- Sem transcrição de áudio recebido, push, instalação PWA ou sincronização do histórico da IA entre dispositivos.
- Texto recebido é armazenado em PostgreSQL sem criptografia de campo. Os nomes legados `phone_number_encrypted` e `content_encrypted` não representam uma implementação de criptografia. Use disco/banco protegidos e HTTPS ao hospedar. O texto consultado é enviado à Anthropic para responder à pergunta.
- Mensagens expiradas são excluídas das consultas; a remoção física do banco exige rotina operacional de retenção. Rascunhos e logs de autorização também precisam de política de retenção antes de exposição pública.
- Projeto pessoal local, sem deploy em produção nesta entrega.

## Ambiente local preparado neste computador

O banco persistente foi criado em `.local/postgres` (ignorado pelo Git), ouvindo somente em `127.0.0.1:55433`. Os segredos locais foram gerados em `backend/.env`, também ignorado pelo Git. As chaves externas continuam vazias até serem fornecidas pelo titular.

- Interface: `http://127.0.0.1:43100`
- Backend: `http://127.0.0.1:43101`
- Configuração Unipile: preencha `UNIPILE_BASE_URL` (DSN, sem `/api/v1`) e `UNIPILE_API_KEY` em `backend/.env`.
- IA: preencha `ANTHROPIC_API_KEY` no mesmo arquivo.
- Após alterar as chaves, reinicie o backend.

Para reiniciar o banco, a partir da raiz do projeto:

```sh
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o '-p 55433 -h 127.0.0.1 -k /tmp' start
```

Em terminais separados, inicie `npm start` dentro de `backend/` e `npm run dev -- --hostname 127.0.0.1 --port 43100` dentro de `frontend/`. O app permanece local; acesso pelo iPhone e webhooks externos ainda exigem preparação do endereço HTTPS. Para hospedagem, configure `HOST` e a rede conforme o ambiente.
