// Notificações por e-mail: configuração (sem segredos), fila, reenvio e teste — somente Operador administrador.
const express = require('express');
const db = require('../db');
const email = require('../email');
const N = require('../notificacoes');
const { rota, falha } = require('../http');

const router = express.Router();
const semConteudo = ({ html, texto, ...n }) => n;

router.get('/status', (_req, res) => res.json({ ...email.status(), contagem: N.resumo() }));

router.get('/', (req, res) => {
  const { status, limite = 200 } = req.query;
  let l = db.list('notificacoes');
  if (status) l = l.filter((n) => n.status === status);
  res.json(l.slice(0, Math.min(1000, Number(limite) || 200)).map(semConteudo));
});

router.post('/reenviar', rota((req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids
    : db.list('notificacoes').filter((n) => ['falhou', 'nao_configurado'].includes(n.status)).map((n) => n.id);
  if (!email.status().configurado) falha(409, 'Configure o serviço de e-mail antes de reenviar.');
  const n = N.reenviar(ids);
  db.log({ acao: 'atualizou', entidade: 'notificacao', entidadeId: null, titulo: 'Fila de e-mails', detalhe: `${n} notificação(ões) reenviada(s)` });
  res.json({ reenviadas: n });
}));

router.post('/teste', rota(async (req, res) => {
  try {
    const r = await N.testar(req.usuario);
    db.log({ acao: 'atualizou', entidade: 'notificacao', entidadeId: null, titulo: 'E-mail de teste', detalhe: `Enviado para ${req.usuario.email}` });
    res.json({ ok: true, para: req.usuario.email, id: r.id });
  } catch (e) {
    falha(e.naoConfigurado ? 409 : 502, e.message);
  }
}));

module.exports = router;
