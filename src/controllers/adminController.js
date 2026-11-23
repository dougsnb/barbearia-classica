const db = require('../config/db');
const lembreteService = require('../services/lembreteService');
const { validarDataYYYYMMDD, timeParaMinutos } = require('../utils/dateTime');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function normalizarTimeSql(valor) {
  if (typeof valor !== 'string') return null;
  const match = valor.trim().match(TIME_REGEX);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
}

/**
 * UC09 - Resumo operacional do painel administrativo
 * GET /api/admin/resumo
 */
async function obterResumoPainel(_req, res) {
  try {
    const [[totaisAg]] = await db.query(`
      SELECT
        SUM(CASE WHEN status = 'AGENDADO' AND DATE(data_hora_inicio) = CURDATE() THEN 1 ELSE 0 END) AS agendados_hoje,
        SUM(CASE WHEN status = 'AGENDADO' AND data_hora_inicio >= NOW() THEN 1 ELSE 0 END) AS agendados_futuros,
        SUM(CASE WHEN status = 'CONCLUIDO' AND DATE(data_hora_inicio) = CURDATE() THEN 1 ELSE 0 END) AS concluidos_hoje,
        SUM(CASE WHEN status = 'CANCELADO' AND DATE(data_hora_inicio) = CURDATE() THEN 1 ELSE 0 END) AS cancelados_hoje
      FROM AGENDAMENTO
    `);

    const [[totaisCad]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM BARBEIRO WHERE ativo = TRUE) AS barbeiros_ativos,
        (SELECT COUNT(*) FROM SERVICO WHERE ativo = TRUE) AS servicos_ativos,
        (SELECT COUNT(*) FROM USUARIO WHERE perfil = 'CLIENTE') AS total_clientes,
        (SELECT COUNT(*) FROM LEMBRETE WHERE status = 'ENVIADO') AS lembretes_enviados
    `);

    return res.status(200).json({
      resumo: {
        agendados_hoje: Number(totaisAg.agendados_hoje || 0),
        agendados_futuros: Number(totaisAg.agendados_futuros || 0),
        concluidos_hoje: Number(totaisAg.concluidos_hoje || 0),
        cancelados_hoje: Number(totaisAg.cancelados_hoje || 0),
        barbeiros_ativos: Number(totaisCad.barbeiros_ativos || 0),
        servicos_ativos: Number(totaisCad.servicos_ativos || 0),
        total_clientes: Number(totaisCad.total_clientes || 0),
        lembretes_enviados: Number(totaisCad.lembretes_enviados || 0),
      },
    });
  } catch (err) {
    console.error('Erro ao carregar resumo administrativo:', err);
    return res.status(500).json({
      erro: 'Erro interno ao gerar resumo do painel.',
    });
  }
}

/**
 * UC09 - Listagem geral da agenda com filtros
 * GET /api/admin/agendamentos?data=YYYY-MM-DD&id_barbeiro=1&status=AGENDADO
 */
async function listarAgendaGeral(req, res) {
  try {
    const condicoes = [];
    const params = [];

    if (req.query.data && validarDataYYYYMMDD(String(req.query.data).trim())) {
      condicoes.push('DATE(a.data_hora_inicio) = ?');
      params.push(String(req.query.data).trim());
    } else {
      if (req.query.data_inicio && validarDataYYYYMMDD(String(req.query.data_inicio).trim())) {
        condicoes.push('DATE(a.data_hora_inicio) >= ?');
        params.push(String(req.query.data_inicio).trim());
      }
      if (req.query.data_fim && validarDataYYYYMMDD(String(req.query.data_fim).trim())) {
        condicoes.push('DATE(a.data_hora_inicio) <= ?');
        params.push(String(req.query.data_fim).trim());
      }
    }

    if (req.query.id_barbeiro) {
      const idBarbeiro = Number(req.query.id_barbeiro);
      if (Number.isInteger(idBarbeiro) && idBarbeiro > 0) {
        condicoes.push('a.id_barbeiro = ?');
        params.push(idBarbeiro);
      }
    }

    if (req.query.status) {
      const status = String(req.query.status).trim().toUpperCase();
      if (['AGENDADO', 'CANCELADO', 'CONCLUIDO'].includes(status)) {
        condicoes.push('a.status = ?');
        params.push(status);
      }
    }

    const whereSql = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

    const [agendamentos] = await db.query(
      `SELECT a.id_agendamento,
              a.id_cliente,
              u.nome AS nome_cliente,
              u.email AS email_cliente,
              u.telefone AS telefone_cliente,
              a.id_barbeiro,
              b.nome AS nome_barbeiro,
              a.id_servico,
              s.nome AS nome_servico,
              s.preco,
              s.duracao_min,
              DATE_FORMAT(a.data_hora_inicio, '%Y-%m-%d %H:%i:%s') AS data_hora_inicio,
              DATE_FORMAT(a.data_hora_fim, '%Y-%m-%d %H:%i:%s') AS data_hora_fim,
              a.status,
              a.criado_em,
              a.cancelado_em
       FROM AGENDAMENTO a
       INNER JOIN USUARIO u ON u.id_usuario = a.id_cliente
       INNER JOIN BARBEIRO b ON b.id_barbeiro = a.id_barbeiro
       INNER JOIN SERVICO s ON s.id_servico = a.id_servico
       ${whereSql}
       ORDER BY a.data_hora_inicio ASC`,
      params
    );

    const lista = agendamentos.map((ag) => ({
      ...ag,
      preco: Number(ag.preco),
    }));

    const totais = {
      total: lista.length,
      agendados: lista.filter((a) => a.status === 'AGENDADO').length,
      concluidos: lista.filter((a) => a.status === 'CONCLUIDO').length,
      cancelados: lista.filter((a) => a.status === 'CANCELADO').length,
    };

    return res.status(200).json({
      totais,
      agendamentos: lista,
    });
  } catch (err) {
    console.error('Erro ao listar agenda geral:', err);
    return res.status(500).json({
      erro: 'Erro interno ao consultar agendamentos.',
    });
  }
}

/**
 * UC10 - Atualização de status de agendamento pelo ADMIN
 * PATCH /api/admin/agendamentos/:id/status
 */
async function atualizarStatusAgendamento(req, res) {
  try {
    const idAgendamento = Number(req.params.id);
    const novoStatus = typeof req.body.status === 'string' ? req.body.status.trim().toUpperCase() : '';

    if (!Number.isInteger(idAgendamento) || idAgendamento <= 0) {
      return res.status(400).json({ erro: 'Identificador de agendamento inválido.' });
    }

    if (!['AGENDADO', 'CANCELADO', 'CONCLUIDO'].includes(novoStatus)) {
      return res.status(400).json({
        erro: 'Status inválido. Valores permitidos: AGENDADO, CANCELADO, CONCLUIDO.',
      });
    }

    const [linhas] = await db.query(
      'SELECT id_agendamento, status FROM AGENDAMENTO WHERE id_agendamento = ? LIMIT 1',
      [idAgendamento]
    );

    if (linhas.length === 0) {
      return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }

    if (novoStatus === 'CANCELADO') {
      await db.query(
        `UPDATE AGENDAMENTO SET status = 'CANCELADO', cancelado_em = NOW() WHERE id_agendamento = ?`,
        [idAgendamento]
      );
    } else {
      await db.query(
        `UPDATE AGENDAMENTO SET status = ?, cancelado_em = NULL WHERE id_agendamento = ?`,
        [novoStatus, idAgendamento]
      );
    }

    return res.status(200).json({
      mensagem: `Status atualizado para ${novoStatus}.`,
      id_agendamento: idAgendamento,
      status: novoStatus,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Já existe outro agendamento ativo para este barbeiro neste mesmo horário.',
      });
    }
    console.error('Erro ao atualizar status do agendamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar agendamento.' });
  }
}

/**
 * UC13 - Concluir atendimento diretamente
 * PATCH /api/admin/agendamentos/:id/concluir
 */
async function concluirAgendamento(req, res) {
  try {
    const idAgendamento = Number(req.params.id);
    if (!Number.isInteger(idAgendamento) || idAgendamento <= 0) {
      return res.status(400).json({ erro: 'Identificador de agendamento inválido.' });
    }

    const [linhas] = await db.query(
      'SELECT id_agendamento, status FROM AGENDAMENTO WHERE id_agendamento = ? LIMIT 1',
      [idAgendamento]
    );

    if (linhas.length === 0) {
      return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }

    if (linhas[0].status !== 'AGENDADO') {
      return res.status(400).json({
        erro: `Apenas agendamentos com status AGENDADO podem ser concluídos (atual: ${linhas[0].status}).`,
      });
    }

    await db.query(
      `UPDATE AGENDAMENTO SET status = 'CONCLUIDO', cancelado_em = NULL WHERE id_agendamento = ?`,
      [idAgendamento]
    );

    return res.status(200).json({
      mensagem: 'Atendimento concluído com sucesso.',
      id_agendamento: idAgendamento,
      status: 'CONCLUIDO',
    });
  } catch (err) {
    console.error('Erro ao concluir agendamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao concluir atendimento.' });
  }
}

/**
 * UC09 - Disparo manual imediato da rotina de lembretes por e-mail
 * POST /api/admin/lembretes/executar
 */
async function executarLembretesAgora(_req, res) {
  try {
    const resultado = await lembreteService.processarLembretes();

    if (resultado.ignorado) {
      return res.status(200).json({
        mensagem:
          'Rotina executada, porém as credenciais SMTP não estão configuradas no ambiente.',
        resultado,
      });
    }

    if (resultado.erro) {
      return res.status(500).json({
        erro: `Falha ao consultar agendamentos para lembretes: ${resultado.erro}`,
      });
    }

    return res.status(200).json({
      mensagem: `Verificação concluída: ${resultado.processados} pendente(s), ${resultado.enviados} enviado(s), ${resultado.falhas} falha(s).`,
      resultado,
    });
  } catch (err) {
    console.error('Erro ao executar lembretes manualmente:', err);
    return res.status(500).json({ erro: 'Erro interno ao executar lembretes.' });
  }
}

// ==============================================================================
// UC11, RN08 - CRUD DE SERVIÇOS
// ==============================================================================

async function criarServico(req, res) {
  try {
    const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
    const descricao =
      typeof req.body.descricao === 'string' && req.body.descricao.trim() !== ''
        ? req.body.descricao.trim()
        : null;
    const preco = Number(req.body.preco);
    const duracaoMin = Number(req.body.duracao_min);
    const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : true;

    if (!nome || nome.length > 80) {
      return res.status(400).json({ erro: 'Nome do serviço é obrigatório (máx. 80 caracteres).' });
    }
    if (!Number.isFinite(preco) || preco <= 0) {
      return res.status(400).json({ erro: 'Preço deve ser maior que zero.' });
    }
    if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) {
      return res.status(400).json({ erro: 'Duração em minutos deve ser um inteiro positivo.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO SERVICO (nome, descricao, preco, duracao_min, ativo)
       VALUES (?, ?, ?, ?, ?)`,
      [nome, descricao, preco.toFixed(2), duracaoMin, ativo]
    );

    return res.status(201).json({
      mensagem: 'Serviço cadastrado com sucesso.',
      servico: {
        id_servico: resultado.insertId,
        nome,
        descricao,
        preco: Number(preco.toFixed(2)),
        duracao_min: duracaoMin,
        ativo,
      },
    });
  } catch (err) {
    console.error('Erro ao criar serviço:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar serviço.' });
  }
}

