// Acesso: empresa (prefixo), métodos disponíveis, login por e-mail/senha ou Microsoft, sessão, troca de senha.
const express = require('express');
const db = require('../db');
const A = require('../auth');
const MS = require('../microsoft');
const config = require('../config');
const { rota, falha, invalido } = require('../http');

const router = express.Router();
const normEmail = (e) => String(e || '').trim().toLowerCase();
const PORTAIS = { ti: 'Portal do Operador (TI)', rh: 'Portal do Solicitante (RH)' };
// Diagnóstico no terminal da API (nunca para quem está na tela de login, nunca com a senha)
const diagnostico = (email, motivo) => { if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.warn(`[login] recusado ${email}: ${motivo}`); };
const voltarSeguro = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v.slice(0, 300) : '');

// ---------- Etapa 1: empresa e métodos ----------
router.get('/empresa', (req, res) => {
  const e = config.empresaPorPrefixo(req.query.prefixo);
  if (!e) return res.status(404).json({ valido: false, erro: 'Prefixo não encontrado. Verifique o nome da empresa ou fale com o suporte de TI.' });
  return res.json({ valido: true, prefixo: e.prefixo, nome: e.nome });
});

router.get('/metodos', (_req, res) => {
  res.json({
    senha: true,
    microsoft: { configurado: MS.configurado(), mensagem: MS.configurado() ? '' : 'O login com a conta Microsoft ainda não está disponível. Use e-mail e senha ou fale com o administrador.' }
  });
});

router.get('/politica-senha', (_req, res) => res.json({ requisitos: A.REQUISITOS_SENHA.map(({ id, texto }) => ({ id, texto })) }));

// Regras comuns aos dois métodos: empresa, conta, licença e perfil do portal
function verificarEntrada(usuario, { perfil, empresa, metodo }, req) {
  const registrar = (detalhe) => db.contexto.run({ ip: req.ip }, () => db.log({ acao: 'negado', entidade: 'acesso', entidadeId: usuario.id, titulo: usuario.email, detalhe, usuario: usuario.email }));
  const m = A.motivoBloqueio(usuario);
  if (m) diagnostico(usuario.email, m);
  if (m) { registrar(`Login (${metodo}) recusado: ${m}`); falha(403, A.MENSAGEM_BLOQUEIO[m], { codigo: m }); }
  if ((usuario.empresa || config.empresas[0].prefixo) !== empresa.prefixo) { registrar(`Login (${metodo}) recusado: empresa ${empresa.prefixo}`); falha(403, 'Esta conta não pertence à empresa informada.'); }
  if (usuario.perfil !== perfil) {
    registrar(`Login (${metodo}) recusado: perfil ${usuario.perfil} no ${PORTAIS[perfil]}`);
    falha(403, `Esta conta é de ${A.PERFIS[usuario.perfil].nome}. Volte e escolha o ${PORTAIS[usuario.perfil]}.`, { codigo: 'perfil_incorreto', perfilCorreto: usuario.perfil });
  }
}

function abrirSessao(usuario, { perfil, empresa, metodo }, req) {
  const token = A.criarSessao(usuario, { portal: perfil, empresa: empresa.prefixo, metodo });
  db.update('usuarios', usuario.id, { ultimoAcesso: new Date().toISOString() });
  db.contexto.run({ usuario, ip: req.ip }, () => db.log({ acao: 'entrou', entidade: 'acesso', entidadeId: usuario.id, titulo: usuario.nome, detalhe: `${PORTAIS[perfil]} · ${metodo === 'microsoft' ? 'conta Microsoft' : 'e-mail e senha'}` }));
  return { token, usuario: { ...A.publico(db.get('usuarios', usuario.id)), sessao: { portal: perfil, empresa: empresa.prefixo, metodo } }, expiraEmHoras: A.SESSAO_HORAS };
}

