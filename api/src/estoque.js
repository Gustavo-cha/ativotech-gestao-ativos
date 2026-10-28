// Regras de estoque, reservas e saída de equipamentos — compartilhadas por solicitações, estoque e ativos.
//
// Dois tipos de item:
//  • Equipamentos com patrimônio (notebook, monitor, smartphone, tablet): cada unidade é um ativo.
//    Ao ser reservado, o ativo guarda "reservadoPara" (id da solicitação) e a linha do pedido guarda o id do ativo.
//  • Itens por quantidade (mouse, teclado, headset…): têm "quantidade" e "reservado"; disponível = quantidade − reservado.
//
// Todas as funções de alteração mutam os objetos em memória; quem chama grava uma única vez
// (db.transacao). Como não há "await" entre verificar e gravar, duas requisições simultâneas
// nunca conseguem reservar o mesmo equipamento ou a mesma unidade de estoque.
const crypto = require('crypto');
const db = require('./db');
const D = require('./domain');
const { falha } = require('./http');

const rotuloAtivo = (a) => `${a.patrimonio} · ${a.nome}`;
// Proprietário (H&CO ou H&CO B2Finance). Registros antigos sem o campo pertencem à H&CO.
const prop = (x) => x?.proprietario || D.PROPRIETARIO_PADRAO;
const solicitavel = (a) => D.CATEGORIAS_SOLICITAVEIS.includes(a.categoria);
const disponivelItem = (i) => (i.quantidade || 0) - (i.reservado || 0);

// ---------- Movimentações (entradas, saídas, reservas, envios) ----------
function registrarMov({ tipo, alvo, item, ativo, quantidade = 1, motivo = '', solicitacao = null, salvar = false }) {
  const ctx = db.contexto.getStore();
  const mov = {
    id: crypto.randomUUID(), em: new Date().toISOString(), tipo, alvo,
    itemId: item?.id || null, ativoId: ativo?.id || null, proprietario: prop(item || ativo),
    nome: item ? item.nome : ativo ? rotuloAtivo(ativo) : '',
    quantidade, saldoApos: item ? item.quantidade : null, disponivelApos: item ? disponivelItem(item) : null,
    motivo, solicitacaoId: solicitacao?.id || null, numero: solicitacao?.numero || null,
    usuario: ctx?.usuario?.nome || 'Sistema'
  };
  const lista = db.list('movimentacoes');
  lista.unshift(mov);
  if (lista.length > 2000) lista.length = 2000;
  if (salvar) db.salvar();
  return mov;
}

// ---------- Situação dos equipamentos ----------
function equipamentosComSituacao(categorias = D.CATEGORIAS_SOLICITAVEIS, proprietario = '') {
  return db.list('ativos').filter((a) => categorias.includes(a.categoria) && (!proprietario || prop(a) === proprietario)).map((a) => {
    const sol = a.reservadoPara ? db.get('solicitacoes', a.reservadoPara) : null;
    return { ativo: a, solicitacao: sol, situacao: D.situacaoEstoque(a, sol) };
  });
}

// Colaborador vinculado (nome e e-mail corporativo)
function colaboradorResumo(id) {
  const c = id ? db.get('colaboradores', id) : null;
  return c ? { id: c.id, nome: c.nome, email: c.email } : null;
}

function serializarEquipamento({ ativo: a, solicitacao: s, situacao }) {
  return {
    id: a.id, patrimonio: a.patrimonio, nome: a.nome, categoria: a.categoria, marca: a.marca, modelo: a.modelo, numeroSerie: a.numeroSerie,
    configuracao: a.configuracao || '', status: a.status, situacao, localizacao: a.localizacao, responsavel: a.responsavel,
    departamento: a.departamento, dataEntradaEstoque: a.dataEntradaEstoque || a.dataAquisicao || '', garantiaAte: a.garantiaAte,
    proprietario: prop(a), colaborador: colaboradorResumo(a.colaboradorId),
    reserva: s ? { id: s.id, numero: s.numero, nomeAdmitido: s.nomeAdmitido, dataAdmissao: s.dataAdmissao, status: s.status } : null,
    entrega: !s && a.status === 'Em uso' ? entregaDe(a.id) : null
  };
}

// Solicitação entregue que originou o uso do equipamento (vínculo exibido no estoque).
// O mapa é montado uma vez por revisão dos dados (antes era uma varredura de todas as solicitações por equipamento).
function entregaDe(ativoId) {
  const mapa = db.memo('entregas-por-ativo', () => {
    const m = new Map();
    for (const x of db.list('solicitacoes')) {
      if (x.status !== 'Entregue') continue;
      for (const l of x.itens || []) for (const id of l.ativoIds || []) m.set(id, { id: x.id, numero: x.numero, nomeAdmitido: x.nomeAdmitido });
    }
    return m;
  });
  return mapa.get(ativoId) || null;
}