async function atualizarServico(req, res) {
  try {
    const idServico = Number(req.params.id);
    if (!Number.isInteger(idServico) || idServico <= 0) {
      return res.status(400).json({ erro: 'ID de serviço inválido.' });
    }

    const [existentes] = await db.query(
      'SELECT id_servico, nome, descricao, preco, duracao_min, ativo FROM SERVICO WHERE id_servico = ? LIMIT 1',
      [idServico]
    );

    if (existentes.length === 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado.' });
    }

    const atual = existentes[0];
    const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
    const descricao =
      req.body.descricao !== undefined
        ? String(req.body.descricao).trim() || null
        : atual.descricao;
    const preco = req.body.preco !== undefined ? Number(req.body.preco) : Number(atual.preco);
    const duracaoMin =
      req.body.duracao_min !== undefined ? Number(req.body.duracao_min) : Number(atual.duracao_min);
    const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : Boolean(atual.ativo);

    if (!nome || nome.length > 80) {
      return res.status(400).json({ erro: 'Nome do serviço inválido (1 a 80 caracteres).' });
    }
    if (!Number.isFinite(preco) || preco <= 0) {
      return res.status(400).json({ erro: 'Preço deve ser maior que zero.' });
    }
    if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) {
      return res.status(400).json({ erro: 'Duração deve ser um número inteiro positivo.' });
    }

    await db.query(
      `UPDATE SERVICO
       SET nome = ?, descricao = ?, preco = ?, duracao_min = ?, ativo = ?
       WHERE id_servico = ?`,
      [nome, descricao, preco.toFixed(2), duracaoMin, ativo, idServico]
    );

    return res.status(200).json({
      mensagem: 'Serviço atualizado com sucesso.',
      servico: {
        id_servico: idServico,
        nome,
        descricao,
        preco: Number(preco.toFixed(2)),
        duracao_min: duracaoMin,
        ativo,
      },
    });
  } catch (err) {
    console.error('Erro ao atualizar serviço:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar serviço.' });
  }
}

