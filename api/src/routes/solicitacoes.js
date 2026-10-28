// Solicitações de equipamentos: o RH pede, a TI analisa, reserva, prepara, envia e entrega.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const D = require('../domain');
const E = require('../estoque');
const { pode, exigir } = require('../auth');
const { rota, falha, invalido } = require('../http');
const N = require('../notificacoes');
const C = require('../colaboradores');
const config = require('../config');

const router = express.Router();
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fmt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const rotulo = (s) => `${s.numero} · ${s.nomeAdmitido}`;
const gerencia = (u) => pode(u, 'solicitacoes:gerenciar');
const gerenciar = exigir('solicitacoes:gerenciar');

// ---------- Visibilidade: Operador vê todas; Solicitante só as próprias ----------
const ehDono = (usuario, s) => s.solicitanteId === usuario.id || s.abertoPorId === usuario.id;
const podeVer = (usuario, s) => gerencia(usuario) || ehDono(usuario, s);

function buscar(req) {
  const s = db.get('solicitacoes', req.params.id);
  // 404 também quando não há permissão: não revela a existência de pedidos de outras pessoas
  if (!s || !podeVer(req.usuario, s)) falha(404, 'Solicitação não encontrada.');
  return s;
}

const resumoItens = (s) => (s.itens || []).map((l) => `${l.tipo === 'ativo' ? l.categoria : l.nome}${l.quantidade > 1 ? ` ×${l.quantidade}` : ''}`).join(' + ');

// O que cada perfil enxerga: notas internas, patrimônios e série ficam só com a TI
function serializar(s, usuario) {
  const ti = gerencia(usuario);
  const hoje = D.hojeISO();
  const dias = s.dataAdmissao ? D.diasEntre(hoje, s.dataAdmissao) : null;
  const ativa = D.statusAtivo(s.status);
  const { notasInternas, ...resto } = s;
  const itens = (s.itens || []).map((l) => {
    if (l.tipo === 'ativo') {
      const ativos = (l.ativoIds || []).map((id) => db.get('ativos', id)).filter(Boolean);
      return {
        ...l, alocado: ativos.length, completo: E.linhaCompleta(l),
        equipamentos: ativos.map((a) => (ti
          ? { id: a.id, patrimonio: a.patrimonio, nome: a.nome, marca: a.marca, modelo: a.modelo, numeroSerie: a.numeroSerie, configuracao: a.configuracao, localizacao: a.localizacao }
          : { nome: `${a.marca} ${a.modelo}`.trim(), configuracao: a.configuracao }))
      };
    }
    const item = db.get('estoqueItens', l.itemId);
    return { ...l, alocado: (l.reservado || 0) + (l.enviado || 0), completo: E.linhaCompleta(l), ...(ti && item ? { disponivelEstoque: Math.max(0, E.disponivelItem(item)) } : {}) };
  });
  const totalUn = itens.reduce((x, l) => x + l.quantidade, 0);
  const col = s.colaboradorId ? db.get('colaboradores', s.colaboradorId) : null;
  const alocadoUn = itens.reduce((x, l) => x + Math.min(l.quantidade, l.alocado), 0);
  return {
    ...resto,
    proprietario: E.prop(s),
    emailColaborador: s.emailColaborador || '',
    colaborador: col ? { id: col.id, nome: col.nome, email: col.email } : null,
    itens,
    itensResumo: resumoItens(s),
    progressoReserva: { total: totalUn, alocado: alocadoUn, completo: alocadoUn === totalUn },
    enderecoResumo: D.enderecoResumo(s.entrega),
    atualizacoes: (s.atualizacoes || []).filter((x) => x.publico !== false),
    ...(ti ? { notasInternas: notasInternas || [], nova: !s.vistaPorTI && ativa } : { vistaPorTI: undefined }),
    diasParaAdmissao: dias,
    urgencia: !ativa || s.status === 'Enviado' ? 'nenhuma' : dias !== null && dias <= 3 ? 'critica' : dias !== null && dias <= 7 ? 'alta' : 'normal',
    entregaAtrasada: Boolean(ativa && s.previsaoEntrega && s.previsaoEntrega < hoje),
    previsaoAposAdmissao: Boolean(ativa && s.previsaoEntrega && s.dataAdmissao && s.previsaoEntrega > s.dataAdmissao),
    proximosStatus: ti ? proximos(s) : [],
    podeCancelar: ativa && (ti ? s.status !== 'Enviado' : ehDono(usuario, s) && D.RH_PODE_CANCELAR.includes(s.status)),
    podeGerenciar: ti
  };
}

