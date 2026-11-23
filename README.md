# Sistema de Agendamento para Barbearia

Aplicação web full-stack desenvolvida para a gestão de horários, serviços e atendimentos de uma barbearia. O sistema permite que clientes consultem o catálogo, realizem cadastro e agendem, remarquem ou cancelem atendimentos online, enquanto administradores gerenciam barbeiros, jornadas de trabalho, serviços, agenda geral e lembretes automáticos por e-mail[cite: 1, 2, 3, 21].

Projeto desenvolvido para a disciplina **Projeto Tecnológico em Desenvolvimento de Sistemas** — Curso Superior de Tecnologia em Análise e Desenvolvimento de Sistemas (**ULBRA EAD**)[cite: 1].

---

## 🔗 Acesso ao Sistema Publicado

* **Aplicação Web:** `[INSIRA AQUI O LINK PÚBLICO DO RENDER, EX: https://barbearia-classica-douglas.onrender.com]`
* **Verificação de Saúde da API / Banco:** `[INSIRA AQUI O LINK PÚBLICO]/api/health`

> **Observação:** Como o sistema está hospedado em instância gratuita na nuvem, caso o servidor esteja em modo de suspensão por inatividade, o primeiro carregamento pode levar cerca de 30 a 40 segundos.

---

## 🔑 Credenciais de Acesso para Teste

Para avaliar os dois perfis previstos no sistema (`ADMIN` e `CLIENTE`), utilize as contas pré-cadastradas abaixo na tela de login (`/login.html`)[cite: 5, 13]:

| Perfil | E-mail | Senha | Permissões |
| :--- | :--- | :--- | :--- |
| **Administrador (`ADMIN`)** | `admin@barbearia.com` | `Admin@123` | Gestão de barbeiros, horários de trabalho, serviços, agenda geral, conclusão de atendimentos e disparo de lembretes[cite: 2, 13]. |
| **Cliente (`CLIENTE`)** | `cliente.teste@barbearia.com` | `Cliente@123` | Consulta de serviços, agendamento com barbeiro específico ou "Sem preferência", consulta de histórico, remarcação e cancelamento[cite: 2, 13]. |

*(Também é possível criar novas contas de cliente livremente na aba **"Criar Conta"** da tela de login)[cite: 5].*

---

## 🚀 Funcionalidades Principais

* **Cadastro e Autenticação (`UC01`, `UC02`):** Validação de e-mail único, criptografia de senhas com `bcrypt` e controle de sessão via `JWT` com separação por perfil[cite: 2, 3, 5, 19].
* **Catálogo Público (`UC03`):** Exibição dinâmica de serviços ativos (preço e duração) e barbeiros disponíveis[cite: 2, 6].
* **Agendamento e Controle de Conflitos (`UC04`, `UC08`):**
  * Escolha de profissional específico ou opção **"Sem preferência"** (alocação automática do primeiro barbeiro livre no horário)[cite: 2, 6].
  * Cálculo dinâmico de horários livres em intervalos de 15 minutos respeitando a jornada cadastrada e a duração do serviço[cite: 2, 8].
  * Prevenção de concorrência por meio de transações SQL (`FOR UPDATE`) e restrição de unicidade `UNIQUE (id_barbeiro, inicio_ativo)` no MySQL[cite: 8, 12, 14].
* **Consulta, Remarcação e Cancelamento (`UC05`, `UC06`, `UC07`):** Visualização de próximos atendimentos e histórico, com validação de antecedência mínima de 120 minutos para alterações pelo cliente[cite: 2, 7, 8].
* **Lembretes Automáticos por E-mail (`UC09`):** Rotina agendada com `node-cron` e `Nodemailer` que dispara avisos próximos ao horário do atendimento, com opção de execução manual no painel administrativo[cite: 9, 19].
* **Gestão Administrativa e Relatórios (`UC10` a `UC13`):** Cadastro e inativação lógica de barbeiros e serviços, configuração de turnos semanais por profissional e consulta de agenda/relatórios por período e barbeiro[cite: 2, 9, 10, 11].

---

## 🛠️ Tecnologias Utilizadas

* **Front-end:** HTML5, CSS3 e JavaScript puro (Vanilla JS) com layout responsivo[cite: 19].
* **Back-end:** Node.js com Express[cite: 19].
* **Banco de Dados:** MySQL 8+ (`mysql2/promise`)[cite: 19].
* **Segurança:** `bcrypt` e `jsonwebtoken` (JWT)[cite: 19].
* **Agendamento e E-mail:** `node-cron` e `nodemailer`[cite: 19].

---

## 💻 Como Executar Localmente

### Pré-requisitos
* **Node.js** (versão 18 ou superior)
* **MySQL** (versão 8.0 ou superior)

### Passo a passo

1. **Clone ou extraia o repositório** e abra o terminal na pasta raiz do projeto:
   ```bash
   cd barbearia-classica
