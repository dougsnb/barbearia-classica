const db = require('../config/db');
const {
  agoraNoFuso,
  hojeYYYYMMDD,
  validarDataYYYYMMDD,
  obterDiaSemana,
  timeParaMinutos,
  minutosParaHHMM,
  parseDateTimeMysql,
  calcularIntervaloSql,
  ehPassadoOuAgora,
} = require('../utils/dateTime');

const INTERVALO_SLOT_MIN = 15;
const ANTECEDENCIA_MIN_MINUTOS = Number(process.env.AGENDAMENTO_ANTECEDENCIA_MIN) || 120;

/**
 * Verifica se dois intervalos [aInicio, aFim) e [bInicio, bFim) se sobrepõem.
 */
function haSobreposicao(aInicio, aFim, bInicio, bFim) {
  return aInicio < bFim && aFim > bInicio;
}

/**
 * Gera os horários disponíveis (em minutos) para um barbeiro específico em uma data.
 */
function calcularSlotsBarbeiro(jornadas, ocupados, duracaoMin, dataStr) {
  const slotsLivres = [];

  for (const j of jornadas) {
    const jInicio = timeParaMinutos(j.hora_inicio);
    const jFim = timeParaMinutos(j.hora_fim);

    for (let cursor = jInicio; cursor + duracaoMin <= jFim; cursor += INTERVALO_SLOT_MIN) {
      if (ehPassadoOuAgora(dataStr, cursor)) {
        continue;
      }

      const slotFim = cursor + duracaoMin;
      const conflito = ocupados.some((ag) =>
        haSobreposicao(cursor, slotFim, ag.inicioMin, ag.fimMin)
      );

      if (!conflito) {
        slotsLivres.push(cursor);
      }
    }
  }

  return slotsLivres;
}

/**
 * UC08, RN03, RN05, RN06 - Consulta de disponibilidade de horários
 * GET /api/agendamentos/disponibilidade?data=YYYY-MM-DD&id_servico=X&id_barbeiro=Y
 */
