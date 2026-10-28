// Controle interno de licenças de usuário.
//
// Cada usuário tem uma licença { status, validaAte, atribuidaEm }:
//   • ativa     — ocupa uma vaga e permite acessar o sistema
//   • pendente  — cadastrado, aguardando ativação (não acessa)
//   • suspensa  — bloqueada pelo administrador (não acessa)
//   • expirada  — calculada: licença ativa com "validaAte" no passado (não acessa e libera a vaga)
//
// A quantidade de licenças contratadas fica em db.config.licencas.total e nunca pode ser ultrapassada.
// A verificação acontece no login e em TODA requisição autenticada (middleware autenticar).
//
// Integração futura: troque PROVEDOR por um adaptador que consulte um serviço externo
// (mesma interface: nome, total(), validar(usuario)). O restante do sistema não muda.
const db = require('./db');
const { falha } = require('./http');

const STATUS = ['ativa', 'pendente', 'suspensa'];
const NOMES = { ativa: 'Licença ativa', pendente: 'Licença pendente', suspensa: 'Licença suspensa', expirada: 'Licença expirada' };
const hoje = () => new Date().toISOString().slice(0, 10);

const PROVEDOR = {
  nome: 'interno',
  total: () => db.list('config')?.licencas?.total ?? 0,
  // Retorna null se a licença permite o acesso, ou o motivo do bloqueio
  validar: (u) => {
    const st = statusEfetivo(u);
    return st === 'ativa' ? null : st;
  }
};

function statusEfetivo(u) {
  const l = u?.licenca;
  if (!l || !STATUS.includes(l.status)) return 'pendente';
  if (l.status === 'ativa' && l.validaAte && l.validaAte < hoje()) return 'expirada';
  return l.status;
}

const utilizadas = (excetoId) => db.list('usuarios').filter((u) => u.id !== excetoId && statusEfetivo(u) === 'ativa').length;

function resumo() {
  const total = PROVEDOR.total();
  const usados = utilizadas();
  const porStatus = { ativa: 0, pendente: 0, suspensa: 0, expirada: 0 };
  for (const u of db.list('usuarios')) porStatus[statusEfetivo(u)]++;
  return { provedor: PROVEDOR.nome, total, utilizadas: usados, disponiveis: Math.max(0, total - usados), porStatus };
}

// Valida e monta a licença nova de um usuário, respeitando o limite de vagas
function montar(usuarioAtual, { status, validaAte } = {}) {
  const atual = usuarioAtual?.licenca || {};
  const st = status ?? atual.status ?? 'pendente';
  if (!STATUS.includes(st)) falha(422, 'Status de licença inválido.', { licenca: 'Escolha ativa, pendente ou suspensa.' });
  const validade = validaAte === undefined ? (atual.validaAte || '') : String(validaAte || '');
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) falha(422, 'Data de validade inválida.', { validaAte: 'Data inválida.' });
  if (st === 'ativa' && validade && validade < hoje()) falha(422, 'A validade não pode estar no passado.', { validaAte: 'Escolha uma data futura.' });
  const nova = { status: st, validaAte: validade, atribuidaEm: atual.atribuidaEm || '' };
  const ocupavaVaga = usuarioAtual ? statusEfetivo(usuarioAtual) === 'ativa' : false;
  if (st === 'ativa' && !ocupavaVaga) {
    const total = PROVEDOR.total();
    if (utilizadas(usuarioAtual?.id) >= total) falha(409, `Não há licenças disponíveis (${total} de ${total} em uso). Aumente a quantidade contratada ou suspenda uma licença.`, { licenca: 'Sem licenças disponíveis.' });
    nova.atribuidaEm = new Date().toISOString();
  }
  return nova;
}

function definirTotal(total) {
  const n = Math.floor(Number(total));
  if (!(n >= 1) || n > 10000) falha(422, 'Informe de 1 a 10.000 licenças.', { total: 'Quantidade inválida.' });
  const usados = utilizadas();
  if (n < usados) falha(409, `Já existem ${usados} licenças em uso. Suspenda licenças antes de reduzir para ${n}.`, { total: `Mínimo: ${usados}.` });
  db.transacao((d) => { d.config.licencas = { ...d.config.licencas, total: n, atualizadoEm: new Date().toISOString() }; });
  return resumo();
}

module.exports = { STATUS, NOMES, PROVEDOR, statusEfetivo, utilizadas, resumo, montar, definirTotal };
