require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./src/config/db');
const { iniciarCronLembretes } = require('./src/services/lembreteService');

const authRoutes = require('./src/routes/authRoutes');
const catalogoRoutes = require('./src/routes/catalogoRoutes');
const agendamentoRoutes = require('./src/routes/agendamentoRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos do Front-end (HTML5, CSS3, Vanilla JS)
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API REST
app.get('/api/health', async (_req, res) => {
  try {
    await Promise.race([
      db.testarConexao(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_CONEXAO_MYSQL')), 2000)
      ),
    ]);
    return res.status(200).json({ status: 'ok', banco: 'conectado' });
  } catch (err) {
    return res.status(200).json({
      status: 'ok',
      banco: 'aguardando_conexao',
      detalhe: err.code || err.message,
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', catalogoRoutes);
app.use('/api/agendamentos', agendamentoRoutes);
app.use('/api/admin', adminRoutes);

// 404 para endpoints de API inexistentes
app.use('/api', (_req, res) => {
  return res.status(404).json({ erro: 'Endpoint não encontrado.' });
});

// Tratamento de JSON malformado e erros inesperados
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisição JSON inválido.' });
  }
  console.error('Erro não tratado no Express:', err);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor da Barbearia em execução na porta ${PORT}`);
  iniciarCronLembretes();

  try {
    await db.testarConexao();
    console.log('Conexão com MySQL verificada com sucesso.');
  } catch (err) {
    console.warn(`Aviso: MySQL ainda indisponível na inicialização (${err.code || err.message}).`);
  }
});
