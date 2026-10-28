// Utilitários dos testes: banco temporário, administrador inicial por variável de ambiente
// e criação dos demais usuários pela própria API (não existem contas de demonstração).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert');

const senhaForte = () => `Tst#${crypto.randomBytes(5).toString('hex')}Aa9`;

function preparar(envExtra = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ativotech-'));
  const admin = { email: 'admin.teste@hco.com', senha: senhaForte(), nome: 'Admin Teste' };
  Object.assign(process.env, {
    NODE_ENV: 'test', DATA_FILE: path.join(tmpDir, 'db.json'), ADMIN_EMAIL: admin.email, ADMIN_INITIAL_PASSWORD: admin.senha,
    ADMIN_NOME: admin.nome, LICENCAS_TOTAL: '40', APP_URL: 'http://app.teste', EMAIL_DOMINIOS_PERMITIDOS: 'hco.com', ...envExtra
  });
  const ctx = { tmpDir, admin, base: '', server: null, tokens: {}, senhas: {} };

  ctx.iniciar = async () => {
    const { createApp } = require('../src/app');
    ctx.server = createApp().listen(0);
    await new Promise((r) => ctx.server.once('listening', r));
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}/api`;
  };
  ctx.encerrar = () => { ctx.server?.closeAllConnections?.(); ctx.server?.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); };

  // chamar('ti', 'GET', '/rota') usa o token salvo; chamar(null, …) sem login; chamar({ token }, …) token avulso
  ctx.chamar = async (quem, metodo, rota, corpo) => {
    const headers = { 'Content-Type': 'application/json' };
    const token = typeof quem === 'string' ? ctx.tokens[quem] : quem?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(ctx.base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
    const texto = await r.text();
    let body = null;
    try { body = texto ? JSON.parse(texto) : null; } catch { body = texto; }
    return { status: r.status, body, headers: r.headers };
  };
  ctx.login = (email, senha, perfil = 'ti', prefixo = 'H&CO') => ctx.chamar(null, 'POST', '/auth/login', { email, senha, perfil, prefixo });

  // Faz login e, se a senha for temporária, troca por uma definitiva
  ctx.entrar = async (apelido, email, senha, perfil) => {
    let r = await ctx.login(email, senha, perfil);
    assert.strictEqual(r.status, 200, `login ${apelido}: ${JSON.stringify(r.body)}`);
    let { token } = r.body;
    if (r.body.usuario.trocarSenha) {
      const nova = senhaForte();
      r = await ctx.chamar({ token }, 'POST', '/auth/senha', { atual: senha, nova, confirmacao: nova });
      assert.strictEqual(r.status, 200, `troca de senha ${apelido}`);
      token = r.body.token;
      senha = nova;
    }
    ctx.tokens[apelido] = token;
    ctx.senhas[apelido] = senha;
    return token;
  };

  // Cria um usuário pelo painel (como administrador) e já entra com ele
  ctx.criarUsuario = async (apelido, dados) => {
    const r = await ctx.chamar('admin', 'POST', '/usuarios', { acesso: 'gerar', licenca: { status: 'ativa' }, ...dados });
    assert.strictEqual(r.status, 201, `criar ${apelido}: ${JSON.stringify(r.body)}`);
    await ctx.entrar(apelido, dados.email, r.body.senhaTemporaria, dados.perfil);
    return r.body;
  };
  return ctx;
}

module.exports = { preparar, senhaForte };
