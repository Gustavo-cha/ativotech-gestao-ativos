// Estoque: indicadores (RH resumido, TI completo), equipamentos, itens por quantidade,
// entradas/saídas/ajustes, movimentações, integridade e conferência física.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const D = require('../domain');
const E = require('../estoque');
const { exigir, pode } = require('../auth');
const { rota, invalido, falha } = require('../http');

const router = express.Router();
const gerenciar = exigir('estoque:gerenciar');
// ?proprietario=H&CO | H&CO B2Finance (vazio = todos)
const lerProprietario = (q) => (D.PROPRIETARIOS.includes(q?.proprietario) ? q.proprietario : '');

// RH: resumo sem patrimônio, série, localização interna nem quantidades reservadas por pedido.
// ?detalhe=0 dispensa a lista completa de equipamentos (telas que só mostram os números).
router.get('/resumo', exigir('estoque:ver'), (req, res) => {
  const detalhe = pode(req.usuario, 'estoque:detalhe');
  const r = { ...E.resumo({ detalhado: detalhe && req.query.detalhe !== '0', proprietario: lerProprietario(req.query) }) };
  if (!detalhe) {
    r.catalogo = r.catalogo.map(({ tipo, chave, itemId, nome, categoria, unidade, disponivel, proprietario }) => ({ tipo, chave, itemId, nome, categoria, unidade, disponivel, proprietario }));
    r.proprietarios = r.proprietarios.map(({ proprietario, equipamentosDisponiveis, notebooksDisponiveis, acessoriosDisponiveis }) => ({ proprietario, equipamentosDisponiveis, notebooksDisponiveis, acessoriosDisponiveis }));
    delete r.itensAbaixoMinimo;
  }
  res.json(r);
});

// Equipamentos com patrimônio (notebook, monitor, smartphone, tablet) e sua situação
router.get('/equipamentos', exigir('estoque:detalhe'), (req, res) => {
  const cats = req.query.categoria ? [String(req.query.categoria)] : D.CATEGORIAS_SOLICITAVEIS;
  res.json(E.equipamentosComSituacao(cats, lerProprietario(req.query)).map(E.serializarEquipamento).sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR', { numeric: true })));
});

// ---------- Itens por quantidade ----------
const serializarItem = (i) => ({ ...i, proprietario: E.prop(i), disponivel: E.disponivelItem(i), abaixoMinimo: (i.minimo || 0) > 0 && E.disponivelItem(i) <= i.minimo });

router.get('/itens', exigir('estoque:detalhe'), (req, res) => {
  const dono = lerProprietario(req.query);
  res.json(db.list('estoqueItens').filter((i) => !dono || E.prop(i) === dono).map(serializarItem)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || E.prop(a).localeCompare(E.prop(b))));
});

router.post('/itens', gerenciar, rota((req, res) => {
  const { data, errors } = D.validarItemEstoque(req.body, { existentes: db.list('estoqueItens') });
  const inicial = Math.floor(Number(req.body?.quantidade) || 0);
  if (inicial < 0 || inicial > 100000) errors.quantidade = 'Quantidade inválida.';
  if (Object.keys(errors).length) invalido(errors);
  const item = db.transacao(() => {
    const agora = new Date().toISOString();
    const novo = { id: crypto.randomUUID(), ...data, quantidade: inicial, reservado: 0, criadoEm: agora, atualizadoEm: agora };
    db.list('estoqueItens').push(novo);
    if (inicial) E.registrarMov({ tipo: 'entrada', alvo: 'item', item: novo, quantidade: inicial, motivo: 'Saldo inicial' });
    db.log({ acao: 'criou', entidade: 'estoque', entidadeId: novo.id, titulo: novo.nome, detalhe: `${novo.proprietario} · saldo inicial: ${inicial} ${novo.unidade}`, salvarAgora: false });
    return novo;
  });
  res.status(201).json(serializarItem(item));
}));

