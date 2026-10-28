// Testes da plataforma de logística de equipamentos: autenticação, RBAC (Operador x Solicitante),
// fluxo RH → TI com envio e entrega, alerta em tempo real, reservas sem duplicidade, estoque por
// quantidade (entradas/saídas/ajustes), gestão de usuários e migração do banco antigo.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { preparar } = require('./ajuda');

const ctx = preparar();
const { tmpDir, tokens } = ctx;
const db = require('../src/db');
let base;
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const chamar = (...a) => ctx.chamar(...a);
const login = (email, senha, perfil) => ctx.login(email, senha, perfil);
const ids = {};

// Abre o canal em tempo real e coleta os eventos recebidos
async function ouvir(quem) {
  const ctl = new AbortController();
  const r = await fetch(`${base}/stream`, { headers: { Authorization: `Bearer ${tokens[quem]}` }, signal: ctl.signal });
  const eventos = [];
  const leitor = r.body.getReader();
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(bloco)?.[1];
        const data = /^data: (.+)$/m.exec(bloco)?.[1];
        if (ev) eventos.push({ ev, data: data ? JSON.parse(data) : null });
      }
    }
  })().catch(() => {});
  await espera(80);
  const canal = { eventos, fechar: () => ctl.abort() };
  canais.push(canal);
  return canal;
}

before(async () => {
  await ctx.iniciar();
  base = ctx.base;
  // "ti" = Operador administrador inicial; "ti2" = Operador sem permissão administrativa; "rh"/"rh2" = Solicitantes
  await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  tokens.ti = tokens.admin;
  ids.ti2 = (await ctx.criarUsuario('ti2', { nome: 'Paula Operadora', email: 'paula.op@hco.com', perfil: 'ti' })).id;
  ids.rh = (await ctx.criarUsuario('rh', { nome: 'Fernanda Solicitante', email: 'fernanda.rh@hco.com', perfil: 'rh' })).id;
  ids.rh2 = (await ctx.criarUsuario('rh2', { nome: 'Juliana Solicitante', email: 'juliana.rh@hco.com', perfil: 'rh' })).id;
  const me = await chamar('rh', 'GET', '/auth/me');
  assert.ok(!('senhaHash' in me.body) && !('salt' in me.body), 'hash da senha nunca é exposto');
});
const canais = [];
after(() => { canais.forEach((c) => c.fechar()); ctx.encerrar(); });