async function consultarDisponibilidade(req, res) {
  try {
    const data = typeof req.query.data === 'string' ? req.query.data.trim() : '';
    const idServico = Number(req.query.id_servico);
    const idBarbeiroParam = req.query.id_barbeiro
      ? String(req.query.id_barbeiro).trim()
      : 'sem_preferencia';

    if (!validarDataYYYYMMDD(data)) {
      return res.status(400).json({
        erro: 'Parâmetro "data" inválido. Utilize o formato YYYY-MM-DD.',
      });
    }

    if (!Number.isInteger(idServico) || idServico <= 0) {
      return res.status(400).json({
        erro: 'Parâmetro "id_servico" deve ser um identificador numérico válido.',
      });
    }

    const semPreferencia = idBarbeiroParam === 'sem_preferencia';
    const idBarbeiro = semPreferencia ? null : Number(idBarbeiroParam);

    if (!semPreferencia && (!Number.isInteger(idBarbeiro) || idBarbeiro <= 0)) {
      return res.status(400).json({
        erro: 'Parâmetro "id_barbeiro" inválido. Informe um ID numérico ou "sem_preferencia".',
      });
    }

    // Busca serviço ativo
    const [servicos] = await db.query(
      `SELECT id_servico, nome, preco, duracao_min, ativo
       FROM SERVICO
       WHERE id_servico = ? AND ativo = TRUE
       LIMIT 1`,
      [idServico]
    );

    if (servicos.length === 0) {
      return res.status(404).json({
        erro: 'Serviço não encontrado ou inativo.',
      });
    }

    const servico = servicos[0];
    const hoje = hojeYYYYMMDD();

    // Se a data solicitada já passou, não há horários disponíveis
    if (data < hoje) {
      return res.status(200).json({
        data,
        dia_semana: obterDiaSemana(data),
        servico: {
          id_servico: servico.id_servico,
          nome: servico.nome,
          duracao_min: servico.duracao_min,
          preco: Number(servico.preco),
        },
        slots: [],
      });
    }

    // Busca barbeiro(s) ativo(s)
    const [barbeiros] = semPreferencia
      ? await db.query(
          `SELECT id_barbeiro, nome FROM BARBEIRO WHERE ativo = TRUE ORDER BY nome ASC`
        )
      : await db.query(
          `SELECT id_barbeiro, nome FROM BARBEIRO WHERE id_barbeiro = ? AND ativo = TRUE LIMIT 1`,
          [idBarbeiro]
        );

    if (barbeiros.length === 0) {
      return res.status(404).json({
        erro: semPreferencia
          ? 'Nenhum barbeiro ativo disponível no momento.'
          : 'Barbeiro não encontrado ou inativo.',
      });
    }

    const diaSemana = obterDiaSemana(data);
    const idsBarbeiros = barbeiros.map((b) => b.id_barbeiro);

    // Busca jornadas de trabalho para o dia da semana
    const [jornadasRows] = await db.query(
      `SELECT id_barbeiro,
              TIME_FORMAT(hora_inicio, '%H:%i:%s') AS hora_inicio,
              TIME_FORMAT(hora_fim, '%H:%i:%s') AS hora_fim
       FROM HORARIO_TRABALHO
       WHERE id_barbeiro IN (?) AND dia_semana = ?
       ORDER BY hora_inicio ASC`,
      [idsBarbeiros, diaSemana]
    );

    // Busca agendamentos ativos (AGENDADO) na data informada
    const [agendamentosRows] = await db.query(
      `SELECT id_barbeiro, data_hora_inicio, data_hora_fim
       FROM AGENDAMENTO
       WHERE id_barbeiro IN (?)
         AND status = 'AGENDADO'
         AND DATE(data_hora_inicio) = ?`,
      [idsBarbeiros, data]
    );

    const mapaJornadas = new Map();
    for (const j of jornadasRows) {
      if (!mapaJornadas.has(j.id_barbeiro)) mapaJornadas.set(j.id_barbeiro, []);
      mapaJornadas.get(j.id_barbeiro).push(j);
    }

    const mapaOcupados = new Map();
    for (const ag of agendamentosRows) {
      const inicio = parseDateTimeMysql(ag.data_hora_inicio);
      const fim = parseDateTimeMysql(ag.data_hora_fim);
      if (!inicio || !fim) continue;
      if (!mapaOcupados.has(ag.id_barbeiro)) mapaOcupados.set(ag.id_barbeiro, []);
      mapaOcupados.get(ag.id_barbeiro).push({
        inicioMin: inicio.horaMin,
        fimMin: fim.horaMin,
      });
    }

    // Agrega os horários disponíveis por minuto inicial
    const mapaSlots = new Map();

    for (const barbeiro of barbeiros) {
      const jornadas = mapaJornadas.get(barbeiro.id_barbeiro) || [];
      if (jornadas.length === 0) continue;

      const ocupados = mapaOcupados.get(barbeiro.id_barbeiro) || [];
      const slotsMin = calcularSlotsBarbeiro(
        jornadas,
        ocupados,
        servico.duracao_min,
        data
      );

      for (const inicioMin of slotsMin) {
        if (!mapaSlots.has(inicioMin)) {
          mapaSlots.set(inicioMin, []);
        }
        mapaSlots.get(inicioMin).push({
          id_barbeiro: barbeiro.id_barbeiro,
          nome: barbeiro.nome,
        });
      }
    }

    const horariosOrdenados = Array.from(mapaSlots.keys()).sort((a, b) => a - b);
    const slots = horariosOrdenados.map((inicioMin) => {
      const horaInicio = minutosParaHHMM(inicioMin);
      const horaFim = minutosParaHHMM(inicioMin + servico.duracao_min);
      return {
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        data_hora_inicio: `${data} ${horaInicio}:00`,
        barbeiros_disponiveis: mapaSlots.get(inicioMin),
      };
    });

    return res.status(200).json({
      data,
      dia_semana: diaSemana,
      servico: {
        id_servico: servico.id_servico,
        nome: servico.nome,
        duracao_min: servico.duracao_min,
        preco: Number(servico.preco),
      },
      slots,
    });
  } catch (err) {
    console.error('Erro ao consultar disponibilidade:', err);
    return res.status(500).json({
      erro: 'Erro interno ao calcular disponibilidade de horários.',
    });
  }
}