// Indicadores do estoque — mesma fonte que a TI usa (nada é digitado à parte).
// proprietario vazio = visão consolidada; os totais por proprietário vêm sempre em "proprietarios".
function resumo({ detalhado = false, proprietario = '' } = {}) {
  return db.memo(`resumo:${detalhado ? 1 : 0}:${proprietario}`, () => calcularResumo({ detalhado, proprietario }), { ttlMs: 60000 });
}

function calcularResumo({ detalhado, proprietario }) {
  const todosGeral = equipamentosComSituacao();
  const todos = proprietario ? todosGeral.filter((i) => prop(i.ativo) === proprietario) : todosGeral;
  const notebooks = todos.filter((i) => i.ativo.categoria === 'Notebook');
  const conta = (lista, s) => lista.filter((i) => i.situacao === s).length;
  const ativas = db.list('solicitacoes').filter((s) => D.statusAtivo(s.status));
  // Demanda: unidades pedidas e ainda não reservadas (por categoria e proprietário)
  const faltaReservar = (cat, dono) => ativas.reduce((soma, s) => soma + (s.itens || [])
    .filter((i) => i.tipo === 'ativo' && i.categoria === cat && (!dono || prop(i) === dono)).reduce((x, i) => x + Math.max(0, i.quantidade - (i.ativoIds || []).length), 0), 0);
  const demandaNotebook = faltaReservar('Notebook', proprietario);
  const disp = conta(notebooks, 'disponivel');
  const itens = db.list('estoqueItens').filter((i) => i.ativo !== false);

  // Totais separados por proprietário (o que o RH vê primeiro: "H&CO: 12 disponíveis")
  const proprietarios = D.PROPRIETARIOS.map((p) => {
    const eq = todosGeral.filter((i) => prop(i.ativo) === p);
    const nbs = eq.filter((i) => i.ativo.categoria === 'Notebook');
    const dispNb = conta(nbs, 'disponivel');
    const demanda = faltaReservar('Notebook', p);
    return {
      proprietario: p,
      equipamentosDisponiveis: conta(eq, 'disponivel'),
      equipamentosTotal: eq.filter((i) => i.situacao !== 'baixado').length,
      notebooksDisponiveis: dispNb,
      notebooksTotal: nbs.filter((i) => i.situacao !== 'baixado').length,
      reservados: eq.filter((i) => ['reservado', 'preparacao'].includes(i.situacao)).length,
      demandaNotebook: demanda,
      saldoProjetado: dispNb - demanda,
      acessoriosDisponiveis: itens.filter((i) => prop(i) === p).reduce((x, i) => x + Math.max(0, disponivelItem(i)), 0)
    };
  });

  // Disponibilidade por tipo e proprietário (o que o RH pode pedir) — sem patrimônio ou número de série
  const donos = proprietario ? [proprietario] : D.PROPRIETARIOS;
  const catalogo = [
    ...donos.flatMap((p) => D.CATEGORIAS_SOLICITAVEIS.map((cat) => {
      const doTipo = todosGeral.filter((i) => i.ativo.categoria === cat && prop(i.ativo) === p);
      return { tipo: 'ativo', chave: `ativo:${p}:${cat}`, categoria: cat, nome: cat, proprietario: p, disponivel: conta(doTipo, 'disponivel'), reservado: doTipo.filter((i) => ['reservado', 'preparacao'].includes(i.situacao)).length, demanda: faltaReservar(cat, p) };
    })),
    ...itens.filter((i) => donos.includes(prop(i))).map((i) => ({
      tipo: 'acessorio', chave: `item:${i.id}`, itemId: i.id, nome: i.nome, categoria: i.categoria, unidade: i.unidade, proprietario: prop(i),
      disponivel: Math.max(0, disponivelItem(i)), reservado: i.reservado || 0, abaixoMinimo: disponivelItem(i) <= (i.minimo || 0) && (i.minimo || 0) > 0
    }))
  ];

  const porModelo = {};
  for (const { ativo: a } of notebooks.filter((i) => i.situacao === 'disponivel')) {
    const k = `${prop(a)}|${a.marca} ${a.modelo}`.trim();
    porModelo[k] ||= { modelo: `${a.marca} ${a.modelo}`.trim(), proprietario: prop(a), configuracao: a.configuracao || '', quantidade: 0, locais: new Set() };
    porModelo[k].quantidade++;
    if (a.localizacao) porModelo[k].locais.add(a.localizacao);
  }
  const porLocal = {};
  for (const { ativo: a, situacao } of notebooks.filter((i) => ['disponivel', 'reservado', 'preparacao'].includes(i.situacao))) {
    const k = `${prop(a)}|${a.localizacao || 'Não informado'}`;
    porLocal[k] ||= { local: a.localizacao || 'Não informado', proprietario: prop(a), disponivel: 0, reservado: 0, preparacao: 0 };
    porLocal[k][situacao]++;
  }

  const r = {
    proprietario: proprietario || null,
    // Notebooks (indicadores principais)
    total: notebooks.filter((i) => i.situacao !== 'baixado').length,
    disponivel: disp,
    reservado: conta(notebooks, 'reservado'),
    preparacao: conta(notebooks, 'preparacao'),
    transito: conta(notebooks, 'transito'),
    emUso: conta(notebooks, 'em-uso'),
    manutencao: conta(notebooks, 'manutencao'),
    baixados: conta(notebooks, 'baixado'),
    demandaPendente: demandaNotebook,
    saldoProjetado: disp - demandaNotebook,
    proprietarios,
    catalogo,
    porModelo: Object.values(porModelo).map((m) => ({ ...m, locais: [...m.locais] })).sort((a, b) => b.quantidade - a.quantidade),
    porLocal: Object.values(porLocal).sort((a, b) => a.proprietario.localeCompare(b.proprietario) || a.local.localeCompare(b.local, 'pt-BR')),
    itensAbaixoMinimo: catalogo.filter((c) => c.abaixoMinimo).length,
    atualizadoEm: db.revEm()
  };
  if (detalhado) r.equipamentos = todos.map(serializarEquipamento);
  return r;
}