// Próximos status válidos, considerando a modalidade (envio x retirada)
function proximos(s) {
  return (D.TRANSICOES[s.status] || []).filter((x) => x !== 'Cancelado'
    && !(x === 'Enviado' && s.entrega?.modalidade === 'retirada')
    && !(x === 'Entregue' && s.status === 'Em preparação' && s.entrega?.modalidade === 'envio'));
}

function registrar(s, { tipo = 'mensagem', status, texto, publico = true }, usuario) {
  s.atualizacoes ||= [];
  s.atualizacoes.push({ id: crypto.randomUUID(), tipo, status: status || null, autor: usuario.nome, autorPerfil: usuario.perfil, texto: String(texto || '').slice(0, 2000), em: new Date().toISOString(), publico });
  s.atualizadoEm = new Date().toISOString();
}

// E-mail para as interações públicas registradas nesta requisição (a fila evita duplicidade)
const qtdAtualizacoes = (s) => (s.atualizacoes || []).length;
function notificarDesde(sol, desde, usuario) {
  const s = db.get('solicitacoes', sol.id) || sol;
  for (const a of (s.atualizacoes || []).slice(desde)) if (a.publico !== false) N.interacao(s, a, usuario);
}

const avisarStatus = (s) => db.emitir('solicitacao:status', { id: s.id, numero: s.numero, status: s.status, nomeAdmitido: s.nomeAdmitido, solicitanteId: s.solicitanteId });

// ---------- Consulta ----------
router.get('/meta', (_req, res) => {
  res.json({
    tipos: D.TIPOS_SOLICITACAO, status: D.STATUS_SOLICITACAO, etapas: D.ETAPAS_SOLICITACAO, transicoes: D.TRANSICOES,
    ufs: D.UFS, transportadoras: D.TRANSPORTADORAS, categorias: D.CATEGORIAS_SOLICITAVEIS,
    proprietarios: D.PROPRIETARIOS, dominiosColaborador: config.dominiosColaborador
  });
});

// Catálogo do formulário: o que pode ser pedido, de qual proprietário e quanto há disponível (sem dados internos)
router.get('/catalogo', exigir('solicitacoes:criar'), (req, res) => {
  const dono = D.PROPRIETARIOS.includes(req.query.proprietario) ? req.query.proprietario : '';
  res.json(E.resumo().catalogo.filter((c) => !dono || c.proprietario === dono)
    .map(({ tipo, chave, categoria, nome, itemId, unidade, disponivel, proprietario }) => ({ tipo, chave, categoria, nome, itemId, unidade, disponivel, proprietario })));
});

// GET /api/solicitacoes?status=ativas|novas|<status>&q=&tipo=&departamento=&minhas=1
router.get('/', (req, res) => {
  const { status, q, tipo, departamento, minhas, proprietario } = req.query;
  let itens = db.list('solicitacoes').filter((s) => podeVer(req.usuario, s));
  if (minhas) itens = itens.filter((s) => ehDono(req.usuario, s));
  if (D.PROPRIETARIOS.includes(proprietario)) itens = itens.filter((s) => E.prop(s) === proprietario);
  if (status === 'ativas') itens = itens.filter((s) => D.statusAtivo(s.status));
  else if (status === 'novas') itens = itens.filter((s) => D.statusAtivo(s.status) && !s.vistaPorTI);
  else if (status) itens = itens.filter((s) => s.status === status);
  if (tipo) itens = itens.filter((s) => s.tipo === tipo);
  if (departamento) itens = itens.filter((s) => s.departamento === departamento);
  if (q) {
    const t = norm(q);
    itens = itens.filter((s) => [s.numero, s.nomeAdmitido, s.cargo, s.departamento, s.solicitanteNome, s.envio?.codigoRastreio, s.entrega?.cidade, s.emailColaborador].some((v) => norm(v).includes(t)));
  }
  // Ativas primeiro (novas no topo), ordenadas pela admissão mais próxima
  itens = [...itens].sort((a, b) => D.statusAtivo(b.status) - D.statusAtivo(a.status) || (!a.vistaPorTI ? 0 : 1) - (!b.vistaPorTI ? 0 : 1)
    || (D.statusAtivo(a.status) ? a.dataAdmissao.localeCompare(b.dataAdmissao) : b.criadoEm.localeCompare(a.criadoEm)));
  res.json(itens.map((s) => serializar(s, req.usuario)));
});

