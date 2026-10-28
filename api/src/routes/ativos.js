const express = require('express');
const db = require('../db');
const D = require('../domain');
const { exigir } = require('../auth');
const E = require('../estoque');
const C = require('../colaboradores');
const { rota, falha, invalido: invalidoErr } = require('../http');

const router = express.Router();
const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rotulo = (a) => `${a.patrimonio} · ${a.nome}`;
const invalido = (res, campos) => res.status(422).json({ erro: 'Verifique os campos destacados.', campos });
const gerenciar = exigir('ativos:gerenciar');
// Comparador único (bem mais rápido que localeCompare a cada comparação)
const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

// Ativo + reserva vinculada (portal de solicitações) + colaborador
function comReserva(a) {
  const e = D.enriquecerAtivo(a);
  const s = a.reservadoPara ? db.get('solicitacoes', a.reservadoPara) : null;
  e.proprietario = E.prop(a);
  e.colaborador = E.colaboradorResumo(a.colaboradorId);
  e.reserva = s ? { id: s.id, numero: s.numero, nomeAdmitido: s.nomeAdmitido, dataAdmissao: s.dataAdmissao, status: s.status } : null;
  e.situacaoEstoque = a.categoria === 'Notebook' ? D.situacaoEstoque(a, s) : null;
  return e;
}

// Linha enxuta para tabelas e quadros (só o que a tela mostra). Recebe o ativo já enriquecido.
function linha(e) {
  return {
    id: e.id, patrimonio: e.patrimonio, nome: e.nome, categoria: e.categoria, marca: e.marca, modelo: e.modelo, numeroSerie: e.numeroSerie,
    status: e.status, responsavel: e.responsavel, departamento: e.departamento, localizacao: e.localizacao, hostname: e.hostname,
    sistemaOperacional: e.sistemaOperacional, garantiaAte: e.garantiaAte, garantiaStatus: e.garantiaStatus, valor: e.valor, valorAtual: e.valorAtual,
    proprietario: e.proprietario, colaborador: e.colaborador, reserva: e.reserva && { id: e.reserva.id, numero: e.reserva.numero, nomeAdmitido: e.reserva.nomeAdmitido },
    tags: e.tags || [], diasNoStatus: e.diasNoStatus
  };
}

// Um equipamento reservado só muda de status pelo fluxo da solicitação (evita divergência de estoque)
function bloqueioReserva(a, novoStatus) {
  if (!a.reservadoPara || novoStatus === a.status) return null;
  const s = db.get('solicitacoes', a.reservadoPara);
  return `${a.patrimonio} está reservado para ${s ? `${s.numero} (${s.nomeAdmitido})` : 'uma solicitação'}. Altere pelo fluxo da solicitação ou libere a reserva antes.`;
}

// Texto de busca de cada ativo, calculado uma vez por revisão dos dados
function textoBusca() {
  return db.memo('ativos-busca', () => {
    const m = new Map();
    for (const a of db.list('ativos')) {
      const col = a.colaboradorId ? db.get('colaboradores', a.colaboradorId) : null;
      m.set(a.id, normalize([a.patrimonio, a.nome, a.marca, a.modelo, a.numeroSerie, a.responsavel, a.departamento, a.localizacao, a.hostname, a.ip,
        a.sistemaOperacional, ...(a.tags || []), col?.email, col?.nome].filter(Boolean).join(' ')));
    }
    return m;
  });
}
const enriquecidos = () => db.memo('ativos-enriquecidos', () => db.list('ativos').map(comReserva), { ttlMs: 60000 });

function filtrar(query, { ignorarStatus = false } = {}) {
  const { q, status, categoria, departamento, tag, garantia, proprietario, colaboradorId } = query;
  let itens = enriquecidos();
  if (q) {
    const termos = normalize(q).split(/\s+/).filter(Boolean);
    const busca = textoBusca();
    itens = itens.filter((a) => termos.every((t) => busca.get(a.id)?.includes(t)));
  }
  if (status && !ignorarStatus) itens = itens.filter((a) => a.status === status);
  if (categoria) itens = itens.filter((a) => a.categoria === categoria);
  if (departamento) itens = itens.filter((a) => a.departamento === departamento);
  if (tag) itens = itens.filter((a) => (a.tags || []).includes(tag));
  if (garantia) itens = itens.filter((a) => a.garantiaStatus === garantia);
  if (proprietario) itens = itens.filter((a) => a.proprietario === proprietario);
  if (colaboradorId) itens = itens.filter((a) => a.colaboradorId === colaboradorId);
  return itens;
}