const catalogo = async () => (await chamar('rh', 'GET', '/solicitacoes/catalogo')).body;
const itemId = async (nome) => (await catalogo()).find((c) => c.nome === nome).itemId;
const enderecoSP = { modalidade: 'envio', cep: '01310-100', logradouro: 'Av. Paulista', numero: '1000', complemento: 'Sala 5', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', telefone: '(11) 98765-4321' };
const retirada = { modalidade: 'retirada', unidade: 'Matriz · recepção da TI' };
const pedido = (extra = {}) => ({
  nomeAdmitido: `Colaborador ${Math.random().toString(36).slice(2, 7)}`, departamento: 'Financeiro', cargo: 'Analista',
  dataAdmissao: dia(10), tipo: 'Nova admissão', observacoes: 'Teste', proprietario: 'H&CO', itens: [{ tipo: 'ativo', categoria: 'Notebook', quantidade: 1 }], entrega: retirada, ...extra
});

// ---------------- Autenticação e perfis ----------------
test('sem login → 401; token inválido → 401', async () => {
  assert.strictEqual((await chamar(null, 'GET', '/solicitacoes')).status, 401);
  tokens.falso = 'abc';
  assert.strictEqual((await chamar('falso', 'GET', '/estoque/resumo')).status, 401);
  assert.strictEqual((await fetch(`${base}/stream`)).status, 401);
});

test('login com senha errada é genérico e bloqueia após 5 tentativas', async () => {
  const r = await login(ctx.admin.email, 'errada');
  assert.strictEqual(r.status, 401);
  assert.strictEqual((await login('ninguem@hco.com', 'x')).body.erro, r.body.erro, 'não revela se o e-mail existe');
  for (let i = 0; i < 5; i++) await login('bloqueio@hco.com', 'errada');
  assert.strictEqual((await login('bloqueio@hco.com', 'x')).status, 429);
});

test('existem apenas dois perfis: Operador (TI) e Solicitante (RH)', async () => {
  const r = await chamar('ti', 'GET', '/usuarios/perfis');
  assert.deepStrictEqual(Object.keys(r.body.perfis).sort(), ['rh', 'ti']);
  assert.match(r.body.perfis.ti.nome, /Operador/);
  assert.match(r.body.perfis.rh.nome, /Solicitante/);
  const admin = await chamar('ti', 'POST', '/usuarios', { nome: 'Fulano Admin', email: 'adm@hco.com', perfil: 'admin' });
  assert.strictEqual(admin.status, 422);
});

test('chamados de suporte não existem mais', async () => {
  assert.strictEqual((await chamar('ti', 'GET', '/chamados')).status, 404);
  assert.ok(!('chamados' in db.snapshot()));
});

// ---------------- RBAC aplicado no servidor ----------------
test('Solicitante não acessa funções administrativas nem altera estoque', async () => {
  const mouse = await itemId('Mouse sem fio');
  const proibidas = [['GET', '/ativos'], ['POST', '/ativos', { patrimonio: 'X' }], ['GET', '/dashboard'], ['GET', '/alertas'], ['GET', '/historico'],
    ['GET', '/usuarios'], ['POST', '/usuarios', {}], ['POST', '/admin/reset'], ['GET', '/estoque/equipamentos'], ['GET', '/estoque/itens'],
    ['POST', '/estoque/itens', { nome: 'X' }], ['POST', `/estoque/itens/${mouse}/movimentar`, { tipo: 'entrada', quantidade: 5 }],
    ['GET', '/estoque/movimentacoes'], ['POST', '/estoque/conferencia', { patrimonios: ['TI-0019'] }]];
  for (const [m, r, b] of proibidas) assert.strictEqual((await chamar('rh', m, r, b)).status, 403, `${m} ${r}`);
  const sol = (await chamar('rh', 'POST', '/solicitacoes', pedido())).body;
  ids.solRh = sol.id;
  for (const [m, r, b] of [['PATCH', `/solicitacoes/${sol.id}/status`, { status: 'Em análise' }], ['POST', `/solicitacoes/${sol.id}/reservar-tudo`],
    ['PUT', `/solicitacoes/${sol.id}/itens/${sol.itens[0].id}`, { ativoIds: [] }], ['PATCH', `/solicitacoes/${sol.id}/envio`, { transportadora: 'Jadlog' }],
    ['POST', `/solicitacoes/${sol.id}/notas`, { texto: 'x' }], ['POST', `/solicitacoes/${sol.id}/visto`]])
    assert.strictEqual((await chamar('rh', m, r, b)).status, 403, `${m} ${r}`);
  assert.ok(db.list('historico').some((h) => h.acao === 'negado' && h.perfil === 'rh'), 'tentativas negadas vão para a auditoria');
});

test('Solicitante vê estoque resumido (sem patrimônio, série ou reservas)', async () => {
  const r = await chamar('rh', 'GET', '/estoque/resumo');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.catalogo.length > 4 && r.body.catalogo.every((c) => !('reservado' in c)));
  assert.ok(!('equipamentos' in r.body) && !JSON.stringify(r.body).includes('TI-00'));
});

test('Solicitante vê só as próprias solicitações; as de outros retornam 404', async () => {
  await chamar('rh2', 'POST', '/solicitacoes', pedido());
  const deJuliana = (await chamar('rh2', 'GET', '/solicitacoes')).body;
  assert.ok(deJuliana.length > 0 && deJuliana.every((s) => s.solicitanteId === ids.rh2));
  assert.strictEqual((await chamar('rh2', 'GET', `/solicitacoes/${ids.solRh}`)).status, 404);
  assert.ok((await chamar('rh', 'GET', '/solicitacoes')).body.every((s) => s.solicitanteId === ids.rh));
  assert.ok((await chamar('ti2', 'GET', '/solicitacoes')).body.length > deJuliana.length, 'Operador vê todas');
});

