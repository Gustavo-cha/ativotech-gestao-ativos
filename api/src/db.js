// "Banco de dados" em arquivo JSON (api/data/db.json).
// Mantém tudo em memória e grava no disco a cada alteração (escrita atômica).
// Como o Node executa cada requisição de forma síncrona até gravar, "verificar e gravar"
// dentro de um mesmo handler é atômico — base da prevenção de reservas duplicadas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { EventEmitter } = require('events');
const gerarSeed = require('./seed-data');
const { migrar, COLECOES } = require('./migracao');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
let db = null;

// ---------- Desempenho ----------
// Índice id → registro por coleção (evita varrer listas grandes a cada consulta). É descartado a cada gravação.
let indices = new Map();
const limparIndices = () => { indices = new Map(); memos = new Map(); };
// Resultados calculados (resumo do estoque, alertas…) reaproveitados enquanto os dados não mudam
let memos = new Map();
function memo(chave, fn, { ttlMs = 0 } = {}) {
  const m = memos.get(chave);
  const agora = Date.now();
  if (m && (!ttlMs || agora - m.em < ttlMs)) return m.valor;
  const valor = fn();
  memos.set(chave, { valor, em: agora });
  return valor;
}

// Contexto da requisição (usuário autenticado, IP) — usado pela auditoria
const contexto = new AsyncLocalStorage();

// Barramento de eventos para o canal em tempo real (/api/stream)
const eventos = new EventEmitter();
eventos.setMaxListeners(0);
// Eventos de negócio (ex.: nova solicitação) só são emitidos depois de gravados
const emitir = (tipo, dados) => setImmediate(() => eventos.emit('evento', { tipo, dados, rev: db?.rev || 0 }));

// ---------- Alterações feitas por fora (ex.: npm run criar-admin com a API rodando) ----------
// Guardamos a "assinatura" (data de modificação + tamanho) do arquivo que nós mesmos gravamos/lemos.
// Se ela mudar, outro processo gravou o arquivo: recarregamos antes de atender a requisição e,
// por segurança, nunca gravamos por cima sem trazer os usuários que o outro processo criou ou alterou.
let assinatura = null;
const assinar = () => { try { const st = fs.statSync(DATA_FILE); assinatura = `${st.mtimeMs}:${st.size}`; } catch { assinatura = null; } };
const alteradoPorFora = () => {
  try { const st = fs.statSync(DATA_FILE); return assinatura !== null && `${st.mtimeMs}:${st.size}` !== assinatura; } catch { return false; }
};
function lerDisco() {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  migrar(d, gerarSeed);
  return d;
}

// Chamado no início de cada requisição
function sincronizarDisco() {
  if (!db || !alteradoPorFora()) return false;
  try {
    db = lerDisco();
    limparIndices();
    assinar();
    console.log('Dados recarregados: o arquivo foi alterado por outro processo (ex.: npm run criar-admin).');
    const rev = db.rev || 0;
    setImmediate(() => eventos.emit('evento', { tipo: 'rev', rev }));
    return true;
  } catch (e) {
    console.error(`Não foi possível recarregar ${DATA_FILE}: ${e.message}`);
    return false;
  }
}

// Traz usuários criados/alterados por fora para a memória (último recurso antes de gravar)
function mesclarUsuariosDoDisco() {
  try {
    const disco = lerDisco();
    for (const u of disco.usuarios || []) {
      const i = db.usuarios.findIndex((x) => x.id === u.id || x.email === u.email);
      if (i === -1) db.usuarios.push(u);
      else if ((u.atualizadoEm || '') > (db.usuarios[i].atualizadoEm || '')) db.usuarios[i] = u;
    }
    if ((disco.config?.licencas?.total || 0) > (db.config?.licencas?.total || 0)) db.config.licencas.total = disco.config.licencas.total;
  } catch { /* arquivo ilegível: segue com a memória */ }
}

// Várias gravações na mesma requisição geram um único aviso "rev" para as telas abertas
let revAgendada = false;
function avisarRev() {
  if (revAgendada) return;
  revAgendada = true;
  setImmediate(() => { revAgendada = false; eventos.emit('evento', { tipo: 'rev', rev: db?.rev || 0 }); });
}