router.get('/:id', rota((req, res) => res.json(serializar(buscar(req), req.usuario))));

// Equipamentos que podem ser vinculados a uma linha (disponíveis + os já reservados nela) — TI
router.get('/:id/itens/:linha/disponiveis', gerenciar, rota((req, res) => {
  const s = buscar(req);
  const l = (s.itens || []).find((x) => x.id === req.params.linha);
  if (!l || l.tipo !== 'ativo') falha(404, 'Linha não encontrada.');
  res.json(E.equipamentosComSituacao([l.categoria], E.prop(l))
    .filter((i) => i.situacao === 'disponivel' || (l.ativoIds || []).includes(i.ativo.id))
    .map(E.serializarEquipamento)
    .sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR', { numeric: true })));
}));

// ---------- Abertura (Solicitante ou Operador) ----------
router.post('/', exigir('solicitacoes:criar'), rota((req, res) => {
  const { data, errors } = D.validarSolicitacao({ solicitanteNome: req.usuario.nome, ...req.body }, { itensEstoque: db.list('estoqueItens'), dominios: config.dominiosColaborador });
  if (Object.keys(errors).length) invalido(errors);
  const duplicada = db.list('solicitacoes').find((s) => D.statusAtivo(s.status) && norm(s.nomeAdmitido) === norm(data.nomeAdmitido) && s.tipo === data.tipo);
  if (duplicada) falha(409, `Já existe a solicitação ${duplicada.numero} em andamento para ${duplicada.nomeAdmitido}. Acompanhe por ela.`);

  const s = db.transacao(() => {
    const agora = new Date().toISOString();
    const nova = {
      id: crypto.randomUUID(), numero: `SOL-${db.nextSeq('solicitacao')}`, ...data, colaboradorId: C.porEmail(data.emailColaborador)?.id || null,
      itens: data.itens.map((l) => ({ id: crypto.randomUUID(), ...l, ...(l.tipo === 'ativo' ? { ativoIds: [] } : { reservado: 0, enviado: 0 }) })),
      solicitanteId: req.usuario.id, abertoPorId: req.usuario.id, abertoPorNome: req.usuario.nome,
      status: 'Pendente', previsaoEntrega: '', envio: null, rejeitada: false, motivoCancelamento: '',
      // Pedido aberto pela própria TI já nasce "visto"
      vistaPorTI: gerencia(req.usuario) ? { em: agora, por: req.usuario.nome } : null,
      atualizacoes: [], notasInternas: [], criadoEm: agora, atualizadoEm: agora
    };
    registrar(nova, { tipo: 'status', status: 'Pendente', texto: 'Solicitação registrada e enviada para a equipe de TI.' }, req.usuario);
    db.list('solicitacoes').push(nova);
    db.log({ acao: 'solicitou', entidade: 'solicitacao', entidadeId: nova.id, titulo: rotulo(nova), detalhe: `${nova.proprietario} · ${resumoItens(nova)} · admissão ${fmt(nova.dataAdmissao)}`, salvarAgora: false });
    return nova;
  });
  // Notificação em tempo real para os Operadores (alerta sonoro + visual no painel da TI)
  db.emitir('solicitacao:nova', {
    id: s.id, numero: s.numero, nomeAdmitido: s.nomeAdmitido, solicitanteNome: s.solicitanteNome, dataAdmissao: s.dataAdmissao,
    itensResumo: resumoItens(s), modalidade: s.entrega.modalidade, cidade: s.entrega.cidade || s.entrega.unidade, abertoPorId: req.usuario.id
  });
  // E-mail para os Operadores (enviado em segundo plano)
  N.novaSolicitacao(s, req.usuario);
  res.status(201).json(serializar(s, req.usuario));
}));

// Mensagem pública (TI ↔ RH)
router.post('/:id/atualizacoes', rota((req, res) => {
  const s = buscar(req);
  const texto = String(req.body?.texto || '').trim();
  if (!texto) invalido({ texto: 'Escreva uma mensagem.' });
  const desde = qtdAtualizacoes(s);
  db.transacao(() => {
    registrar(s, { texto }, req.usuario);
    db.log({ acao: 'comentou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: texto.slice(0, 120), salvarAgora: false });
  });
  db.emitir('solicitacao:mensagem', { id: s.id, numero: s.numero, solicitanteId: s.solicitanteId, autorPerfil: req.usuario.perfil });
  notificarDesde(s, desde, req.usuario);
  res.status(201).json(serializar(s, req.usuario));
}));

// Cancelamento pelo solicitante (antes da preparação) ou pela TI (antes do envio)
router.post('/:id/cancelar', rota((req, res) => {
  const s = buscar(req);
  if (!D.statusAtivo(s.status)) falha(409, `A solicitação já está ${s.status.toLowerCase()}.`);
  if (s.status === 'Enviado') falha(409, 'O equipamento já foi enviado e não pode mais ser cancelado.');
  if (!gerencia(req.usuario) && !D.RH_PODE_CANCELAR.includes(s.status))
    falha(403, 'Esta solicitação já está em preparação pela TI. Fale com a equipe para cancelar.');
  const motivo = String(req.body?.motivo || '').trim();
  if (motivo.length < 5) invalido({ motivo: 'Explique o motivo do cancelamento.' });
  const desde = qtdAtualizacoes(s);
  db.transacao(() => {
    const liberados = E.liberarTudo(s);
    Object.assign(s, { status: 'Cancelado', motivoCancelamento: motivo, canceladoEm: new Date().toISOString(), vistaPorTI: s.vistaPorTI || { em: new Date().toISOString(), por: 'Cancelamento' } });
    registrar(s, { tipo: 'status', status: 'Cancelado', texto: `Cancelada: ${motivo}` }, req.usuario);
    db.log({ acao: 'cancelou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: liberados.length ? `Reservas liberadas: ${liberados.join(', ')}` : motivo, salvarAgora: false });
  });
  avisarStatus(s);
  notificarDesde(s, desde, req.usuario);
  res.json(serializar(s, req.usuario));
}));

// ---------- Gestão (Operador) ----------

// Marca a solicitação como vista pela TI (tira o destaque de "nova")
router.post('/:id/visto', gerenciar, rota((req, res) => {
  const s = buscar(req);
  if (!s.vistaPorTI) {
    db.transacao(() => { s.vistaPorTI = { em: new Date().toISOString(), por: req.usuario.nome }; });
    db.emitir('solicitacao:vista', { id: s.id });
  }
  res.json(serializar(s, req.usuario));
}));

function aplicarStatus(s, novo, mensagem, usuario, extras = {}) {
  if (!D.STATUS_SOLICITACAO.includes(novo)) invalido({ status: 'Status inválido.' });
  if (novo === s.status) return null;
  if (novo === 'Cancelado') falha(422, 'Use "Rejeitar" ou "Cancelar" informando o motivo.');
  if (!proximos(s).includes(novo)) {
    const msg = novo === 'Enviado' && s.entrega?.modalidade === 'retirada' ? 'Esta solicitação é de retirada na unidade: conclua direto como "Entregue".'
      : novo === 'Entregue' && s.entrega?.modalidade === 'envio' && s.status === 'Em preparação' ? 'Registre o envio (transportadora e data) antes de marcar como entregue.'
        : `Não é possível passar de "${s.status}" para "${novo}". Próximas etapas: ${proximos(s).join(', ') || 'nenhuma'}.`;
    falha(409, msg);
  }
  if (['Em preparação', 'Enviado', 'Entregue'].includes(novo) && !E.pedidoCompleto(s))
    falha(409, `Reserve todos os itens antes de mudar para "${novo}".`);

  const anterior = s.status;
  let detalhe = `Status: ${anterior} → ${novo}`;
  let padrao = `Status alterado para ${novo}.`;
  let acao = 'atualizou';
  if (novo === 'Enviado') {
    const { data: env, errors } = D.validarEnvio({ ...s.envio, ...extras.envio }, { exigir: true });
    if (Object.keys(errors).length) invalido(errors);
    s.envio = { ...s.envio, ...env, entregueEm: '', recebidoPor: '' };
    if (env.previsaoEntrega) s.previsaoEntrega = env.previsaoEntrega;
    s.status = novo; // necessário antes de baixar o estoque (situação "em trânsito")
    E.enviar(s);
    acao = 'enviou';
    detalhe = `${env.transportadora}${env.codigoRastreio ? ` · ${env.codigoRastreio}` : ''}`;
    padrao = `Enviado por ${env.transportadora} em ${fmt(env.dataEnvio)}${env.codigoRastreio ? `. Rastreio: ${env.codigoRastreio}` : ''}${s.previsaoEntrega ? `. Previsão: ${fmt(s.previsaoEntrega)}` : ''}.`;
  }
  if (novo === 'Entregue') {
    const recebidoPor = String(extras.recebidoPor || s.nomeAdmitido).trim().slice(0, 120);
    vincularColaborador(s);
    const entregues = E.entregar(s);
    s.envio = { transportadora: '', codigoRastreio: '', dataEnvio: '', ...s.envio, entregueEm: new Date().toISOString(), recebidoPor };
    acao = 'entregou';
    detalhe = `${entregues.map((a) => a.patrimonio).join(', ') || 'Itens'} entregue(s) · recebido por ${recebidoPor}`;
    padrao = `Equipamentos entregues${s.entrega?.modalidade === 'retirada' ? ' na unidade' : ''}. Recebido por ${recebidoPor}.`;
    for (const a of entregues) db.log({ acao: 'moveu', entidade: 'ativo', entidadeId: a.id, titulo: E.rotuloAtivo(a), detalhe: `Disponível → Em uso (${s.numero} · ${s.nomeAdmitido})`, salvarAgora: false });
  }
  s.status = novo;
  s.vistaPorTI ||= { em: new Date().toISOString(), por: usuario.nome };
  registrar(s, { tipo: 'status', status: novo, texto: mensagem || padrao }, usuario);
  db.log({ acao, entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe, salvarAgora: false });
  return anterior;
}

// Cadastra (ou reaproveita, pelo e-mail) o colaborador que recebe os equipamentos. Nunca impede a entrega.
function vincularColaborador(s) {
  if (s.colaboradorId && db.get('colaboradores', s.colaboradorId)) return db.get('colaboradores', s.colaboradorId);
  if (!s.emailColaborador) return null;
  const r = C.encontrarOuCriar({ nome: s.nomeAdmitido, email: s.emailColaborador, cargo: s.cargo, departamento: s.departamento, empresa: E.prop(s) }, { origem: `solicitação ${s.numero}` });
  if (r.erros) { s.notasInternas ||= []; s.notasInternas.push({ id: crypto.randomUUID(), autor: 'Sistema', texto: `Colaborador não cadastrado automaticamente: ${Object.values(r.erros).join(' ')}`, em: new Date().toISOString() }); return null; }
  s.colaboradorId = r.colaborador.id;
  return r.colaborador;
}

// E-mail corporativo do colaborador: TI a qualquer momento; o solicitante enquanto a solicitação estiver em andamento
router.patch('/:id/colaborador', rota((req, res) => {
  const s = buscar(req);
  const ti = gerencia(req.usuario);
  if (!ti && !(ehDono(req.usuario, s) && D.statusAtivo(s.status))) falha(403, 'Somente a TI pode alterar o colaborador de uma solicitação encerrada.');
  const email = String(req.body?.emailColaborador || '').trim().toLowerCase();
  const erro = D.validarEmailCorporativo(email, { obrigatorio: false, dominios: config.dominiosColaborador });
  if (erro) invalido({ emailColaborador: erro });
  db.transacao(() => {
    const antes = s.emailColaborador || '';
    s.emailColaborador = email;
    s.colaboradorId = C.porEmail(email)?.id || null;
    // Já entregue: cria o cadastro e vincula os equipamentos entregues
    if (s.status === 'Entregue' && email) {
      const c = vincularColaborador(s);
      if (c) for (const l of s.itens || []) for (const id of l.ativoIds || []) { const a = db.get('ativos', id); if (a && a.status === 'Em uso') Object.assign(a, { colaboradorId: c.id, responsavel: c.nome }); }
    }
    s.atualizadoEm = new Date().toISOString();
    db.log({ acao: 'atualizou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: `E-mail do colaborador: ${antes || '—'} → ${email || '—'}`, salvarAgora: false });
  });
  res.json(serializar(s, req.usuario));
}));

// PATCH { status, mensagem, envio?: {transportadora, codigoRastreio, dataEnvio, previsaoEntrega}, recebidoPor? }
router.patch('/:id/status', gerenciar, rota((req, res) => {
  const s = buscar(req);
  const desde = qtdAtualizacoes(s);
  db.transacao(() => aplicarStatus(s, req.body?.status, String(req.body?.mensagem || '').trim(), req.usuario, { envio: req.body?.envio, recebidoPor: req.body?.recebidoPor }));
  const atual = db.get('solicitacoes', s.id);
  avisarStatus(atual);
  notificarDesde(atual, desde, req.usuario);
  res.json(serializar(atual, req.usuario));
}));

router.post('/:id/rejeitar', gerenciar, rota((req, res) => {
  const s = buscar(req);
  if (!D.statusAtivo(s.status)) falha(409, `A solicitação já está ${s.status.toLowerCase()}.`);
  if (s.status === 'Enviado') falha(409, 'O equipamento já foi enviado.');
  const motivo = String(req.body?.motivo || '').trim();
  if (motivo.length < 5) invalido({ motivo: 'Informe o motivo da rejeição (o solicitante verá esta mensagem).' });
  const desde = qtdAtualizacoes(s);
  db.transacao(() => {
    E.liberarTudo(s);
    Object.assign(s, { status: 'Cancelado', rejeitada: true, motivoCancelamento: motivo, canceladoEm: new Date().toISOString(), vistaPorTI: s.vistaPorTI || { em: new Date().toISOString(), por: req.usuario.nome } });
    registrar(s, { tipo: 'status', status: 'Cancelado', texto: `Rejeitada: ${motivo}` }, req.usuario);
    db.log({ acao: 'rejeitou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: motivo, salvarAgora: false });
  });
  avisarStatus(s);
  notificarDesde(s, desde, req.usuario);
  res.json(serializar(s, req.usuario));
}));

// Reserva de uma linha: { ativoIds: [...] } para equipamentos ou { quantidade } para itens por quantidade
router.put('/:id/itens/:linha', gerenciar, rota((req, res) => {
  const s = buscar(req);
  const l = (s.itens || []).find((x) => x.id === req.params.linha);
  if (!l) falha(404, 'Linha da solicitação não encontrada.');
  db.transacao(() => {
    let texto;
    if (l.tipo === 'ativo') {
      const antes = (l.ativoIds || []).length;
      E.alocarAtivos(s, l, Array.isArray(req.body?.ativoIds) ? req.body.ativoIds : []);
      const pats = l.ativoIds.map((id) => db.get('ativos', id)?.patrimonio).filter(Boolean);
      texto = pats.length ? `${l.categoria}: ${pats.join(', ')} reservado(s).` : `Reserva de ${l.categoria.toLowerCase()} liberada.`;
      db.log({ acao: pats.length >= antes ? 'reservou' : 'liberou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: texto, salvarAgora: false });
    } else {
      E.reservarQuantidade(s, l, req.body?.quantidade);
      texto = `${l.nome}: ${l.reservado} de ${l.quantidade} reservado(s).`;
      db.log({ acao: 'reservou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: texto, salvarAgora: false });
    }
    registrar(s, { tipo: 'reserva', texto, publico: false }, req.usuario);
  });
  res.json(serializar(s, req.usuario));
}));

// Reserva tudo o que houver disponível de uma vez
router.post('/:id/reservar-tudo', gerenciar, rota((req, res) => {
  const s = buscar(req);
  const feito = db.transacao(() => {
    const f = E.alocarAutomatico(s);
    if (f.length) {
      registrar(s, { tipo: 'reserva', texto: `Reservado automaticamente: ${f.join(', ')}.`, publico: false }, req.usuario);
      db.log({ acao: 'reservou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: f.join(', '), salvarAgora: false });
    }
    return f;
  });
  res.json({ ...serializar(s, req.usuario), reservadosAgora: feito });
}));

// Dados de envio (transportadora, rastreio, datas) — podem ser preenchidos antes ou depois do envio
router.patch('/:id/envio', gerenciar, rota((req, res) => {
  const s = buscar(req);
  if (!['Em preparação', 'Enviado'].includes(s.status)) falha(409, 'Os dados de envio são registrados na preparação ou após o envio.');
  if (s.entrega?.modalidade === 'retirada') falha(409, 'Esta solicitação é de retirada na unidade.');
  const { data, errors } = D.validarEnvio(req.body, { exigir: s.status === 'Enviado' });
  if (Object.keys(errors).length) invalido(errors);
  const desde = qtdAtualizacoes(s);
  db.transacao(() => {
    const antes = s.envio?.codigoRastreio;
    s.envio = { entregueEm: '', recebidoPor: '', ...s.envio, ...data };
    if (data.previsaoEntrega) s.previsaoEntrega = data.previsaoEntrega;
    if (s.status === 'Enviado') registrar(s, { tipo: 'envio', texto: `Dados de envio atualizados: ${data.transportadora}${data.codigoRastreio ? ` · rastreio ${data.codigoRastreio}` : ''}${data.previsaoEntrega ? ` · previsão ${fmt(data.previsaoEntrega)}` : ''}.` }, req.usuario);
    db.log({ acao: 'atualizou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: `Envio: ${data.transportadora || '—'} ${data.codigoRastreio || ''}${antes && antes !== data.codigoRastreio ? ` (antes ${antes})` : ''}`.trim(), salvarAgora: false });
  });
  notificarDesde(s, desde, req.usuario);
  res.json(serializar(s, req.usuario));
}));

router.patch('/:id/previsao', gerenciar, rota((req, res) => {
  const s = buscar(req);
  if (!D.statusAtivo(s.status)) falha(409, 'Solicitação encerrada.');
  const p = String(req.body?.previsaoEntrega || '');
  if (p && !D.isDate(p)) invalido({ previsaoEntrega: 'Data inválida.' });
  if (p && p < D.hojeISO()) invalido({ previsaoEntrega: 'A previsão não pode estar no passado.' });
  const desde = qtdAtualizacoes(s);
  db.transacao(() => {
    const antes = s.previsaoEntrega;
    s.previsaoEntrega = p;
    registrar(s, { tipo: 'previsao', texto: p ? `Previsão de entrega ${antes ? 'atualizada' : 'definida'}: ${fmt(p)}.` : 'Previsão de entrega removida.' }, req.usuario);
    db.log({ acao: 'atualizou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: `Previsão: ${fmt(antes) || '—'} → ${fmt(p) || '—'}`, salvarAgora: false });
  });
  notificarDesde(s, desde, req.usuario);
  res.json(serializar(s, req.usuario));
}));

// Observações internas — nunca são enviadas ao RH
router.post('/:id/notas', exigir('solicitacoes:notas'), rota((req, res) => {
  const s = buscar(req);
  const texto = String(req.body?.texto || '').trim();
  if (!texto) invalido({ texto: 'Escreva a observação.' });
  db.transacao(() => {
    s.notasInternas ||= [];
    s.notasInternas.push({ id: crypto.randomUUID(), autor: req.usuario.nome, texto: texto.slice(0, 2000), em: new Date().toISOString() });
    s.atualizadoEm = new Date().toISOString();
    db.log({ acao: 'comentou', entidade: 'solicitacao', entidadeId: s.id, titulo: rotulo(s), detalhe: 'Observação interna adicionada', salvarAgora: false });
  });
  res.status(201).json(serializar(s, req.usuario));
}));

module.exports = { router, podeVer };
