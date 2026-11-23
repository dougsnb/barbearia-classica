const express = require('express');
const adminController = require('../controllers/adminController');
const { autenticar, somenteAdmin } = require('../middlewares/auth');

const router = express.Router();

router.use(autenticar, somenteAdmin);

router.get('/resumo', adminController.obterResumoPainel);

router.get('/agendamentos', adminController.listarAgendaGeral);
router.patch('/agendamentos/:id/concluir', adminController.concluirAgendamento);
router.patch('/agendamentos/:id/status', adminController.atualizarStatusAgendamento);

router.post('/lembretes/executar', adminController.executarLembretesAgora);

router.post('/servicos', adminController.criarServico);
router.put('/servicos/:id', adminController.atualizarServico);
router.delete('/servicos/:id', adminController.excluirServico);

router.post('/barbeiros', adminController.criarBarbeiro);
router.put('/barbeiros/:id', adminController.atualizarBarbeiro);
router.delete('/barbeiros/:id', adminController.excluirBarbeiro);

router.get('/barbeiros/:id/horarios', adminController.listarHorariosBarbeiro);
router.post('/barbeiros/:id/horarios', adminController.adicionarHorarioBarbeiro);
router.delete('/horarios/:id_horario', adminController.excluirHorario);

module.exports = router;
