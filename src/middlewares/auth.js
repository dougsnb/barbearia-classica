const jwt = require('jsonwebtoken');

const PERFIS_VALIDOS = Object.freeze({
  CLIENTE: 'CLIENTE',
  ADMIN: 'ADMIN',
});

/**
 * Middleware de autenticação via token JWT no cabeçalho Authorization: Bearer <token>.
 * Popula req.usuario com os dados decodificados do usuário autenticado.
 */
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      erro: 'Token de autenticação não fornecido.',
    });
  }

  const partes = authHeader.split(' ');
  if (partes.length !== 2 || !/^Bearer$/i.test(partes[0]) || !partes[1]) {
    return res.status(401).json({
      erro: 'Formato de token inválido. Utilize: Bearer <token>.',
    });
  }

  const token = partes[1].trim();
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('Erro crítico: variável de ambiente JWT_SECRET não definida.');
    return res.status(500).json({
      erro: 'Erro interno na configuração de segurança do servidor.',
    });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);

    if (!payload || !payload.id_usuario || !payload.perfil) {
      return res.status(401).json({
        erro: 'Token inválido: carga de dados incompleta.',
      });
    }

    req.usuario = {
      id_usuario: payload.id_usuario,
      nome: payload.nome || null,
      email: payload.email || null,
      perfil: payload.perfil,
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        erro: 'Sessão expirada. Faça login novamente.',
      });
    }

    return res.status(401).json({
      erro: 'Token inválido ou adulterado.',
    });
  }
}

/**
 * Fábrica de middleware de autorização baseada em perfil (RBAC).
 * Deve ser utilizada após o middleware `autenticar`.
 * @param {...('CLIENTE'|'ADMIN')} perfisPermitidos
 */
function autorizarPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        erro: 'Usuário não autenticado.',
      });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        erro: 'Acesso negado. Seu perfil não possui permissão para este recurso.',
      });
    }

    return next();
  };
}

/**
 * Middleware opcional de autenticação JWT.
 * Se houver token válido, popula req.usuario; caso contrário segue com req.usuario = null.
 */
function autenticarOpcional(req, _res, next) {
  const authHeader = req.headers.authorization;
  req.usuario = null;

  if (!authHeader || !process.env.JWT_SECRET) {
    return next();
  }

  const partes = authHeader.split(' ');
  if (partes.length !== 2 || !/^Bearer$/i.test(partes[0]) || !partes[1]) {
    return next();
  }

  try {
    const payload = jwt.verify(partes[1].trim(), process.env.JWT_SECRET);
    if (payload && payload.id_usuario && payload.perfil) {
      req.usuario = {
        id_usuario: payload.id_usuario,
        nome: payload.nome || null,
        email: payload.email || null,
        perfil: payload.perfil,
      };
    }
  } catch (_err) {
    req.usuario = null;
  }

  return next();
}

const somenteAdmin = autorizarPerfis(PERFIS_VALIDOS.ADMIN);
const somenteCliente = autorizarPerfis(PERFIS_VALIDOS.CLIENTE);
const clienteOuAdmin = autorizarPerfis(PERFIS_VALIDOS.CLIENTE, PERFIS_VALIDOS.ADMIN);

module.exports = {
  PERFIS_VALIDOS,
  autenticar,
  autenticarOpcional,
  autorizarPerfis,
  somenteAdmin,
  somenteCliente,
  clienteOuAdmin,
};
