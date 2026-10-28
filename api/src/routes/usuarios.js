// Gerenciamento de usuários — somente Operadores (TI) com permissão administrativa.
// Regras: perfil e permissão administrativa só mudam por outro administrador (ninguém se autopromove);
// o sistema mantém pelo menos um administrador ativo com licença; licenças respeitam o limite contratado.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const A = require('../auth');
const L = require('../licencas');
const config = require('../config');
const { rota, falha, invalido } = require('../http');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Administradores que continuariam podendo entrar
const adminsAtivos = (excetoId) => db.list('usuarios').filter((u) => u.id !== excetoId && u.perfil === 'ti' && u.admin && A.motivoBloqueio(u) === null).length;
const exigirOutroAdmin = (u, depois) => {
  const continua = depois.perfil === 'ti' && depois.admin && depois.ativo && L.statusEfetivo(depois) === 'ativa';
  const era = u.perfil === 'ti' && u.admin && A.motivoBloqueio(u) === null;
  if (era && !continua && adminsAtivos(u.id) === 0) falha(409, 'O sistema precisa de pelo menos um Operador administrador ativo com licença.');
};

function validar(body, { idAtual = null } = {}) {
  const errors = {};
  const d = {
    nome: String(body?.nome || '').trim().replace(/\s+/g, ' '),
    email: String(body?.email || '').trim().toLowerCase(),
    perfil: body?.perfil,
    departamento: String(body?.departamento || '').trim().slice(0, 80),
    ativo: body?.ativo === undefined ? true : Boolean(body.ativo),
    notificacoesEmail: body?.notificacoesEmail === undefined ? true : Boolean(body.notificacoesEmail)
  };
  d.admin = d.perfil === 'ti' && Boolean(body?.admin);
  if (d.nome.length < 3 || d.nome.length > 100) errors.nome = 'Informe o nome completo.';
  if (!EMAIL_RE.test(d.email) || d.email.length > 150) errors.email = 'E-mail inválido.';
  else if (config.dominiosEmail.length && !config.dominiosEmail.includes(d.email.split('@')[1])) errors.email = `Use um e-mail corporativo (${config.dominiosEmail.map((x) => `@${x}`).join(', ')}).`;
  else if (db.list('usuarios').some((u) => u.email === d.email && u.id !== idAtual)) errors.email = 'Já existe um usuário com este e-mail.';
  if (!A.PERFIS[d.perfil]) errors.perfil = 'Escolha Operador (TI) ou Solicitante (RH).';
  return { d, errors };
}

const bloqueioTemp = (u) => A.verificarBloqueio(u.email);
function serializar(u) {
  const sessoes = db.list('sessoes');
  return {
    ...A.publico(u),
    sessoesAtivas: A.motivoBloqueio(u) ? 0 : sessoes.filter((s) => s.usuarioId === u.id && s.portal === u.perfil && Date.parse(s.expiraEm) > Date.now()).length,
    solicitacoes: db.list('solicitacoes').filter((s) => s.solicitanteId === u.id).length,
    bloqueioMinutos: bloqueioTemp(u),
    // "Bloqueado" = não consegue entrar agora (conta desativada, licença não ativa ou bloqueio por tentativas)
    situacao: !u.ativo ? 'desativado' : L.statusEfetivo(u) !== 'ativa' ? 'sem_licenca' : bloqueioTemp(u) ? 'bloqueio_temporario' : 'ativo'
  };
}

// Perfis e matriz de permissões (exibidos na tela de usuários)
router.get('/perfis', (_req, res) => res.json({ perfis: A.PERFIS, permissoes: A.PERMISSOES, permissoesAdmin: A.PERMISSOES_ADMIN, requisitosSenha: A.REQUISITOS_SENHA.map(({ id, texto }) => ({ id, texto })) }));

