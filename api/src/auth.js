// Autenticação (sessões por token) e controle de acesso baseado em perfis (RBAC).
// Senhas: scrypt com salt aleatório. Tokens: aleatórios de 256 bits; no banco fica só o hash SHA-256.
//
// Cada sessão guarda o PORTAL escolhido no login (Operador ou Solicitante), a empresa (prefixo) e o método
// (senha ou Microsoft). A cada requisição o servidor confere: sessão válida, conta ativa, licença ativa
// e perfil do usuário igual ao portal da sessão — mudar a URL ou a interface não dá acesso a nada.
const crypto = require('crypto');
const db = require('./db');
const { hashSenha } = require('./senha');
const L = require('./licencas');

const SESSAO_HORAS = Number(process.env.SESSAO_HORAS) || 8;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MIN = 5;

// Dois perfis. As chaves internas ("ti" e "rh") são mantidas por compatibilidade com os dados existentes.
const PERFIS = {
  ti: { nome: 'Operador (TI)', desc: 'Equipamentos, estoque, solicitações, preparação, envios e notificações. Com permissão administrativa, também gerencia usuários e licenças.' },
  rh: { nome: 'Solicitante (RH)', desc: 'Abre e acompanha as próprias solicitações de equipamentos e consulta o estoque disponível (resumido).' }
};

// Matriz de permissões — a fonte única de verdade, usada pela API e enviada ao front-end
const PERMISSOES = {
  ti: ['painel:ver', 'ativos:ver', 'ativos:gerenciar', 'eventos:gerenciar', 'alertas:ver', 'historico:ver', 'estoque:ver', 'estoque:detalhe',
    'estoque:gerenciar', 'solicitacoes:criar', 'solicitacoes:acompanhar', 'solicitacoes:gerenciar', 'solicitacoes:notas', 'notificacoes:receber',
    'colaboradores:ver', 'colaboradores:gerenciar', 'importacao:executar'],
  rh: ['estoque:ver', 'solicitacoes:criar', 'solicitacoes:acompanhar']
};
// Só Operadores com permissão administrativa ("admin: true")
const PERMISSOES_ADMIN = ['usuarios:gerenciar', 'licencas:gerenciar', 'notificacoes:gerenciar', 'sistema:admin'];

function permissoesDe(usuario) {
  if (!usuario) return [];
  const base = PERMISSOES[usuario.perfil] || [];
  return usuario.perfil === 'ti' && usuario.admin ? [...base, ...PERMISSOES_ADMIN] : [...base];
}
const pode = (usuario, permissao) => permissoesDe(usuario).includes(permissao);

