// Acesso: prefixo da empresa, portal (perfil), administrador inicial, troca obrigatória de senha,
// gerenciamento de usuários, licenças, e serviços externos (e-mail e Microsoft) sem configuração.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { preparar, senhaForte } = require('./ajuda');

const ctx = preparar({ LICENCAS_TOTAL: '5' });
const { tokens } = ctx;
const chamar = (...a) => ctx.chamar(...a);
const ids = {};
let db;
const hojeMais = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

before(async () => {
  await ctx.iniciar();
  db = require('../src/db');
});
after(() => ctx.encerrar());

test('banco novo não tem contas de demonstração; só o administrador inicial', () => {
  const us = db.list('usuarios');
  assert.strictEqual(us.length, 1);
  const a = us[0];
  assert.strictEqual(a.email, ctx.admin.email);
  assert.ok(a.perfil === 'ti' && a.admin && a.ativo && a.licenca.status === 'ativa' && a.trocarSenha);
  const arquivo = fs.readFileSync(process.env.DATA_FILE, 'utf-8');
  assert.ok(!arquivo.includes(ctx.admin.senha), 'a senha nunca é gravada em texto puro');
  assert.ok(!/@ativotech\.local/.test(arquivo), 'nenhum e-mail de demonstração');
});

test('prefixo: H&CO é aceito (maiúsculas/espaços), outros são recusados', async () => {
  for (const p of ['H&CO', 'h&co', ' H&CO ']) assert.strictEqual((await chamar(null, 'GET', `/auth/empresa?prefixo=${encodeURIComponent(p)}`)).body.valido, true, p);
  for (const p of ['XYZ', 'HCO', '']) assert.strictEqual((await chamar(null, 'GET', `/auth/empresa?prefixo=${encodeURIComponent(p)}`)).status, 404, p);
  const r = await ctx.login(ctx.admin.email, ctx.admin.senha, 'ti', 'ACME');
  assert.strictEqual(r.status, 422);
  assert.ok(r.body.campos.prefixo);
  assert.strictEqual((await ctx.login(ctx.admin.email, ctx.admin.senha, 'gestor')).status, 422, 'portal inválido');
});

test('administrador inicial: troca de senha obrigatória antes de usar o sistema', async () => {
  const r = await ctx.login(ctx.admin.email, ctx.admin.senha, 'ti');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.usuario.trocarSenha, true);
  assert.ok(r.body.usuario.permissoes.includes('usuarios:gerenciar'));
  const t = { token: r.body.token };
  const bloqueado = await chamar(t, 'GET', '/solicitacoes');
  assert.strictEqual(bloqueado.status, 403);
  assert.strictEqual(bloqueado.body.codigo, 'TROCA_SENHA');
  assert.strictEqual((await chamar(t, 'GET', '/auth/me')).status, 200);
  // Validações da troca
  const nova = senhaForte();
  assert.ok((await chamar(t, 'POST', '/auth/senha', { atual: 'errada', nova, confirmacao: nova })).body.campos.atual);
  assert.ok((await chamar(t, 'POST', '/auth/senha', { atual: ctx.admin.senha, nova: 'curta1', confirmacao: 'curta1' })).body.campos.nova);
  assert.ok((await chamar(t, 'POST', '/auth/senha', { atual: ctx.admin.senha, nova: 'semnumeroNemSimbolo', confirmacao: 'semnumeroNemSimbolo' })).body.campos.nova);
  assert.ok((await chamar(t, 'POST', '/auth/senha', { atual: ctx.admin.senha, nova, confirmacao: `${nova}x` })).body.campos.confirmacao);
  assert.ok((await chamar(t, 'POST', '/auth/senha', { atual: ctx.admin.senha, nova: ctx.admin.senha, confirmacao: ctx.admin.senha })).body.campos.nova, 'nova ≠ atual');
  const ok = await chamar(t, 'POST', '/auth/senha', { atual: ctx.admin.senha, nova, confirmacao: nova });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.usuario.trocarSenha, false);
  assert.strictEqual((await chamar(t, 'GET', '/auth/me')).status, 401, 'sessões antigas são encerradas');
  tokens.admin = ok.body.token;
  ctx.senhas.admin = nova;
  assert.strictEqual((await chamar('admin', 'GET', '/solicitacoes')).status, 200);
  assert.strictEqual((await ctx.login(ctx.admin.email, ctx.admin.senha, 'ti')).status, 401, 'senha inicial deixa de valer');
});

