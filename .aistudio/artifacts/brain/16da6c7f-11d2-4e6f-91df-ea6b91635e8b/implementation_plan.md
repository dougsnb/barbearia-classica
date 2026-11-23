# Sistema de Agendamento para Barbearia

Plataforma web full-stack para agendamento online de horários em barbearia, integrando portal do cliente, painel administrativo, prevenção de conflitos de agenda no banco de dados MySQL 8+ e lembretes automáticos por e-mail. A execução seguirá entregas por etapas, iniciando pela base de configuração, esquema relacional e autenticação da Etapa 1.

### Revisão do Usuário e Decisões Críticas

> [!IMPORTANT]
> As decisões abaixo foram confirmadas na entrevista inicial e guiarão a implementação da **Etapa 1** (infraestrutura, schema SQL, pool MySQL e middleware JWT) bem como as etapas seguintes após sua validação:

- **Padrão de Módulos no Back-end**: CommonJS (`require` / `module.exports`) em todo o servidor Node.js e utilitários.
- **Conexão MySQL e SSL**: Configuração voltada a ambiente local sem SSL por padrão, com ativação opcional via variáveis de ambiente para nuvem (Railway / Aiven).
- **Lembretes Automáticos por E-mail**: Rotina agendada com `node-cron` executando a cada 15 minutos para notificar agendamentos com 2 horas de antecedência.
- **Identidade Visual (Etapas Futuras de Front-end)**: Estética clássica escura em grafite e dourado, com tipografia editorial e foco em legibilidade e agendamento direto.
- **Escopo Imediato de Aprovação**: Ao aprovar este plano, serão gerados e entregues **apenas os 5 artefatos da Etapa 1** (configuração de dependências, exemplo de variáveis de ambiente, DDL/seed MySQL, pool de conexão e middleware de autenticação/autorização), aguardando sua confirmação para avançar ao Back-end completo.

---

### 1. Visão Geral e Conceito Central

- **O que o Sistema Faz**: Permite que clientes consultem serviços e barbeiros disponíveis, reservem horários sem sobreposição e acompanhem ou cancelem seus agendamentos; ao mesmo tempo, oferece ao administrador gestão de barbeiros, serviços, jornadas de trabalho e agenda geral, além do disparo automático de lembretes por e-mail.
- **Público-Alvo**:
  - **Clientes (`CLIENTE`)**: Usuários finais que buscam praticidade pelo celular ou desktop para agendar cortes, barba e combos.
  - **Administradores (`ADMIN`)**: Gestores ou donos da barbearia responsáveis por manter o catálogo, escalas semanais e controle operacional dos atendimentos.
- **Proposta de Valor**: Eliminação de conflitos de horário via restrição estrutural no próprio MySQL (`UNIQUE KEY` sobre coluna gerada para agendamentos ativos), segurança com hash `bcrypt` e tokens JWT com controle de perfil (RBAC), e redução de faltas por meio de lembretes automatizados.

---

### 2. Experiência do Usuário e Design Visual

- **Jornada Principal (Fluxo de Ponta a Ponta)**:
  1. **Página Inicial**: Apresentação da barbearia, catálogo de serviços com duração e preço, equipe de barbeiros e botão único de chamada principal para agendar horário.
  2. **Autenticação**: Tela limpa de login e cadastro com validação de campos, feedback claro de erro e redirecionamento automático conforme perfil (`CLIENTE` ou `ADMIN`).
  3. **Portal do Cliente**: Seleção sequencial (serviço -> barbeiro -> data -> horários livres calculados dinamicamente pela jornada e agenda ocupada), confirmação imediata e histórico com ação de cancelamento.
  4. **Painel Administrativo**: Visão tabular de agendamentos do dia/semana com filtro por status e barbeiro, alteração de status (`CONCLUIDO` / `CANCELADO`), e gerenciamento de serviços, barbeiros e horários de trabalho.