// ---------- Situação de cada linha do pedido ----------
const linhaCompleta = (l) => (l.tipo === 'ativo' ? (l.ativoIds || []).length === l.quantidade : (l.reservado || 0) + (l.enviado || 0) >= l.quantidade);
const pedidoCompleto = (s) => (s.itens || []).length > 0 && s.itens.every(linhaCompleta);

// ---------- Reservas ----------
// Define os ativos reservados para uma linha (substitui a reserva anterior da linha)
function alocarAtivos(sol, linha, ativoIds) {
  if (!D.statusAtivo(sol.status) || sol.status === 'Enviado') falha(409, `A solicitação ${sol.numero} está ${sol.status.toLowerCase()} e não aceita alterações de reserva.`);
  if (linha.tipo !== 'ativo') falha(422, 'Esta linha é de item por quantidade.');
  const ids = [...new Set(ativoIds || [])];
  if (ids.length > linha.quantidade) falha(422, `Esta linha pede ${linha.quantidade} ${linha.categoria.toLowerCase()}(s).`);
  const novos = [];
  for (const id of ids) {
    const a = db.get('ativos', id);
    if (!a) falha(404, 'Equipamento não encontrado.');
    if (a.categoria !== linha.categoria) falha(422, `${a.patrimonio} não é ${linha.categoria.toLowerCase()}.`);
    // Os estoques das duas organizações nunca se misturam
    if (prop(a) !== prop(linha)) falha(422, `${a.patrimonio} pertence à ${prop(a)}. Esta solicitação é de equipamentos da ${prop(linha)}.`);
    if (a.reservadoPara && a.reservadoPara !== sol.id) {
      const outra = db.get('solicitacoes', a.reservadoPara);
      falha(409, `${a.patrimonio} já está reservado para ${outra ? `${outra.numero} (${outra.nomeAdmitido})` : 'outra solicitação'}.`);
    }
    if (a.status !== 'Disponível') falha(409, `${a.patrimonio} não está disponível (status atual: ${a.status}).`);
    novos.push(a);
  }
  const antes = new Set(linha.ativoIds || []);
  const agora = new Set(ids);
  for (const id of antes) if (!agora.has(id)) liberarAtivo(sol, id);
  for (const a of novos) if (!antes.has(a.id)) {
    a.reservadoPara = sol.id;
    a.atualizadoEm = new Date().toISOString();
    registrarMov({ tipo: 'reserva', alvo: 'ativo', ativo: a, solicitacao: sol });
  }
  linha.ativoIds = ids;
  return novos;
}

