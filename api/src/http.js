// Erros HTTP com status e um "wrapper" que os converte em respostas JSON padronizadas.
class HttpError extends Error {
  constructor(status, erro, campos) {
    super(erro);
    this.status = status;
    this.campos = campos;
  }
}

const falha = (status, erro, campos) => { throw new HttpError(status, erro, campos); };
const invalido = (campos) => falha(422, 'Verifique os campos destacados.', campos);

// Envolve um handler: erros HttpError viram { erro, campos } com o status correto
const rota = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch((e) => tratar(e, res, next));
  } catch (e) {
    tratar(e, res, next);
  }
};

function tratar(e, res, next) {
  if (e instanceof HttpError) return res.status(e.status).json({ erro: e.message, ...(e.campos ? { campos: e.campos } : {}) });
  return next(e);
}

module.exports = { HttpError, falha, invalido, rota };
