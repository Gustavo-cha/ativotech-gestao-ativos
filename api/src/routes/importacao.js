// Importação de equipamentos por planilha (CSV ou Excel .xlsx) — Operador TI.
// Fluxo: analisar (envia o arquivo) → ajustar mapeamento/opções → revisar e corrigir linhas → confirmar.
// Nada é gravado antes da confirmação; a confirmação confere se a prévia vista ainda é a atual.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const D = require('../domain');
const P = require('../importacao/planilha');
const M = require('../importacao/mapear');
const MO = require('../importacao/motor');
const { rota, falha, invalido } = require('../http');

const router = express.Router();

// Sessões de importação em memória (por usuário, expiram em 2 h)
const sessoes = new Map();
const TTL = 2 * 3600000;
function limparExpiradas() {
  const agora = Date.now();
  for (const [id, s] of sessoes) if (agora - s.usadoEm > TTL) sessoes.delete(id);
}
function sessaoDe(req) {
  limparExpiradas();
  const s = sessoes.get(req.params.id);
  if (!s || s.usuarioId !== req.usuario.id) falha(404, 'Importação não encontrada ou expirada. Envie o arquivo novamente.');
  s.usadoEm = Date.now();
  return s;
}
const nomeSeguro = (n) => String(n || 'planilha').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 120) || 'planilha';

// Linhas da prévia, paginadas e filtradas
const FILTROS = {
  todos: () => true,
  criar: (r) => r.acao === 'criar',
  existentes: (r) => r.situacao === 'existente',
  alterar: (r) => r.acao === 'atualizar' || r.acao === 'complementar',
  erros: (r) => r.situacao === 'erro',
  avisos: (r) => r.avisos.length > 0,
  ignorar: (r) => r.acao === 'ignorar' && r.situacao !== 'erro'
};
function resposta(s, { filtro = 'todos', pagina = 1, limite = 50, faltando } = {}) {
  const f = FILTROS[filtro] || FILTROS.todos;
  const lista = s.resultados.filter(f);
  const lim = Math.min(200, Math.max(10, Number(limite) || 50));
  const paginas = Math.max(1, Math.ceil(lista.length / lim));
  const pag = Math.min(paginas, Math.max(1, Number(pagina) || 1));
  const amostra = (i) => s.linhas.slice(0, 3).map((l) => l.valores[i]).filter(Boolean);
  return {
    id: s.id, arquivo: s.arquivo, formato: s.formato, aba: s.aba, separador: s.separador, versao: s.versao,
    colunas: s.colunas.map((c, i) => ({ nome: c, campo: s.mapeamento[c] || '', confianca: s.confianca[c] || null, exemplos: amostra(i) })),
    campos: M.CAMPOS.map(({ id, label, obrigatorio }) => ({ id, label, obrigatorio: Boolean(obrigatorio) })),
    proprietarios: D.PROPRIETARIOS, status: D.STATUS_ATIVO,
    opcoes: s.opcoes, totais: s.totais, faltando: faltando ?? s.faltando ?? [],
    filtro, pagina: pag, paginas, total: lista.length,
    linhas: lista.slice((pag - 1) * lim, pag * lim)
  };
}
function recalcular(s) {
  const r = MO.previa(s);
  s.faltando = r.faltando;
  return r;
}

// POST /api/importacao/analisar  (corpo = arquivo; cabeçalho X-Arquivo-Nome)
router.post('/analisar', express.raw({ type: () => true, limit: '12mb' }), rota((req, res) => {
  limparExpiradas();
  const arquivo = nomeSeguro(decodeURIComponent(String(req.get('X-Arquivo-Nome') || 'planilha')));
  if (!Buffer.isBuffer(req.body) || !req.body.length) falha(400, 'Envie um arquivo .csv ou .xlsx.');
  let lido;
  try {
    lido = P.lerPlanilha(req.body, arquivo);
  } catch (e) {
    if (e instanceof P.ErroPlanilha) falha(422, e.message);
    console.error(`Importação: falha ao ler ${arquivo}: ${e.message}`);
    falha(422, 'Não foi possível ler o arquivo. Verifique se é um .csv ou .xlsx válido.');
  }
  // No máximo 3 importações abertas por pessoa
  const minhas = [...sessoes.values()].filter((x) => x.usuarioId === req.usuario.id).sort((a, b) => a.usadoEm - b.usadoEm);
  while (minhas.length >= 3) sessoes.delete(minhas.shift().id);
  const { mapeamento, confianca } = M.sugerirMapeamento(lido.colunas, lido.linhas);
  const s = {
    id: crypto.randomUUID(), usuarioId: req.usuario.id, arquivo, formato: lido.formato, aba: lido.aba, separador: lido.separador,
    colunas: lido.colunas, linhas: lido.linhas, mapeamento, confianca, opcoes: MO.normalizarOpcoes(), edicoes: {}, decisoes: {}, usadoEm: Date.now()
  };
  // Planilha sem coluna de proprietário e com todas as linhas de um só dono? O Operador escolhe o padrão na tela.
  recalcular(s);
  sessoes.set(s.id, s);
  res.status(201).json(resposta(s));
}));

router.get('/:id/previa', rota((req, res) => res.json(resposta(sessaoDe(req), req.query))));

// Mapeamento e opções (proprietário padrão, status padrão, duplicados…)
router.put('/:id/configuracao', rota((req, res) => {
  const s = sessaoDe(req);
  if (req.body?.mapeamento) s.mapeamento = MO.normalizarMapeamento(s.colunas, req.body.mapeamento);
  if (req.body?.opcoes) {
    const antes = s.opcoes.decisaoDuplicados;
    s.opcoes = MO.normalizarOpcoes({ ...s.opcoes, ...req.body.opcoes });
    // Mudou a regra geral dos duplicados: decisões individuais anteriores são descartadas
    if (antes !== s.opcoes.decisaoDuplicados) s.decisoes = {};
  }
  recalcular(s);
  res.json(resposta(s, req.query));
}));