/**
 * UC04, UC05, RN03, RN04, RN05, RN06 - Criação de agendamento com transação e bloqueio
 * POST /api/agendamentos
 */
async function criarAgendamento(req, res) {
  let conexao;
  try {
    const idCliente = req.usuario.id_usuario;
    const idServico = Number(req.body.id_servico);
    const idBarbeiroRaw = req.body.id_barbeiro ? String(req.body.id_barbeiro).trim() : 'sem_preferencia';
    const dataHoraInicioInput = req.body.data_hora_inicio;

    if (!Number.isInteger(idServico) || idServico <= 0) {
      return res.status(400).json({
        erro: 'Informe um serviço válido (id_servico).',
      });
    }

    if (!dataHoraInicioInput) {
      return res.status(400).json({
        erro: 'Informe a data e hora de início do agendamento (data_hora_inicio).',
      });
    }

    const semPreferencia = idBarbeiroRaw === 'sem_preferencia';
    const idBarbeiroSolicitado = semPreferencia ? null : Number(idBarbeiroRaw);
    if (!semPreferencia && (!Number.isInteger(idBarbeiroSolicitado) || idBarbeiroSolicitado <= 0)) {
      return res.status(400).json({
        erro: 'Barbeiro inválido. Informe um ID numérico ou "sem_preferencia".',
      });
    }

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    // 1. Verifica serviço ativo
    const [servicos] = await conexao.query(
      `SELECT id_servico, nome, preco, duracao_min
       FROM SERVICO
       WHERE id_servico = ? AND ativo = TRUE
       LIMIT 1`,
      [idServico]
    );

    if (servicos.length === 0) {
      await conexao.rollback();
      return res.status(404).json({
        erro: 'Serviço não encontrado ou inativo.',
      });
    }

    const servico = servicos[0];
    const intervalo = calcularIntervaloSql(dataHoraInicioInput, servico.duracao_min);

    if (!intervalo) {
      await conexao.rollback();
      return res.status(400).json({
        erro: 'Formato de data/hora inválido ou horário ultrapassa o encerramento do dia.',
      });
    }

    // Impede agendamento no passado
    if (ehPassadoOuAgora(intervalo.data, intervalo.inicioMin)) {
      await conexao.rollback();
      return res.status(400).json({
        erro: 'Não é possível agendar em datas ou horários passados.',
      });
    }

    // 2. Identifica barbeiros candidatos
    const [candidatos] = semPreferencia
      ? await conexao.query(
          `SELECT id_barbeiro, nome FROM BARBEIRO WHERE ativo = TRUE ORDER BY id_barbeiro ASC`
        )
      : await conexao.query(
          `SELECT id_barbeiro, nome FROM BARBEIRO WHERE id_barbeiro = ? AND ativo = TRUE LIMIT 1`,
          [idBarbeiroSolicitado]
        );

    if (candidatos.length === 0) {
      await conexao.rollback();
      return res.status(404).json({
        erro: semPreferencia
          ? 'Nenhum barbeiro ativo disponível.'
          : 'Barbeiro não encontrado ou inativo.',
      });
    }

    let barbeiroEscolhido = null;

    for (const barbeiro of candidatos) {
      // Verifica se o intervalo cabe integralmente em alguma jornada de trabalho do dia
      const [jornadas] = await conexao.query(
        `SELECT hora_inicio, hora_fim
         FROM HORARIO_TRABALHO
         WHERE id_barbeiro = ? AND dia_semana = ?`,
        [barbeiro.id_barbeiro, intervalo.diaSemana]
      );

      const dentroDaJornada = jornadas.some((j) => {
        const jIni = timeParaMinutos(j.hora_inicio);
        const jFim = timeParaMinutos(j.hora_fim);
        return intervalo.inicioMin >= jIni && intervalo.fimMin <= jFim;
      });

      if (!dentroDaJornada) {
        continue;
      }

      // Bloqueia registros de agendamento do barbeiro no dia para evitar race conditions
      const [conflitos] = await conexao.query(
        `SELECT id_agendamento
         FROM AGENDAMENTO
         WHERE id_barbeiro = ?
           AND status = 'AGENDADO'
           AND data_hora_inicio < ?
           AND data_hora_fim > ?
         FOR UPDATE`,
        [barbeiro.id_barbeiro, intervalo.fimSql, intervalo.inicioSql]
      );

      if (conflitos.length === 0) {
        barbeiroEscolhido = barbeiro;
        break;
      }
    }

    if (!barbeiroEscolhido) {
      await conexao.rollback();
      return res.status(409).json({
        erro: semPreferencia
          ? 'Nenhum barbeiro possui disponibilidade para este horário.'
          : 'Horário indisponível ou fora da jornada de trabalho do barbeiro selecionado.',
      });
    }

    // 3. Insere agendamento (protegido também por uk_barbeiro_inicio_ativo no MySQL)
    const [insertAg] = await conexao.query(
      `INSERT INTO AGENDAMENTO (id_cliente, id_barbeiro, id_servico, data_hora_inicio, data_hora_fim, status)
       VALUES (?, ?, ?, ?, ?, 'AGENDADO')`,
      [
        idCliente,
        barbeiroEscolhido.id_barbeiro,
        servico.id_servico,
        intervalo.inicioSql,
        intervalo.fimSql,
      ]
    );

    const idAgendamento = insertAg.insertId;

    // 4. Registra lembrete pendente para disparo pelo cron
    await conexao.query(
      `INSERT INTO LEMBRETE (id_agendamento, canal, status) VALUES (?, 'EMAIL', 'PENDENTE')`,
      [idAgendamento]
    );

    await conexao.commit();

    return res.status(201).json({
      mensagem: 'Agendamento realizado com sucesso.',
      agendamento: {
        id_agendamento: idAgendamento,
        id_cliente: idCliente,
        id_barbeiro: barbeiroEscolhido.id_barbeiro,
        nome_barbeiro: barbeiroEscolhido.nome,
        id_servico: servico.id_servico,
        nome_servico: servico.nome,
        preco: Number(servico.preco),
        duracao_min: servico.duracao_min,
        data_hora_inicio: intervalo.inicioSql,
        data_hora_fim: intervalo.fimSql,
        status: 'AGENDADO',
      },
    });
  } catch (err) {
    if (conexao) {
      await conexao.rollback().catch(() => {});
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Este horário acabou de ser reservado por outro cliente. Escolha outro horário.',
      });
    }
    console.error('Erro ao criar agendamento:', err);
    return res.status(500).json({
      erro: 'Erro interno ao realizar agendamento.',
    });
  } finally {
    if (conexao) conexao.release();
  }
}