test('observações internas e patrimônios não chegam ao Solicitante', async () => {
  const s = { id: ids.solRh };
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/notas`, { texto: 'Instalar VPN do cliente' });
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/reservar-tudo`);
  const rh = (await chamar('rh', 'GET', `/solicitacoes/${s.id}`)).body;
  assert.ok(rh.itens[0].equipamentos.length === 1, 'RH vê que há equipamento reservado');
  assert.ok(!('notasInternas' in rh) && !JSON.stringify(rh.itens).includes('TI-00'));
  assert.ok((await chamar('ti', 'GET', `/solicitacoes/${s.id}`)).body.notasInternas.length > 0);
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' }); // devolve o notebook
});

// ---------------- Abertura e validação ----------------
test('validação: itens, endereço de entrega, data e substituição', async () => {
  const r = await chamar('rh', 'POST', '/solicitacoes', { tipo: 'Substituição de equipamento', dataAdmissao: dia(-2), itens: [], entrega: { modalidade: 'envio', cep: '123', uf: 'XX' } });
  assert.strictEqual(r.status, 422);
  for (const c of ['nomeAdmitido', 'departamento', 'cargo', 'dataAdmissao', 'equipamentoAtual', 'itens', 'entrega.cep', 'entrega.logradouro', 'entrega.numero', 'entrega.cidade', 'entrega.uf'])
    assert.ok(r.body.campos[c], c);
  const semUnidade = await chamar('rh', 'POST', '/solicitacoes', pedido({ entrega: { modalidade: 'retirada' } }));
  assert.ok(semUnidade.body.campos['entrega.unidade']);
  const qtd = await chamar('rh', 'POST', '/solicitacoes', pedido({ itens: [{ tipo: 'ativo', categoria: 'Notebook', quantidade: 9 }] }));
  assert.ok(qtd.body.campos.itens);
});

test('impede duas solicitações ativas para o mesmo colaborador', async () => {
  const dados = pedido({ nomeAdmitido: 'Ana Duplicada' });
  assert.strictEqual((await chamar('rh', 'POST', '/solicitacoes', dados)).status, 201);
  assert.strictEqual((await chamar('rh2', 'POST', '/solicitacoes', { ...dados, nomeAdmitido: 'ana duplicada ' })).status, 409);
});

