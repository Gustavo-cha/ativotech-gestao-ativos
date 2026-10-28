// Login com Microsoft (OpenID Connect) contra um provedor local que emite id_tokens RS256 de verdade.
// Confere PKCE, state, nonce, assinatura, emissor, audiência e — principalmente — que autenticar na Microsoft
// não basta: o usuário precisa existir no Ativos Tech, estar ativo, licenciado e no portal certo.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const { preparar } = require('./ajuda');

const TID = '11111111-2222-3333-4444-555555555555';
const CID = 'cliente-ativostech';
const chaveBoa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const chaveRuim = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...chaveBoa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };
let provedor;
let authority;
// O que o provedor falso vai emitir no próximo token
const proximo = { email: '', oid: '', chave: chaveBoa.privateKey, nonce: null, tid: TID };
const recebidoNoToken = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(claims, chave) {
  const h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const p = b64(claims);
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), chave).toString('base64url')}`;
}

const ctx = preparar({ MS_TENANT_ID: TID, MS_CLIENT_ID: CID, MS_CLIENT_SECRET: 'segredo-de-teste', API_PUBLIC_URL: 'http://api.teste' });
const chamar = (...a) => ctx.chamar(...a);
let autorizacao = null; // parâmetros da última URL de autorização

before(async () => {
  provedor = http.createServer((req, res) => {
    if (req.url === `/${TID}/discovery/v2.0/keys`) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (req.url === `/${TID}/oauth2/v2.0/token` && req.method === 'POST') {
      let corpo = '';
      req.on('data', (c) => { corpo += c; });
      return req.on('end', () => {
        const f = new URLSearchParams(corpo);
        recebidoNoToken.push(Object.fromEntries(f));
        const pkceOk = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') === autorizacao.get('code_challenge');
        res.setHeader('Content-Type', 'application/json');
        if (f.get('code') !== 'codigo-ok' || f.get('client_secret') !== 'segredo-de-teste' || !pkceOk) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid_grant' })); }
        const agora = Math.floor(Date.now() / 1000);
        const idToken = assinar({ aud: CID, iss: `${authority}/${proximo.tid}/v2.0`, tid: proximo.tid, oid: proximo.oid, preferred_username: proximo.email, name: 'Pessoa', nonce: proximo.nonce ?? autorizacao.get('nonce'), iat: agora, nbf: agora, exp: agora + 3600 }, proximo.chave);
        return res.end(JSON.stringify({ id_token: idToken, token_type: 'Bearer' }));
      });
    }
    res.statusCode = 404;
    return res.end();
  });
  await new Promise((r) => provedor.listen(0, '127.0.0.1', r));
  authority = `http://127.0.0.1:${provedor.address().port}`;
  process.env.MS_AUTHORITY = authority;
  await ctx.iniciar();
  await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  // Usuário cadastrado só para login Microsoft (sem senha local)
  const r = await chamar('admin', 'POST', '/usuarios', { nome: 'Fernanda Lima', email: 'fernanda@hco.com', perfil: 'rh', acesso: 'microsoft', licenca: { status: 'ativa' } });
  assert.strictEqual(r.status, 201);
  assert.ok(!r.body.senhaTemporaria && !r.body.temSenha);
});
after(() => { ctx.encerrar(); provedor.close(); });

// Executa o fluxo completo: iniciar → (Microsoft) → callback. Devolve a URL final do front-end.
async function fluxo({ perfil = 'rh', voltar = '/portal', email = 'fernanda@hco.com', oid = 'oid-fernanda', ajustar = () => {}, code = 'codigo-ok' } = {}) {
  const ini = await chamar(null, 'GET', `/auth/microsoft/iniciar?perfil=${perfil}&prefixo=H%26CO&voltar=${encodeURIComponent(voltar)}`);
  assert.strictEqual(ini.status, 302);
  const url = new URL(ini.headers.get('location'));
  autorizacao = url.searchParams;
  Object.assign(proximo, { email, oid, chave: chaveBoa.privateKey, nonce: null, tid: TID });
  ajustar(proximo);
  const cb = await chamar(null, 'GET', `/auth/microsoft/callback?code=${code}&state=${encodeURIComponent(autorizacao.get('state'))}`);
  assert.strictEqual(cb.status, 302);
  return { autorizar: url, destino: new URL(cb.headers.get('location')), state: autorizacao.get('state') };
}

test('métodos: Microsoft disponível quando configurado', async () => {
  assert.strictEqual((await chamar(null, 'GET', '/auth/metodos')).body.microsoft.configurado, true);
});

