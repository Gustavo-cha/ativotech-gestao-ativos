// Acesso de vários computadores: a API é servida pelo mesmo endereço do site (/api), sem CORS aberto,
// e a mesma conta entra de "aparelhos" diferentes, todos vendo os mesmos dados (um único banco no servidor).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { preparar } = require('./ajuda');

const ctx = preparar();
const { chamar } = ctx;

before(async () => {
  await ctx.iniciar();
  await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  await ctx.criarUsuario('rh', { nome: 'Rita RH', email: 'rita.rede@hco.com', perfil: 'rh' });
});
after(() => ctx.encerrar());

test('sem CORS_ORIGIN, a API não libera chamadas de outros sites pelo navegador', async () => {
  const r = await fetch(`${ctx.base}/health`, { headers: { Origin: 'https://site-qualquer.example' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
});

test('a mesma conta entra em dois aparelhos ao mesmo tempo e ambos veem os mesmos dados', async () => {
  const c = ctx.admin;
  const login = (ua) => fetch(`${ctx.base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua, 'X-Forwarded-For': '192.168.0.50' },
    body: JSON.stringify({ email: c.email.toUpperCase(), senha: ctx.senhas.admin, prefixo: 'H&CO', perfil: 'ti' }) }).then(async (x) => ({ s: x.status, b: await x.json() }));
  const pc = await login('Mozilla/5.0 (Windows NT 10.0) PC');
  const note = await login('Mozilla/5.0 (Windows NT 10.0) Notebook Edge');
  assert.strictEqual(pc.s, 200, JSON.stringify(pc.b));
  assert.strictEqual(note.s, 200, JSON.stringify(note.b));
  assert.notStrictEqual(pc.b.token, note.b.token);
  const criado = await fetch(`${ctx.base}/ativos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pc.b.token}` },
    body: JSON.stringify({ patrimonio: 'REDE-001', nome: 'Notebook rede', categoria: 'Notebook', status: 'Disponível', proprietario: 'H&CO' }) });
  assert.strictEqual(criado.status, 201);
  const visto = await fetch(`${ctx.base}/ativos?busca=REDE-001`, { headers: { Authorization: `Bearer ${note.b.token}` } }).then((x) => x.json());
  const lista = Array.isArray(visto) ? visto : visto.itens || visto.dados || [];
  assert.ok(JSON.stringify(lista).includes('REDE-001'), 'o notebook vê o que o PC cadastrou');
  // Sair em um aparelho não derruba o outro
  await fetch(`${ctx.base}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${pc.b.token}` } });
  const ainda = await fetch(`${ctx.base}/auth/me`, { headers: { Authorization: `Bearer ${note.b.token}` } });
  assert.strictEqual(ainda.status, 200);
});

test('endereço de acesso: só administradores consultam; mostra o endereço configurado e os da rede', async () => {
  const rh = await chamar('rh', 'GET', '/sistema/acesso');
  assert.strictEqual(rh.status, 403);
  const r = await chamar('admin', 'GET', '/sistema/acesso');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.appUrl);
  assert.strictEqual(typeof r.body.appUrlLocal, 'boolean');
  assert.ok(Array.isArray(r.body.rede));
  assert.ok(r.body.microsoftRedirectUri.endsWith('/api/auth/microsoft/callback'));
  assert.ok(r.body.microsoftRedirectUri.startsWith(r.body.appUrl), 'o retorno da Microsoft passa pelo endereço do site');
});
