// Login com Microsoft Entra ID — OAuth 2.0 Authorization Code + PKCE, OpenID Connect.
//
// O backend conduz todo o fluxo: gera state/nonce/PKCE, troca o código pelo id_token usando o client secret
// (que nunca sai do servidor) e valida o token: assinatura RS256 com as chaves publicadas pela Microsoft (JWKS),
// emissor, audiência, validade e nonce. Autenticar na Microsoft NÃO dá acesso: quem decide é o cadastro do
// Ativos Tech (usuário existente, ativo, com licença ativa e perfil igual ao portal escolhido).
const crypto = require('crypto');
const config = require('./config');

const ms = config.microsoft;
const configurado = () => Boolean(ms.tenantId && ms.clientId && ms.clientSecret);
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fluxos em andamento (state → dados) e códigos de uso único entregues ao front-end
const pendentes = new Map();
const codigos = new Map();
const limpar = (m) => { const agora = Date.now(); for (const [k, v] of m) if (v.exp < agora) m.delete(k); };

function iniciar({ perfil, prefixo, voltar }) {
  limpar(pendentes);
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  pendentes.set(state, { nonce, verifier, perfil, prefixo, voltar, exp: Date.now() + 10 * 60000 });
  const q = new URLSearchParams({
    client_id: ms.clientId, response_type: 'code', redirect_uri: ms.redirectUri, response_mode: 'query',
    scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
  });
  return `${ms.authority}/${encodeURIComponent(ms.tenantId)}/oauth2/v2.0/authorize?${q}`;
}

function consumirEstado(state) {
  limpar(pendentes);
  const p = pendentes.get(state);
  pendentes.delete(state);
  return p || null;
}

// ---------- Validação do id_token ----------
let jwksCache = { em: 0, chaves: [] };
async function chaves(forcar = false) {
  if (!forcar && Date.now() - jwksCache.em < 3600000 && jwksCache.chaves.length) return jwksCache.chaves;
  const r = await fetch(`${ms.authority}/${encodeURIComponent(ms.tenantId)}/discovery/v2.0/keys`);
  if (!r.ok) throw new Error(`Falha ao obter as chaves públicas da Microsoft (HTTP ${r.status}).`);
  jwksCache = { em: Date.now(), chaves: (await r.json()).keys || [] };
  return jwksCache.chaves;
}

async function validarIdToken(idToken, nonce) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('Token de identidade malformado.');
  const [h, p, s] = partes;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (header.alg !== 'RS256') throw new Error('Algoritmo de assinatura não aceito.');
  let jwk = (await chaves()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await chaves(true)).find((k) => k.kid === header.kid); // rotação de chaves
  if (!jwk) throw new Error('Chave de assinatura desconhecida.');
  const chave = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), chave, Buffer.from(s, 'base64url'))) throw new Error('Assinatura do token inválida.');

  const agora = Math.floor(Date.now() / 1000);
  const folga = 300;
  if (claims.aud !== ms.clientId) throw new Error('Token emitido para outro aplicativo.');
  if (!claims.tid || claims.iss !== `${ms.authority}/${claims.tid}/v2.0`) throw new Error('Emissor do token inválido.');
  if (GUID.test(ms.tenantId) && claims.tid.toLowerCase() !== ms.tenantId.toLowerCase()) throw new Error('Conta de outra organização.');
  if (typeof claims.exp !== 'number' || claims.exp + folga < agora) throw new Error('Token expirado.');
  if (claims.nbf && claims.nbf - folga > agora) throw new Error('Token ainda não é válido.');
  if (!nonce || claims.nonce !== nonce) throw new Error('Nonce inválido.');
  const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
  if (!email || !claims.oid) throw new Error('A conta Microsoft não informou e-mail e identificador.');
  return { email, oid: claims.oid, nome: claims.name || '', tid: claims.tid };
}

// Troca o código de autorização pelo id_token e valida
async function concluir({ code, pendente }) {
  const corpo = new URLSearchParams({
    client_id: ms.clientId, client_secret: ms.clientSecret, grant_type: 'authorization_code', code,
    redirect_uri: ms.redirectUri, code_verifier: pendente.verifier, scope: 'openid profile email'
  });
  const r = await fetch(`${ms.authority}/${encodeURIComponent(ms.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) throw new Error(`A Microsoft recusou o código de autorização (${j.error || `HTTP ${r.status}`}).`);
  return validarIdToken(j.id_token, pendente.nonce);
}

// Código de uso único (60 s) para o front-end buscar o token da sessão — o token nunca vai na URL
function emitirCodigo(dados) {
  limpar(codigos);
  const codigo = b64url(crypto.randomBytes(32));
  codigos.set(codigo, { ...dados, exp: Date.now() + 60000 });
  return codigo;
}
function resgatarCodigo(codigo) {
  limpar(codigos);
  const c = codigos.get(String(codigo || ''));
  codigos.delete(String(codigo || ''));
  return c || null;
}

module.exports = { configurado, iniciar, consumirEstado, concluir, emitirCodigo, resgatarCodigo, validarIdToken };