function salvar() {
  if (alteradoPorFora()) mesclarUsuariosDoDisco();
  db.rev = (db.rev || 0) + 1;
  db.revEm = new Date().toISOString();
  limparIndices();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  // JSON compacto: grava mais rápido e ocupa ~40% menos que o formatado
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
  assinar();
  avisarRev();
}

function carregar() {
  if (db) return db;
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
      console.warn('db.json corrompido — recriando com dados de exemplo.');
      db = null;
    }
  }
  if (!db) {
    db = gerarSeed();
    salvar();
  } else if (migrar(db, gerarSeed)) {
    salvar();
  } else {
    assinar();
  }
  return db;
}

const list = (col) => carregar()[col];
function get(col, id) {
  const arr = list(col);
  if (!Array.isArray(arr)) return null;
  let idx = indices.get(col);
  // O índice só vale para o mesmo array com o mesmo tamanho (inserções e remoções o invalidam)
  if (!idx || idx.arr !== arr || idx.n !== arr.length) {
    idx = { arr, n: arr.length, mapa: new Map(arr.map((x) => [x.id, x])) };
    indices.set(col, idx);
  }
  return idx.mapa.get(id) || null;
}

function insert(col, obj) {
  const now = new Date().toISOString();
  const item = { id: crypto.randomUUID(), ...obj, criadoEm: obj.criadoEm || now, atualizadoEm: now };
  list(col).push(item);
  salvar();
  return item;
}

function update(col, id, patch) {
  const arr = list(col);
  const i = arr.findIndex((x) => x.id === id);
  if (i === -1) return null;
  arr[i] = { ...arr[i], ...patch, id, atualizadoEm: new Date().toISOString() };
  indices.delete(col);
  salvar();
  return arr[i];
}

function remove(col, id) {
  const arr = list(col);
  const i = arr.findIndex((x) => x.id === id);
  if (i === -1) return false;
  arr.splice(i, 1);
  indices.delete(col);
  salvar();
  return true;
}

// Executa várias alterações e grava uma única vez (operações compostas, ex.: reservar notebook)
function transacao(fn) {
  carregar();
  const copia = JSON.stringify(db);
  try {
    const r = fn(db);
    salvar();
    return r;
  } catch (e) {
    db = JSON.parse(copia); // desfaz tudo em caso de erro
    limparIndices();
    throw e;
  }
}

function nextSeq(nome) {
  carregar().seq[nome] = (db.seq[nome] || 1000) + 1;
  return db.seq[nome];
}

// Registro de auditoria (aba "Atividade"). O usuário vem do contexto da requisição.
function log({ acao, entidade, entidadeId, titulo, detalhe = '', usuario, salvarAgora = true }) {
  const ctx = contexto.getStore();
  const h = list('historico');
  h.unshift({
    id: crypto.randomUUID(), em: new Date().toISOString(), acao, entidade, entidadeId, titulo, detalhe,
    usuario: usuario || ctx?.usuario?.nome || 'Sistema',
    usuarioId: ctx?.usuario?.id || null,
    perfil: ctx?.usuario?.perfil || null,
    ip: ctx?.ip || null
  });
  if (h.length > 1000) h.length = 1000;
  if (salvarAgora) salvar();
}

// Restaura os dados de exemplo (equipamentos, estoque, solicitações).
// Usuários, sessões, licenças e a fila de e-mails são SEMPRE mantidos — ninguém perde o acesso.
function reset() {
  const atual = db ? { usuarios: db.usuarios, sessoes: db.sessoes, notificacoes: db.notificacoes, licencas: db.config?.licencas } : null;
  const rev = db?.rev || 0;
  db = gerarSeed();
  limparIndices();
  db.rev = rev;
  if (atual) {
    db.usuarios = atual.usuarios || [];
    db.sessoes = atual.sessoes || [];
    db.notificacoes = atual.notificacoes || [];
    if (atual.licencas) db.config.licencas = atual.licencas;
  }
  salvar();
}

const rev = () => carregar().rev || 0;
const revEm = () => carregar().revEm || null;

// Backup sem dados sensíveis de autenticação
function snapshot() {
  const s = JSON.parse(JSON.stringify(carregar()));
  s.usuarios = s.usuarios.map(({ senhaHash, salt, ...u }) => u);
  delete s.sessoes;
  return s;
}

module.exports = { memo, sincronizarDisco, list, get, insert, update, remove, transacao, nextSeq, log, reset, snapshot, salvar, rev, revEm, contexto, eventos, emitir, DATA_FILE };