test('administrador cria Operadores e Solicitantes (e-mail corporativo, senha temporária)', async () => {
  const fora = await chamar('admin', 'POST', '/usuarios', { nome: 'Pessoa Externa', email: 'pessoa@gmail.com', perfil: 'rh' });
  assert.strictEqual(fora.status, 422);
  assert.match(fora.body.campos.email, /corporativo/);
  const op = await ctx.criarUsuario('op', { nome: 'Operador Comum', email: 'operador@hco.com', perfil: 'ti' });
  ids.op = op.id;
  assert.strictEqual(op.admin, false);
  ids.rh = (await ctx.criarUsuario('rh', { nome: 'Solicitante RH', email: 'solicitante@hco.com', perfil: 'rh' })).id;
  const lista = (await chamar('admin', 'GET', '/usuarios')).body;
  const u = lista.find((x) => x.id === ids.rh);
  assert.ok(u.criadoEm && u.ultimoAcesso && u.licenca.efetiva === 'ativa' && u.situacao === 'ativo');
  assert.ok(lista.every((x) => !('senhaHash' in x) && !('salt' in x) && !('senhaTemporaria' in x)));
});

test('portal do login precisa corresponder ao perfil (validado no servidor)', async () => {
  const r1 = await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'ti');
  assert.strictEqual(r1.status, 403);
  assert.match(r1.body.erro, /Solicitante/);
  const r2 = await ctx.login(ctx.admin.email, ctx.senhas.admin, 'rh');
  assert.strictEqual(r2.status, 403);
  assert.match(r2.body.erro, /Operador/);
  // Sessão do RH não alcança nada do TI, mesmo chamando a API diretamente
  for (const [m, r] of [['GET', '/usuarios'], ['GET', '/licencas'], ['GET', '/notificacoes'], ['GET', '/dashboard'], ['POST', '/estoque/itens']])
    assert.strictEqual((await chamar('rh', m, r, m === 'GET' ? undefined : {})).status, 403, `${m} ${r}`);
});

test('Operador sem permissão administrativa não gerencia usuários nem se promove', async () => {
  for (const [m, r, b] of [['GET', '/usuarios'], ['POST', '/usuarios', { nome: 'X Y Z', email: 'x@hco.com', perfil: 'ti', admin: true }],
    ['PUT', `/usuarios/${ids.op}`, { admin: true }], ['PATCH', `/usuarios/${ids.rh}/licenca`, { status: 'suspensa' }], ['GET', '/licencas'], ['PUT', '/licencas', { total: 99 }]])
    assert.strictEqual((await chamar('op', m, r, b)).status, 403, `${m} ${r}`);
  assert.ok(!(await chamar('op', 'GET', '/auth/me')).body.permissoes.includes('usuarios:gerenciar'));
  assert.strictEqual((await chamar('op', 'GET', '/solicitacoes')).status, 200, 'mas usa o painel de Operador normalmente');
});

test('mudar o perfil de alguém encerra as sessões dessa pessoa', async () => {
  const t = (await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).body.token;
  const u = (await chamar('admin', 'GET', '/usuarios')).body.find((x) => x.id === ids.rh);
  assert.strictEqual((await chamar('admin', 'PUT', `/usuarios/${ids.rh}`, { ...u, perfil: 'ti' })).status, 200);
  assert.strictEqual((await chamar({ token: t }, 'GET', '/auth/me')).status, 401);
  assert.strictEqual((await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).status, 403, 'agora só entra pelo portal do Operador');
  await chamar('admin', 'PUT', `/usuarios/${ids.rh}`, { ...u, perfil: 'rh' });
  tokens.rh = (await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).body.token;
});

test('licenças: limite contratado, pendente, suspensa e expirada', async () => {
  let r = (await chamar('admin', 'GET', '/licencas')).body;
  assert.deepStrictEqual([r.total, r.utilizadas, r.disponiveis], [5, 3, 2]);
  // Reduzir abaixo do que está em uso é recusado
  assert.strictEqual((await chamar('admin', 'PUT', '/licencas', { total: 2 })).status, 409);
  assert.strictEqual((await chamar('admin', 'PUT', '/licencas', { total: 3 })).body.disponiveis, 0);
  // Sem vaga: não cria com licença ativa, mas cria como pendente (sem acesso)
  assert.strictEqual((await chamar('admin', 'POST', '/usuarios', { nome: 'Sem Vaga', email: 'semvaga@hco.com', perfil: 'rh', licenca: { status: 'ativa' } })).status, 409);
  const p = await chamar('admin', 'POST', '/usuarios', { nome: 'Pendente Silva', email: 'pendente@hco.com', perfil: 'rh', licenca: { status: 'pendente' } });
  assert.strictEqual(p.status, 201);
  ids.pend = p.body.id;
  const lp = await ctx.login('pendente@hco.com', p.body.senhaTemporaria, 'rh');
  assert.strictEqual(lp.status, 403);
  assert.match(lp.body.erro, /licença ainda não foi ativada/);
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${ids.pend}/licenca`, { status: 'ativa' })).status, 409, 'ainda sem vaga');
  // Suspender uma licença libera a vaga e derruba a sessão na hora
  const s = await chamar('admin', 'PATCH', `/usuarios/${ids.op}/licenca`, { status: 'suspensa' });
  assert.strictEqual(s.body.situacao, 'sem_licenca');
  const op401 = await chamar('op', 'GET', '/solicitacoes');
  assert.strictEqual(op401.status, 401);
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${ids.pend}/licenca`, { status: 'ativa', validaAte: hojeMais(30) })).status, 200);
  await ctx.entrar('pend', 'pendente@hco.com', p.body.senhaTemporaria, 'rh');
  assert.strictEqual((await chamar('pend', 'GET', '/estoque/resumo')).status, 200);
  // Validade no passado é recusada pela API; expiração acontece com o passar do tempo
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${ids.pend}/licenca`, { status: 'ativa', validaAte: hojeMais(-1) })).status, 422);
  db.get('usuarios', ids.pend).licenca.validaAte = hojeMais(-1); // simula o vencimento
  const exp = await chamar('pend', 'GET', '/estoque/resumo');
  assert.strictEqual(exp.status, 401);
  assert.strictEqual(exp.body.codigo, 'LICENCA_EXPIRADA');
  r = (await chamar('admin', 'GET', '/licencas')).body;
  assert.strictEqual(r.porStatus.expirada, 1);
  assert.strictEqual(r.utilizadas, 2, 'licença expirada libera a vaga');
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${ids.op}/licenca`, { status: 'ativa' })).status, 200);
  await chamar('admin', 'PUT', '/licencas', { total: 10 });
});