router.get('/', (_req, res) => {
  res.json(db.list('usuarios').map(serializar).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
});

// Criação: senha temporária gerada pelo sistema, definida pelo administrador, ou somente login Microsoft
router.post('/', rota((req, res) => {
  const { d, errors } = validar(req.body);
  const acesso = ['gerar', 'definir', 'microsoft'].includes(req.body?.acesso) ? req.body.acesso : 'gerar';
  if (acesso === 'definir') { const e = A.validarSenha(req.body?.senha); if (e) errors.senha = e; }
  if (Object.keys(errors).length) invalido(errors);
  const senhaTemporaria = acesso === 'gerar' ? A.gerarSenhaTemporaria() : acesso === 'definir' ? String(req.body.senha) : null;

  const u = db.transacao(() => {
    const licenca = L.montar(null, req.body?.licenca || { status: 'ativa' });
    const agora = new Date().toISOString();
    const novo = {
      id: crypto.randomUUID(), ...d, empresa: config.empresas[0].prefixo, licenca, ultimoAcesso: null,
      trocarSenha: Boolean(senhaTemporaria), senhaHash: null, salt: null, ...(senhaTemporaria ? A.hashSenha(senhaTemporaria) : {}),
      criadoPor: req.usuario.nome, criadoEm: agora, atualizadoEm: agora
    };
    db.list('usuarios').push(novo);
    db.log({ acao: 'criou', entidade: 'usuario', entidadeId: novo.id, titulo: novo.nome, detalhe: `${A.PERFIS[novo.perfil].nome}${novo.admin ? ' · administrador' : ''} · ${L.NOMES[L.statusEfetivo(novo)]} · acesso: ${acesso === 'microsoft' ? 'somente Microsoft' : 'senha temporária'}`, salvarAgora: false });
    return novo;
  });
  // A senha temporária gerada é mostrada UMA vez ao administrador e não fica salva em lugar nenhum
  res.status(201).json({ ...serializar(u), ...(acesso === 'gerar' ? { senhaTemporaria } : {}) });
}));

router.put('/:id', rota((req, res) => {
  const antes = db.get('usuarios', req.params.id);
  if (!antes) falha(404, 'Usuário não encontrado.');
  const { d, errors } = validar({ ...antes, ...req.body }, { idAtual: antes.id });
  if (Object.keys(errors).length) invalido(errors);
  const proprio = antes.id === req.usuario.id;
  if (proprio && (d.perfil !== antes.perfil || d.admin !== Boolean(antes.admin) || !d.ativo))
    falha(409, 'Você não pode alterar o próprio perfil, a própria permissão administrativa nem desativar a própria conta.');
  const licenca = req.body?.licenca ? L.montar(antes, req.body.licenca) : antes.licenca;
  if (proprio && licenca.status !== 'ativa') falha(409, 'Você não pode suspender a própria licença.');
  exigirOutroAdmin(antes, { ...antes, ...d, licenca });

  const depois = db.transacao(() => {
    const u = db.get('usuarios', antes.id);
    Object.assign(u, d, { licenca, atualizadoEm: new Date().toISOString() });
    const mud = ['nome', 'email', 'perfil', 'admin', 'departamento', 'ativo'].filter((k) => String(antes[k] ?? '') !== String(u[k] ?? ''))
      .map((k) => `${k}: ${antes[k] ?? '—'} → ${u[k]}`);
    if (antes.licenca?.status !== licenca.status || (antes.licenca?.validaAte || '') !== licenca.validaAte) mud.push(`licença: ${antes.licenca?.status || '—'} → ${licenca.status}${licenca.validaAte ? ` até ${licenca.validaAte}` : ''}`);
    db.log({ acao: 'atualizou', entidade: 'usuario', entidadeId: u.id, titulo: u.nome, detalhe: mud.join(' · ') || 'Sem alterações', salvarAgora: false });
    return u;
  });
  // Desativação, perda de licença ou mudança de perfil valem na hora: cada requisição revalida a sessão
  // (o middleware recusa e encerra as sessões, informando o motivo à pessoa na tela de login).
  if (depois.admin !== Boolean(antes.admin)) A.revogarSessoesDe(depois.id); // permissões novas exigem novo login
  res.json(serializar(depois));
}));

// Ativar / desativar a conta com um clique
router.patch('/:id/ativo', rota((req, res) => {
  const u = db.get('usuarios', req.params.id);
  if (!u) falha(404, 'Usuário não encontrado.');
  const ativo = Boolean(req.body?.ativo);
  if (u.id === req.usuario.id && !ativo) falha(409, 'Você não pode desativar a própria conta.');
  if (ativo && u.demo) falha(409, 'Esta era uma conta de demonstração. Redefina a senha antes de reativar.');
  exigirOutroAdmin(u, { ...u, ativo });
  const depois = db.update('usuarios', u.id, { ativo });
  db.log({ acao: ativo ? 'ativou' : 'desativou', entidade: 'usuario', entidadeId: u.id, titulo: u.nome });
  res.json(serializar(depois));
}));

// Licença: { status: ativa|pendente|suspensa, validaAte?: 'AAAA-MM-DD' | '' }
router.patch('/:id/licenca', rota((req, res) => {
  const u = db.get('usuarios', req.params.id);
  if (!u) falha(404, 'Usuário não encontrado.');
  const licenca = L.montar(u, req.body || {});
  if (u.id === req.usuario.id && licenca.status !== 'ativa') falha(409, 'Você não pode suspender a própria licença.');
  exigirOutroAdmin(u, { ...u, licenca });
  const antes = L.statusEfetivo(u);
  const depois = db.update('usuarios', u.id, { licenca });
  db.log({ acao: 'atualizou', entidade: 'usuario', entidadeId: u.id, titulo: u.nome, detalhe: `Licença: ${antes} → ${licenca.status}${licenca.validaAte ? ` (válida até ${licenca.validaAte})` : ''}` });
  res.json(serializar(depois));
}));

// Redefinição de senha: gera uma senha temporária (mostrada uma vez) ou usa a informada; exige troca no próximo acesso
router.post('/:id/senha', rota((req, res) => {
  const u = db.get('usuarios', req.params.id);
  if (!u) falha(404, 'Usuário não encontrado.');
  if (u.id === req.usuario.id) falha(409, 'Para trocar a sua própria senha, use Configurações.');
  let senha = req.body?.senha;
  const gerada = !senha;
  if (gerada) senha = A.gerarSenhaTemporaria();
  else { const e = A.validarSenha(senha); if (e) invalido({ senha: e }); }
  db.update('usuarios', u.id, { ...A.hashSenha(senha), trocarSenha: true, demo: false });
  A.revogarSessoesDe(u.id);
  A.limparFalhas(u.email);
  db.log({ acao: 'atualizou', entidade: 'usuario', entidadeId: u.id, titulo: u.nome, detalhe: 'Senha temporária definida pelo administrador (troca obrigatória no próximo acesso)' });
  res.json({ ok: true, ...(gerada ? { senhaTemporaria: senha } : {}) });
}));

// Remove o bloqueio temporário por tentativas de login
router.post('/:id/desbloquear', rota((req, res) => {
  const u = db.get('usuarios', req.params.id);
  if (!u) falha(404, 'Usuário não encontrado.');
  A.limparFalhas(u.email);
  db.log({ acao: 'atualizou', entidade: 'usuario', entidadeId: u.id, titulo: u.nome, detalhe: 'Bloqueio por tentativas de login removido' });
  res.json(serializar(u));
}));

module.exports = router;