// ---------------- Fluxo completo com envio por transportadora ----------------
test('fluxo completo: RH pede → TI é alertada → reserva → prepara → envia → entrega', async () => {
  const canalTI = await ouvir('ti');
  const canalRH = await ouvir('rh');
  const mouse = await itemId('Mouse sem fio');
  const estoqueAntes = (await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === mouse);
  const resumoAntes = (await chamar('rh', 'GET', '/estoque/resumo')).body;

  // 1) RH abre: número automático, itens e endereço
  const aberta = await chamar('rh', 'POST', '/solicitacoes', pedido({
    nomeAdmitido: 'Gabriel Teste', entrega: enderecoSP,
    itens: [{ tipo: 'ativo', categoria: 'Notebook', quantidade: 1, especificacao: '16 GB' }, { tipo: 'acessorio', itemId: mouse, quantidade: 2 }]
  }));
  assert.strictEqual(aberta.status, 201);
  assert.match(aberta.body.numero, /^SOL-\d+$/);
  assert.strictEqual(aberta.body.status, 'Pendente');
  assert.strictEqual(aberta.body.entrega.cep, '01310100');
  assert.strictEqual(aberta.body.entrega.destinatario, 'Gabriel Teste');
  const id = aberta.body.id;

  // 2) Operador recebe o alerta em tempo real; o RH não recebe o alerta de "nova"
  await espera(150);
  const alerta = canalTI.eventos.find((e) => e.ev === 'solicitacao:nova');
  assert.ok(alerta, 'TI recebeu o evento de nova solicitação');
  assert.strictEqual(alerta.data.numero, aberta.body.numero);
  assert.match(alerta.data.itensResumo, /Notebook \+ Mouse sem fio ×2/);
  assert.ok(!canalRH.eventos.some((e) => e.ev === 'solicitacao:nova'));
  assert.ok(canalRH.eventos.some((e) => e.ev === 'rev'), 'todos recebem a revisão para atualizar as telas');

  // 3) Aparece na fila como nova; contador de pendentes aumenta; abrir marca como vista
  const novas = (await chamar('ti', 'GET', '/solicitacoes?status=novas')).body;
  assert.ok(novas.some((s) => s.id === id && s.nova));
  const dash = (await chamar('ti', 'GET', '/dashboard')).body;
  assert.ok(dash.kpis.solicitacoesNovas >= 1 && dash.novasSolicitacoes.some((s) => s.id === id && s.nova));
  assert.strictEqual((await chamar('ti2', 'POST', `/solicitacoes/${id}/visto`)).body.nova, false);
  assert.ok(!(await chamar('ti', 'GET', '/solicitacoes?status=novas')).body.some((s) => s.id === id));

  // 4) Análise; "Em preparação" exige todos os itens reservados
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Entregue' })).status, 409);
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Em análise' })).status, 200);
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Em preparação' })).status, 409);

  // 5) Reserva tudo de uma vez; estoque do RH reflete na hora
  const res = (await chamar('ti', 'POST', `/solicitacoes/${id}/reservar-tudo`)).body;
  assert.strictEqual(res.progressoReserva.completo, true);
  const nb = res.itens[0].equipamentos[0];
  let resumo = (await chamar('rh', 'GET', '/estoque/resumo')).body;
  assert.strictEqual(resumo.disponivel, resumoAntes.disponivel - 1);
  assert.strictEqual(resumo.catalogo.find((c) => c.itemId === mouse).disponivel, resumoAntes.catalogo.find((c) => c.itemId === mouse).disponivel - 2);

  // 6) Preparação; status mudou → evento para o RH dono
  await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Em preparação' });
  await espera(100);
  assert.ok(canalRH.eventos.some((e) => e.ev === 'solicitacao:status' && e.data.status === 'Em preparação'));
  assert.strictEqual((await chamar('rh', 'POST', `/solicitacoes/${id}/cancelar`, { motivo: 'Desistência do candidato' })).status, 403);
  // Envio direto para "Entregue" é bloqueado (precisa registrar o envio)
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Entregue' })).status, 409);

  // 7) Enviar exige transportadora e data
  const semDados = await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Enviado' });
  assert.strictEqual(semDados.status, 422);
  assert.ok(semDados.body.campos.transportadora && semDados.body.campos.dataEnvio);
  const enviada = await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Enviado', envio: { transportadora: 'Jadlog', codigoRastreio: 'jd 1234 5678', dataEnvio: dia(0), previsaoEntrega: dia(2) } });
  assert.strictEqual(enviada.status, 200, JSON.stringify(enviada.body));
  assert.strictEqual(enviada.body.envio.codigoRastreio, 'JD12345678');
  assert.strictEqual(enviada.body.previsaoEntrega, dia(2));

  // 8) Notebook em trânsito; mouses saíram do estoque físico (quantidade −2, reservado de volta)
  resumo = (await chamar('ti', 'GET', '/estoque/resumo')).body;
  assert.ok(resumo.equipamentos.find((e) => e.id === nb.id).situacao === 'transito');
  const estoqueDepois = (await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === mouse);
  assert.strictEqual(estoqueDepois.quantidade, estoqueAntes.quantidade - 2);
  assert.strictEqual(estoqueDepois.reservado, estoqueAntes.reservado);
  assert.strictEqual((await chamar('ti', 'POST', `/solicitacoes/${id}/rejeitar`, { motivo: 'tarde demais' })).status, 409, 'não cancela depois de enviado');

  // 9) RH acompanha o rastreio
  const vistaRH = (await chamar('rh', 'GET', `/solicitacoes/${id}`)).body;
  assert.strictEqual(vistaRH.envio.transportadora, 'Jadlog');
  assert.strictEqual(vistaRH.envio.codigoRastreio, 'JD12345678');

  // 10) Entrega: notebook vira "Em uso" com o colaborador
  const entregue = await chamar('ti', 'PATCH', `/solicitacoes/${id}/status`, { status: 'Entregue', recebidoPor: 'Portaria do prédio' });
  assert.strictEqual(entregue.body.status, 'Entregue');
  assert.strictEqual(entregue.body.envio.recebidoPor, 'Portaria do prédio');
  const ativo = (await chamar('ti', 'GET', `/ativos/${nb.id}`)).body;
  assert.strictEqual(ativo.status, 'Em uso');
  assert.strictEqual(ativo.responsavel, 'Gabriel Teste');
  assert.strictEqual(ativo.localizacao, 'São Paulo/SP');

  // 11) Linha do tempo e movimentações completas
  const final = (await chamar('rh', 'GET', `/solicitacoes/${id}`)).body;
  assert.deepStrictEqual(final.atualizacoes.filter((a) => a.tipo === 'status').map((a) => a.status), ['Pendente', 'Em análise', 'Em preparação', 'Enviado', 'Entregue']);
  const movs = (await chamar('ti', 'GET', `/estoque/movimentacoes?solicitacaoId=${id}`)).body.map((m) => m.tipo);
  for (const t of ['reserva', 'envio', 'entrega']) assert.ok(movs.includes(t), `movimentação ${t}`);
  canalTI.fechar(); canalRH.fechar();
});

