const express = require('express');
const catalogoController = require('../controllers/catalogoController');
const { autenticarOpcional } = require('../middlewares/auth');

const router = express.Router();

router.get('/servicos', autenticarOpcional, catalogoController.listarServicos);
router.get('/barbeiros', autenticarOpcional, catalogoController.listarBarbeiros);

module.exports = router;