// Correção manual de uma linha: { valores: { campo: valor }, decisao?: 'ignorar'|'complementar'|'atualizar' }
router.patch('/:id/linhas/:n', rota((req, res) => {
  const s = sessaoDe(req);
  const n = Number(req.params.n);
  if (!s.linhas.some((l) => l.n === n)) falha(404, 'Linha não encontrada.');
  const valores = req.body?.valores;
  if (valores && typeof valores === 'object') {
    const validos = new Set(M.CAMPOS.map((c) => c.id));
    s.edicoes[n] ||= {};
    for (const [k, v] of Object.entries(valores)) if (validos.has(k)) s.edicoes[n][k] = String(v ?? '').slice(0, 500);
  }
  if (req.body?.decisao !== undefined) {
    if (!['ignorar', 'complementar', 'atualizar', ''].includes(req.body.decisao)) invalido({ decisao: 'Decisão inválida.' });
    if (req.body.decisao) s.decisoes[n] = req.body.decisao; else delete s.decisoes[n];
  }
  if (req.body?.restaurar) { delete s.edicoes[n]; delete s.decisoes[n]; }
  recalcular(s);
  res.json({ linha: s.resultados.find((r) => r.n === n), totais: s.totais, faltando: s.faltando, versao: s.versao });
}));

// Relatório (CSV) das linhas que precisam de correção — antes ou depois de importar
const esc = (v) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function enviarCsv(res, nome, colunas, linhas) {
  const csv = [colunas.map(esc).join(';'), ...linhas.map((l) => l.map(esc).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send('﻿' + csv);
}
const textoErros = (r) => [...Object.values(r.erros || {}), ...(r.avisos || [])].join(' | ');

router.get('/:id/relatorio.csv', rota((req, res) => {
  const s = sessaoDe(req);
  const linhas = s.resultados.filter((r) => r.situacao === 'erro' || r.avisos.length);
  enviarCsv(res, `correcoes-${s.arquivo.replace(/\.[^.]+$/, '')}.csv`, ['Linha', 'Situação', 'Problemas', ...s.colunas],
    linhas.map((r) => [r.n, r.situacao === 'erro' ? 'Erro (não será importada)' : 'Aviso', textoErros(r), ...s.colunas.map((c) => r.original[c])]));
}));

// Confirmação: { confirmar: true, versao } — a versão garante que o Operador confirmou exatamente a prévia que viu
router.post('/:id/confirmar', rota((req, res) => {
  const s = sessaoDe(req);
  if (req.body?.confirmar !== true) invalido({ confirmar: 'Confirme a importação.' });
  if (Number(req.body?.versao) !== s.versao) falha(409, 'A prévia mudou desde a última visualização. Revise o resumo e confirme de novo.');
  recalcular(s); // dados atuais do cadastro (alguém pode ter cadastrado algo durante a revisão)
  if (s.faltando.length) falha(422, `Antes de importar: ${s.faltando.join(' · ')}.`);
  if (!s.totais.criar && !s.totais.atualizar && !s.totais.complementar) falha(422, 'Nenhuma linha será importada ou alterada.');
  const registro = MO.confirmar(s, req.usuario);
  sessoes.delete(s.id);
  res.status(201).json(registro);
}));

router.delete('/:id', rota((req, res) => { const s = sessaoDe(req); sessoes.delete(s.id); res.status(204).end(); }));

// ---------- Histórico ----------
router.get('/', (_req, res) => res.json(db.list('importacoes').slice(0, 50)));

router.get('/historico/:hid/relatorio.csv', rota((req, res) => {
  const reg = db.list('importacoes').find((x) => x.id === req.params.hid);
  if (!reg) falha(404, 'Importação não encontrada.');
  const det = MO.lerDetalhes(reg.id);
  if (!det) falha(404, 'O detalhe desta importação não está disponível.');
  const ROT = { criado: 'Criado', atualizado: 'Atualizado', complementado: 'Complementado', ignorado: 'Ignorado', erro: 'Erro' };
  enviarCsv(res, `importacao-${reg.em.slice(0, 10)}-${reg.arquivo.replace(/\.[^.]+$/, '')}.csv`, ['Linha', 'Resultado', 'Patrimônio', 'Alterações', 'Corrigido na revisão', 'Problemas', ...det.colunas],
    det.linhas.map((l) => [l.n, ROT[l.acao] || l.acao, l.patrimonio || '',
      Object.keys(l.depois || {}).map((k) => `${k}: ${JSON.stringify(l.antes?.[k] ?? '')} → ${JSON.stringify(l.depois[k])}`).join(' | '),
      Object.entries(l.corrigido || {}).map(([k, v]) => `${k} = ${v}`).join(' | '),
      textoErros(l), ...det.colunas.map((c) => l.original?.[c])]));
}));

router.post('/historico/:hid/desfazer', rota((req, res) => {
  const reg = db.list('importacoes').find((x) => x.id === req.params.hid);
  if (!reg) falha(404, 'Importação não encontrada.');
  if (reg.desfeitaEm) falha(409, 'Esta importação já foi desfeita.');
  const r = MO.desfazer(reg, req.usuario);
  if (!r) falha(409, 'O detalhe desta importação não está disponível para desfazer.');
  res.json(r);
}));

module.exports = router;