function ordenar(itens, { ordem = 'patrimonio', dir = 'asc' }) {
  const s = dir === 'desc' ? -1 : 1;
  return [...itens].sort((a, b) => {
    const va = ordem === 'colaborador' ? (a.colaborador?.nome || a.responsavel) : a[ordem];
    const vb = ordem === 'colaborador' ? (b.colaborador?.nome || b.responsavel) : b[ordem];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * s;
    return COLLATOR.compare(String(va ?? ''), String(vb ?? '')) * s;
  });
}

function descreverMudancas(antes, depois) {
  const nomes = { status: 'Status', responsavel: 'Responsável', departamento: 'Departamento', localizacao: 'Localização', valor: 'Valor', garantiaAte: 'Garantia', proprietario: 'Proprietário' };
  const partes = Object.keys(nomes)
    .filter((k) => String(antes[k] ?? '') !== String(depois[k] ?? ''))
    .map((k) => `${nomes[k]}: ${antes[k] || '—'} → ${depois[k] || '—'}`);
  if ((antes.colaboradorId || null) !== (depois.colaboradorId || null)) {
    const c = E.colaboradorResumo(depois.colaboradorId);
    partes.push(`Colaborador: ${c ? `${c.nome} <${c.email}>` : '—'}`);
  }
  return partes.join(' · ');
}

// Listas para selects e filtros
router.get('/meta', (_req, res) => {
  res.json(db.memo('ativos-meta', () => {
    const ativos = db.list('ativos');
    const uniq = (k) => [...new Set(ativos.map((a) => a[k]).filter(Boolean))].sort(COLLATOR.compare);
    return {
      categorias: D.CATEGORIAS,
      status: D.STATUS_ATIVO,
      proprietarios: D.PROPRIETARIOS,
      departamentos: uniq('departamento'),
      responsaveis: uniq('responsavel').slice(0, 500),
      sistemas: uniq('sistemaOperacional'),
      fornecedores: uniq('fornecedor'),
      tags: [...new Set(ativos.flatMap((a) => a.tags || []))].sort(),
      vidaUtil: D.VIDA_UTIL
    };
  }));
});