test('retirada na unidade: pula "Enviado" e baixa os acessórios na entrega', async () => {
  const teclado = await itemId('Teclado sem fio ABNT2');
  const antes = (await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === teclado).quantidade;
  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido({ itens: [{ tipo: 'acessorio', itemId: teclado, quantidade: 1 }] }))).body;
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/reservar-tudo`);
  await chamar('ti', 'PATCH', `/solicitacoes/${s.id}/status`, { status: 'Em preparação' });
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${s.id}/status`, { status: 'Enviado', envio: { transportadora: 'Jadlog', dataEnvio: dia(0) } })).status, 409);
  assert.strictEqual((await chamar('ti', 'PATCH', `/solicitacoes/${s.id}/status`, { status: 'Entregue' })).status, 200);
  assert.strictEqual((await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === teclado).quantidade, antes - 1);
});

// ---------------- Reservas sem duplicidade ----------------
test('um equipamento não pode ser reservado para duas admissões', async () => {
  const a = (await chamar('rh', 'POST', '/solicitacoes', pedido())).body;
  const b = (await chamar('rh', 'POST', '/solicitacoes', pedido())).body;
  const nb = (await chamar('ti', 'GET', `/solicitacoes/${a.id}/itens/${a.itens[0].id}/disponiveis`)).body[0];
  assert.strictEqual((await chamar('ti', 'PUT', `/solicitacoes/${a.id}/itens/${a.itens[0].id}`, { ativoIds: [nb.id] })).status, 200);
  const conflito = await chamar('ti', 'PUT', `/solicitacoes/${b.id}/itens/${b.itens[0].id}`, { ativoIds: [nb.id] });
  assert.strictEqual(conflito.status, 409);
  assert.match(conflito.body.erro, /já está reservado/);
  // Cancelar libera o equipamento para a outra admissão
  assert.strictEqual((await chamar('rh', 'POST', `/solicitacoes/${a.id}/cancelar`, { motivo: 'Vaga cancelada' })).status, 200);
  assert.strictEqual((await chamar('ti', 'PUT', `/solicitacoes/${b.id}/itens/${b.itens[0].id}`, { ativoIds: [nb.id] })).status, 200);
  await chamar('ti', 'POST', `/solicitacoes/${b.id}/rejeitar`, { motivo: 'Limpeza do teste' });
});

