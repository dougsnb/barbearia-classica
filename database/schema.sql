-- ==============================================================================
-- SISTEMA DE AGENDAMENTO PARA BARBEARIA
-- Banco de Dados: MySQL 8+
-- ==============================================================================

-- ==============================================================================
-- 1. TABELA USUARIO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS USUARIO (
  id_usuario INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefone VARCHAR(20) NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('CLIENTE', 'ADMIN') NOT NULL DEFAULT 'CLIENTE',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario),
  UNIQUE KEY uk_usuario_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- 2. TABELA BARBEIRO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS BARBEIRO (
  id_barbeiro INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20) NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_barbeiro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- 3. TABELA SERVICO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS SERVICO (
  id_servico INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) NULL,
  preco DECIMAL(8,2) NOT NULL,
  duracao_min INT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_servico),
  CONSTRAINT chk_servico_preco CHECK (preco > 0),
  CONSTRAINT chk_servico_duracao CHECK (duracao_min > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- 4. TABELA HORARIO_TRABALHO
-- 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
-- ==============================================================================
CREATE TABLE IF NOT EXISTS HORARIO_TRABALHO (
  id_horario INT NOT NULL AUTO_INCREMENT,
  id_barbeiro INT NOT NULL,
  dia_semana TINYINT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  PRIMARY KEY (id_horario),
  INDEX idx_horario_barbeiro_dia (id_barbeiro, dia_semana),
  CONSTRAINT chk_horario_dia_semana CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horario_intervalo CHECK (hora_fim > hora_inicio),
  CONSTRAINT fk_horario_barbeiro
    FOREIGN KEY (id_barbeiro) REFERENCES BARBEIRO (id_barbeiro)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- 5. TABELA AGENDAMENTO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS AGENDAMENTO (
  id_agendamento INT NOT NULL AUTO_INCREMENT,
  id_cliente INT NOT NULL,
  id_barbeiro INT NOT NULL,
  id_servico INT NOT NULL,
  data_hora_inicio DATETIME NOT NULL,
  data_hora_fim DATETIME NOT NULL,
  status ENUM('AGENDADO', 'CANCELADO', 'CONCLUIDO') NOT NULL DEFAULT 'AGENDADO',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelado_em DATETIME NULL,
  inicio_ativo DATETIME GENERATED ALWAYS AS (
    CASE WHEN status = 'AGENDADO' THEN data_hora_inicio ELSE NULL END
  ) STORED,
  PRIMARY KEY (id_agendamento),
  UNIQUE KEY uk_barbeiro_inicio_ativo (id_barbeiro, inicio_ativo),
  INDEX idx_agendamento_cliente (id_cliente),
  INDEX idx_agendamento_barbeiro_data (id_barbeiro, data_hora_inicio, status),
  CONSTRAINT chk_agendamento_intervalo CHECK (data_hora_fim > data_hora_inicio),
  CONSTRAINT fk_agendamento_cliente
    FOREIGN KEY (id_cliente) REFERENCES USUARIO (id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_agendamento_barbeiro
    FOREIGN KEY (id_barbeiro) REFERENCES BARBEIRO (id_barbeiro)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_agendamento_servico
    FOREIGN KEY (id_servico) REFERENCES SERVICO (id_servico)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- 6. TABELA LEMBRETE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS LEMBRETE (
  id_lembrete INT NOT NULL AUTO_INCREMENT,
  id_agendamento INT NOT NULL,
  canal ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
  status ENUM('PENDENTE', 'ENVIADO', 'FALHA') NOT NULL DEFAULT 'PENDENTE',
  enviado_em DATETIME NULL,
  PRIMARY KEY (id_lembrete),
  INDEX idx_lembrete_agendamento_status (id_agendamento, status),
  CONSTRAINT fk_lembrete_agendamento
    FOREIGN KEY (id_agendamento) REFERENCES AGENDAMENTO (id_agendamento)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- DADOS INICIAIS (SEED)
-- ==============================================================================

-- Usuários iniciais:
-- ADMIN:   admin@barbearia.com / Admin@123
-- CLIENTE: cliente@teste.com   / Cliente@123
INSERT INTO USUARIO (nome, email, telefone, senha_hash, perfil) VALUES
  ('Administrador Barbearia', 'admin@barbearia.com', '(11) 99999-0001', '$2b$10$GWlcp3QUF4N.6ulYC90XyOU/CpEiehwNQj5PRbncp2Iaa34XfGVL.', 'ADMIN'),
  ('Cliente Teste', 'cliente@teste.com', '(11) 98888-0002', '$2b$10$9bll1dGpVxmh/JXbynCNx.5FjtVCnNt7CevLpEe2s4dQ2mIlwHMBu', 'CLIENTE');

-- Barbeiros ativos
INSERT INTO BARBEIRO (id_barbeiro, nome, telefone, ativo) VALUES
  (1, 'Carlos Silva', '(11) 97777-1001', TRUE),
  (2, 'Rafael Santos', '(11) 97777-1002', TRUE);

-- Horários de trabalho: Segunda (1) a Sábado (6), 09:00-12:00 e 13:30-19:00
INSERT INTO HORARIO_TRABALHO (id_barbeiro, dia_semana, hora_inicio, hora_fim) VALUES
  -- Carlos Silva (id_barbeiro = 1)
  (1, 1, '09:00:00', '12:00:00'),
  (1, 1, '13:30:00', '19:00:00'),
  (1, 2, '09:00:00', '12:00:00'),
  (1, 2, '13:30:00', '19:00:00'),
  (1, 3, '09:00:00', '12:00:00'),
  (1, 3, '13:30:00', '19:00:00'),
  (1, 4, '09:00:00', '12:00:00'),
  (1, 4, '13:30:00', '19:00:00'),
  (1, 5, '09:00:00', '12:00:00'),
  (1, 5, '13:30:00', '19:00:00'),
  (1, 6, '09:00:00', '12:00:00'),
  (1, 6, '13:30:00', '19:00:00'),
  -- Carlos Silva (id_barbeiro = 1) - Domingo
  (1, 0, '09:00:00', '12:00:00'),
  (1, 0, '13:30:00', '19:00:00'),
  -- Rafael Santos (id_barbeiro = 2)
  (2, 1, '09:00:00', '12:00:00'),
  (2, 1, '13:30:00', '19:00:00'),
  (2, 2, '09:00:00', '12:00:00'),
  (2, 2, '13:30:00', '19:00:00'),
  (2, 3, '09:00:00', '12:00:00'),
  (2, 3, '13:30:00', '19:00:00'),
  (2, 4, '09:00:00', '12:00:00'),
  (2, 4, '13:30:00', '19:00:00'),
  (2, 5, '09:00:00', '12:00:00'),
  (2, 5, '13:30:00', '19:00:00'),
  (2, 6, '09:00:00', '12:00:00'),
  (2, 6, '13:30:00', '19:00:00'),
  -- Rafael Santos (id_barbeiro = 2) - Domingo
  (2, 0, '09:00:00', '12:00:00'),
  (2, 0, '13:30:00', '19:00:00');

-- Serviços ativos
INSERT INTO SERVICO (nome, descricao, preco, duracao_min, ativo) VALUES
  ('Corte Masculino', 'Corte tradicional ou moderno com acabamento na navalha e lavagem.', 45.00, 30, TRUE),
  ('Barba', 'Alinhamento, modelagem e hidratação com toalha quente e navalha.', 35.00, 30, TRUE),
  ('Sobrancelha', 'Design e limpeza dos fios com pinça e navalha de precisão.', 20.00, 15, TRUE),
  ('Combo Corte + Barba', 'Pacote completo com corte masculino personalizado e barba com toalha quente.', 70.00, 60, TRUE);