- **Identidade Visual e Tema (Grafite e Dourado Clássico)**:
  - **Direção Estética**: Barbearia tradicional contemporânea, sóbria e masculina, evitando excessos visuais ou ornamentos genéricos.
  - **Paleta 60-30-10**:
    - *60% Base Neutra*: Grafite profundo (`#111315`) como fundo principal de alto conforto visual.
    - *30% Superfícies Estruturais*: Carvão acetinado (`#1A1D21`) e bordas finas de 1px (`rgba(255,255,255,0.08)`), sem empilhamento de cartões dentro de cartões e com elevação única.
    - *10% Acento Intencional*: Dourado envelhecido (`#C9A24D`) reservado para ações primárias, estados ativos e destaques tipográficos. Texto principal em marfim suave (`#F3F4F6`) e metadados em cinza neutro (`#9CA3AF`), com estados semânticos (verde `#16A34A`, âmbar `#D97706`, carmesim `#DC2626`) sempre acompanhados de rótulo textual.
  - **Tipografia e Hierarquia**:
    - *Títulos e Marca*: `Playfair Display` (serifada clássica com `text-wrap: balance`).
    - *Interface e Corpo*: `Plus Jakarta Sans` (15px–16px, alta legibilidade).
    - *Dados, Preços e Horários*: `JetBrains Mono` ou figuras tabulares (`tabular-nums`) para alinhamento vertical perfeito em tabelas e seletores de horário.
  - **Contrato de Cabeçalho e Disciplina Visual**: Barra superior enxuta em uma única linha com 3 zonas (nome da barbearia à esquerda, links curtos de navegação ao centro e 1 ação principal à direita). Metadados (duração, preço, status) apresentados como texto limpo com separadores tipográficos (`·`), sem excesso de cápsulas decorativas.
- **Estados de Interface e Micro-interações**: Transições rápidas ($\le 200\text{ms}$) em `transform` e `opacity`, skeletons proporcionais durante carregamento de horários, estados vazios orientativos (com ação direta) e mensagens explícitas de erro ou confirmação sem uso de alertas nativos do navegador.

---

### 3. Decisões Técnicas e Trade-Offs

- **CommonJS no Servidor Node.js**:
  - *Abordagem Escolhida*: Uso de `require` e `module.exports` com `"type": "commonjs"` no `package.json`.
  - *Justificativa*: Alinhamento direto à especificação acadêmica clássica de Express + `mysql2` + `node-cron`, garantindo compatibilidade imediata com bibliotecas tradicionais de Node.js sem necessidade de transpilação.
- **Prevenção de Concorrência de Horários no Banco de Dados**:
  - *Abordagem Escolhida*: Coluna gerada persistida (`inicio_ativo`) que espelha `data_hora_inicio` apenas quando `status = 'AGENDADO'`, combinada com `UNIQUE KEY uk_barbeiro_inicio_ativo (id_barbeiro, inicio_ativo)` além de checagem transacional de intervalos sobrepostos.
  - *Justificativa*: Impede condição de corrida (dois clientes reservando o mesmo horário exato simultaneamente) no nível do SGBD, liberando automaticamente o horário caso um agendamento seja cancelado (`NULL` não colide em índices `UNIQUE` no MySQL).
- **Pool MySQL com SSL Opcional**:
  - *Abordagem Escolhida*: Pool `mysql2/promise` lendo `DB_SSL=true` para ativar objeto SSL (com `rejectUnauthorized` configurável via `DB_SSL_REJECT_UNAUTHORIZED`) e mantendo desativado por padrão em ambiente local.
  - *Justificativa*: Permite rodar imediatamente em MySQL local de desenvolvimento ou migrar para Railway/Aiven alterando apenas o `.env`.
- **Middleware de Autenticação e Autorização RBAC**:
  - *Abordagem Escolhida*: Validação Bearer JWT em `Authorization` anexando `req.usuario` (`id_usuario`, `nome`, `email`, `perfil`) e fábrica de middleware `autorizarPerfis(...perfisPermitidos)` para restringir rotas de `ADMIN` e `CLIENTE`.
  - *Justificativa*: Separa claramente autenticação (quem é o usuário) de autorização (o que o perfil pode acessar), mantendo códigos HTTP padronizados (`401` e `403`).
