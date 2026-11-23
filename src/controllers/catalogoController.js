const db = require('../config/db');
const { PERFIS_VALIDOS } = require('../middlewares/auth');

/**
 * UC03, RN08 - Listagem de serviços públicos (ou todos para ADMIN com ?todos=true)
 * GET /api/servicos
 */
async function listarServicos(req, res) {
  try {
    const solicitarTodos = req.query.todos === 'true';
    const ehAdmin = req.usuario && req.usuario.perfil === PERFIS_VALIDOS.ADMIN;

    const sql =
      solicitarTodos && ehAdmin
        ? `SELECT id_servico, nome, descricao, preco, duracao_min, ativo
           FROM SERVICO
           ORDER BY ativo DESC, nome ASC`
        : `SELECT id_servico, nome, descricao, preco, duracao_min, ativo
           FROM SERVICO
           WHERE ativo = TRUE
           ORDER BY preco ASC, nome ASC`;

    const [servicos] = await db.query(sql);

    return res.status(200).json({
      servicos: servicos.map((s) => ({
        ...s,
        preco: Number(s.preco),
        ativo: Boolean(s.ativo),
      })),
    });
  } catch (err) {
    console.error('Erro ao listar serviços:', err);
    return res.status(500).json({
      erro: 'Erro interno ao consultar serviços.',
    });
  }
}

/**
 * UC03, RN08 - Listagem de barbeiros ativos (ou todos para ADMIN com ?todos=true)
 * GET /api/barbeiros
 */
async function listarBarbeiros(req, res) {
  try {
    const solicitarTodos = req.query.todos === 'true';
    const ehAdmin = req.usuario && req.usuario.perfil === PERFIS_VALIDOS.ADMIN;

    const sqlBarbeiros =
      solicitarTodos && ehAdmin
        ? `SELECT id_barbeiro, nome, telefone, ativo
           FROM BARBEIRO
           ORDER BY ativo DESC, nome ASC`
        : `SELECT id_barbeiro, nome, telefone, ativo
           FROM BARBEIRO
           WHERE ativo = TRUE
           ORDER BY nome ASC`;

    const [barbeiros] = await db.query(sqlBarbeiros);

    if (barbeiros.length === 0) {
      return res.status(200).json({ barbeiros: [] });
    }

    const ids = barbeiros.map((b) => b.id_barbeiro);
    const [horarios] = await db.query(
      `SELECT id_horario, id_barbeiro, dia_semana,
              TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hora_fim, '%H:%i') AS hora_fim
       FROM HORARIO_TRABALHO
       WHERE id_barbeiro IN (?)
       ORDER BY dia_semana ASC, hora_inicio ASC`,
      [ids]
    );

    const mapaHorarios = new Map();
    for (const h of horarios) {
      if (!mapaHorarios.has(h.id_barbeiro)) {
        mapaHorarios.set(h.id_barbeiro, []);
      }
      mapaHorarios.get(h.id_barbeiro).push(h);
    }

    return res.status(200).json({
      barbeiros: barbeiros.map((b) => ({
        ...b,
        ativo: Boolean(b.ativo),
        horarios: mapaHorarios.get(b.id_barbeiro) || [],
      })),
    });
  } catch (err) {
    console.error('Erro ao listar barbeiros:', err);
    return res.status(500).json({
      erro: 'Erro interno ao consultar barbeiros.',
    });
  }
}

module.exports = {
  listarServicos,
  listarBarbeiros,
};
