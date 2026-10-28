// Endpoints analíticos: alertas, painel (dashboard), histórico, busca global e administração.
// O sistema é dedicado à logística de equipamentos — não há chamados de suporte técnico.
const express = require('express');
const db = require('../db');
const D = require('../domain');
const eventosR = require('./eventos');
const E = require('../estoque');
const { exigir, pode } = require('../auth');
const { podeVer } = require('./solicitacoes');

const router = express.Router();
const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SEV_PESO = { critico: 0, alto: 1, medio: 2, info: 3 };
const fmtData = (iso) => iso.slice(0, 10).split('-').reverse().join('/');

// Os alertas dependem dos dados e do relógio: recalculados quando algo muda ou a cada minuto
const gerarAlertas = () => db.memo('alertas', calcularAlertas, { ttlMs: 60000 });

function calcularAlertas() {
  const alertas = [];
  const ativos = db.list('ativos').map(D.enriquecerAtivo).filter((a) => a.status !== 'Descartado');
  for (const a of ativos) {
    const link = { tipo: 'ativo', id: a.id };
    const nome = `${a.patrimonio} · ${a.nome}`;
    if (a.garantiaStatus === 'vencida')
      alertas.push({ id: `garantia-vencida:${a.id}`, severidade: a.tags.includes('Crítico') ? 'critico' : 'alto', tipo: 'Garantia', titulo: 'Garantia vencida', descricao: `${nome} — venceu em ${fmtData(a.garantiaAte)} (há ${-a.diasGarantia} dias).`, link });
    else if (a.garantiaStatus === 'vencendo')
      alertas.push({ id: `garantia-vencendo:${a.id}`, severidade: a.diasGarantia <= 30 ? 'alto' : 'medio', tipo: 'Garantia', titulo: `Garantia vence em ${a.diasGarantia} dias`, descricao: `${nome} — vence em ${fmtData(a.garantiaAte)}.`, link });
    if (a.status === 'Em manutenção' && a.diasNoStatus > 14)
      alertas.push({ id: `manutencao-longa:${a.id}`, severidade: 'medio', tipo: 'Manutenção', titulo: `Em manutenção há ${a.diasNoStatus} dias`, descricao: `${nome} — verifique o andamento com o fornecedor.`, link });
    if (a.fimDeVida)
      alertas.push({ id: `fim-vida:${a.id}`, severidade: 'info', tipo: 'Ciclo de vida', titulo: 'Fim da vida útil', descricao: `${nome} — ${Math.floor(a.idadeMeses / 12)} anos de uso (vida útil de ${a.vidaUtilAnos}). Planeje a substituição.`, link });
  }
  agruparAlertasDeAtivos(alertas);
  for (const e of db.list('eventos').map(eventosR.enriquecer).filter((e) => e.atrasado))
    alertas.push({ id: `evento-atrasado:${e.id}`, severidade: 'medio', tipo: 'Agenda', titulo: 'Tarefa atrasada', descricao: `${e.titulo} — prevista para ${fmtData(e.data)}.`, link: { tipo: 'evento', id: e.id, data: e.data } });
  // Solicitações, envios e estoque
  const hoje = D.hojeISO();
  for (const s of db.list('solicitacoes').filter((x) => D.statusAtivo(x.status))) {
    const link = { tipo: 'solicitacao', id: s.id };
    const dias = D.diasEntre(hoje, s.dataAdmissao);
    const pronto = ['Enviado'].includes(s.status);
    if (!pronto && dias <= 7 && !['Em preparação'].includes(s.status))
      alertas.push({ id: `sol-admissao:${s.id}`, severidade: dias <= 3 ? 'critico' : 'alto', tipo: 'Admissão', titulo: dias < 0 ? 'Admissão já ocorreu sem equipamento' : `Admissão em ${dias} dia${dias === 1 ? '' : 's'} sem equipamento preparado`, descricao: `${s.numero} · ${s.nomeAdmitido} (${s.departamento}) — admissão em ${fmtData(s.dataAdmissao)}.`, link });
    if (s.status === 'Em preparação' && s.entrega?.modalidade === 'envio' && dias <= 2)
      alertas.push({ id: `sol-envio-urgente:${s.id}`, severidade: 'critico', tipo: 'Envio', titulo: dias < 0 ? 'Admissão passou e o envio não saiu' : `Envio precisa sair hoje — admissão em ${dias} dia${dias === 1 ? '' : 's'}`, descricao: `${s.numero} · ${s.nomeAdmitido} — ${s.entrega.cidade}/${s.entrega.uf}.`, link });
    if (!s.vistaPorTI && Date.now() - Date.parse(s.criadoEm) > 4 * 3600000)
      alertas.push({ id: `sol-nao-vista:${s.id}`, severidade: 'alto', tipo: 'Solicitação', titulo: 'Nova solicitação ainda não aberta pela TI', descricao: `${s.numero} · ${s.nomeAdmitido} — enviada por ${s.solicitanteNome} há mais de 4 h.`, link });
    else if (s.status === 'Pendente' && Date.now() - Date.parse(s.criadoEm) > 24 * 3600000)
      alertas.push({ id: `sol-sem-analise:${s.id}`, severidade: 'medio', tipo: 'Solicitação', titulo: 'Solicitação pendente há mais de 24 h', descricao: `${s.numero} · ${s.nomeAdmitido} — aberta por ${s.solicitanteNome}.`, link });
    if (s.previsaoEntrega && s.previsaoEntrega < hoje)
      alertas.push({ id: `sol-atrasada:${s.id}:${s.previsaoEntrega}`, severidade: 'alto', tipo: 'Envio', titulo: 'Entrega atrasada', descricao: `${s.numero} · ${s.nomeAdmitido} — previsão era ${fmtData(s.previsaoEntrega)}${s.envio?.transportadora ? ` (${s.envio.transportadora})` : ''}.`, link });
    else if (s.previsaoEntrega && s.previsaoEntrega > s.dataAdmissao)
      alertas.push({ id: `sol-previsao:${s.id}:${s.previsaoEntrega}`, severidade: 'medio', tipo: 'Envio', titulo: 'Previsão de entrega depois da admissão', descricao: `${s.numero} · ${s.nomeAdmitido} — previsão ${fmtData(s.previsaoEntrega)}, admissão ${fmtData(s.dataAdmissao)}.`, link });
  }
  const est = E.resumo();
  for (const p of est.proprietarios.filter((x) => x.saldoProjetado < 0))
    alertas.push({ id: `estoque-insuficiente:${p.proprietario}:${p.demandaNotebook}:${p.notebooksDisponiveis}`, severidade: 'alto', tipo: 'Estoque', titulo: `Notebooks insuficientes — ${p.proprietario}`, descricao: `${p.demandaNotebook} notebook(s) da ${p.proprietario} pedidos ainda sem reserva e ${p.notebooksDisponiveis} disponível(is). Faltam ${-p.saldoProjetado}.`, link: { tipo: 'estoque' } });
  for (const c of est.catalogo.filter((x) => x.tipo === 'acessorio' && x.abaixoMinimo)) {
    const item = db.get('estoqueItens', c.itemId);
    alertas.push({ id: `item-minimo:${c.itemId}:${c.disponivel}`, severidade: c.disponivel === 0 ? 'alto' : 'medio', tipo: 'Estoque', titulo: `${c.disponivel === 0 ? `${c.nome} esgotado` : `${c.nome} abaixo do mínimo`} (${c.proprietario})`, descricao: `${c.disponivel} disponível(is) · mínimo ${item?.minimo}. Registre uma entrada ao repor.`, link: { tipo: 'estoque', aba: 'itens' } });
  }
  const inconsistencias = E.verificarConsistencia();
  if (inconsistencias.length)
    alertas.push({ id: `estoque-inconsistente:${inconsistencias.length}`, severidade: 'critico', tipo: 'Estoque', titulo: 'Divergência entre reservas e estoque', descricao: inconsistencias[0], link: { tipo: 'estoque' } });

  return alertas.sort((a, b) => SEV_PESO[a.severidade] - SEV_PESO[b.severidade]);
}

