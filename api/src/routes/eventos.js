const express = require('express');
const db = require('../db');
const D = require('../domain');

const router = express.Router();
const invalido = (res, campos) => res.status(422).json({ erro: 'Verifique os campos destacados.', campos });

function enriquecer(e) {
  const ativo = e.ativoId ? db.get('ativos', e.ativoId) : null;
  return {
    ...e,
    ativo: ativo ? { id: ativo.id, patrimonio: ativo.patrimonio, nome: ativo.nome } : null,
    atrasado: !e.concluido && e.data < D.hojeISO()
  };
}

router.get('/meta', (_req, res) => res.json({ tipos: D.TIPOS_EVENTO }));

// GET /api/eventos?de=AAAA-MM-DD&ate=AAAA-MM-DD&ativoId=&pendentes=1
router.get('/', (req, res) => {
  const { de, ate, ativoId, pendentes } = req.query;
  let itens = db.list('eventos');
  if (de) itens = itens.filter((e) => e.data >= de);
  if (ate) itens = itens.filter((e) => e.data <= ate);
  if (ativoId) itens = itens.filter((e) => e.ativoId === ativoId);
  if (pendentes) itens = itens.filter((e) => !e.concluido);
  itens = [...itens].sort((a, b) => (a.data + (a.hora || '99')).localeCompare(b.data + (b.hora || '99')));
  res.json(itens.map(enriquecer));
});

router.get('/:id', (req, res) => {
  const e = db.get('eventos', req.params.id);
  if (!e) return res.status(404).json({ erro: 'Evento não encontrado.' });
  res.json(enriquecer(e));
});

router.post('/', (req, res) => {
  const { data, errors } = D.validarEvento({ tipo: 'Manutenção', ...req.body }, { ativos: db.list('ativos') });
  if (Object.keys(errors).length) return invalido(res, errors);
  const e = db.insert('eventos', data);
  db.log({ acao: 'agendou', entidade: 'evento', entidadeId: e.id, titulo: e.titulo, detalhe: `${e.tipo} · ${e.data.split('-').reverse().join('/')}${e.hora ? ' ' + e.hora : ''}` });
  res.status(201).json(enriquecer(e));
});

// Atualização parcial (ex.: marcar como concluído, arrastar para outra data)
router.put('/:id', (req, res) => {
  const antes = db.get('eventos', req.params.id);
  if (!antes) return res.status(404).json({ erro: 'Evento não encontrado.' });
  const { data, errors } = D.validarEvento({ ...antes, ...req.body }, { ativos: db.list('ativos') });
  if (Object.keys(errors).length) return invalido(res, errors);
  const depois = db.update('eventos', antes.id, data);
  let acao = 'atualizou';
  let detalhe = '';
  if (!antes.concluido && depois.concluido) acao = 'concluiu';
  else if (antes.concluido && !depois.concluido) acao = 'reabriu';
  if (antes.data !== depois.data) detalhe = `Data: ${antes.data.split('-').reverse().join('/')} → ${depois.data.split('-').reverse().join('/')}`;
  db.log({ acao, entidade: 'evento', entidadeId: antes.id, titulo: depois.titulo, detalhe });
  res.json(enriquecer(depois));
});

router.delete('/:id', (req, res) => {
  const e = db.get('eventos', req.params.id);
  if (!e) return res.status(404).json({ erro: 'Evento não encontrado.' });
  db.remove('eventos', e.id);
  db.log({ acao: 'excluiu', entidade: 'evento', entidadeId: e.id, titulo: e.titulo });
  res.status(204).end();
});

module.exports = { router, enriquecer };