async function excluirServico(req, res) {
  try {
    const idServico = Number(req.params.id);
    if (!Number.isInteger(idServico) || idServico <= 0) {
      return res.status(400).json({ erro: 'ID de serviço inválido.' });
    }

    const [[vinculos]] = await db.query(
      'SELECT COUNT(*) AS total FROM AGENDAMENTO WHERE id_servico = ?',
      [idServico]
    );

    if (vinculos.total > 0) {
      await db.query('UPDATE SERVICO SET ativo = FALSE WHERE id_servico = ?', [idServico]);
      return res.status(200).json({
        mensagem: 'Serviço possui histórico de agendamentos e foi desativado.',
        inativado: true,
      });
    }

    const [resultado] = await db.query('DELETE FROM SERVICO WHERE id_servico = ?', [idServico]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado.' });
    }

    return res.status(200).json({
      mensagem: 'Serviço removido com sucesso.',
      inativado: false,
    });
  } catch (err) {
    console.error('Erro ao excluir serviço:', err);
    return res.status(500).json({ erro: 'Erro interno ao remover serviço.' });
  }
}

// ==============================================================================
// UC12, UC13, RN08 - CRUD DE BARBEIROS E HORÁRIOS DE TRABALHO
// ==============================================================================

async function criarBarbeiro(req, res) {
  try {
    const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
    const telefone =
      typeof req.body.telefone === 'string' && req.body.telefone.trim() !== ''
        ? req.body.telefone.trim()
        : null;
    const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : true;

    if (!nome || nome.length > 100) {
      return res.status(400).json({ erro: 'Nome do barbeiro é obrigatório (máx. 100 caracteres).' });
    }

    const [resultado] = await db.query(
      'INSERT INTO BARBEIRO (nome, telefone, ativo) VALUES (?, ?, ?)',
      [nome, telefone, ativo]
    );

    return res.status(201).json({
      mensagem: 'Barbeiro cadastrado com sucesso.',
      barbeiro: {
        id_barbeiro: resultado.insertId,
        nome,
        telefone,
        ativo,
      },
    });
  } catch (err) {
    console.error('Erro ao criar barbeiro:', err);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar barbeiro.' });
  }
}

