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

Reconexão automática tem tentativas limitadas. Logout ou sessão inválida exigem novo QR; o app não envia mensagens durante a conexão. A sincronização inicial importa conversas e mensagens recebidas/enviadas disponibilizadas pelo WhatsApp. Uma sessão vinculada antes dessa mudança pode precisar de um novo QR para receber o histórico inicial; não há garantia de recuperar todo o histórico do celular.

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

A autorização dura 10 minutos e vincula usuário, sessão, provedor, conta, conversa e texto exatos. Uma mensagem de uma conta anterior não pode originar rascunho para outra conta. Alterar texto ou destinatário cria outro rascunho interno.

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
- Histórico inicial conforme disponibilizado pelo WhatsApp; mensagens próprias são importadas. Status/newsletters, eventos de sistema e conteúdo de visualização única são ignorados. Sem push ou transcrição automática de áudios.
- Telas antigas com mocks ficam arquivadas em `frontend/legacy-pages`, fora das rotas ativas.

## Luna e voz OpenAI

O assistente ativo usa `gpt-5.6-luna` via Responses API. A conversa por voz usa `gpt-realtime-2.1-mini` por WebRTC e consulta a Luna para analisar mensagens. Configure `OPENAI_API_KEY` no backend (serviço `whatapp` no Railway). `OPENAI_MODEL` e `OPENAI_REALTIME_MODEL` permitem configurar os modelos. A chave nunca vai ao navegador. A assinatura de ChatGPT não substitui os créditos da API.

A voz inicia ao abrir o app autenticado e configurado, permanecendo disponível entre as abas internas. O navegador ainda pode exigir permissão de microfone e um toque para liberar áudio. Pausar voz ou ocultar o app libera o microfone; ao retornar, a chamada retoma se não foi pausada. Chamadas são renovadas após 55 minutos, quando o agente está ocioso. Luna envia por ordem direta do usuário, sem segunda confirmação, com proteção contra duplicação. Mensagens recebidas não autorizam envio. Avisos por chegada são opcionais; o padrão é consulta por voz. O PWA não promete microfone ativo em segundo plano no iOS.

Sem a chave, a interface indica configuração pendente. O código Anthropic legado de digests não é usado pelo assistente ativo.

A caixa de entrada identifica mensagens novas a cada 5 segundos, sem anunciar o histórico inicial. O aviso pergunta se deseja saber o conteúdo. **Ler mensagem** seleciona a conversa; **Preparar resposta** e **Sugerir resposta** preenchem o campo e abrem a revisão. Editar, cancelar ou mudar de conversa invalida a confirmação anterior. Avisos por voz exigem a página visível e chamada ativa; não há notificação de voz com o app fechado.

Validação do fluxo: `npm --prefix frontend test` verifica deduplicação dos avisos e a frase de confirmação. No backend, `DATABASE_URL=<banco_descartavel_com_sufixo_test> npm run test:flow` testa sugestão autenticada, isolamento entre usuários e envio único com provedores simulados.


## Conversas, perfil e relatórios

- `/messages`: carregamento paginado de conversas sincronizadas, busca, favoritas e leitura locais; cada conversa exibe até 100 mensagens recebidas/enviadas disponíveis.
- `/settings`: temas claro/escuro, avisos de voz e chave OpenAI pessoal ou acesso da plataforma.
- Chaves pessoais verificadas nos endpoints de modelos, criptografadas com AES-256-GCM e vinculadas ao usuário. Configure `AI_KEYS_ENCRYPTION_KEY` (32+ caracteres) ou use `BAILEYS_AUTH_KEY`. Não troque a chave mestre sem migrar os valores criptografados. Rotas autenticadas retornam status, nunca a chave.
- Gerações e voz usam a credencial da conta autenticada. Contas existentes na primeira migração mantêm o acesso de teste; novas contas não consomem a chave compartilhada. Selecionar plataforma não concede saldo.
- `/reports`: relatório manual salvo por data, até 300 mensagens no fuso da conta. Trava transacional evita gerações simultâneas duplicadas. Sem envio agendado por WhatsApp/email.
- Assinatura de R$ 9,90 e créditos em preparação, sem checkout nem medição de saldo. Veja [proposta](docs/plano-nexo.md).
- APK Android e áudio com tela bloqueada são próximas etapas. Esta entrega é web responsiva.

Validação: 10 testes backend, 2 frontend, build completo, testes PostgreSQL de isolamento de chaves/conversas, relatório reutilizável e envio único. Interface conferida com fixtures em 390×844 e desktop. Nenhuma mensagem real enviada nos testes.

### Login no PWA
O atalho inicia em `/messages` e usa login próprio. E-mails são normalizados; o campo de senha permite conferir o preenchimento automático. Tokens expirados são renovados quando há refresh token válido. Credenciais incorretas continuam sendo recusadas. Railway usa confiança de um proxy por padrão; `TRUST_PROXY_HOPS` permite ajustar à topologia real.

### Agenda, fotos e histórico
- Luna busca nomes na agenda e nas conversas da conta conectada; `enviar_mensagem` não depende de mensagem recebida. Homônimos exigem escolher o contato pelo nome, nunca um ID. Busca e envio continuam isolados por usuário e conta, com envio único.
- Eventos de contatos salvam nome da agenda e aliases LID/telefone. Fotos são consultadas no WhatsApp autenticado, sob demanda, com cache de uma hora; fotos restritas ou ausentes usam iniciais.
- Ao conectar uma sessão sem histórico, o backend solicita sincronização completa ao aparelho e mensagens anteriores das conversas com âncoras conhecidas. O pedido pode ser recusado pelo WhatsApp; a interface distingue pedido de recebimento. Um novo QR pode ser necessário. Nenhum total de mensagens do telefone é prometido.
- A lista mostra rascunhos reais e permite iniciar conversa pelo botão de nova mensagem. O atalho de voz usa nomes, sem expor IDs internos.

### Conectar pela web e usar no PWA
Abra `/connect` no computador, entre com a mesma conta usada no PWA e escaneie pelo WhatsApp → Dispositivos conectados. Essa página é independente do layout do assistente e não inicia microfone ou chamada de voz. A conexão vive no servidor; o PWA observa o mesmo `connection_id` e recarrega as conversas quando a sessão ou o histórico mudam.

O handshake usa `Browsers.macOS('Chrome')` com histórico habilitado. A identificação Desktop foi reproduzida encerrando o handshake com 428; o teste `scripts/qr-flow-test.cjs`, em banco `_test`, confirma QR persistido e estado compartilhado, sem vincular telefone ou enviar mensagens.

A voz responde após uma transcrição não vazia, no máximo uma vez por item de entrada. VAD não cria respostas automaticamente. Durante a reprodução da voz, o envio do microfone fica suspenso e retoma após 450 ms, descartando capturas marcadas como eco. Conflitos de resposta ativa não enfileiram respostas adicionais. `/diagnostics` e o painel em `/connect` mostram até 100 eventos técnicos; o armazenamento mantém até 200 por usuário, sem texto, áudio, contatos, QR, SDP ou credenciais.
