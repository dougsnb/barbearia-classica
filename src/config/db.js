require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * Monta a configuração de SSL apenas quando DB_SSL=true,
 * permitindo execução local sem SSL e deploy em nuvem (Railway, Aiven, etc.).
 * @returns {import('mysql2').SslOptions | undefined}
 */
function construirConfigSsl() {
  if (String(process.env.DB_SSL).toLowerCase() !== 'true') {
    return undefined;
  }

  const sslConfig = {
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== 'false',
  };

  if (
    process.env.DB_SSL_CA &&
    process.env.DB_SSL_CA.trim() !== '' &&
    process.env.DB_SSL_CA.trim().toLowerCase() !== 'none'
  ) {
    sslConfig.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }

  return sslConfig;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'barbearia_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 5000,
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '-03:00',
  ssl: construirConfigSsl(),
});

/**
 * Valida a conectividade inicial com o servidor MySQL.
 * @returns {Promise<void>}
 */
async function testarConexao() {
  const conexao = await pool.getConnection();
  try {
    await conexao.ping();
  } finally {
    conexao.release();
  }
}

pool.testarConexao = testarConexao;

module.exports = pool;