test('reservas simultâneas do mesmo notebook: apenas uma vence', async () => {
  const sols = [];
  for (let i = 0; i < 5; i++) sols.push((await chamar('rh', 'POST', '/solicitacoes', pedido())).body);
  const nb = (await chamar('ti', 'GET', `/solicitacoes/${sols[0].id}/itens/${sols[0].itens[0].id}/disponiveis`)).body[0];
  const respostas = await Promise.all(sols.map((s) => chamar('ti', 'PUT', `/solicitacoes/${s.id}/itens/${s.itens[0].id}`, { ativoIds: [nb.id] })));
  assert.strictEqual(respostas.filter((r) => r.status === 200).length, 1);
  assert.strictEqual(respostas.filter((r) => r.status === 409).length, 4);
  for (const s of sols) await chamar('ti', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' });
});

test('acessórios: nunca reserva mais do que o estoque, mesmo em paralelo', async () => {
  const dock = await itemId('Dock station USB-C');
  const disp = (await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === dock).disponivel;
  const sols = [];
  for (let i = 0; i < disp + 2; i++) sols.push((await chamar('rh', 'POST', '/solicitacoes', pedido({ itens: [{ tipo: 'acessorio', itemId: dock, quantidade: 1 }] }))).body);
  const r = await Promise.all(sols.map((s) => chamar('ti', 'PUT', `/solicitacoes/${s.id}/itens/${s.itens[0].id}`, { quantidade: 1 })));
  assert.strictEqual(r.filter((x) => x.status === 200).length, disp);
  assert.ok(r.filter((x) => x.status === 409).every((x) => /Estoque insuficiente/.test(x.body.erro)));
  assert.strictEqual((await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === dock).disponivel, 0);
  for (const s of sols) await chamar('ti', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' });
  assert.strictEqual((await chamar('ti', 'GET', '/estoque/itens')).body.find((i) => i.id === dock).disponivel, disp, 'rejeitar devolve as reservas');
});

test('não reserva equipamento em manutenção, em uso ou de outra categoria', async () => {
  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido())).body;
  const ativos = (await chamar('ti', 'GET', '/ativos')).body;
  const rota = `/solicitacoes/${s.id}/itens/${s.itens[0].id}`;
  assert.strictEqual((await chamar('ti', 'PUT', rota, { ativoIds: [ativos.find((a) => a.categoria === 'Notebook' && a.status === 'Em manutenção').id] })).status, 409);
  assert.strictEqual((await chamar('ti', 'PUT', rota, { ativoIds: [ativos.find((a) => a.categoria === 'Notebook' && a.status === 'Em uso').id] })).status, 409);
  assert.strictEqual((await chamar('ti', 'PUT', rota, { ativoIds: [ativos.find((a) => a.categoria === 'Monitor').id] })).status, 422);
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' });
});

test('equipamento reservado não muda de status nem é excluído por fora do fluxo', async () => {
  const reservado = (await chamar('ti', 'GET', '/ativos')).body.find((a) => a.reserva);
  assert.ok(reservado);
  assert.strictEqual((await chamar('ti', 'PATCH', `/ativos/${reservado.id}/status`, { status: 'Em uso', responsavel: 'Outra pessoa' })).status, 409);
  assert.strictEqual((await chamar('ti', 'DELETE', `/ativos/${reservado.id}`)).status, 409);
});