// Muitos alertas iguais (ex.: 300 garantias vencidas) viram um único alerta com o total e um link para a lista filtrada —
// evita avisos repetitivos e mantém a central de alertas legível.
const GRUPOS = {
  'garantia-vencida': { titulo: (n) => `${n} equipamentos com garantia vencida`, filtro: 'garantia=vencida' },
  'garantia-vencendo': { titulo: (n) => `${n} garantias vencendo nos próximos 60 dias`, filtro: 'garantia=vencendo' },
  'manutencao-longa': { titulo: (n) => `${n} equipamentos em manutenção há mais de 14 dias`, filtro: 'status=Em%20manuten%C3%A7%C3%A3o' },
  'fim-vida': { titulo: (n) => `${n} equipamentos no fim da vida útil`, filtro: '' }
};
const LIMITE_INDIVIDUAL = 5;
function agruparAlertasDeAtivos(alertas) {
  for (const [tipo, g] of Object.entries(GRUPOS)) {
    const doTipo = alertas.filter((a) => a.id.startsWith(`${tipo}:`));
    if (doTipo.length <= LIMITE_INDIVIDUAL) continue;
    const pior = doTipo.reduce((m, a) => (SEV_PESO[a.severidade] < SEV_PESO[m] ? a.severidade : m), 'info');
    const exemplos = doTipo.slice(0, 3).map((a) => a.descricao.split(' — ')[0]);
    for (const a of doTipo) alertas.splice(alertas.indexOf(a), 1);
    alertas.push({
      id: `grupo:${tipo}:${doTipo.length}`, severidade: pior, tipo: doTipo[0].tipo, titulo: g.titulo(doTipo.length), agrupado: doTipo.length,
      descricao: `${exemplos.join(', ')} e mais ${doTipo.length - exemplos.length}.`, link: { tipo: 'ativos', filtro: g.filtro }
    });
  }
}