// Exportação CSV (abre direto no Excel em pt-BR: separador ";" e BOM UTF-8)
router.get('/export.csv', (req, res) => {
  const ids = req.query.ids ? new Set(String(req.query.ids).split(',')) : null;
  const itens = ordenar(filtrar(req.query), req.query).filter((a) => !ids || ids.has(a.id))
    .map((a) => ({ ...a, reservaNumero: a.reserva ? `${a.reserva.numero} (${a.reserva.nomeAdmitido})` : '', colaboradorNome: a.colaborador?.nome || '', colaboradorEmail: a.colaborador?.email || '' }));
  const cols = [['patrimonio', 'Patrimônio'], ['nome', 'Nome'], ['categoria', 'Categoria'], ['proprietario', 'Proprietário'], ['status', 'Status'],
    ['colaboradorNome', 'Colaborador'], ['colaboradorEmail', 'E-mail corporativo'], ['responsavel', 'Responsável'],
    ['departamento', 'Departamento'], ['localizacao', 'Localização'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['numeroSerie', 'Nº série'],
    ['hostname', 'Hostname'], ['ip', 'IP'], ['sistemaOperacional', 'Sistema'], ['dataAquisicao', 'Aquisição'], ['valor', 'Valor'],
    ['valorAtual', 'Valor atual'], ['garantiaAte', 'Garantia até'], ['garantiaStatus', 'Situação garantia'], ['configuracao', 'Configuração'],
    ['dataEntradaEstoque', 'Entrada no estoque'], ['reservaNumero', 'Reservado para'], ['tags', 'Tags']];
  const esc = (v) => {
    let s = Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmulas maliciosas ao abrir no Excel
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map((c) => c[1]).join(';'), ...itens.map((a) => cols.map(([k]) => esc(a[k])).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ativos-${D.hojeISO()}.csv"`);
  res.send('﻿' + csv);
});

// GET /api/ativos
//  • ?pagina=1&limite=25 → { itens, total, pagina, limite, contagens, valorTotal } (linhas enxutas, filtros e ordenação no servidor)
//  • ?campos=min         → [{ id, patrimonio, nome, status, categoria }] (seletores)
//  • sem pagina          → lista completa (compatibilidade)
router.get('/', (req, res) => {
  if (req.query.campos === 'min') {
    return res.json(ordenar(filtrar(req.query), req.query).map((a) => ({ id: a.id, patrimonio: a.patrimonio, nome: a.nome, status: a.status, categoria: a.categoria, proprietario: a.proprietario })));
  }
  if (req.query.pagina === undefined) {
    const l = ordenar(filtrar(req.query), req.query);
    return res.json(req.query.campos === 'lista' ? l.map(linha) : l);
  }
  const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 25));
  const semStatus = filtrar(req.query, { ignorarStatus: true });
  const filtrados = req.query.status ? semStatus.filter((a) => a.status === req.query.status) : semStatus;
  const total = filtrados.length;
  const paginas = Math.max(1, Math.ceil(total / limite));
  const pagina = Math.min(paginas, Math.max(1, Number(req.query.pagina) || 1));
  const ordenados = ordenar(filtrados, req.query);
  const porStatus = Object.fromEntries(D.STATUS_ATIVO.map((s) => [s, 0]));
  for (const a of semStatus) porStatus[a.status] = (porStatus[a.status] || 0) + 1;
  res.json({
    itens: ordenados.slice((pagina - 1) * limite, pagina * limite).map(linha),
    total, pagina, paginas, limite,
    contagens: { total: semStatus.length, porStatus },
    valorTotal: Math.round(filtrados.reduce((s, a) => s + (a.valorAtual || 0), 0) * 100) / 100,
    // Todos os ids do filtro atual (seleção "todos os resultados" para ações em lote)
    ...(req.query.ids === '1' ? { ids: ordenados.map((a) => a.id) } : {})
  });
});

router.get('/:id', (req, res) => {
  const a = db.get('ativos', req.params.id);
  if (!a) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  res.json(comReserva(a));
});

// Colaborador informado no formulário: existente (colaboradorId) ou novo (colaborador: { nome, email, … })
function resolverColaborador(body, erros) {
  if (body?.novoColaborador && typeof body.novoColaborador === 'object') {
    const r = C.encontrarOuCriar(body.novoColaborador);
    if (r.erros) { for (const [k, v] of Object.entries(r.erros)) erros[`novoColaborador.${k}`] = v; return null; }
    return r.colaborador.id;
  }
  const id = body?.colaboradorId || null;
  if (id && !db.get('colaboradores', id)) { erros.colaboradorId = 'Colaborador não encontrado.'; return null; }
  return id;
}

router.post('/', gerenciar, rota((req, res) => {
  const a = db.transacao(() => {
    const erros = {};
    const colaboradorId = resolverColaborador(req.body, erros);
    const { data, errors } = D.validarAtivo({ ...req.body, colaboradorId }, { existentes: db.list('ativos') });
    Object.assign(errors, erros);
    if (Object.keys(errors).length) invalidoErr(errors);
    if (data.colaboradorId) data.responsavel = db.get('colaboradores', data.colaboradorId).nome;
    const agora = new Date().toISOString();
    const novo = { id: require('crypto').randomUUID(), ...data, reservadoPara: null, statusDesde: agora, criadoEm: agora, atualizadoEm: agora };
    db.list('ativos').push(novo);
    if (E.solicitavel(novo)) E.registrarMov({ tipo: 'entrada', alvo: 'ativo', ativo: novo, motivo: novo.notaFiscal || 'Cadastro' });
    db.log({ acao: 'criou', entidade: 'ativo', entidadeId: novo.id, titulo: rotulo(novo), detalhe: novo.proprietario, salvarAgora: false });
    return novo;
  });
  res.status(201).json(comReserva(db.get('ativos', a.id)));
}));

router.put('/:id', gerenciar, rota((req, res) => {
  const antes = db.get('ativos', req.params.id);
  if (!antes) falha(404, 'Ativo não encontrado.');
  const copiaAntes = { ...antes };
  db.transacao(() => {
    const erros = {};
    const colaboradorId = resolverColaborador(req.body, erros);
    const { data, errors } = D.validarAtivo({ proprietario: E.prop(antes), ...req.body, colaboradorId }, { existentes: db.list('ativos'), idAtual: antes.id });
    Object.assign(errors, erros);
    if (Object.keys(errors).length) invalidoErr(errors);
    const bloqueio = bloqueioReserva(antes, data.status)
      || (antes.reservadoPara && data.categoria !== antes.categoria ? `${antes.patrimonio} está reservado e precisa continuar como ${antes.categoria}.` : null)
      || (antes.reservadoPara && data.proprietario !== E.prop(antes) ? `${antes.patrimonio} está reservado para uma solicitação da ${E.prop(antes)}: libere a reserva antes de trocar o proprietário.` : null);
    if (bloqueio) falha(409, bloqueio);
    if (data.colaboradorId) data.responsavel = db.get('colaboradores', data.colaboradorId).nome;
    if (data.status !== antes.status) data.statusDesde = new Date().toISOString();
    if (data.proprietario !== E.prop(antes) && E.solicitavel(antes)) E.registrarMov({ tipo: 'ajuste', alvo: 'ativo', ativo: { ...antes, ...data }, motivo: `Proprietário: ${E.prop(antes)} → ${data.proprietario}` });
    Object.assign(antes, data, { atualizadoEm: new Date().toISOString() });
    db.log({ acao: 'atualizou', entidade: 'ativo', entidadeId: antes.id, titulo: rotulo(antes), detalhe: descreverMudancas(copiaAntes, antes), salvarAgora: false });
  });
  res.json(comReserva(db.get('ativos', req.params.id)));
}));

// Mudança rápida de status (quadro kanban / menu de ações)
router.patch('/:id/status', gerenciar, (req, res) => {
  const antes = db.get('ativos', req.params.id);
  if (!antes) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const { status } = req.body || {};
  const responsavel = req.body?.responsavel !== undefined ? String(req.body.responsavel).trim() : antes.responsavel;
  if (!D.STATUS_ATIVO.includes(status)) return invalido(res, { status: 'Status inválido.' });
  if (status === 'Em uso' && !responsavel && !antes.colaboradorId) return invalido(res, { responsavel: 'Ativos "Em uso" precisam de um colaborador ou responsável.' });
  const bloqueio = bloqueioReserva(antes, status);
  if (bloqueio) return res.status(409).json({ erro: bloqueio });
  if (status === antes.status && responsavel === antes.responsavel) return res.json(comReserva(antes));
  const liberar = status === 'Disponível' || status === 'Descartado';
  const copia = { ...antes };
  db.transacao(() => {
    Object.assign(antes, {
      status, responsavel: liberar ? '' : responsavel, colaboradorId: liberar ? null : antes.colaboradorId,
      statusDesde: status !== copia.status ? new Date().toISOString() : copia.statusDesde, atualizadoEm: new Date().toISOString()
    });
    db.log({ acao: 'moveu', entidade: 'ativo', entidadeId: antes.id, titulo: rotulo(antes), detalhe: descreverMudancas(copia, antes), salvarAgora: false });
  });
  res.json(comReserva(antes));
});

// Ações em lote: { ids: [], acao: 'status' | 'proprietario' | 'excluir', status?, proprietario? }
router.post('/lote', gerenciar, (req, res) => {
  const { ids = [], acao, status, proprietario } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return invalido(res, { ids: 'Selecione ao menos um ativo.' });
  if (ids.length > 5000) return invalido(res, { ids: 'Selecione no máximo 5.000 ativos por vez.' });
  if (acao === 'status') {
    if (!D.STATUS_ATIVO.includes(status)) return invalido(res, { status: 'Status inválido.' });
    const bloqueados = [];
    const reservados = [];
    let alterados = 0;
    db.transacao(() => {
      for (const idAtivo of ids) {
        const a = db.get('ativos', idAtivo);
        if (!a || a.status === status) continue;
        if (status === 'Em uso' && !a.responsavel && !a.colaboradorId) { bloqueados.push(a.patrimonio); continue; }
        if (bloqueioReserva(a, status)) { reservados.push(a.patrimonio); continue; }
        const anterior = a.status;
        const liberar = status === 'Disponível' || status === 'Descartado';
        Object.assign(a, { status, statusDesde: new Date().toISOString(), responsavel: liberar ? '' : a.responsavel, colaboradorId: liberar ? null : a.colaboradorId, atualizadoEm: new Date().toISOString() });
        db.log({ acao: 'moveu', entidade: 'ativo', entidadeId: a.id, titulo: rotulo(a), detalhe: `Status: ${anterior} → ${status} (em lote)`, salvarAgora: false });
        alterados++;
      }
    });
    return res.json({ alterados, bloqueados, reservados });
  }
  if (acao === 'proprietario') {
    if (!D.PROPRIETARIOS.includes(proprietario)) return invalido(res, { proprietario: 'Proprietário inválido.' });
    const reservados = [];
    let alterados = 0;
    db.transacao(() => {
      for (const idAtivo of ids) {
        const a = db.get('ativos', idAtivo);
        if (!a || E.prop(a) === proprietario) continue;
        if (a.reservadoPara) { reservados.push(a.patrimonio); continue; }
        const anterior = E.prop(a);
        a.proprietario = proprietario;
        a.atualizadoEm = new Date().toISOString();
        if (E.solicitavel(a)) E.registrarMov({ tipo: 'ajuste', alvo: 'ativo', ativo: a, motivo: `Proprietário: ${anterior} → ${proprietario} (em lote)` });
        alterados++;
      }
      if (alterados) db.log({ acao: 'atualizou', entidade: 'ativo', entidadeId: null, titulo: `${alterados} equipamento(s)`, detalhe: `Proprietário alterado para ${proprietario} (em lote)`, salvarAgora: false });
    });
    return res.json({ alterados, reservados });
  }
  if (acao === 'excluir') {
    let excluidos = 0;
    const reservados = [];
    db.transacao(() => {
      for (const idAtivo of ids) {
        const a = db.get('ativos', idAtivo);
        if (a?.reservadoPara) { reservados.push(a.patrimonio); continue; }
        if (a && excluirAtivo(a)) excluidos++;
      }
    });
    return res.json({ excluidos, reservados });
  }
  invalido(res, { acao: 'Ação inválida.' });
});

// Exclui dentro de uma transação (quem chama grava uma única vez)
function excluirAtivo(a) {
  // Eventos vinculados são mantidos, apenas desvinculados.
  for (const e of db.list('eventos')) if (e.ativoId === a.id) { e.ativoId = null; e.atualizadoEm = new Date().toISOString(); }
  // Solicitações já atendidas guardam o patrimônio entregue como referência histórica
  for (const s of db.list('solicitacoes')) {
    for (const l of s.itens || []) if ((l.ativoIds || []).includes(a.id)) { l.ativoIds = l.ativoIds.filter((x) => x !== a.id); l.removidos = [...(l.removidos || []), rotulo(a)]; }
  }
  if (E.solicitavel(a)) E.registrarMov({ tipo: 'saida', alvo: 'ativo', ativo: a, motivo: 'Exclusão do cadastro' });
  const arr = db.list('ativos');
  const i = arr.indexOf(a);
  if (i === -1) return false;
  arr.splice(i, 1);
  db.log({ acao: 'excluiu', entidade: 'ativo', entidadeId: a.id, titulo: rotulo(a), salvarAgora: false });
  return true;
}

router.delete('/:id', gerenciar, (req, res) => {
  const a = db.get('ativos', req.params.id);
  if (!a) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  if (a.reservadoPara) return res.status(409).json({ erro: bloqueioReserva(a, '__excluir__') });
  db.transacao(() => excluirAtivo(a));
  res.status(204).end();
});

module.exports = router;
module.exports.comReserva = comReserva;
