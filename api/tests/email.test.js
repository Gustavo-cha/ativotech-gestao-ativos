// Notificações por e-mail com envio REAL por SMTP para um servidor local de teste (smtp-server):
// nova solicitação → Operadores; interação da TI → Solicitante; mensagem do RH → Operadores;
// deduplicação, preferência pessoal, notas internas não geram e-mail, falha registrada.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { SMTPServer } = require('smtp-server');
const { preparar } = require('./ajuda');

const recebidos = [];
let smtp;
const ctx = preparar({ EMAIL_PROVEDOR: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_EXIGIR_TLS: 'false', EMAIL_REMETENTE: 'ativostech@hco.com' });
const { tokens } = ctx;
const chamar = (...a) => ctx.chamar(...a);
const ids = {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const amanha = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const decodificar = (raw) => {
  // Junta as linhas quebradas (quoted-printable) para facilitar a busca
  const corpo = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(corpo, 'latin1').toString('utf-8');
};
async function aguardar(cond, ms = 5000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await espera(50); }
  return false;
}
const pedido = (nome) => ({ nomeAdmitido: nome, departamento: 'Financeiro', cargo: 'Analista Fiscal', dataAdmissao: amanha(15), tipo: 'Nova admissão', observacoes: '', proprietario: 'H&CO',
  itens: [{ tipo: 'ativo', categoria: 'Notebook', quantidade: 1 }], entrega: { modalidade: 'retirada', unidade: 'Matriz' } });

before(async () => {
  smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onData(stream, sessao, cb) {
      let raw = '';
      stream.on('data', (c) => { raw += c.toString('latin1'); });
      stream.on('end', () => {
        const texto = decodificar(raw);
        // Assunto: junta linhas dobradas e decodifica "encoded-words" (=?UTF-8?Q?…?= / =?UTF-8?B?…?=)
        const bruto = (/^Subject: (.+(?:\r?\n[ \t].+)*)/mi.exec(raw)?.[1] || '').replace(/\r?\n[ \t]+/g, ' ');
        const assunto = bruto.replace(/=\?UTF-8\?([QB])\?([^?]*)\?=\s*/gi, (_, t, v) => (t.toUpperCase() === 'B' ? Buffer.from(v, 'base64')
          : Buffer.from(v.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), 'latin1')).toString('utf-8'));
        recebidos.push({ para: sessao.envelope.rcptTo.map((r) => r.address), de: sessao.envelope.mailFrom.address, assunto, texto });
        cb();
      });
    }
  });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  process.env.SMTP_PORTA = String(smtp.server.address().port);
  await ctx.iniciar();
  await ctx.entrar('admin', ctx.admin.email, ctx.admin.senha, 'ti');
  ids.op = (await ctx.criarUsuario('op', { nome: 'Paula Operadora', email: 'paula@hco.com', perfil: 'ti' })).id;
  ids.rh = (await ctx.criarUsuario('rh', { nome: 'Fernanda Lima', email: 'fernanda@hco.com', perfil: 'rh' })).id;
});
after(() => { ctx.encerrar(); smtp.close(); });

const para = (email) => recebidos.filter((m) => m.para.includes(email));

test('status do serviço: configurado (sem expor segredos)', async () => {
  const st = (await chamar('admin', 'GET', '/notificacoes/status')).body;
  assert.strictEqual(st.configurado, true);
  assert.strictEqual(st.provedor, 'smtp');
  assert.ok(!JSON.stringify(st).match(/senha|password|secret/i));
});

test('nova solicitação do RH → e-mail para cada Operador, com todos os dados e link', async () => {
  const s = (await chamar('rh', 'POST', '/solicitacoes', pedido('Marcos Andrade'))).body;
  ids.sol = s.id;
  assert.ok(await aguardar(() => para(ctx.admin.email).length === 1 && para('paula@hco.com').length === 1), 'os dois Operadores receberam');
  assert.strictEqual(para('fernanda@hco.com').length, 0, 'quem abriu não recebe o aviso de nova solicitação');
  const m = para('paula@hco.com')[0];
  assert.strictEqual(m.de, 'ativostech@hco.com');
  assert.match(m.assunto, new RegExp(s.numero));
  for (const trecho of ['Fernanda Lima', 'Marcos Andrade', s.numero, `http://app.teste/solicitacoes/${s.id}`, 'Data prevista de admissão', 'Aberta em'])
    assert.ok(m.texto.includes(trecho), `contém ${trecho}`);
  await aguardar(() => false, 200);
  const fila = (await chamar('admin', 'GET', `/notificacoes?status=enviado`)).body.filter((n) => n.solicitacaoId === s.id);
  assert.strictEqual(fila.length, 2);
});