async function atualizarBarbeiro(req, res) {
  try {
    const idBarbeiro = Number(req.params.id);
    if (!Number.isInteger(idBarbeiro) || idBarbeiro <= 0) {
      return res.status(400).json({ erro: 'ID de barbeiro inválido.' });
    }

    const [existentes] = await db.query(
      'SELECT id_barbeiro, nome, telefone, ativo FROM BARBEIRO WHERE id_barbeiro = ? LIMIT 1',
      [idBarbeiro]
    );

    if (existentes.length === 0) {
      return res.status(404).json({ erro: 'Barbeiro não encontrado.' });
    }

    const atual = existentes[0];
    const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
    const telefone =
      req.body.telefone !== undefined
        ? String(req.body.telefone).trim() || null
        : atual.telefone;
    const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : Boolean(atual.ativo);

    if (!nome || nome.length > 100) {
      return res.status(400).json({ erro: 'Nome do barbeiro inválido.' });
    }

    // RN08: Impede inativação se houver agendamentos futuros ativos vinculados
    if (Boolean(atual.ativo) && !ativo) {
      const [[futuros]] = await db.query(
        `SELECT COUNT(*) AS total
         FROM AGENDAMENTO
         WHERE id_barbeiro = ? AND status = 'AGENDADO' AND data_hora_inicio >= NOW()`,
        [idBarbeiro]
      );
      if (futuros.total > 0) {
        return res.status(409).json({
          erro: `Não é possível inativar o barbeiro "${atual.nome}": há ${futuros.total} agendamento(s) futuro(s) ativo(s) na agenda dele.`,
        });
      }
    }

    await db.query(
      'UPDATE BARBEIRO SET nome = ?, telefone = ?, ativo = ? WHERE id_barbeiro = ?',
      [nome, telefone, ativo, idBarbeiro]
    );

    return res.status(200).json({
      mensagem: 'Barbeiro atualizado com sucesso.',
      barbeiro: { id_barbeiro: idBarbeiro, nome, telefone, ativo },
    });
  } catch (err) {
    console.error('Erro ao atualizar barbeiro:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar barbeiro.' });
  }
}