/**
 * UC06 - Listagem dos agendamentos do cliente autenticado
 * GET /api/agendamentos/meus?status=AGENDADO
 */
async function listarMeusAgendamentos(req, res) {
  try {
    const idCliente = req.usuario.id_usuario;
    const statusFiltro = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const statusValidos = ['AGENDADO', 'CANCELADO', 'CONCLUIDO'];

    let sql = `
      SELECT a.id_agendamento,
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
      INNER JOIN BARBEIRO b ON b.id_barbeiro = a.id_barbeiro
      INNER JOIN SERVICO s ON s.id_servico = a.id_servico
      WHERE a.id_cliente = ?
    `;

    const params = [idCliente];
    if (statusValidos.includes(statusFiltro)) {
      sql += ' AND a.status = ?';
      params.push(statusFiltro);
    }

    sql += ' ORDER BY a.data_hora_inicio DESC';

    const [agendamentos] = await db.query(sql, params);

    return res.status(200).json({
      agendamentos: agendamentos.map((ag) => ({
        ...ag,
        preco: Number(ag.preco),
      })),
    });
  } catch (err) {
    console.error('Erro ao listar agendamentos do cliente:', err);
    return res.status(500).json({
      erro: 'Erro interno ao consultar seus agendamentos.',
    });
  }
}