router.get('/alertas', exigir('alertas:ver'), (req, res) => {
  const l = gerarAlertas();
  res.json(req.query.limite ? l.slice(0, Math.max(1, Number(req.query.limite) || 10)) : l);
});

// Contadores do menu, do sino e do título da aba — resposta pequena, chamada a cada alteração dos dados.
// (Antes o menu baixava o painel completo e todos os alertas a cada alteração.)
router.get('/contadores', (req, res) => {
  const u = req.usuario;
  if (!pode(u, 'solicitacoes:gerenciar')) return res.json({ operador: false });
  const hoje = D.hojeISO();
  const ativas = db.list('solicitacoes').filter((s) => D.statusAtivo(s.status));
  const novas = ativas.filter((s) => !s.vistaPorTI);
  const est = E.resumo();
  const eventos = db.list('eventos');
  const alertas = pode(u, 'alertas:ver') ? gerarAlertas() : [];
  const N = pode(u, 'notificacoes:gerenciar') ? { contagem: require('../notificacoes').resumo(), configurado: require('../email').status().configurado } : null;
  res.json({
    operador: true,
    novas: novas.length,
    novasLista: novas.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 5).map((s) => ({
      id: s.id, numero: s.numero, nomeAdmitido: s.nomeAdmitido, solicitanteNome: s.solicitanteNome, criadoEm: s.criadoEm, proprietario: s.proprietario || D.PROPRIETARIO_PADRAO,
      itensResumo: (s.itens || []).map((l) => `${l.tipo === 'ativo' ? l.categoria : l.nome}${l.quantidade > 1 ? ` ×${l.quantidade}` : ''}`).join(' + ')
    })),
    emPreparacao: ativas.filter((s) => s.status === 'Em preparação').length,
    emTransito: ativas.filter((s) => s.status === 'Enviado').length,
    agenda: eventos.filter((e) => !e.concluido && e.data <= hoje).length,
    estoque: est.itensAbaixoMinimo + est.proprietarios.filter((p) => p.saldoProjetado < 0).length,
    alertas: alertas.map((a) => ({ id: a.id, severidade: a.severidade })),
    emails: N ? { falhou: N.contagem?.falhou || 0, configurado: N.configurado } : null
  });
});