function liberarAtivo(sol, ativoId) {
  const a = db.get('ativos', ativoId);
  if (a && a.reservadoPara === sol.id) {
    a.reservadoPara = null;
    a.atualizadoEm = new Date().toISOString();
    registrarMov({ tipo: 'liberacao', alvo: 'ativo', ativo: a, solicitacao: sol });
  }
  return a;
}

// Reserva N unidades de um item por quantidade
function reservarQuantidade(sol, linha, quantidade) {
  if (!D.statusAtivo(sol.status) || sol.status === 'Enviado') falha(409, `A solicitação ${sol.numero} está ${sol.status.toLowerCase()} e não aceita alterações de reserva.`);
  if (linha.tipo !== 'acessorio') falha(422, 'Esta linha é de equipamento com patrimônio.');
  const item = db.get('estoqueItens', linha.itemId);
  if (!item) falha(404, 'Item de estoque não encontrado.');
  const q = Math.floor(Number(quantidade));
  if (!(q >= 0) || q > linha.quantidade) falha(422, `Informe de 0 a ${linha.quantidade} unidade(s).`);
  const atual = linha.reservado || 0;
  const delta = q - atual;
  if (delta > 0 && disponivelItem(item) < delta) falha(409, `Estoque insuficiente de ${item.nome}: ${Math.max(0, disponivelItem(item))} disponível(is).`);
  if (delta === 0) return item;
  item.reservado = (item.reservado || 0) + delta;
  item.atualizadoEm = new Date().toISOString();
  linha.reservado = q;
  registrarMov({ tipo: delta > 0 ? 'reserva' : 'liberacao', alvo: 'item', item, quantidade: Math.abs(delta), solicitacao: sol });
  return item;
}

// Libera tudo o que estiver reservado (cancelamento/rejeição)
function liberarTudo(sol) {
  const liberados = [];
  for (const l of sol.itens || []) {
    if (l.tipo === 'ativo') { for (const id of l.ativoIds || []) { const a = liberarAtivo(sol, id); if (a) liberados.push(a.patrimonio); } l.ativoIds = []; }
    else if (l.reservado) { const item = db.get('estoqueItens', l.itemId); if (item) { reservarQuantidade(sol, l, 0); liberados.push(`${item.nome} ×${l.quantidade}`); } }
  }
  return liberados;
}

// Reserva automaticamente o que houver disponível (primeiros por patrimônio / quantidade possível)
function alocarAutomatico(sol) {
  const feito = [];
  for (const l of sol.itens || []) {
    if (l.tipo === 'ativo') {
      const faltam = l.quantidade - (l.ativoIds || []).length;
      if (faltam <= 0) continue;
      const livres = equipamentosComSituacao([l.categoria], prop(l)).filter((i) => i.situacao === 'disponivel')
        .map((i) => i.ativo).sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR', { numeric: true })).slice(0, faltam);
      if (livres.length) { alocarAtivos(sol, l, [...(l.ativoIds || []), ...livres.map((a) => a.id)]); feito.push(...livres.map((a) => a.patrimonio)); }
    } else {
      const item = db.get('estoqueItens', l.itemId);
      if (!item) continue;
      const alvo = Math.min(l.quantidade, (l.reservado || 0) + Math.max(0, disponivelItem(item)));
      if (alvo > (l.reservado || 0)) { const antes = l.reservado || 0; reservarQuantidade(sol, l, alvo); feito.push(`${item.nome} ×${alvo - antes}`); }
    }
  }
  return feito;
}

// Saída física dos itens por quantidade (no envio, ou na entrega quando é retirada)
function baixarQuantidades(sol, motivo) {
  for (const l of sol.itens || []) {
    if (l.tipo !== 'acessorio' || !l.reservado) continue;
    const item = db.get('estoqueItens', l.itemId);
    if (!item) continue;
    item.quantidade -= l.reservado;
    item.reservado -= l.reservado;
    item.atualizadoEm = new Date().toISOString();
    registrarMov({ tipo: 'envio', alvo: 'item', item, quantidade: l.reservado, motivo, solicitacao: sol });
    l.enviado = (l.enviado || 0) + l.reservado;
    l.reservado = 0;
  }
}

// Envio: equipamentos saem do almoxarifado (ficam "em trânsito") e acessórios são baixados
function enviar(sol) {
  if (!pedidoCompleto(sol)) falha(409, 'Reserve todos os itens antes de enviar.');
  for (const l of sol.itens) for (const id of l.ativoIds || []) {
    const a = db.get('ativos', id);
    if (a) registrarMov({ tipo: 'envio', alvo: 'ativo', ativo: a, solicitacao: sol, motivo: sol.envio?.transportadora || '' });
  }
  baixarQuantidades(sol, `Envio ${sol.envio?.transportadora || ''}`.trim());
}