test('não há e-mail duplicado para a mesma interação', async () => {
  const N = require('../src/notificacoes');
  const db = require('../src/db');
  assert.deepStrictEqual(N.novaSolicitacao(db.get('solicitacoes', ids.sol), { id: ids.rh }), []);
  await espera(300);
  assert.strictEqual(para('paula@hco.com').length, 1);
});

test('interação da TI → e-mail para o Solicitante com status, resumo, responsável e link', async () => {
  await chamar('op', 'PATCH', `/solicitacoes/${ids.sol}/status`, { status: 'Em análise', mensagem: 'Recebido! Vamos separar o notebook.' });
  assert.ok(await aguardar(() => para('fernanda@hco.com').length === 1));
  const m = para('fernanda@hco.com')[0];
  for (const trecho of ['Em análise', 'Recebido! Vamos separar o notebook.', 'Paula Operadora', `http://app.teste/portal/solicitacoes/${ids.sol}`])
    assert.ok(m.texto.includes(trecho), `contém ${trecho}`);
  // Nota interna e reserva não geram e-mail para o RH
  await chamar('op', 'POST', `/solicitacoes/${ids.sol}/notas`, { texto: 'Instalar VPN' });
  await chamar('op', 'POST', `/solicitacoes/${ids.sol}/reservar-tudo`);
  // Mensagem pública da TI gera
  await chamar('op', 'POST', `/solicitacoes/${ids.sol}/atualizacoes`, { texto: 'Notebook separado, chega amanhã.' });
  assert.ok(await aguardar(() => para('fernanda@hco.com').length === 2));
  await espera(300);
  assert.strictEqual(para('fernanda@hco.com').length, 2);
});

test('mensagem do RH → e-mail para os Operadores', async () => {
  await chamar('rh', 'POST', `/solicitacoes/${ids.sol}/atualizacoes`, { texto: 'Ele começa às 9h.' });
  assert.ok(await aguardar(() => para('paula@hco.com').length === 2 && para(ctx.admin.email).length === 2));
  assert.ok(para('paula@hco.com')[1].texto.includes('Ele começa às 9h.'));
});

test('preferência desligada: a pessoa deixa de receber', async () => {
  await chamar('op', 'PATCH', '/auth/preferencias', { notificacoesEmail: false });
  await chamar('rh', 'POST', '/solicitacoes', pedido('Lia Campos'));
  assert.ok(await aguardar(() => para(ctx.admin.email).length === 3));
  await espera(300);
  assert.strictEqual(para('paula@hco.com').length, 2);
});

test('e-mail de teste do painel administrativo', async () => {
  const r = await chamar('admin', 'POST', '/notificacoes/teste');
  assert.strictEqual(r.status, 200);
  assert.ok(await aguardar(() => para(ctx.admin.email).some((m) => /Teste de notificação/.test(m.assunto))));
});

test('servidor fora do ar: a falha fica registrada (sem segredos) e vai para nova tentativa', async () => {
  await new Promise((r) => smtp.close(r));
  await chamar('rh', 'POST', '/solicitacoes', pedido('Rui Barbosa'));
  let n;
  assert.ok(await aguardar(() => {
    n = require('../src/db').list('notificacoes').find((x) => x.assunto.includes('Rui Barbosa'));
    return n && n.tentativas === 1 && n.status === 'pendente' && n.erro;
  }, 20000), 'primeira tentativa falhou e foi reagendada');
  assert.ok(n.proximaTentativa > Date.now());
  const lista = (await chamar('admin', 'GET', '/notificacoes?status=pendente')).body;
  assert.ok(lista.some((x) => x.id === n.id && x.erro));
});