// ---------------- Estoque por quantidade: entradas, saídas e ajustes ----------------
test('Operador cadastra item e registra entradas, saídas e ajustes', async () => {
  const novo = await chamar('ti', 'POST', '/estoque/itens', { nome: 'Webcam Full HD', categoria: 'Periférico', quantidade: 5, minimo: 2, proprietario: 'H&CO' });
  assert.strictEqual(novo.status, 201);
  const id = novo.body.id;
  assert.ok((await catalogo()).some((c) => c.itemId === id && c.disponivel === 5), 'aparece no catálogo do RH');
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'entrada', quantidade: 10, motivo: 'NF 1234' })).body.item.quantidade, 15);
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'saida', quantidade: 3 })).status, 422, 'saída exige motivo');
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'saida', quantidade: 3, motivo: 'Defeito' })).body.item.quantidade, 12);
  // Reserva 2 para um pedido: saída maior que o livre e ajuste abaixo do reservado são recusados
  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido({ itens: [{ tipo: 'acessorio', itemId: id, quantidade: 2 }] }))).body;
  await chamar('ti', 'PUT', `/solicitacoes/${s.id}/itens/${s.itens[0].id}`, { quantidade: 2 });
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'saida', quantidade: 11, motivo: 'Perda' })).status, 409);
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'ajuste', quantidade: 1, motivo: 'Inventário' })).status, 409);
  assert.strictEqual((await chamar('ti', 'POST', `/estoque/itens/${id}/movimentar`, { tipo: 'ajuste', quantidade: 8, motivo: 'Inventário' })).body.item.disponivel, 6);
  const movs = (await chamar('ti', 'GET', `/estoque/movimentacoes?itemId=${id}`)).body.map((m) => m.tipo);
  for (const t of ['entrada', 'saida', 'ajuste', 'reserva']) assert.ok(movs.includes(t), t);
  await chamar('ti', 'POST', `/solicitacoes/${s.id}/rejeitar`, { motivo: 'Limpeza do teste' });
});

test('novo notebook cadastrado aparece no estoque do RH e gera movimentação de entrada', async () => {
  const antes = (await chamar('rh', 'GET', '/estoque/resumo')).body;
  const r = await chamar('ti', 'POST', '/ativos', { patrimonio: 'TI-9001', nome: 'Notebook Teste', categoria: 'Notebook', marca: 'Dell', modelo: 'Vostro 3530', status: 'Disponível', proprietario: 'H&CO' });
  assert.strictEqual(r.status, 201);
  const depois = (await chamar('rh', 'GET', '/estoque/resumo')).body;
  assert.strictEqual(depois.disponivel, antes.disponivel + 1);
  assert.ok((await chamar('ti', 'GET', `/estoque/movimentacoes?ativoId=${r.body.id}`)).body.some((m) => m.tipo === 'entrada'));
});

// ---------------- Gestão de usuários pelo Operador ----------------
test('Operador administrador cria, edita, desativa e reativa usuários', async () => {
  const fraca = await chamar('ti', 'POST', '/usuarios', { nome: 'Novo RH', email: 'novo@hco.com', perfil: 'rh', acesso: 'definir', senha: '123' });
  assert.strictEqual(fraca.status, 422);
  const r = await chamar('ti', 'POST', '/usuarios', { nome: 'Novo RH', email: 'novo@hco.com', perfil: 'rh', acesso: 'gerar' });
  assert.strictEqual(r.status, 201);
  await ctx.entrar('novo', 'novo@hco.com', r.body.senhaTemporaria, 'rh');
  assert.strictEqual((await chamar('ti', 'PUT', `/usuarios/${r.body.id}`, { ...r.body, nome: 'Novo RH Editado', departamento: 'Pessoas' })).body.nome, 'Novo RH Editado');
  // Desativar encerra a sessão e bloqueia o login
  assert.strictEqual((await chamar('ti', 'PATCH', `/usuarios/${r.body.id}/ativo`, { ativo: false })).body.ativo, false);
  assert.strictEqual((await chamar('novo', 'GET', '/estoque/resumo')).status, 401);
  assert.strictEqual((await login('novo@hco.com', ctx.senhas.novo, 'rh')).status, 403);
  await chamar('ti', 'PATCH', `/usuarios/${r.body.id}/ativo`, { ativo: true });
  assert.strictEqual((await login('novo@hco.com', ctx.senhas.novo, 'rh')).status, 200);
  // O administrador não remove o próprio acesso
  const eu = (await chamar('ti', 'GET', '/auth/me')).body;
  assert.strictEqual((await chamar('ti', 'PATCH', `/usuarios/${eu.id}/ativo`, { ativo: false })).status, 409);
  assert.strictEqual((await chamar('ti', 'PUT', `/usuarios/${eu.id}`, { ...eu, perfil: 'rh' })).status, 409);
  assert.strictEqual((await chamar('ti', 'PUT', `/usuarios/${eu.id}`, { ...eu, admin: false })).status, 409);
});