router.put('/itens/:id', gerenciar, rota((req, res) => {
  const item = db.get('estoqueItens', req.params.id);
  if (!item) falha(404, 'Item não encontrado.');
  const { data, errors } = D.validarItemEstoque({ proprietario: E.prop(item), ...req.body }, { existentes: db.list('estoqueItens'), idAtual: item.id });
  // Trocar o proprietário com unidades reservadas misturaria os estoques das solicitações em andamento
  if (data.proprietario !== E.prop(item) && (item.reservado || 0) > 0) errors.proprietario = 'Há unidades reservadas para solicitações: libere as reservas antes de trocar o proprietário.';
  if (Object.keys(errors).length) invalido(errors);
  db.transacao(() => {
    Object.assign(item, data, { atualizadoEm: new Date().toISOString() });
    db.log({ acao: 'atualizou', entidade: 'estoque', entidadeId: item.id, titulo: item.nome, detalhe: `${item.proprietario} · mínimo ${item.minimo} · ${item.ativo ? 'ativo' : 'inativo no catálogo'}`, salvarAgora: false });
  });
  res.json(serializarItem(item));
}));

// Entrada (+), saída (−) ou ajuste de inventário (= novo saldo). A quantidade nunca fica abaixo do reservado.
router.post('/itens/:id/movimentar', gerenciar, rota((req, res) => {
  const item = db.get('estoqueItens', req.params.id);
  if (!item) falha(404, 'Item não encontrado.');
  const tipo = req.body?.tipo;
  const q = Math.floor(Number(req.body?.quantidade));
  const motivo = String(req.body?.motivo || '').trim().slice(0, 200);
  if (!['entrada', 'saida', 'ajuste'].includes(tipo)) invalido({ tipo: 'Escolha entrada, saída ou ajuste.' });
  if (!(q >= 0) || q > 100000 || (tipo !== 'ajuste' && q === 0)) invalido({ quantidade: 'Quantidade inválida.' });
  if (tipo !== 'entrada' && motivo.length < 3) invalido({ motivo: 'Informe o motivo (ex.: perda, defeito, inventário).' });
  const mov = db.transacao(() => {
    const antes = item.quantidade;
    if (tipo === 'entrada') item.quantidade += q;
    if (tipo === 'saida') {
      if (q > E.disponivelItem(item)) falha(409, `Só há ${Math.max(0, E.disponivelItem(item))} unidade(s) livre(s) — ${item.reservado} estão reservadas para solicitações.`);
      item.quantidade -= q;
    }
    if (tipo === 'ajuste') {
      if (q < (item.reservado || 0)) falha(409, `O saldo não pode ficar abaixo das ${item.reservado} unidade(s) reservadas.`);
      item.quantidade = q;
    }
    item.atualizadoEm = new Date().toISOString();
    const m = E.registrarMov({ tipo, alvo: 'item', item, quantidade: tipo === 'ajuste' ? q - antes : q, motivo: motivo || (tipo === 'entrada' ? 'Entrada' : '') });
    db.log({ acao: tipo, entidade: 'estoque', entidadeId: item.id, titulo: item.nome, detalhe: `${tipo === 'entrada' ? '+' : tipo === 'saida' ? '−' : '='}${q} · saldo ${antes} → ${item.quantidade}${motivo ? ` · ${motivo}` : ''}`, salvarAgora: false });
    return m;
  });
  res.status(201).json({ item: serializarItem(item), movimentacao: mov });
}));

// Histórico de entradas, saídas, reservas, envios e entregas
router.get('/movimentacoes', exigir('estoque:detalhe'), (req, res) => {
  const { itemId, ativoId, tipo, solicitacaoId, limite = 300 } = req.query;
  const dono = lerProprietario(req.query);
  let l = db.list('movimentacoes');
  if (dono) l = l.filter((m) => (m.proprietario || D.PROPRIETARIO_PADRAO) === dono);
  if (itemId) l = l.filter((m) => m.itemId === itemId);
  if (ativoId) l = l.filter((m) => m.ativoId === ativoId);
  if (solicitacaoId) l = l.filter((m) => m.solicitacaoId === solicitacaoId);
  if (tipo) l = l.filter((m) => m.tipo === tipo);
  res.json(l.slice(0, Math.min(1000, Number(limite) || 300)));
});