router.get('/dashboard', exigir('painel:ver'), (_req, res) => {
  const todos = db.list('ativos').map(D.enriquecerAtivo);
  const ativos = todos.filter((a) => a.status !== 'Descartado');
  const eventos = db.list('eventos').map(eventosR.enriquecer);
  const sols = db.list('solicitacoes');
  const ativas = sols.filter((s) => D.statusAtivo(s.status));
  const entregues = sols.filter((s) => s.status === 'Entregue' && s.envio?.entregueEm);
  const alertas = gerarAlertas();
  const est = E.resumo();
  const hoje = D.hojeISO();
  const mes = hoje.slice(0, 7);
  // Datas locais calculadas uma vez (antes: conversão de data para cada solicitação, para cada um dos 14 dias)
  const diaLocal = (iso) => D.toISODate(new Date(iso));
  const abertasPorDia = new Map();
  for (const s of sols) { const d = diaLocal(s.criadoEm); abertasPorDia.set(d, (abertasPorDia.get(d) || 0) + 1); }
  const entreguesPorDia = new Map();
  for (const s of entregues) { const d = diaLocal(s.envio.entregueEm); entreguesPorDia.set(d, (entreguesPorDia.get(d) || 0) + 1); }
  const em7 = D.toISODate(new Date(Date.now() + 7 * 86400000));
  const soma = (arr, k) => Math.round(arr.reduce((s, x) => s + (Number(x[k]) || 0), 0) * 100) / 100;
  const contar = (arr, k, chaves) => {
    const r = Object.fromEntries((chaves || []).map((c) => [c, 0]));
    for (const x of arr) r[x[k] || 'Não informado'] = (r[x[k] || 'Não informado'] || 0) + 1;
    return r;
  };

  const porCategoria = Object.entries(ativos.reduce((acc, a) => {
    acc[a.categoria] ||= { nome: a.categoria, qtd: 0, valor: 0, valorAtual: 0 };
    acc[a.categoria].qtd++;
    acc[a.categoria].valor += a.valor;
    acc[a.categoria].valorAtual += a.valorAtual;
    return acc;
  }, {})).map(([, v]) => ({ ...v, valor: Math.round(v.valor), valorAtual: Math.round(v.valorAtual) })).sort((a, b) => b.qtd - a.qtd);

  const faixas = { '< 1 ano': 0, '1–2 anos': 0, '2–3 anos': 0, '3–4 anos': 0, '4+ anos': 0 };
  for (const a of ativos) {
    if (a.idadeMeses === null) continue;
    const anos = a.idadeMeses / 12;
    faixas[anos < 1 ? '< 1 ano' : anos < 2 ? '1–2 anos' : anos < 3 ? '2–3 anos' : anos < 4 ? '3–4 anos' : '4+ anos']++;
  }

  // Últimos 14 dias: solicitações abertas x entregues
  const serie = [];
  for (let i = 13; i >= 0; i--) {
    const d = D.toISODate(new Date(Date.now() - i * 86400000));
    serie.push({ dia: d, abertas: abertasPorDia.get(d) || 0, entregues: entreguesPorDia.get(d) || 0 });
  }
  const tempoMedioDias = entregues.length ? Math.round(entregues.reduce((x, s) => x + (Date.parse(s.envio.entregueEm) - Date.parse(s.criadoEm)), 0) / entregues.length / 86400000 * 10) / 10 : null;
  const noPrazo = entregues.length ? Math.round(entregues.filter((s) => s.envio.entregueEm.slice(0, 10) <= s.dataAdmissao).length / entregues.length * 100) : 100;
  const comIdade = ativos.filter((a) => a.idadeMeses !== null);
  const garantia = contar(ativos, 'garantiaStatus', ['vigente', 'vencendo', 'vencida', 'sem']);
  const maisPedidos = {};
  for (const s of sols.filter((x) => x.status !== 'Cancelado')) for (const l of s.itens || []) {
    const k = l.tipo === 'ativo' ? l.categoria : l.nome;
    maisPedidos[k] = (maisPedidos[k] || 0) + l.quantidade;
  }
  const resumoSol = (s) => ({
    id: s.id, numero: s.numero, nomeAdmitido: s.nomeAdmitido, departamento: s.departamento, cargo: s.cargo, status: s.status, dataAdmissao: s.dataAdmissao,
    solicitanteNome: s.solicitanteNome, criadoEm: s.criadoEm, nova: !s.vistaPorTI, previsaoEntrega: s.previsaoEntrega, envio: s.envio,
    itensResumo: (s.itens || []).map((l) => `${l.tipo === 'ativo' ? l.categoria : l.nome}${l.quantidade > 1 ? ` ×${l.quantidade}` : ''}`).join(' + '),
    destino: D.enderecoResumo(s.entrega), modalidade: s.entrega?.modalidade, diasParaAdmissao: D.diasEntre(hoje, s.dataAdmissao)
  });

  res.json({
    kpis: {
      totalAtivos: ativos.length,
      descartados: todos.length - ativos.length,
      valorAquisicao: soma(ativos, 'valor'),
      valorAtual: soma(ativos, 'valorAtual'),
      emUso: ativos.filter((a) => a.status === 'Em uso').length,
      disponiveis: ativos.filter((a) => a.status === 'Disponível' && !a.reservadoPara).length,
      emManutencao: ativos.filter((a) => a.status === 'Em manutenção').length,
      taxaUso: ativos.length ? Math.round(ativos.filter((a) => a.status === 'Em uso').length / ativos.length * 100) : 0,
      coberturaGarantia: ativos.length ? Math.round(garantia.vigente / ativos.length * 100) : 0,
      idadeMediaMeses: comIdade.length ? Math.round(comIdade.reduce((s, a) => s + a.idadeMeses, 0) / comIdade.length) : 0,
      solicitacoesNovas: ativas.filter((s) => !s.vistaPorTI).length,
      solicitacoesPendentes: ativas.filter((s) => ['Pendente', 'Em análise'].includes(s.status)).length,
      solicitacoesAtivas: ativas.length,
      aguardandoEstoque: ativas.filter((s) => s.status === 'Aguardando estoque').length,
      emPreparacao: ativas.filter((s) => s.status === 'Em preparação').length,
      emTransito: ativas.filter((s) => s.status === 'Enviado').length,
      entreguesMes: entregues.filter((s) => s.envio.entregueEm.slice(0, 7) === mes).length,
      entregasAtrasadas: ativas.filter((s) => s.previsaoEntrega && s.previsaoEntrega < hoje).length,
      entregasNoPrazo: noPrazo,
      tempoMedioAtendimentoDias: tempoMedioDias,
      admissoes7dias: ativas.filter((s) => s.dataAdmissao >= hoje && s.dataAdmissao <= em7).length,
      notebooksDisponiveis: est.disponivel,
      notebooksSaldo: est.saldoProjetado,
      estoquePorProprietario: est.proprietarios,
      itensAbaixoMinimo: est.itensAbaixoMinimo,
      eventosHoje: eventos.filter((e) => e.data === hoje && !e.concluido).length,
      eventosSemana: eventos.filter((e) => e.data >= hoje && e.data <= em7 && !e.concluido).length,
      eventosAtrasados: eventos.filter((e) => e.atrasado).length,
      alertas: alertas.length,
      alertasCriticos: alertas.filter((a) => a.severidade === 'critico').length
    },
    porStatus: contar(todos, 'status', D.STATUS_ATIVO),
    porCategoria,
    porDepartamento: contar(ativos, 'departamento'),
    garantia,
    idadeFaixas: faixas,
    solicitacoesPorStatus: contar(sols, 'status', D.STATUS_SOLICITACAO),
    porTransportadora: Object.entries(sols.filter((s) => s.envio?.transportadora).reduce((acc, s) => { acc[s.envio.transportadora] = (acc[s.envio.transportadora] || 0) + 1; return acc; }, {})).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor),
    maisPedidos: Object.entries(maisPedidos).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    serieSolicitacoes: serie,
    novasSolicitacoes: ativas.filter((s) => ['Pendente', 'Em análise', 'Aguardando estoque'].includes(s.status)).sort((a, b) => (!a.vistaPorTI ? 0 : 1) - (!b.vistaPorTI ? 0 : 1) || a.dataAdmissao.localeCompare(b.dataAdmissao)).slice(0, 6).map(resumoSol),
    emPreparacao: ativas.filter((s) => s.status === 'Em preparação').sort((a, b) => a.dataAdmissao.localeCompare(b.dataAdmissao)).slice(0, 5).map(resumoSol),
    enviosEmTransito: ativas.filter((s) => s.status === 'Enviado').sort((a, b) => (a.previsaoEntrega || '9').localeCompare(b.previsaoEntrega || '9')).slice(0, 5).map(resumoSol),
    proximosEventos: eventos.filter((e) => !e.concluido && e.data >= hoje).slice(0, 6),
    alertasTop: alertas.slice(0, 5),
    atividade: db.list('historico').slice(0, 8)
  });
});

