# Nexo Essencial — proposta de R$ 9,90/mês

O produto é um assistente pessoal por voz: o usuário pede para ler, organizar ou responder suas conversas. Envio depende da ordem direta do usuário, sem uma segunda confirmação. Não é um atendente comercial que responde clientes sozinho.

## Pacote recomendado

- Uma conta WhatsApp vinculada; lista de conversas, busca, favoritas e envio manual.
- Um relatório por dia (até 31/mês), com resumo, pedidos e próximos passos. Limite por relatório e tamanho de texto claramente informados.
- Voz com chave própria OpenAI, paga pelo cliente diretamente ao provedor; alternativamente, créditos adicionais pré-pagos do Nexo após a implementação da cobrança e medição.
- Sem promessa de voz ilimitada dentro de R$ 9,90. Nenhuma compra nem cobrança recorrente está habilitada nesta entrega.

## Exemplo de custo de texto

Tabela oficial consultada em 14/09/2026: GPT-5.6 Luna Standard, contexto curto, US$ 0,20 por milhão de tokens de entrada e US$ 1,20 por milhão de saída. Fonte: https://developers.openai.com/api/docs/pricing

Cenário ilustrativo, não consumo medido: cada relatório usa 30.000 tokens de entrada e 1.000 de saída. Custo de US$ 0,0072 por relatório; 31 relatórios custam US$ 0,2232 por cliente/mês. Saída inclui os tokens de raciocínio faturados. Dados maiores e outras consultas aumentam o custo. A implementação ainda não mede nem impõe uma franquia mensal de tokens; o teto atual é 300 mensagens de até 1.000 caracteres e 2.200 tokens de saída por relatório.

Essa conta inclui somente a geração de texto. Ainda devem ser descontados câmbio, impostos, tarifa de pagamento, Railway/banco, armazenamento, suporte e inadimplência. Só fechar a margem após medir uma amostra de uso real e dividir os custos fixos pelo número de assinantes. Não converter os valores acima usando uma cotação não verificada.

## Implementado nesta entrega

Conversas por conta, busca no recorte carregado, histórico recebido e respostas enviadas pelo app, favoritas e leitura locais por usuário, tema claro/escuro, chave pessoal criptografada e validada, relatório gerado manualmente e salvo por data. Repetir a consulta do relatório salvo não gera uma nova resposta de IA. Contas existentes mantêm o acesso de teste do servidor; contas novas não consomem a chave compartilhada. Créditos e assinatura aparecem como proposta, sem checkout fictício.

## Próximas etapas antes de vender o pacote

1. Escolher meio de pagamento e implementar assinatura, webhook verificado e acesso por período pago.
2. Medir tokens e gastos por usuário, reservar saldo antes de sessões e impor limites no servidor, inclusive voz. Nunca aceitar contadores de cobrança enviados pelo cliente como autoridade.
3. Para o relatório automático, definir horário/fuso, geração idempotente por dia e notificação no app. A geração atual é manual; não existe envio agendado de relatório para WhatsApp ou email.
4. APK Android com sessão de áudio em serviço apropriado, notificação persistente, gerenciamento de Bluetooth, bateria e reconexão. Validar em aparelhos reais. A versão web atual exige a tela visível e termina a voz após 10 minutos.
5. Avaliar Gemini Live com as mesmas ações do assistente e comparar latência, português, acerto de destinatários e gasto antes de oferecer outro provedor. A integração atual continua OpenAI.

Vinculação por QR não é clonagem integral do WhatsApp: o app mostra mensagens que o servidor recebeu e manteve no seu período de retenção; não importa todo o histórico nem espelha tudo que for enviado fora do Nexo.
