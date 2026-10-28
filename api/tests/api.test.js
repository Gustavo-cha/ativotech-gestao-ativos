// Testes de integração da API (node --test). Usam um banco temporário, sem tocar nos seus dados.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { preparar } = require('./ajuda');

const ctx = preparar();
let base;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = async (p) => (await fetch(base + p)).json();

before(async () => {
  await ctx.iniciar();
  base = ctx.base;
  // Todas as rotas exigem login: estes testes rodam como o Operador administrador inicial
  const token = await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  const original = globalThis.fetch;
  globalThis.fetch = (url, o = {}) => original(url, { ...o, headers: { ...(o.headers || {}), Authorization: `Bearer ${token}` } });
});
after(() => ctx.encerrar());

const novo = { patrimonio: 'TI-9999', nome: 'Notebook de teste', categoria: 'Notebook', status: 'Disponível', proprietario: 'H&CO',
  valor: '1234.567', dataAquisicao: '2025-01-01', garantiaAte: '2027-01-01', tags: 'Teste, Teste, QA' };

test('lista ativos com campos calculados', async () => {
  const lista = await get('/ativos');
  assert.ok(lista.length >= 24);
  assert.ok('valorAtual' in lista[0] && 'garantiaStatus' in lista[0]);
});

test('filtros: busca sem acento, status e garantia', async () => {
  assert.ok((await get('/ativos?q=manutencao')).length >= 0);
  const m = await get(`/ativos?status=${encodeURIComponent('Em manutenção')}`);
  assert.ok(m.length > 0 && m.every((a) => a.status === 'Em manutenção'));
  const v = await get('/ativos?garantia=vencida');
  assert.ok(v.every((a) => a.garantiaStatus === 'vencida'));
});

test('CRUD de ativo + histórico', async () => {
  const res = await fetch(`${base}/ativos`, json('POST', novo));
  assert.strictEqual(res.status, 201);
  const a = await res.json();
  assert.strictEqual(a.valor, 1234.57);
  assert.deepStrictEqual(a.tags, ['Teste', 'QA']);

  const put = await fetch(`${base}/ativos/${a.id}`, json('PUT', { ...novo, status: 'Em uso', responsavel: 'Fulano' }));
  assert.strictEqual(put.status, 200);
  const hist = await get(`/historico?entidadeId=${a.id}`);
  assert.ok(hist.some((h) => h.detalhe.includes('Disponível → Em uso')));

  assert.strictEqual((await fetch(`${base}/ativos/${a.id}`, { method: 'DELETE' })).status, 204);
  assert.strictEqual((await fetch(`${base}/ativos/${a.id}`)).status, 404);
});

test('validação retorna 422 com campos', async () => {
  const res = await fetch(`${base}/ativos`, json('POST', { patrimonio: 'TI-0001', nome: '', categoria: 'X', status: 'Em uso', valor: -5, ip: '999' }));
  assert.strictEqual(res.status, 422);
  const { campos } = await res.json();
  for (const c of ['patrimonio', 'nome', 'categoria', 'responsavel', 'valor', 'ip']) assert.ok(campos[c], `esperava erro em ${c}`);
});

test('kanban: PATCH de status exige responsável para "Em uso"', async () => {
  const disp = (await get(`/ativos?status=${encodeURIComponent('Disponível')}`))[0];
  const r1 = await fetch(`${base}/ativos/${disp.id}/status`, json('PATCH', { status: 'Em uso' }));
  assert.strictEqual(r1.status, 422);
  const r2 = await fetch(`${base}/ativos/${disp.id}/status`, json('PATCH', { status: 'Em uso', responsavel: 'Joana' }));
  assert.strictEqual((await r2.json()).responsavel, 'Joana');
});

test('ações em lote e exportação CSV', async () => {
  const ids = (await get('/ativos?categoria=Monitor')).map((a) => a.id);
  const r = await (await fetch(`${base}/ativos/lote`, json('POST', { ids, acao: 'status', status: 'Em manutenção' }))).json();
  assert.ok(r.alterados >= 1);
  const csv = await (await fetch(`${base}/ativos/export.csv`)).text();
  assert.ok(csv.includes('Patrimônio;Nome') && csv.includes('TI-0001'));
});

test('chamados de suporte foram removidos da API', async () => {
  assert.strictEqual((await fetch(`${base}/chamados`)).status, 404);
});

test('agenda: cria evento e conclui', async () => {
  const res = await fetch(`${base}/eventos`, json('POST', { titulo: 'Troca de toner', tipo: 'Manutenção', data: '2030-05-10', hora: '09:30' }));
  assert.strictEqual(res.status, 201);
  const e = await res.json();
  const ok = await (await fetch(`${base}/eventos/${e.id}`, json('PUT', { concluido: true }))).json();
  assert.strictEqual(ok.concluido, true);
  assert.strictEqual((await fetch(`${base}/eventos`, json('POST', { titulo: 'x', tipo: 'x', data: 'ontem' }))).status, 422);
});

test('painel, alertas e busca global', async () => {
  const d = await get('/dashboard');
  assert.ok(d.kpis.totalAtivos > 0 && d.kpis.valorAtual <= d.kpis.valorAquisicao);
  assert.strictEqual(d.serieSolicitacoes.length, 14);
  assert.ok(!('chamadosAbertos' in d.kpis));
  const alertas = await get('/alertas');
  assert.ok(alertas.some((a) => a.tipo === 'Garantia'));
  const busca = await get('/busca?q=dell');
  assert.ok(busca.some((b) => b.tipo === 'ativo'));
});