test('URL de autorização usa PKCE (S256), state, nonce e o redirect da API', async () => {
  const ini = await chamar(null, 'GET', '/auth/microsoft/iniciar?perfil=rh&prefixo=H%26CO');
  const u = new URL(ini.headers.get('location'));
  assert.strictEqual(`${u.origin}${u.pathname}`, `${authority}/${TID}/oauth2/v2.0/authorize`);
  const q = u.searchParams;
  assert.strictEqual(q.get('client_id'), CID);
  assert.strictEqual(q.get('redirect_uri'), 'http://api.teste/api/auth/microsoft/callback');
  assert.strictEqual(q.get('code_challenge_method'), 'S256');
  assert.ok(q.get('state') && q.get('nonce') && q.get('code_challenge') && q.get('scope').includes('openid'));
  assert.ok(!u.toString().includes('segredo-de-teste'), 'o segredo nunca vai ao navegador');
});

test('fluxo completo: código de uso único no fragmento → sessão no portal escolhido', async () => {
  const { destino } = await fluxo();
  assert.strictEqual(`${destino.origin}${destino.pathname}`, 'http://app.teste/login/microsoft');
  assert.strictEqual(destino.search, '', 'nada sensível na query string');
  const frag = new URLSearchParams(destino.hash.slice(1));
  assert.strictEqual(frag.get('voltar'), '/portal');
  const r = await chamar(null, 'POST', '/auth/microsoft/trocar', { codigo: frag.get('codigo') });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.usuario.email, 'fernanda@hco.com');
  assert.strictEqual(r.body.usuario.microsoftVinculado, true);
  const me = await chamar({ token: r.body.token }, 'GET', '/auth/me');
  assert.deepStrictEqual([me.body.sessao.metodo, me.body.sessao.portal], ['microsoft', 'rh']);
  assert.strictEqual((await chamar({ token: r.body.token }, 'GET', '/estoque/resumo')).status, 200);
  assert.strictEqual((await chamar({ token: r.body.token }, 'GET', '/usuarios')).status, 403, 'continua sendo Solicitante');
  assert.strictEqual((await chamar(null, 'POST', '/auth/microsoft/trocar', { codigo: frag.get('codigo') })).status, 400, 'código não pode ser reutilizado');
});

test('autenticar na Microsoft não basta: precisa de cadastro, licença e portal correto', async () => {
  let { destino } = await fluxo({ email: 'estranho@hco.com', oid: 'oid-estranho' });
  assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_nao_cadastrado');
  ({ destino } = await fluxo({ perfil: 'ti' }));
  assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_negado');
  assert.match(destino.searchParams.get('mensagem'), /Solicitante/);
  // Conta vinculada a outro identificador Microsoft (mesmo e-mail, outra pessoa/tenant)
  ({ destino } = await fluxo({ oid: 'oid-impostor' }));
  assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_nao_cadastrado');
  // Licença suspensa
  const u = (await chamar('admin', 'GET', '/usuarios')).body.find((x) => x.email === 'fernanda@hco.com');
  await chamar('admin', 'PATCH', `/usuarios/${u.id}/licenca`, { status: 'suspensa' });
  ({ destino } = await fluxo());
  assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_negado');
  assert.match(destino.searchParams.get('mensagem'), /suspensa/);
  await chamar('admin', 'PATCH', `/usuarios/${u.id}/licenca`, { status: 'ativa' });
});

test('tokens adulterados ou de outro contexto são recusados', async () => {
  for (const ajustar of [(p) => { p.chave = chaveRuim.privateKey; }, (p) => { p.nonce = 'outro-nonce'; }, (p) => { p.tid = '99999999-2222-3333-4444-555555555555'; }]) {
    const { destino } = await fluxo({ ajustar });
    assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_falhou');
  }
  const { destino } = await fluxo({ code: 'codigo-forjado' });
  assert.strictEqual(destino.searchParams.get('erro'), 'microsoft_falhou');
});

test('state só vale uma vez; cancelamento volta para o login com aviso', async () => {
  const { state } = await fluxo();
  const repetido = await chamar(null, 'GET', `/auth/microsoft/callback?code=codigo-ok&state=${encodeURIComponent(state)}`);
  assert.match(repetido.headers.get('location'), /\/acesso\?erro=microsoft_expirado/);
  const ini = await chamar(null, 'GET', '/auth/microsoft/iniciar?perfil=rh&prefixo=H%26CO');
  const st = new URL(ini.headers.get('location')).searchParams.get('state');
  const cancel = await chamar(null, 'GET', `/auth/microsoft/callback?error=access_denied&state=${encodeURIComponent(st)}`);
  assert.match(cancel.headers.get('location'), /\/login\?perfil=rh&erro=microsoft_cancelado/);
  // "voltar" externo é descartado (evita redirecionamento aberto)
  const { destino } = await fluxo({ voltar: '//evil.example' });
  assert.strictEqual(new URLSearchParams(destino.hash.slice(1)).get('voltar'), null);
});