test('logout invalida o token', async () => {
  tokens.temp = (await login('fernanda.rh@hco.com', ctx.senhas.rh, 'rh')).body.token;
  assert.strictEqual((await chamar('temp', 'POST', '/auth/logout')).status, 204);
  assert.strictEqual((await chamar('temp', 'GET', '/auth/me')).status, 401);
});

// ---------------- Migração do banco da versão anterior ----------------
test('migração: banco antigo perde os chamados e ganha itens, entrega e perfis novos', () => {
  const arquivo = path.join(tmpDir, 'v3.json');
  const antigo = {
    rev: 10, ativos: [{ id: 'a1', patrimonio: 'TI-1', nome: 'Notebook X', categoria: 'Notebook', status: 'Disponível', reservadoPara: 's1', tags: [], valor: 0 }],
    chamados: [{ id: 'c1', titulo: 'Impressora quebrada' }], eventos: [],
    historico: [{ id: 'h1', entidade: 'chamado', acao: 'criou' }, { id: 'h2', entidade: 'ativo', acao: 'criou' }],
    usuarios: [{ id: 'u1', nome: 'Admin', email: 'a@a.com', perfil: 'admin', ativo: true, escopo: 'todas' }, { id: 'u2', nome: 'RH', email: 'r@a.com', perfil: 'rh', ativo: true }],
    sessoes: [], conferencias: [],
    solicitacoes: [{ id: 's1', numero: 'SOL-1001', status: 'Aprovado', ativoId: 'a1', nomeAdmitido: 'Fulano', localidade: 'Filial Campinas', atualizacoes: [{ status: 'Aberto' }], criadoEm: new Date().toISOString() }],
    seq: { chamado: 1005, solicitacao: 1001 }
  };
  fs.writeFileSync(arquivo, JSON.stringify(antigo));
  const saida = execFileSync(process.execPath, ['-e', `
    const db = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'db.js'))});
    const E = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'estoque.js'))});
    const s = db.list('solicitacoes')[0];
    console.log(JSON.stringify({ temChamados: 'chamados' in db.snapshot(), historico: db.list('historico').filter((h) => h.entidade !== 'sistema').length, proprietario: db.list('ativos')[0].proprietario, linha: s.itens[0].proprietario, perfis: db.list('usuarios').map((u) => u.perfil),
      status: s.status, itens: s.itens, entrega: s.entrega.unidade, estoqueItens: db.list('estoqueItens').length, problemas: E.verificarConsistencia() }));
  `], { env: { ...process.env, DATA_FILE: arquivo } }).toString();
  const r = JSON.parse(saida);
  assert.strictEqual(r.temChamados, false);
  assert.strictEqual(r.historico, 1);
  assert.strictEqual(r.proprietario, 'H&CO', 'v6: equipamentos antigos recebem o proprietário padrão');
  assert.strictEqual(r.linha, 'H&CO');
  assert.deepStrictEqual(r.perfis, ['ti', 'rh']);
  assert.strictEqual(r.status, 'Em análise');
  assert.deepStrictEqual(r.itens[0].ativoIds, ['a1']);
  assert.strictEqual(r.entrega, 'Filial Campinas');
  assert.ok(r.estoqueItens > 0);
  assert.deepStrictEqual(r.problemas, []);
});

test('integridade final: nenhuma divergência entre reservas e estoque', async () => {
  assert.deepStrictEqual((await chamar('ti', 'GET', '/estoque/consistencia')).body.problemas, []);
});
