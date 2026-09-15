# Leitor de WhatsApp

Aplicativo pessoal para ler novas mensagens, perguntar à IA, ouvir áudios originais e preparar respostas com autorização explícita.

## Conexão gratuita com Baileys

A conexão padrão agora usa **Baileys** diretamente com WhatsApp Web: não exige conta, chave nem assinatura Unipile. O servidor precisa permanecer ligado e com internet. O acesso à IA e a hospedagem têm custos independentes.

1. Abra **Conexão → Gerar QR Code**.
2. No WhatsApp do iPhone, abra **Configurações → Dispositivos conectados → Conectar dispositivo**.
3. Escaneie o QR exibido em outra tela. Ele se atualiza automaticamente.
4. Quando aparecer **WhatsApp conectado**, abra o assistente e aguarde novas mensagens.

É uma integração não oficial, sujeita a mudanças e restrições do WhatsApp. A versão está fixada em `@whiskeysockets/baileys@7.0.0-rc14`, versão publicada como latest na implantação desta mudança; futuras atualizações devem passar pelos testes. [Projeto oficial](https://github.com/WhiskeySockets/Baileys) · [Documentação](https://baileys.wiki/).

A sessão e as chaves Signal ficam criptografadas com AES-256-GCM no PostgreSQL. O segredo `BAILEYS_AUTH_KEY` fica no `.env`; mantenha-o estável e faça backup protegido. Se ausente, usa `JWT_SECRET` como chave de origem. Perder ou trocar o segredo exige reconectar. Não há arquivos de sessão públicos. Uma trava no PostgreSQL impede dois processos de controlar os sockets simultaneamente.

Reconexão automática tem tentativas limitadas. Logout ou sessão inválida exigem novo QR; o app não envia mensagens durante a conexão. A sincronização inicial de histórico está desativada; grupos são sincronizados após conectar.

## Executar

Requisitos: Node 20+, npm e PostgreSQL 15+. Redis/BullMQ permanecem somente no código legado, sem workers ativos no servidor atual.

Em `backend/`, copie `.env.example` para `.env` e configure `DATABASE_URL`, `JWT_SECRET` e `BAILEYS_AUTH_KEY` (gere cada segredo com `openssl rand -hex 32`). Use `WHATSAPP_PROVIDER=baileys`.

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

Por padrão, frontend em `http://localhost:3000` e backend em `127.0.0.1:3001`. O Next encaminha `/api/*` ao backend. Ajuste `PORT`, `HOST` e `API_INTERNAL_URL` quando necessário. A interface exige cadastro/login local.

### Ambiente já preparado neste computador

- Interface: `http://127.0.0.1:43100`
- Backend: `http://127.0.0.1:43101`
- PostgreSQL persistente: `.local/postgres`, porta `55433`, banco `reader`.
- Configuração: `backend/.env` e `frontend/.env.local`, fora do Git.

Para reiniciar o banco a partir da raiz:

```sh
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o '-p 55433 -h 127.0.0.1 -k /tmp' start
```

Depois execute `npm start` em `backend/` e `npm run dev -- --hostname 127.0.0.1 --port 43100` em `frontend/`.

A conexão Baileys usa saída de rede; **não precisa de webhook público nem túnel para receber mensagens**. Para abrir a interface no iPhone fora do computador, ainda é necessário hospedar a interface/backend com HTTPS e banco persistente. O servidor não pode ser uma função temporária/serverless: precisa manter o WebSocket ativo. Nenhum deploy público foi feito.

## IA, voz e áudio original

Configure `OPENAI_API_KEY` no backend. O assistente usa `gpt-5.6-luna`; a voz usa `gpt-realtime-2.1-mini`. Sem chave, a leitura e conexão continuam disponíveis e a interface informa a configuração pendente. O texto consultado e o áudio de voz são enviados à OpenAI.

Selecione uma mensagem e pergunte sobre ela. Sem seleção, a IA recebe até 80 mensagens dos últimos 7 dias, com até 2.000 caracteres de texto por mensagem. Seu histórico com a IA fica na aba atual.

Para ouvir o original, selecione uma mensagem de áudio e toque **Ouvir original**, ou pergunte “toca o áudio”. O backend autentica o usuário, confere a conta de origem e baixa/descriptografa o anexo pela Baileys. O player recebe o áudio original, limitado a 25 MB. Não há voz sintetizada nem transcrição automática. Formatos não suportados pelo iPhone ou anexos expirados podem não tocar; o erro é informado.

O ditado preenche os campos para revisão. Depende do suporte/permissão do navegador e HTTPS; alternativamente use o microfone do teclado do iPhone. Falar não dispara envio.

## Autorização de cada envio

Selecione uma mensagem → escreva/dite/cole uma resposta → **Revisar rascunho** → confira conversa e texto → **Autorizar e enviar agora**. Em grupos, o destinatário é o grupo inteiro.

A autorização dura 10 minutos e vincula usuário, sessão, provedor, conta, conversa e texto exatos. Uma mensagem de uma conta anterior não pode originar rascunho para outra conta. Alterar texto ou destinatário exige nova revisão.

O banco reivindica o rascunho antes de chamar o provedor. Dois cliques simultâneos geram no máximo uma chamada. Timeout/resultado incerto mantém `unknown` (ou `sending` após interrupção), sem repetição automática. Confira o WhatsApp antes de criar outro rascunho. A IA não tem ferramenta de envio. Entregas automáticas antigas por WhatsApp/e-mail foram removidas.

## Validação

```sh
cd backend
npm test
# Banco descartável, obrigatoriamente com nome terminado em _test:
DATABASE_URL=postgresql://.../reader_test npm run db:migrate
DATABASE_URL=postgresql://.../reader_test npm run test:integration
```

Cobertura: 8 testes unitários; autorização exata, expiração, usuário/conta/destinatário, concorrência, timeout sem repetição, normalização de grupos e áudios Baileys, criptografia e detecção de adulteração. Integração PostgreSQL verifica persistência, restauração/remoção das chaves Signal, deduplicação e troca de conta. A geração de QR real foi conferida na interface. O pareamento pelo usuário e mensagens/áudios reais ainda exigem validação após escanear.

## Compatibilidade e limites

- A base Whastagenda original foi preservada. Frontend Next.js e backend Node/TypeScript/Express/PostgreSQL foram reaproveitados.
- Unipile v1 permanece opcional com `WHATSAPP_PROVIDER=unipile`, `UNIPILE_BASE_URL`, `UNIPILE_API_KEY` e webhook autenticado por `X-Webhook-Secret`. O webhook é desativado no modo Baileys. `scripts/http-test.cjs` é um teste legado específico desse modo, com backend/banco descartáveis e sem chaves externas.
- Os nomes legados `unipile_account_id` e `unipile_message_id` também guardam identificadores internos Baileys; o campo `provider` os diferencia. As migrações preservam dados antigos.
- Mensagens/payloads são armazenados sem criptografia de campo; as credenciais da sessão, sim. Proteja banco/disco e backups. Consultas excluem mensagens expiradas; limpeza física e retenção de rascunhos precisam de rotina operacional.
- Sem histórico antigo, push, PWA ou transcrição de áudio recebido nesta versão. Mensagens próprias, status/newsletters, eventos de sistema e conteúdo de visualização única são ignorados.
- Telas antigas com mocks ficam arquivadas em `frontend/legacy-pages`, fora das rotas ativas.

## Luna e voz OpenAI

O assistente ativo usa `gpt-5.6-luna` via Responses API. A conversa por voz usa `gpt-realtime-2.1-mini` por WebRTC e consulta a Luna para analisar mensagens. Configure `OPENAI_API_KEY` no backend (serviço `whatapp` no Railway). `OPENAI_MODEL` e `OPENAI_REALTIME_MODEL` permitem configurar os modelos. A chave nunca vai ao navegador. A assinatura de ChatGPT não substitui os créditos da API.

Em `/assistant`, use **Conversar por voz**, permita o microfone e fale. O áudio do microfone vai à OpenAI; as consultas enviam o recorte de mensagens à Luna. **Encerrar voz**, sair da página ou ocultar a aba encerra a conexão e libera o microfone. Cada chamada tem limite local de 10 minutos. Não há ferramenta de envio na voz; a autorização de texto e destinatário continua na etapa de rascunho. Áudios recebidos do WhatsApp continuam disponíveis como original, sem transcrição automática.

Sem a chave, a interface indica configuração pendente. O código Anthropic legado de digests não é usado pelo assistente ativo.