async function excluirBarbeiro(req, res) {
  try {
    const idBarbeiro = Number(req.params.id);
    if (!Number.isInteger(idBarbeiro) || idBarbeiro <= 0) {
      return res.status(400).json({ erro: 'ID de barbeiro inválido.' });
    }

    const [[vinculos]] = await db.query(
      'SELECT COUNT(*) AS total FROM AGENDAMENTO WHERE id_barbeiro = ?',
      [idBarbeiro]
    );

    if (vinculos.total > 0) {
      await db.query('UPDATE BARBEIRO SET ativo = FALSE WHERE id_barbeiro = ?', [idBarbeiro]);
      return res.status(200).json({
        mensagem: 'Barbeiro possui agendamentos vinculados e foi desativado.',
        inativado: true,
      });
    }

    const [resultado] = await db.query('DELETE FROM BARBEIRO WHERE id_barbeiro = ?', [idBarbeiro]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Barbeiro não encontrado.' });
    }

    return res.status(200).json({
      mensagem: 'Barbeiro removido com sucesso.',
      inativado: false,
    });
  } catch (err) {
    console.error('Erro ao excluir barbeiro:', err);
    return res.status(500).json({ erro: 'Erro interno ao remover barbeiro.' });
  }
}

async function listarHorariosBarbeiro(req, res) {
  try {
    const idBarbeiro = Number(req.params.id);
    if (!Number.isInteger(idBarbeiro) || idBarbeiro <= 0) {
      return res.status(400).json({ erro: 'ID de barbeiro inválido.' });
    }

    const [horarios] = await db.query(
      `SELECT id_horario, id_barbeiro, dia_semana,
              TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hora_fim, '%H:%i') AS hora_fim
       FROM HORARIO_TRABALHO
       WHERE id_barbeiro = ?
       ORDER BY dia_semana ASC, hora_inicio ASC`,
      [idBarbeiro]
    );

    return res.status(200).json({ horarios });
  } catch (err) {
    console.error('Erro ao listar horários de trabalho:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar horários.' });
  }
}