/**
 * Calcula quantos minutos faltam entre o momento atual da barbearia e uma data YYYY-MM-DD + minutos do dia.
 */
function minutosAteHorario(dataStr, horaMin) {
  const agora = agoraNoFuso();
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const alvoMs = Date.UTC(ano, mes - 1, dia, Math.floor(horaMin / 60), horaMin % 60, 0);
  const agoraMs = Date.UTC(
    agora.getUTCFullYear(),
    agora.getUTCMonth(),
    agora.getUTCDate(),
    agora.getUTCHours(),
    agora.getUTCMinutes(),
    0
  );
  return Math.floor((alvoMs - agoraMs) / 60000);
}

/**
 * UC07, UC06, RN04 - Cancelamento de agendamento pelo cliente proprietário ou ADMIN
 * PUT /api/agendamentos/:id/cancelar | PATCH /api/agendamentos/:id/cancelar
 */
async function cancelarAgendamento(req, res) {
  try {
    const idAgendamento = Number(req.params.id);
    if (!Number.isInteger(idAgendamento) || idAgendamento <= 0) {
      return res.status(400).json({
        erro: 'Identificador de agendamento inválido.',
      });
    }

    const [linhas] = await db.query(
      `SELECT id_agendamento, id_cliente, status,
              DATE_FORMAT(data_hora_inicio, '%Y-%m-%d %H:%i:%s') AS data_hora_inicio
       FROM AGENDAMENTO
       WHERE id_agendamento = ?
       LIMIT 1`,
      [idAgendamento]
    );

    if (linhas.length === 0) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.',
      });
    }

    const agendamento = linhas[0];
    const ehAdmin = req.usuario.perfil === 'ADMIN';

    if (!ehAdmin && agendamento.id_cliente !== req.usuario.id_usuario) {
      return res.status(403).json({
        erro: 'Você não tem permissão para cancelar este agendamento.',
      });
    }

    if (agendamento.status !== 'AGENDADO') {
      return res.status(400).json({
        erro: `Não é possível cancelar um agendamento com status "${agendamento.status}".`,
      });
    }

    // RN04: Antecedência mínima para alteração/cancelamento pelo cliente
    const inicioParsed = parseDateTimeMysql(agendamento.data_hora_inicio);
    if (!ehAdmin && inicioParsed) {
      const minutosRestantes = minutosAteHorario(inicioParsed.data, inicioParsed.horaMin);
      if (minutosRestantes < 0) {
        return res.status(400).json({
          erro: 'Não é possível cancelar um agendamento cujo horário já foi atingido.',
        });
      }
      if (minutosRestantes < ANTECEDENCIA_MIN_MINUTOS) {
        return res.status(400).json({
          erro: `Cancelamento permitido apenas com no mínimo ${ANTECEDENCIA_MIN_MINUTOS} minutos (${Math.round(ANTECEDENCIA_MIN_MINUTOS / 60)}h) de antecedência (RN04).`,
        });
      }
    }

    await db.query(
      `UPDATE AGENDAMENTO
       SET status = 'CANCELADO', cancelado_em = NOW()
       WHERE id_agendamento = ?`,
      [idAgendamento]
    );

    return res.status(200).json({
      mensagem: 'Agendamento cancelado com sucesso.',
      id_agendamento: idAgendamento,
      status: 'CANCELADO',
    });
  } catch (err) {
    console.error('Erro ao cancelar agendamento:', err);
    return res.status(500).json({
      erro: 'Erro interno ao cancelar agendamento.',
    });
  }
}