function lerAcesso(body) {
  const empresa = config.empresaPorPrefixo(body?.prefixo);
  const perfil = body?.perfil;
  const campos = {};
  if (!empresa) campos.prefixo = 'Prefixo inválido.';
  if (!A.PERFIS[perfil]) campos.perfil = 'Escolha o portal de acesso.';
  if (Object.keys(campos).length) falha(422, 'Volte à tela inicial e escolha a empresa e o portal de acesso.', campos);
  return { empresa, perfil };
}

// ---------- Etapa 2a: e-mail e senha ----------
router.post('/login', rota((req, res) => {
  const { empresa, perfil } = lerAcesso(req.body);
  const email = normEmail(req.body?.email);
  const senha = String(req.body?.senha || '');
  if (!email || !senha) invalido({ ...(email ? {} : { email: 'Informe o e-mail.' }), ...(senha ? {} : { senha: 'Informe a senha.' }) });

  const minutos = A.verificarBloqueio(email);
  if (minutos) falha(429, `Muitas tentativas. Tente novamente em ${minutos} min.`);

  const usuario = db.list('usuarios').find((u) => u.email === email);
  if (!usuario || !A.conferirSenha(senha, usuario)) {
    diagnostico(email, !usuario ? 'e-mail não cadastrado (crie com npm run criar-admin ou em Usuários)' : !usuario.senhaHash ? 'conta sem senha local (somente Microsoft ou conta de demonstração desativada)' : 'senha diferente da cadastrada');
    A.registrarFalha(email);
    db.contexto.run({ ip: req.ip }, () => db.log({ acao: 'falhou', entidade: 'acesso', entidadeId: usuario?.id || null, titulo: email, detalhe: 'Credenciais inválidas', usuario: email }));
    falha(401, 'E-mail ou senha incorretos.'); // mensagem genérica: não revela se o e-mail existe
  }
  A.limparFalhas(email);
  verificarEntrada(usuario, { perfil, empresa, metodo: 'senha' }, req);
  res.json(abrirSessao(usuario, { perfil, empresa, metodo: 'senha' }, req));
}));

// ---------- Etapa 2b: conta Microsoft (Entra ID) ----------
const paraFront = (res, caminho, params) => res.redirect(302, `${config.appUrl}${caminho}${params ? `?${new URLSearchParams(params)}` : ''}`);

router.get('/microsoft/iniciar', (req, res) => {
  const perfil = A.PERFIS[req.query.perfil] ? req.query.perfil : '';
  const empresa = config.empresaPorPrefixo(req.query.prefixo);
  if (!empresa || !perfil) return paraFront(res, '/acesso', { erro: 'acesso_invalido' });
  if (!MS.configurado()) return paraFront(res, '/login', { perfil, erro: 'microsoft_indisponivel' });
  return res.redirect(302, MS.iniciar({ perfil, prefixo: empresa.prefixo, voltar: voltarSeguro(req.query.voltar) }));
});

