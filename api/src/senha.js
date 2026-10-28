// Hash de senhas com scrypt (nativo do Node) e salt aleatório por usuário.
const crypto = require('crypto');

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const senhaHash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return { senhaHash, salt };
}

module.exports = { hashSenha };
