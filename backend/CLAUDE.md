# Leitor de WhatsApp — orientação da cópia

O escopo atual é o próprio WhatsApp do usuário. Preserve a origem Whastagenda; trabalhe nesta cópia.

Regra central: nenhuma mensagem deve ser enviada automaticamente. O único envio permitido pelo app passa por rascunho persistido, destinatário e texto exatos revisados, e autorização explícita do usuário. A IA não tem ferramentas de envio. Falhas/timeout nunca habilitam repetição automática.

Stack herdada: Node/TypeScript/Express/PostgreSQL e Next.js. Conexão padrão Baileys, com sessão criptografada no PostgreSQL; Unipile v1 opcional legado. IA Anthropic. Um único processo backend controla os sockets por banco. Redis/BullMQ e digest legado permanecem como referência sem workers ativos.

Leia ../README.md para configuração e limitações. Execute npm test e os testes de integração apropriados ao alterar o fluxo de envio. Nunca use credenciais de produção nos testes. Não apresente fixtures como mensagens reais.