// Integridade entre reservas, ativos e quantidades
router.get('/consistencia', exigir('estoque:detalhe'), (_req, res) => {
  const problemas = E.verificarConsistencia();
  res.json({ ok: problemas.length === 0, problemas, verificadoEm: new Date().toISOString() });
});

// Conferência física: compara os patrimônios encontrados no almoxarifado com o que deveria estar lá
router.post('/conferencia', gerenciar, rota((req, res) => {
  const lista = Array.isArray(req.body?.patrimonios) ? req.body.patrimonios : String(req.body?.patrimonios || '').split(/[\s,;]+/);
  const encontrados = [...new Set(lista.map((p) => String(p).trim().toUpperCase()).filter(Boolean))];
  if (!encontrados.length) invalido({ patrimonios: 'Informe ao menos um patrimônio encontrado.' });
  const dono = lerProprietario(req.body);
  const equip = E.equipamentosComSituacao();
  const porPat = new Map(equip.map((i) => [i.ativo.patrimonio.toUpperCase(), i]));
  // Conferência de um almoxarifado só de um proprietário: os equipamentos do outro não são "esperados"
  const esperados = equip.filter((i) => ['disponivel', 'reservado', 'preparacao'].includes(i.situacao) && (!dono || E.prop(i.ativo) === dono));
  const esperadosSet = new Set(esperados);
  const encontradosSet = new Set(encontrados);
  const resultado = {
    id: crypto.randomUUID(), em: new Date().toISOString(), por: req.usuario.nome, proprietario: dono || null,
    observacao: String(req.body?.observacao || '').trim().slice(0, 300),
    esperados: esperados.length, encontrados: encontrados.length,
    conferidos: esperados.filter((i) => encontradosSet.has(i.ativo.patrimonio.toUpperCase())).map((i) => i.ativo.patrimonio),
    faltando: esperados.filter((i) => !encontradosSet.has(i.ativo.patrimonio.toUpperCase())).map((i) => ({ patrimonio: i.ativo.patrimonio, nome: i.ativo.nome, situacao: i.situacao, localizacao: i.ativo.localizacao })),
    foraDoEstoque: encontrados.filter((p) => porPat.has(p) && !esperadosSet.has(porPat.get(p))).map((p) => ({ patrimonio: porPat.get(p).ativo.patrimonio, nome: porPat.get(p).ativo.nome, situacao: porPat.get(p).situacao, responsavel: porPat.get(p).ativo.responsavel, proprietario: E.prop(porPat.get(p).ativo) })),
    desconhecidos: encontrados.filter((p) => !porPat.has(p))
  };
  resultado.ok = !resultado.faltando.length && !resultado.foraDoEstoque.length && !resultado.desconhecidos.length;
  db.transacao((dados) => {
    dados.conferencias ||= [];
    dados.conferencias.unshift(resultado);
    dados.conferencias.length = Math.min(dados.conferencias.length, 30);
    db.log({ acao: 'conferiu', entidade: 'estoque', entidadeId: resultado.id, titulo: 'conferência física do estoque',
      detalhe: resultado.ok ? `${resultado.conferidos.length} de ${resultado.esperados} conferidos, sem divergências` : `${resultado.faltando.length} faltando · ${resultado.foraDoEstoque.length} fora do estoque · ${resultado.desconhecidos.length} desconhecidos`, salvarAgora: false });
  });
  res.status(201).json(resultado);
}));

router.get('/conferencias', exigir('estoque:detalhe'), (_req, res) => res.json(db.list('conferencias') || []));

module.exports = router;