async function adicionarHorarioBarbeiro(req, res) {
  try {
    const idBarbeiro = Number(req.params.id);
    const diaSemana = Number(req.body.dia_semana);
    const horaInicio = normalizarTimeSql(req.body.hora_inicio);
    const horaFim = normalizarTimeSql(req.body.hora_fim);

    if (!Number.isInteger(idBarbeiro) || idBarbeiro <= 0) {
      return res.status(400).json({ erro: 'ID de barbeiro inválido.' });
    }
    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
      return res.status(400).json({ erro: 'dia_semana deve estar entre 0 (Domingo) e 6 (Sábado).' });
    }
    if (!horaInicio || !horaFim || timeParaMinutos(horaFim) <= timeParaMinutos(horaInicio)) {
      return res.status(400).json({
        erro: 'Horário inválido. Informe hora_inicio e hora_fim no formato HH:MM com hora_fim maior que hora_inicio.',
      });
    }

    const [barbeiros] = await db.query(
      'SELECT id_barbeiro FROM BARBEIRO WHERE id_barbeiro = ? LIMIT 1',
      [idBarbeiro]
    );
    if (barbeiros.length === 0) {
      return res.status(404).json({ erro: 'Barbeiro não encontrado.' });
    }

    // Verifica sobreposição com jornadas já cadastradas no mesmo dia
    const [sobrepostos] = await db.query(
      `SELECT id_horario FROM HORARIO_TRABALHO
       WHERE id_barbeiro = ? AND dia_semana = ? AND hora_inicio < ? AND hora_fim > ?`,
      [idBarbeiro, diaSemana, horaFim, horaInicio]
    );

    if (sobrepostos.length > 0) {
      return res.status(409).json({
        erro: 'Este turno se sobrepõe a outro horário já cadastrado para o barbeiro neste dia.',
      });
    }

    const [resultado] = await db.query(
      `INSERT INTO HORARIO_TRABALHO (id_barbeiro, dia_semana, hora_inicio, hora_fim)
       VALUES (?, ?, ?, ?)`,
      [idBarbeiro, diaSemana, horaInicio, horaFim]
    );

    return res.status(201).json({
      mensagem: 'Horário de trabalho adicionado com sucesso.',
      horario: {
        id_horario: resultado.insertId,
        id_barbeiro: idBarbeiro,
        dia_semana: diaSemana,
        hora_inicio: horaInicio.slice(0, 5),
        hora_fim: horaFim.slice(0, 5),
      },
    });
  } catch (err) {
    console.error('Erro ao adicionar horário de trabalho:', err);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar horário.' });
  }
}

async function excluirHorario(req, res) {
  try {
    const idHorario = Number(req.params.id_horario);
    if (!Number.isInteger(idHorario) || idHorario <= 0) {
      return res.status(400).json({ erro: 'ID de horário inválido.' });
    }

    const [resultado] = await db.query('DELETE FROM HORARIO_TRABALHO WHERE id_horario = ?', [
      idHorario,
    ]);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Horário de trabalho não encontrado.' });
    }

    return res.status(200).json({ mensagem: 'Horário de trabalho removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir horário:', err);
    return res.status(500).json({ erro: 'Erro interno ao excluir horário.' });
  }
}

module.exports = {
  obterResumoPainel,
  listarAgendaGeral,
  atualizarStatusAgendamento,
  concluirAgendamento,
  executarLembretesAgora,
  criarServico,
  atualizarServico,
  excluirServico,
  criarBarbeiro,
  atualizarBarbeiro,
  excluirBarbeiro,
  listarHorariosBarbeiro,
  adicionarHorarioBarbeiro,
  excluirHorario,
};