router.get('/microsoft/callback', rota(async (req, res) => {
  const pendente = MS.consumirEstado(req.query.state);
  if (!pendente) return paraFront(res, '/acesso', { erro: 'microsoft_expirado' });
  const base = { perfil: pendente.perfil, ...(pendente.voltar ? { voltar: pendente.voltar } : {}) };
  if (req.query.error) return paraFront(res, '/login', { ...base, erro: req.query.error === 'access_denied' ? 'microsoft_cancelado' : 'microsoft_falhou' });
  try {
    const id = await MS.concluir({ code: String(req.query.code || ''), pendente });
    const empresa = config.empresaPorPrefixo(pendente.prefixo);
    const usuario = db.list('usuarios').find((u) => u.microsoftOid === id.oid) || db.list('usuarios').find((u) => u.email === id.email);
    if (!usuario || (usuario.microsoftOid && usuario.microsoftOid !== id.oid)) {
      db.contexto.run({ ip: req.ip }, () => db.log({ acao: 'falhou', entidade: 'acesso', entidadeId: null, titulo: id.email, detalhe: 'Conta Microsoft sem cadastro no Ativos Tech', usuario: id.email }));
      return paraFront(res, '/login', { ...base, erro: 'microsoft_nao_cadastrado' });
    }
    try {
      verificarEntrada(usuario, { perfil: pendente.perfil, empresa, metodo: 'microsoft' }, req);
    } catch (e) {
      return paraFront(res, '/login', { ...base, erro: 'microsoft_negado', mensagem: e.message });
    }
    if (!usuario.microsoftOid) db.update('usuarios', usuario.id, { microsoftOid: id.oid });
    const sessao = abrirSessao(usuario, { perfil: pendente.perfil, empresa, metodo: 'microsoft' }, req);
    const codigo = MS.emitirCodigo(sessao);
    // O código vai no fragmento (#), que o navegador não envia a nenhum servidor
    return res.redirect(302, `${config.appUrl}/login/microsoft#${new URLSearchParams({ codigo, ...(pendente.voltar ? { voltar: pendente.voltar } : {}) })}`);
  } catch (e) {
    console.error(`Login Microsoft falhou: ${e.message}`);
    return paraFront(res, '/login', { ...base, erro: 'microsoft_falhou' });
  }
}));

router.post('/microsoft/trocar', rota((req, res) => {
  const s = MS.resgatarCodigo(req.body?.codigo);
  if (!s) falha(400, 'Código de acesso inválido ou expirado. Entre novamente.');
  res.json(s);
}));

// ---------- Sessão ----------
router.get('/me', A.autenticar, (req, res) => res.json({ ...A.publico(req.usuario), sessao: { portal: req.sessao.portal, empresa: req.sessao.empresa, metodo: req.sessao.metodo } }));

router.post('/logout', A.autenticar, (req, res) => {
  db.log({ acao: 'saiu', entidade: 'acesso', entidadeId: req.usuario.id, titulo: req.usuario.nome });
  A.encerrarSessao(req.token);
  res.status(204).end();
});

// Troca da própria senha (também usada na troca obrigatória do primeiro acesso)
router.post('/senha', A.autenticar, rota((req, res) => {
  const { atual, nova, confirmacao } = req.body || {};
  const campos = {};
  if (!A.conferirSenha(atual, req.usuario)) campos.atual = 'Senha atual incorreta.';
  const erroSenha = A.validarSenha(nova);
  if (erroSenha) campos.nova = erroSenha;
  else if (atual === nova) campos.nova = 'A nova senha precisa ser diferente da atual.';
  if (confirmacao !== undefined && confirmacao !== nova) campos.confirmacao = 'As senhas não conferem.';
  if (Object.keys(campos).length) invalido(campos);
  db.update('usuarios', req.usuario.id, { ...A.hashSenha(nova), trocarSenha: false, senhaAlteradaEm: new Date().toISOString() });
  // Encerra todas as sessões (inclusive em outros dispositivos) e devolve um token novo
  A.revogarSessoesDe(req.usuario.id);
  const token = A.criarSessao(req.usuario, { portal: req.sessao.portal, empresa: req.sessao.empresa, metodo: req.sessao.metodo });
  db.log({ acao: 'atualizou', entidade: 'usuario', entidadeId: req.usuario.id, titulo: req.usuario.nome, detalhe: 'Alterou a própria senha' });
  res.json({ token, usuario: { ...A.publico(db.get('usuarios', req.usuario.id)), sessao: { portal: req.sessao.portal, empresa: req.sessao.empresa, metodo: req.sessao.metodo } } });
}));

// Preferências pessoais
router.patch('/preferencias', A.autenticar, A.exigirSenhaDefinitiva, rota((req, res) => {
  const patch = {};
  if (req.body?.notificacoesEmail !== undefined) patch.notificacoesEmail = Boolean(req.body.notificacoesEmail);
  const u = db.update('usuarios', req.usuario.id, patch);
  res.json(A.publico(u));
}));

module.exports = router;