// Entrega: equipamentos passam a "Em uso" pelo colaborador
function entregar(sol) {
  if (!pedidoCompleto(sol)) falha(409, 'Reserve todos os itens antes de concluir a entrega.');
  if (sol.status !== 'Enviado') baixarQuantidades(sol, 'Retirada na unidade');
  const agora = new Date().toISOString();
  const entregues = [];
  for (const l of sol.itens) for (const id of l.ativoIds || []) {
    const a = db.get('ativos', id);
    if (!a) continue;
    if (a.reservadoPara !== sol.id) falha(409, `${a.patrimonio} não está reservado para esta solicitação.`);
    Object.assign(a, {
      status: 'Em uso', responsavel: sol.nomeAdmitido, departamento: sol.departamento, colaboradorId: sol.colaboradorId || null,
      localizacao: sol.entrega?.modalidade === 'retirada' ? sol.entrega.unidade : `${sol.entrega?.cidade}/${sol.entrega?.uf}`,
      reservadoPara: null, statusDesde: agora, atualizadoEm: agora
    });
    registrarMov({ tipo: 'entrega', alvo: 'ativo', ativo: a, solicitacao: sol, motivo: `Entregue a ${sol.nomeAdmitido}` });
    entregues.push(a);
  }
  return entregues;
}

// ---------- Integridade (deve sempre retornar lista vazia) ----------
function verificarConsistencia() {
  return db.memo('consistencia', calcularConsistencia, { ttlMs: 60000 });
}
function calcularConsistencia() {
  const problemas = [];
  const ativos = db.list('ativos');
  const sols = db.list('solicitacoes');
  const usados = new Map();
  for (const s of sols.filter((x) => D.statusAtivo(x.status))) {
    for (const l of s.itens || []) {
      for (const id of l.ativoIds || []) {
        const a = db.get('ativos', id);
        if (!a) problemas.push(`${s.numero}: equipamento vinculado não existe mais.`);
        else if (a.reservadoPara !== s.id) problemas.push(`${s.numero}: ${a.patrimonio} não está marcado como reservado para esta solicitação.`);
        if (a && prop(a) !== prop(l)) problemas.push(`${s.numero}: ${a.patrimonio} é da ${prop(a)}, mas o pedido é da ${prop(l)}.`);
        if (usados.has(id)) problemas.push(`${s.numero} e ${usados.get(id)} usam o mesmo equipamento.`);
        usados.set(id, s.numero);
      }
    }
  }
  for (const a of ativos.filter((x) => x.reservadoPara)) {
    const s = db.get('solicitacoes', a.reservadoPara);
    if (!s) problemas.push(`${a.patrimonio}: reservado para uma solicitação inexistente.`);
    else if (!D.statusAtivo(s.status)) problemas.push(`${a.patrimonio}: reservado para ${s.numero}, que já está ${s.status.toLowerCase()}.`);
    else if (!(s.itens || []).some((l) => (l.ativoIds || []).includes(a.id))) problemas.push(`${a.patrimonio}: reserva não confere com ${s.numero}.`);
    if (a.status !== 'Disponível') problemas.push(`${a.patrimonio}: reservado mas com status "${a.status}".`);
  }
  // Itens por quantidade: reservado deve bater com a soma das reservas das solicitações ativas
  const reservadoPorItem = new Map();
  for (const s of sols.filter((x) => D.statusAtivo(x.status))) for (const l of s.itens || []) if (l.itemId) reservadoPorItem.set(l.itemId, (reservadoPorItem.get(l.itemId) || 0) + (l.reservado || 0));
  for (const item of db.list('estoqueItens')) {
    const soma = reservadoPorItem.get(item.id) || 0;
    if (soma !== (item.reservado || 0)) problemas.push(`${item.nome}: ${item.reservado || 0} reservado(s) no estoque, mas ${soma} nas solicitações.`);
    if ((item.quantidade || 0) < 0) problemas.push(`${item.nome}: quantidade negativa.`);
    if ((item.reservado || 0) > (item.quantidade || 0)) problemas.push(`${item.nome}: mais unidades reservadas do que em estoque.`);
  }
  return problemas;
}

module.exports = {
  resumo, equipamentosComSituacao, serializarEquipamento, verificarConsistencia, registrarMov,
  alocarAtivos, reservarQuantidade, liberarTudo, alocarAutomatico, enviar, entregar,
  linhaCompleta, pedidoCompleto, disponivelItem, rotuloAtivo, solicitavel, prop, colaboradorResumo
};