router.get('/historico', exigir('historico:ver'), (req, res) => {
  const { entidade, entidadeId, q, limite = 200 } = req.query;
  let itens = db.list('historico');
  if (entidade) itens = itens.filter((h) => h.entidade === entidade);
  if (entidadeId) itens = itens.filter((h) => h.entidadeId === entidadeId);
  if (q) {
    const t = normalize(q);
    itens = itens.filter((h) => [h.titulo, h.detalhe, h.usuario, h.acao].some((v) => normalize(v).includes(t)));
  }
  res.json(itens.slice(0, Number(limite) || 200));
});

// Busca global para a paleta de comandos (Ctrl+K)
router.get('/busca', (req, res) => {
  const t = normalize(req.query.q);
  if (!t) return res.json([]);
  const solicitacoes = db.list('solicitacoes')
    .filter((s) => podeVer(req.usuario, s) && [s.numero, s.nomeAdmitido, s.cargo, s.departamento, s.envio?.codigoRastreio].some((v) => normalize(v).includes(t)))
    .slice(0, 5).map((s) => ({ tipo: 'solicitacao', id: s.id, titulo: `${s.numero} · ${s.nomeAdmitido}`, sub: `${s.status} · admissão ${fmtData(s.dataAdmissao)}` }));
  // Cada perfil só encontra o que pode ver
  if (!pode(req.usuario, 'ativos:ver')) return res.json(solicitacoes);
  const ativos = db.list('ativos')
    .filter((a) => [a.patrimonio, a.nome, a.responsavel, a.numeroSerie, a.hostname].some((v) => normalize(v).includes(t)))
    .slice(0, 6).map((a) => ({ tipo: 'ativo', id: a.id, titulo: `${a.patrimonio} · ${a.nome}`, sub: [a.status, a.responsavel, a.proprietario].filter(Boolean).join(' · ') }));
  const colaboradores = pode(req.usuario, 'colaboradores:ver') ? db.list('colaboradores')
    .filter((c) => [c.nome, c.email].some((v) => normalize(v).includes(t)))
    .slice(0, 4).map((c) => ({ tipo: 'colaborador', id: c.id, titulo: c.nome, sub: `${c.email} · ${c.empresa}` })) : [];
  const eventos = db.list('eventos')
    .filter((e) => normalize(e.titulo).includes(t))
    .slice(0, 4).map((e) => ({ tipo: 'evento', id: e.id, data: e.data, titulo: e.titulo, sub: `${e.tipo} · ${fmtData(e.data)}` }));
  res.json([...solicitacoes, ...ativos, ...colaboradores, ...eventos]);
});

router.post('/admin/reset', exigir('sistema:admin'), (_req, res) => {
  db.reset();
  db.log({ acao: 'restaurou', entidade: 'sistema', entidadeId: null, titulo: 'Dados de exemplo restaurados' });
  res.json({ ok: true });
});

router.get('/admin/backup', exigir('sistema:admin'), (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="ativotech-backup-${D.hojeISO()}.json"`);
  res.json(db.snapshot());
});

module.exports = router;
