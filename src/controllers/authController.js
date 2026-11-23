const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { PERFIS_VALIDOS } = require('../middlewares/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

function gerarToken(usuario) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Variável de ambiente JWT_SECRET não configurada.');
  }

  return jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

/**
 * UC01 - Cadastro de novo cliente (RN01, RN09)
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const telefone =
      typeof req.body.telefone === 'string' && req.body.telefone.trim() !== ''
        ? req.body.telefone.trim()
        : null;
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

    if (!nome || !email || !senha) {
      return res.status(400).json({
        erro: 'Nome, e-mail e senha são obrigatórios.',
      });
    }

    if (nome.length < 2 || nome.length > 100) {
      return res.status(400).json({
        erro: 'O nome deve ter entre 2 e 100 caracteres.',
      });
    }

    if (!EMAIL_REGEX.test(email) || email.length > 150) {
      return res.status(400).json({
        erro: 'Formato de e-mail inválido.',
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        erro: 'A senha deve possuir no mínimo 6 caracteres.',
      });
    }

    if (telefone && telefone.length > 20) {
      return res.status(400).json({
        erro: 'Telefone deve ter no máximo 20 caracteres.',
      });
    }

    // RN01: Impede cadastro duplicado pelo mesmo e-mail
    const [existentes] = await db.query(
      'SELECT id_usuario FROM USUARIO WHERE email = ? LIMIT 1',
      [email]
    );

    if (existentes.length > 0) {
      return res.status(409).json({
        erro: 'Já existe uma conta cadastrada com este e-mail.',
      });
    }

    // RN09: Hash seguro da senha com bcrypt e perfil fixo CLIENTE
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    const [resultado] = await db.query(
      `INSERT INTO USUARIO (nome, email, telefone, senha_hash, perfil)
       VALUES (?, ?, ?, ?, ?)`,
      [nome, email, telefone, senhaHash, PERFIS_VALIDOS.CLIENTE]
    );

    const usuario = {
      id_usuario: resultado.insertId,
      nome,
      email,
      telefone,
      perfil: PERFIS_VALIDOS.CLIENTE,
    };

    const token = gerarToken(usuario);

    return res.status(201).json({
      mensagem: 'Cadastro realizado com sucesso.',
      token,
      usuario,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        erro: 'Já existe uma conta cadastrada com este e-mail.',
      });
    }
    console.error('Erro no cadastro de usuário:', err);
    return res.status(500).json({
      erro: 'Erro interno ao realizar cadastro.',
    });
  }
}

/**
 * UC02 - Autenticação de usuário (CLIENTE ou ADMIN)
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

    if (!email || !senha) {
      return res.status(400).json({
        erro: 'Informe e-mail e senha.',
      });
    }

    const [linhas] = await db.query(
      `SELECT id_usuario, nome, email, telefone, senha_hash, perfil, criado_em
       FROM USUARIO
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (linhas.length === 0) {
      return res.status(401).json({
        erro: 'Credenciais inválidas.',
      });
    }

    const registro = linhas[0];
    const senhaValida = await bcrypt.compare(senha, registro.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({
        erro: 'Credenciais inválidas.',
      });
    }

    const usuario = {
      id_usuario: registro.id_usuario,
      nome: registro.nome,
      email: registro.email,
      telefone: registro.telefone,
      perfil: registro.perfil,
      criado_em: registro.criado_em,
    };

    const token = gerarToken(usuario);

    return res.status(200).json({
      token,
      usuario,
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({
      erro: 'Erro interno ao realizar login.',
    });
  }
}

/**
 * Retorna dados atualizados do usuário autenticado
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    const [linhas] = await db.query(
      `SELECT id_usuario, nome, email, telefone, perfil, criado_em
       FROM USUARIO
       WHERE id_usuario = ?
       LIMIT 1`,
      [req.usuario.id_usuario]
    );

    if (linhas.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.',
      });
    }

    return res.status(200).json({
      usuario: linhas[0],
    });
  } catch (err) {
    console.error('Erro ao buscar perfil autenticado:', err);
    return res.status(500).json({
      erro: 'Erro interno ao carregar dados do usuário.',
    });
  }
}

module.exports = {
  register,
  login,
  me,
};