// ---------- Senhas ----------
function conferirSenha(senha, usuario) {
  if (!usuario?.senhaHash || !usuario.salt) return false;
  const { senhaHash } = hashSenha(senha, usuario.salt);
  const a = Buffer.from(senhaHash, 'hex');
  const b = Buffer.from(usuario.senhaHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Política de senha (a mesma lista é exibida no front-end)
const REQUISITOS_SENHA = [
  { id: 'tamanho', texto: 'Pelo menos 10 caracteres', ok: (s) => s.length >= 10 },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', ok: (s) => /[A-ZÀ-Ý]/.test(s) },
  { id: 'minuscula', texto: 'Uma letra minúscula', ok: (s) => /[a-zß-ÿ]/.test(s) },
  { id: 'numero', texto: 'Um número', ok: (s) => /\d/.test(s) },
  { id: 'simbolo', texto: 'Um símbolo (ex.: ! @ # $ %)', ok: (s) => /[^A-Za-zÀ-ÿ0-9\s]/.test(s) }
];
function validarSenha(senha) {
  const s = String(senha || '');
  if (s.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  const faltando = REQUISITOS_SENHA.filter((r) => !r.ok(s));
  return faltando.length ? `A senha precisa ter: ${faltando.map((r) => r.texto.toLowerCase()).join(', ')}.` : null;
}

// Senha temporária forte (mostrada uma única vez ao administrador)
function gerarSenhaTemporaria() {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const todos = grupos.join('');
  const pick = (g) => g[crypto.randomInt(g.length)];
  const chars = [...grupos.map(pick), ...Array.from({ length: 10 }, () => pick(todos))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

// ---------- Regras de acesso ----------
// Motivo pelo qual o usuário não pode usar o sistema (ou null)
function motivoBloqueio(u) {
  if (!u) return 'inexistente';
  if (!u.ativo) return 'desativado';
  const lic = L.PROVEDOR.validar(u);
  if (lic) return `licenca_${lic}`;
  return null;
}
const MENSAGEM_BLOQUEIO = {
  desativado: 'Sua conta está desativada. Procure um Operador administrador.',
  licenca_pendente: 'Sua licença ainda não foi ativada. Procure um Operador administrador.',
  licenca_suspensa: 'Sua licença está suspensa. Procure um Operador administrador.',
  licenca_expirada: 'Sua licença expirou. Procure um Operador administrador para renovar.',
  perfil: 'Seu perfil de acesso foi alterado. Entre novamente pelo portal correto.',
  sessao: 'Sessão inválida ou expirada. Faça login novamente.'
};

// ---------- Sessões ----------
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function criarSessao(usuario, { portal, empresa, metodo = 'senha' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const agora = Date.now();
  const sessoes = db.list('sessoes');
  for (let i = sessoes.length - 1; i >= 0; i--) if (Date.parse(sessoes[i].expiraEm) < agora) sessoes.splice(i, 1);
  sessoes.push({
    id: crypto.randomUUID(), tokenHash: hashToken(token), usuarioId: usuario.id, portal: portal || usuario.perfil, empresa: empresa || usuario.empresa,
    metodo, criadoEm: new Date(agora).toISOString(), expiraEm: new Date(agora + SESSAO_HORAS * 3600000).toISOString()
  });
  db.salvar();
  return token;
}

function encerrarSessao(token) {
  const s = db.list('sessoes');
  const i = s.findIndex((x) => x.tokenHash === hashToken(token));
  if (i >= 0) { s.splice(i, 1); db.salvar(); }
}

function revogarSessoesDe(usuarioId, { exceto } = {}) {
  const s = db.list('sessoes');
  const antes = s.length;
  const manter = exceto ? hashToken(exceto) : null;
  for (let i = s.length - 1; i >= 0; i--) if (s[i].usuarioId === usuarioId && s[i].tokenHash !== manter) s.splice(i, 1);
  if (s.length !== antes) db.salvar();
}

// Resolve o token e aplica todas as regras. Retorna { usuario, sessao } ou { motivo }.
function resolverSessao(token) {
  if (!token) return { motivo: 'sessao' };
  const sessao = db.list('sessoes').find((x) => x.tokenHash === hashToken(token));
  if (!sessao || Date.parse(sessao.expiraEm) < Date.now()) return { motivo: 'sessao' };
  const usuario = db.get('usuarios', sessao.usuarioId);
  const m = motivoBloqueio(usuario);
  if (m) return { motivo: m, usuarioId: usuario?.id };
  if (sessao.portal !== usuario.perfil) return { motivo: 'perfil', usuarioId: usuario.id };
  return { usuario, sessao };
}
const usuarioDoToken = (token) => resolverSessao(token).usuario || null;

// Dados públicos do usuário (nunca devolve hash, salt ou identificadores externos)
function publico(u) {
  if (!u) return null;
  const { senhaHash, salt, microsoftOid, ...resto } = u;
  return {
    ...resto,
    admin: u.perfil === 'ti' && Boolean(u.admin),
    perfilNome: PERFIS[u.perfil]?.nome,
    permissoes: permissoesDe(u),
    licenca: { ...(u.licenca || {}), efetiva: L.statusEfetivo(u) },
    temSenha: Boolean(senhaHash),
    microsoftVinculado: Boolean(microsoftOid),
    trocarSenha: Boolean(u.trocarSenha)
  };
}

// ---------- Proteção contra força bruta ----------
const tentativas = new Map(); // chave: email → { falhas, bloqueadoAte }
function verificarBloqueio(chave) {
  const t = tentativas.get(chave);
  if (t?.bloqueadoAte && t.bloqueadoAte > Date.now()) return Math.ceil((t.bloqueadoAte - Date.now()) / 60000);
  return 0;
}
function registrarFalha(chave) {
  const t = tentativas.get(chave) || { falhas: 0 };
  t.falhas++;
  if (t.falhas >= MAX_TENTATIVAS) { t.bloqueadoAte = Date.now() + BLOQUEIO_MIN * 60000; t.falhas = 0; }
  tentativas.set(chave, t);
}
const limparFalhas = (chave) => tentativas.delete(chave);

// ---------- Middlewares ----------
function tokenDaRequisicao(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// Identifica o usuário e o coloca no contexto da auditoria
function autenticar(req, res, next) {
  const token = tokenDaRequisicao(req);
  const r = resolverSessao(token);
  if (!r.usuario) {
    // Conta bloqueada, licença inválida ou perfil alterado: encerra as sessões na hora
    if (r.usuarioId && r.motivo !== 'sessao') revogarSessoesDe(r.usuarioId);
    return res.status(401).json({ erro: MENSAGEM_BLOQUEIO[r.motivo] || MENSAGEM_BLOQUEIO.sessao, codigo: r.motivo.toUpperCase() });
  }
  req.usuario = r.usuario;
  req.sessao = r.sessao;
  req.token = token;
  db.contexto.run({ usuario: r.usuario, ip: req.ip }, next);
}

// Senha temporária: até trocar, só é possível consultar a sessão, trocar a senha e sair
function exigirSenhaDefinitiva(req, res, next) {
  if (req.usuario?.trocarSenha && req.sessao?.metodo === 'senha')
    return res.status(403).json({ erro: 'Defina uma nova senha para continuar.', codigo: 'TROCA_SENHA' });
  return next();
}

// Exige uma permissão; registra tentativas negadas na auditoria
function exigir(...permissoes) {
  return (req, res, next) => {
    if (permissoes.some((p) => pode(req.usuario, p))) return next();
    db.log({ acao: 'negado', entidade: 'acesso', entidadeId: req.usuario?.id, titulo: `${req.method} ${req.originalUrl.split('?')[0]}`, detalhe: `Sem permissão: ${permissoes.join(' ou ')}` });
    return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
  };
}

module.exports = {
  PERFIS, PERMISSOES, PERMISSOES_ADMIN, REQUISITOS_SENHA, MENSAGEM_BLOQUEIO, pode, permissoesDe, hashSenha, conferirSenha, validarSenha, gerarSenhaTemporaria,
  motivoBloqueio, criarSessao, encerrarSessao, revogarSessoesDe, resolverSessao, publico, verificarBloqueio, registrarFalha, limparFalhas,
  autenticar, exigirSenhaDefinitiva, exigir, SESSAO_HORAS, usuarioDoToken, tokenDaRequisicao
};
