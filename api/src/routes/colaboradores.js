// Cadastro de colaboradores (Operador TI): nome, e-mail corporativo, empresa, cargo e departamento,
// com os equipamentos vinculados a cada um e as solicitações em que aparecem.
const express = require('express');
const db = require('../db');
const D = require('../domain');
const E = require('../estoque');
const C = require('../colaboradores');
const { exigir } = require('../auth');
const { rota, falha, invalido } = require('../http');

const router = express.Router();
const gerenciar = exigir('colaboradores:gerenciar');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function contagem() {
  return db.memo('colaboradores-equip', () => {
    const m = new Map();
    for (const a of db.list('ativos')) if (a.colaboradorId) m.set(a.colaboradorId, (m.get(a.colaboradorId) || 0) + 1);
    return m;
  });
}
const serializar = (c) => ({ ...c, equipamentos: contagem().get(c.id) || 0 });

// GET /api/colaboradores?q=&empresa=&pagina=&limite=  (sem pagina: lista completa)
router.get('/', (req, res) => {
  const { q, empresa, ativos } = req.query;
  let l = db.list('colaboradores');
  if (empresa) l = l.filter((c) => c.empresa === empresa);
  if (ativos === '1') l = l.filter((c) => c.ativo !== false);
  if (q) { const t = norm(q); l = l.filter((c) => norm(`${c.nome} ${c.email} ${c.departamento} ${c.cargo} ${c.matricula}`).includes(t)); }
  l = [...l].sort((a, b) => COLLATOR.compare(a.nome, b.nome));
  if (req.query.pagina === undefined) return res.json(l.slice(0, Math.min(2000, Number(req.query.limite) || 2000)).map(serializar));
  const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 25));
  const paginas = Math.max(1, Math.ceil(l.length / limite));
  const pagina = Math.min(paginas, Math.max(1, Number(req.query.pagina) || 1));
  res.json({ itens: l.slice((pagina - 1) * limite, pagina * limite).map(serializar), total: l.length, pagina, paginas, limite });
});

router.get('/:id', rota((req, res) => {
  const c = db.get('colaboradores', req.params.id);
  if (!c) falha(404, 'Colaborador não encontrado.');
  const equipamentos = C.equipamentosDe(c.id).map((a) => ({ id: a.id, patrimonio: a.patrimonio, nome: a.nome, categoria: a.categoria, status: a.status, proprietario: E.prop(a), numeroSerie: a.numeroSerie }));
  const solicitacoes = db.list('solicitacoes').filter((s) => s.colaboradorId === c.id || (s.emailColaborador && s.emailColaborador === c.email))
    .map((s) => ({ id: s.id, numero: s.numero, status: s.status, dataAdmissao: s.dataAdmissao, proprietario: s.proprietario, criadoEm: s.criadoEm }));
  res.json({ ...serializar(c), equipamentosLista: equipamentos, solicitacoes });
}));

router.post('/', gerenciar, rota((req, res) => {
  const r = db.transacao(() => {
    const x = C.criar(req.body);
    if (x.erros) invalido(x.erros);
    return x.colaborador;
  });
  res.status(201).json(serializar(r));
}));

router.put('/:id', gerenciar, rota((req, res) => {
  const c = db.get('colaboradores', req.params.id);
  if (!c) falha(404, 'Colaborador não encontrado.');
  const { data, errors } = C.validar({ ...c, ...req.body }, c.id);
  if (Object.keys(errors).length) invalido(errors);
  const antes = { ...c };
  db.transacao(() => {
    Object.assign(c, data, { atualizadoEm: new Date().toISOString() });
    // O nome aparece como "responsável" nos equipamentos vinculados
    if (antes.nome !== c.nome) for (const a of C.equipamentosDe(c.id)) a.responsavel = c.nome;
    const mud = ['nome', 'email', 'empresa', 'cargo', 'departamento'].filter((k) => antes[k] !== c[k]).map((k) => `${k}: ${antes[k] || '—'} → ${c[k] || '—'}`);
    db.log({ acao: 'atualizou', entidade: 'colaborador', entidadeId: c.id, titulo: c.nome, detalhe: mud.join(' · ') || 'Sem mudanças nos dados principais', salvarAgora: false });
  });
  res.json(serializar(c));
}));

// Vincula (ou desvincula, com ativoId e vincular=false) um equipamento ao colaborador
router.post('/:id/equipamentos', gerenciar, rota((req, res) => {
  const c = db.get('colaboradores', req.params.id);
  if (!c) falha(404, 'Colaborador não encontrado.');
  const a = db.get('ativos', req.body?.ativoId);
  if (!a) falha(404, 'Equipamento não encontrado.');
  const vincular = req.body?.vincular !== false;
  if (vincular && a.reservadoPara) falha(409, `${a.patrimonio} está reservado para uma solicitação: a entrega faz o vínculo automaticamente.`);
  if (vincular && a.status === 'Descartado') falha(409, `${a.patrimonio} está descartado.`);
  db.transacao(() => {
    if (vincular) {
      const antes = a.status;
      Object.assign(a, { colaboradorId: c.id, responsavel: c.nome, departamento: c.departamento || a.departamento, status: 'Em uso', statusDesde: antes === 'Em uso' ? a.statusDesde : new Date().toISOString(), atualizadoEm: new Date().toISOString() });
      db.log({ acao: 'moveu', entidade: 'ativo', entidadeId: a.id, titulo: `${a.patrimonio} · ${a.nome}`, detalhe: `Alocado a ${c.nome} <${c.email}>${antes !== 'Em uso' ? ` · ${antes} → Em uso` : ''}`, salvarAgora: false });
    } else if (a.colaboradorId === c.id) {
      Object.assign(a, { colaboradorId: null, atualizadoEm: new Date().toISOString() });
      db.log({ acao: 'atualizou', entidade: 'ativo', entidadeId: a.id, titulo: `${a.patrimonio} · ${a.nome}`, detalhe: `Desvinculado de ${c.nome}`, salvarAgora: false });
    }
  });
  res.json({ ok: true });
}));

router.get('/meta/opcoes', (_req, res) => res.json({ empresas: D.PROPRIETARIOS }));

module.exports = router;
