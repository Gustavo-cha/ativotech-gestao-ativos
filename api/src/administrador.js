// Administrador inicial: Operador (TI) com permissão administrativa e licença ativa.
//
// Duas formas de criar (nenhuma delas grava a senha em texto puro):
//  1) Variáveis de ambiente ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD (api/.env). Na inicialização da API,
//     a conta é criada SOMENTE se ainda não existir — depois disso a variável é ignorada e pode ser apagada.
//  2) Comando interativo: npm run criar-admin (pede a senha sem exibi-la no terminal).
// A senha inicial é temporária: o sistema exige a troca no primeiro acesso.
const db = require('./db');
const A = require('./auth');
const L = require('./licencas');
const config = require('./config');

const nomeDoEmail = (email) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

function garantirVaga(excetoId) {
  const lic = db.list('config').licencas;
  if (L.utilizadas(excetoId) >= lic.total) lic.total = L.utilizadas(excetoId) + 1;
}

// Cria (ou, com redefinir=true, recupera) a conta administrativa
function criarAdministrador({ email, nome, senha, redefinir = false }) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  const erroSenha = A.validarSenha(senha);
  if (erroSenha) throw new Error(erroSenha);
  const existente = db.list('usuarios').find((u) => u.email === e);
  if (existente && !redefinir) return { criado: false, usuario: existente };

  const agora = new Date().toISOString();
  return db.transacao(() => {
    garantirVaga(existente?.id);
    const dados = {
      nome: nome || existente?.nome || nomeDoEmail(e), email: e, perfil: 'ti', admin: true, ativo: true, empresa: config.empresas[0].prefixo,
      departamento: existente?.departamento || 'TI', notificacoesEmail: existente?.notificacoesEmail ?? true, demo: false,
      licenca: { status: 'ativa', validaAte: '', atribuidaEm: existente?.licenca?.atribuidaEm || agora },
      trocarSenha: true, ...A.hashSenha(senha), atualizadoEm: agora
    };
    let usuario;
    if (existente) { Object.assign(existente, dados); usuario = existente; }
    else {
      usuario = { id: require('crypto').randomUUID(), ultimoAcesso: null, criadoEm: agora, origem: 'administrador-inicial', ...dados };
      db.list('usuarios').push(usuario);
    }
    A.revogarSessoesDe(usuario.id);
    db.log({ acao: existente ? 'atualizou' : 'criou', entidade: 'usuario', entidadeId: usuario.id, titulo: usuario.nome, detalhe: existente ? 'Acesso administrativo recuperado (senha temporária)' : 'Administrador inicial criado', usuario: 'Sistema', salvarAgora: false });
    return { criado: !existente, usuario };
  });
}

// Chamado na inicialização da API
function inicializarAdministrador() {
  const { email, nome, senhaInicial } = config.admin;
  const temAdmin = db.list('usuarios').some((u) => u.perfil === 'ti' && u.admin && A.motivoBloqueio(u) === null);
  if (email && senhaInicial) {
    try {
      const r = criarAdministrador({ email, nome, senha: senhaInicial });
      if (r.criado) console.log(`Administrador inicial criado: ${email} (troca de senha obrigatória no primeiro acesso). Você já pode remover ADMIN_INITIAL_PASSWORD do arquivo .env.`);
      else console.log(`ADMIN_INITIAL_PASSWORD ignorada: ${email} já existe (a senha inicial só vale na criação). Para redefinir o acesso: npm run criar-admin`);
    } catch (e) {
      console.error(`Não foi possível criar o administrador inicial: ${e.message}`);
    }
  } else if (!temAdmin) {
    console.warn('Nenhum Operador administrador ativo — ninguém consegue entrar ainda. Rode: npm run criar-admin (ou defina ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD em api/.env e reinicie a API).');
  }
  const total = db.list('usuarios').filter((u) => A.motivoBloqueio(u) === null).length;
  console.log(`Usuários com acesso: ${total} · arquivo de dados: ${db.DATA_FILE}`);
}

module.exports = { criarAdministrador, inicializarAdministrador };
