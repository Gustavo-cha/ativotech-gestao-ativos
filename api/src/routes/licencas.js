// Licenças: quantidade contratada, utilizadas e disponíveis — somente Operador administrador.
const express = require('express');
const db = require('../db');
const L = require('../licencas');
const { rota } = require('../http');

const router = express.Router();

router.get('/', (_req, res) => res.json(L.resumo()));

router.put('/', rota((req, res) => {
  const antes = L.resumo().total;
  const r = L.definirTotal(req.body?.total);
  db.log({ acao: 'atualizou', entidade: 'licenca', entidadeId: null, titulo: 'Licenças contratadas', detalhe: `${antes} → ${r.total}` });
  res.json(r);
}));

module.exports = router;