- **Estratégia de Lembretes por E-mail**:
  - *Abordagem Escolhida*: Job `node-cron` a cada 15 minutos (`*/15 * * * *`) buscando agendamentos `AGENDADO` nas próximas 2 horas sem registro `ENVIADO` na tabela `LEMBRETE`, disparando via Nodemailer e registrando sucesso (`ENVIADO`) ou erro (`FALHA`).
  - *Justificativa*: Garante idempotência (não envia duplicado) e rastreabilidade completa de entregas no banco.

---

### 4. Arquitetura Técnica e Estratégia de Dados *(Referência Técnica)*

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Cliente Web (HTML5 / CSS3 / Vanilla JS)              │
│   Pública (Catálogo) │ Login/Cadastro │ Portal Cliente │ Painel Admin   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / JSON + Bearer JWT
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Servidor Express (Node.js CommonJS)               │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │  Middlewares JWT     │  │ Rotas & Controllers │  │ Arquivos Estát.│  │
│  │  (autenticar / RBAC) │  │ (Auth, Agenda, Adm) │  │   (/public)    │  │
│  └──────────┬───────────┘  └──────────┬──────────┘  └────────────────┘  │
│             └─────────────────────────┼─────────────────────────────────┘
│                                       │
│  ┌────────────────────────────────────▼─────────────────────────────────┐
│  │                Serviço de Lembretes (node-cron + Nodemailer)         │
│  │           Execução a cada 15 min · Janela de 2h de antecedência      │
│  └────────────────────────────────────┬─────────────────────────────────┘
└───────────────────────────────────────┼─────────────────────────────────┘
                                        │ mysql2/promise Pool (SSL Opcional)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Banco de Dados MySQL 8+                         │
│   USUARIO ──< AGENDAMENTO >── BARBEIRO ──< HORARIO_TRABALHO             │
│                    │                                                    │
│                    ├──> SERVICO                                         │
│                    └──< LEMBRETE                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Modelo de Dados e Integridade**:
  - `USUARIO`: Armazena clientes e administradores (`perfil` ENUM `'CLIENTE'`, `'ADMIN'`), e-mail único e `senha_hash` gerada com `bcrypt`.
  - `BARBEIRO` e `HORARIO_TRABALHO`: Cadastro de profissionais ativos e janelas semanais de atendimento (`dia_semana` de 0 a 6, `hora_inicio`, `hora_fim`).
  - `SERVICO`: Catálogo com `preco` (`DECIMAL(8,2) > 0`), `duracao_min` (`INT > 0`) e flag `ativo`.
  - `AGENDAMENTO`: Relaciona cliente, barbeiro e serviço com `data_hora_inicio`, `data_hora_fim`, `status` (`AGENDADO`, `CANCELADO`, `CONCLUIDO`), `cancelado_em` e coluna gerada `inicio_ativo` protegida por índice único composto.
  - `LEMBRETE`: Auditoria de envios de e-mail por agendamento (`PENDENTE`, `ENVIADO`, `FALHA`, `enviado_em`).
- **Dados Iniciais (Seed)**:
  - 1 usuário `ADMIN` (`admin@barbearia.com` / `Admin@123`) e 1 usuário `CLIENTE` (`cliente@teste.com` / `Cliente@123`) com hashes `bcrypt` válidos gerados com custo compatível.
  - 2 barbeiros ativos ("Carlos Silva" e "Rafael Santos") com escalas de segunda (1) a sábado (6) nos turnos `09:00–12:00` e `13:30–19:00`.
  - 4 serviços ativos: Corte Masculino (R$ 45,00 / 30 min), Barba (R$ 35,00 / 30 min), Sobrancelha (R$ 20,00 / 15 min) e Combo Corte + Barba (R$ 70,00 / 60 min).
- **Escopo Imediato (Etapa 1 após aprovação)**:
  - Criação e entrega integral exclusiva dos 5 arquivos solicitados para a Etapa 1 (`package.json`, `.env.example`, `/database/schema.sql`, `/src/config/db.js` e `/src/middlewares/auth.js`), mantendo compatibilidade com os requisitos exatos e aguardando sua confirmação para iniciar a Etapa 2 (Back-end).
