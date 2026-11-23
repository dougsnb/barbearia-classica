const express = require('express');
const agendamentoController = require('../controllers/agendamentoController');
const { autenticar, clienteOuAdmin } = require('../middlewares/auth');

const router = express.Router();

router.get('/disponibilidade', agendamentoController.consultarDisponibilidade);
router.post('/', autenticar, clienteOuAdmin, agendamentoController.criarAgendamento);
router.get('/meus', autenticar, clienteOuAdmin, agendamentoController.listarMeusAgendamentos);
router.put('/:id/cancelar', autenticar, clienteOuAdmin, agendamentoController.cancelarAgendamento);
router.patch('/:id/cancelar', autenticar, clienteOuAdmin, agendamentoController.cancelarAgendamento);
router.put('/:id/remarcar', autenticar, clienteOuAdmin, agendamentoController.remarcarAgendamento);

module.exports = router;