/**
 * UC05, RN04, RN05, RN06 - Remarcação de agendamento existente
 * PUT /api/agendamentos/:id/remarcar
 */
async function remarcarAgendamento(req, res) {
  let conexao;
  try {
    const idAgendamento = Number(req.params.id);
    const dataHoraInicioInput = req.body.data_hora_inicio;
    const idBarbeiroRaw = req.body.id_barbeiro ? String(req.body.id_barbeiro).trim() : null;

    if (!Number.isInteger(idAgendamento) || idAgendamento <= 0) {
      return res.status(400).json({ erro: 'Identificador de agendamento inválido.' });
    }

    if (!dataHoraInicioInput) {
      return res.status(400).json({ erro: 'Informe a nova data e hora de início.' });
    }

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    const [linhas] = await conexao.query(
      `SELECT a.id_agendamento, a.id_cliente, a.id_barbeiro, a.id_servico, a.status,
              DATE_FORMAT(a.data_hora_inicio, '%Y-%m-%d %H:%i:%s') AS data_hora_inicio,
              s.nome AS nome_servico, s.duracao_min, s.preco, s.ativo AS servico_ativo
       FROM AGENDAMENTO a
       INNER JOIN SERVICO s ON s.id_servico = a.id_servico
       WHERE a.id_agendamento = ?
       LIMIT 1
       FOR UPDATE`,
      [idAgendamento]
    );

    if (linhas.length === 0) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }

    const atual = linhas[0];
    const ehAdmin = req.usuario.perfil === 'ADMIN';

    if (!ehAdmin && atual.id_cliente !== req.usuario.id_usuario) {
      await conexao.rollback();
      return res.status(403).json({ erro: 'Você não tem permissão para remarcar este agendamento.' });
    }

    if (atual.status !== 'AGENDADO') {
      await conexao.rollback();
      return res.status(400).json({
        erro: `Apenas agendamentos com status AGENDADO podem ser remarcados (status atual: ${atual.status}).`,
      });
    }

    if (!atual.servico_ativo) {
      await conexao.rollback();
      return res.status(400).json({ erro: 'O serviço deste agendamento encontra-se inativo.' });
    }

    // RN04: Antecedência mínima para remarcação
    const atualParsed = parseDateTimeMysql(atual.data_hora_inicio);
    if (!ehAdmin && atualParsed) {
      const minutosRestantes = minutosAteHorario(atualParsed.data, atualParsed.horaMin);
      if (minutosRestantes < ANTECEDENCIA_MIN_MINUTOS) {
        await conexao.rollback();
        return res.status(400).json({
          erro: `Remarcação permitida apenas com no mínimo ${ANTECEDENCIA_MIN_MINUTOS} minutos (${Math.round(ANTECEDENCIA_MIN_MINUTOS / 60)}h) de antecedência (RN04).`,
        });
      }
    }

    const intervalo = calcularIntervaloSql(dataHoraInicioInput, atual.duracao_min);
    if (!intervalo) {
      await conexao.rollback();
      return res.status(400).json({ erro: 'Nova data/hora inválida ou fora do limite do dia.' });
    }

    if (ehPassadoOuAgora(intervalo.data, intervalo.inicioMin)) {
      await conexao.rollback();
      return res.status(400).json({ erro: 'Não é possível remarcar para data ou horário passado.' });
    }

    const semPreferencia = idBarbeiroRaw === 'sem_preferencia';
    const idBarbeiroAlvo = semPreferencia
      ? null
      : idBarbeiroRaw
      ? Number(idBarbeiroRaw)
      : atual.id_barbeiro;

    if (!semPreferencia && (!Number.isInteger(idBarbeiroAlvo) || idBarbeiroAlvo <= 0)) {
      await conexao.rollback();
      return res.status(400).json({ erro: 'Barbeiro informado é inválido.' });
    }

    const [candidatos] = semPreferencia
      ? await conexao.query(`SELECT id_barbeiro, nome FROM BARBEIRO WHERE ativo = TRUE ORDER BY id_barbeiro ASC`)
      : await conexao.query(
          `SELECT id_barbeiro, nome FROM BARBEIRO WHERE id_barbeiro = ? AND ativo = TRUE LIMIT 1`,
          [idBarbeiroAlvo]
        );

    if (candidatos.length === 0) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Barbeiro não encontrado ou inativo.' });
    }

    let barbeiroEscolhido = null;

    for (const barbeiro of candidatos) {
      const [jornadas] = await conexao.query(
        `SELECT hora_inicio, hora_fim
         FROM HORARIO_TRABALHO
         WHERE id_barbeiro = ? AND dia_semana = ?`,
        [barbeiro.id_barbeiro, intervalo.diaSemana]
      );

      const dentroDaJornada = jornadas.some((j) => {
        const jIni = timeParaMinutos(j.hora_inicio);
        const jFim = timeParaMinutos(j.hora_fim);
        return intervalo.inicioMin >= jIni && intervalo.fimMin <= jFim;
      });

      if (!dentroDaJornada) continue;

      const [conflitos] = await conexao.query(
        `SELECT id_agendamento
         FROM AGENDAMENTO
         WHERE id_barbeiro = ?
           AND id_agendamento <> ?
           AND status = 'AGENDADO'
           AND data_hora_inicio < ?
           AND data_hora_fim > ?
         FOR UPDATE`,
        [barbeiro.id_barbeiro, idAgendamento, intervalo.fimSql, intervalo.inicioSql]
      );

      if (conflitos.length === 0) {
        barbeiroEscolhido = barbeiro;
        break;
      }
    }

    if (!barbeiroEscolhido) {
      await conexao.rollback();
      return res.status(409).json({
        erro: 'Horário indisponível ou fora da jornada do barbeiro selecionado.',
      });
    }

    await conexao.query(
      `UPDATE AGENDAMENTO
       SET id_barbeiro = ?, data_hora_inicio = ?, data_hora_fim = ?
       WHERE id_agendamento = ?`,
      [barbeiroEscolhido.id_barbeiro, intervalo.inicioSql, intervalo.fimSql, idAgendamento]
    );

    // Reprograma lembrete para o novo horário
    const [lembretes] = await conexao.query(
      `SELECT id_lembrete FROM LEMBRETE WHERE id_agendamento = ? AND canal = 'EMAIL' LIMIT 1`,
      [idAgendamento]
    );
    if (lembretes.length > 0) {
      await conexao.query(
        `UPDATE LEMBRETE SET status = 'PENDENTE', enviado_em = NULL WHERE id_lembrete = ?`,
        [lembretes[0].id_lembrete]
      );
    } else {
      await conexao.query(
        `INSERT INTO LEMBRETE (id_agendamento, canal, status) VALUES (?, 'EMAIL', 'PENDENTE')`,
        [idAgendamento]
      );
    }

    await conexao.commit();

    return res.status(200).json({
      mensagem: 'Agendamento remarcado com sucesso.',
      agendamento: {
        id_agendamento: idAgendamento,
        id_barbeiro: barbeiroEscolhido.id_barbeiro,
        nome_barbeiro: barbeiroEscolhido.nome,
        id_servico: atual.id_servico,
        nome_servico: atual.nome_servico,
        preco: Number(atual.preco),
        duracao_min: atual.duracao_min,
        data_hora_inicio: intervalo.inicioSql,
        data_hora_fim: intervalo.fimSql,
        status: 'AGENDADO',
      },
    });
  } catch (err) {
    if (conexao) {
      await conexao.rollback().catch(() => {});
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Este novo horário acabou de ser ocupado. Escolha outro horário.',
      });
    }
    console.error('Erro ao remarcar agendamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao remarcar agendamento.' });
  } finally {
    if (conexao) conexao.release();
  }
}

module.exports = {
  consultarDisponibilidade,
  criarAgendamento,
  listarMeusAgendamentos,
  cancelarAgendamento,
  remarcarAgendamento,
};