test('o administrador não remove o último acesso administrativo', async () => {
  const eu = (await chamar('admin', 'GET', '/auth/me')).body;
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${eu.id}/licenca`, { status: 'suspensa' })).status, 409);
  assert.strictEqual((await chamar('admin', 'PATCH', `/usuarios/${eu.id}/ativo`, { ativo: false })).status, 409);
  assert.strictEqual((await chamar('admin', 'PUT', `/usuarios/${eu.id}`, { ...eu, admin: false })).status, 409);
});

test('redefinição de senha pelo administrador: senha temporária mostrada uma vez e troca obrigatória', async () => {
  const r = await chamar('admin', 'POST', `/usuarios/${ids.rh}/senha`, {});
  assert.strictEqual(r.status, 200);
  assert.ok(!require('../src/auth').validarSenha(r.body.senhaTemporaria), 'temporária atende à política');
  assert.strictEqual((await chamar('rh', 'GET', '/auth/me')).status, 401, 'sessões antigas encerradas');
  assert.strictEqual((await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).status, 401, 'senha antiga não vale mais');
  const l = await ctx.login('solicitante@hco.com', r.body.senhaTemporaria, 'rh');
  assert.strictEqual(l.body.usuario.trocarSenha, true);
  await ctx.entrar('rh', 'solicitante@hco.com', r.body.senhaTemporaria, 'rh');
  assert.strictEqual((await chamar('admin', 'POST', `/usuarios/${(await chamar('admin', 'GET', '/auth/me')).body.id}/senha`, {})).status, 409, 'a própria senha se troca em Configurações');
});

test('bloqueio por tentativas aparece na lista e pode ser removido', async () => {
  for (let i = 0; i < 5; i++) await ctx.login('solicitante@hco.com', 'errada', 'rh');
  assert.strictEqual((await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).status, 429);
  const u = (await chamar('admin', 'GET', '/usuarios')).body.find((x) => x.id === ids.rh);
  assert.strictEqual(u.situacao, 'bloqueio_temporario');
  assert.strictEqual((await chamar('admin', 'POST', `/usuarios/${ids.rh}/desbloquear`)).body.situacao, 'ativo');
  assert.strictEqual((await ctx.login('solicitante@hco.com', ctx.senhas.rh, 'rh')).status, 200);
});

test('e-mail sem configuração: nada é simulado, fila registra e o painel avisa', async () => {
  const st = (await chamar('admin', 'GET', '/notificacoes/status')).body;
  assert.strictEqual(st.configurado, false);
  assert.ok(st.faltando.length > 0);
  const s = await chamar('rh', 'POST', '/solicitacoes', { nomeAdmitido: 'Carla Nunes', departamento: 'TI', cargo: 'Analista', dataAdmissao: hojeMais(12), tipo: 'Nova admissão', proprietario: 'H&CO', itens: [{ tipo: 'ativo', categoria: 'Monitor', quantidade: 1 }], entrega: { modalidade: 'retirada', unidade: 'Matriz' } });
  assert.strictEqual(s.status, 201);
  const fila = (await chamar('admin', 'GET', '/notificacoes')).body.filter((n) => n.solicitacaoId === s.body.id);
  assert.ok(fila.length >= 1 && fila.every((n) => n.status === 'nao_configurado' && /não configurado/.test(n.erro)));
  assert.ok(fila.every((n) => !('html' in n)), 'lista não devolve o conteúdo');
  assert.strictEqual((await chamar('admin', 'POST', '/notificacoes/reenviar')).status, 409);
  assert.strictEqual((await chamar('admin', 'POST', '/notificacoes/teste')).status, 409);
  assert.strictEqual((await chamar('rh', 'GET', '/notificacoes/status')).status, 403);
});

test('login Microsoft sem configuração: indisponível, sem simular', async () => {
  assert.strictEqual((await chamar(null, 'GET', '/auth/metodos')).body.microsoft.configurado, false);
  const r = await chamar(null, 'GET', '/auth/microsoft/iniciar?perfil=ti&prefixo=H%26CO');
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /^http:\/\/app\.teste\/login\?perfil=ti&erro=microsoft_indisponivel$/);
  assert.match((await chamar(null, 'GET', '/auth/microsoft/iniciar?perfil=xx&prefixo=ACME')).headers.get('location'), /\/acesso\?erro=acesso_invalido/);
  assert.strictEqual((await chamar(null, 'POST', '/auth/microsoft/trocar', { codigo: 'inventado' })).status, 400);
});

test('preferência de e-mail é pessoal', async () => {
  assert.strictEqual((await chamar('rh', 'PATCH', '/auth/preferencias', { notificacoesEmail: false })).body.notificacoesEmail, false);
  assert.strictEqual((await chamar('rh', 'PATCH', '/auth/preferencias', { notificacoesEmail: true })).body.notificacoesEmail, true);
});

test('migração v4 → v5: contas de demonstração desativadas, sem senha e sem licença', () => {
  const arquivo = path.join(ctx.tmpDir, 'v4.json');
  const { hashSenha } = require('../src/senha');
  const v4 = {
    versao: 4, rev: 3, ativos: [], eventos: [], historico: [], solicitacoes: [], estoqueItens: [{ id: 'i1', nome: 'Mouse', quantidade: 1, reservado: 0 }], movimentacoes: [], conferencias: [],
    sessoes: [{ id: 's1', tokenHash: 'x', usuarioId: 'usr-ti', expiraEm: '2999-01-01T00:00:00Z' }],
    usuarios: [
      { id: 'usr-ti', nome: 'Rafael', email: 'ti@ativotech.local', perfil: 'ti', ativo: true, ...hashSenha('Suporte@2026') },
      { id: 'usr-rh', nome: 'Fernanda', email: 'rh@ativotech.local', perfil: 'rh', ativo: true, ...hashSenha('Pessoas@2026') },
      { id: 'u-real', nome: 'Pessoa Real', email: 'real@hco.com', perfil: 'ti', ativo: true, ...hashSenha('Real#2026abc') }
    ],
    seq: { solicitacao: 1000 }
  };
  fs.writeFileSync(arquivo, JSON.stringify(v4));
  const out = execFileSync(process.execPath, ['-e', `
    const db = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'db.js'))});
    console.log(JSON.stringify({ versao: db.list('versao'), usuarios: db.list('usuarios').map((u) => ({ email: u.email, ativo: u.ativo, senha: Boolean(u.senhaHash), lic: u.licenca.status, admin: u.admin })),
      sessoes: db.list('sessoes').length, notificacoes: Array.isArray(db.list('notificacoes')), licencas: db.list('config').licencas.total }));
  `], { env: { ...process.env, DATA_FILE: arquivo } }).toString();
  const r = JSON.parse(out);
  assert.strictEqual(r.versao, 6);
  assert.deepStrictEqual(r.usuarios.filter((u) => u.email.endsWith('@ativotech.local')).map((u) => [u.ativo, u.senha, u.lic]), [[false, false, 'suspensa'], [false, false, 'suspensa']]);
  assert.deepStrictEqual(r.usuarios.find((u) => u.email === 'real@hco.com'), { email: 'real@hco.com', ativo: true, senha: true, lic: 'ativa', admin: true });
  assert.strictEqual(r.sessoes, 0);
  assert.ok(r.notificacoes && r.licencas >= 1);
});

test('npm run criar-admin com a API rodando: a conta não é perdida', async () => {
  const senha = 'Rodando#2026x';
  execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'criar-admin.js')], {
    input: `rodando@hco.com\nAdmin Rodando\n${senha}\n${senha}\n`, env: { ...process.env }
  });
  // Uma tentativa errada grava no arquivo (auditoria) — antes, isso apagava a conta recém-criada
  assert.strictEqual((await ctx.login('rodando@hco.com', 'errada', 'ti')).status, 401);
  const r = await ctx.login('rodando@hco.com', senha, 'ti');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.usuario.trocarSenha, true);
  assert.ok(JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf-8')).usuarios.some((u) => u.email === 'rodando@hco.com'));
});
