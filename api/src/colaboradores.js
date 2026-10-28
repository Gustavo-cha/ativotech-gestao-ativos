// Colaboradores: quem recebe e usa os equipamentos (identificados pelo e-mail corporativo).
// Usado pelo cadastro de ativos, pela entrega das solicitações e pela importação de planilhas.
const crypto = require('crypto');
const db = require('./db');
const D = require('./domain');
const config = require('./config');

const porEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  return e ? db.list('colaboradores').find((c) => c.email === e) || null : null;
};

function validar(dados, idAtual = null) {
  return D.validarColaborador(dados, { existentes: db.list('colaboradores'), idAtual, dominios: config.dominiosColaborador });
}

// Cria o colaborador (deve ser chamado dentro de db.transacao; quem chama grava)
function criar(dados, { origem = 'cadastro' } = {}) {
  const { data, errors } = validar(dados);
  if (Object.keys(errors).length) return { erros: errors };
  const agora = new Date().toISOString();
  const c = { id: crypto.randomUUID(), ...data, origem, criadoEm: agora, atualizadoEm: agora };
  db.list('colaboradores').push(c);
  db.log({ acao: 'criou', entidade: 'colaborador', entidadeId: c.id, titulo: c.nome, detalhe: `${c.email} · ${c.empresa}`, salvarAgora: false });
  return { colaborador: c, criado: true };
}

// Mesmo e-mail = mesma pessoa: devolve o existente (completando campos vazios) ou cria um novo
function encontrarOuCriar(dados, opcoes = {}) {
  const existente = porEmail(dados?.email);
  if (existente) {
    let mudou = false;
    for (const k of ['cargo', 'departamento', 'matricula', 'localidade']) {
      const v = String(dados?.[k] || '').trim().slice(0, 120);
      if (v && !existente[k]) { existente[k] = v; mudou = true; }
    }
    if (mudou) existente.atualizadoEm = new Date().toISOString();
    return { colaborador: existente, criado: false };
  }
  return criar({ empresa: D.PROPRIETARIO_PADRAO, ...dados }, opcoes);
}

// Equipamentos em posse do colaborador (vínculo direto)
const equipamentosDe = (id) => db.list('ativos').filter((a) => a.colaboradorId === id);

module.exports = { porEmail, validar, criar, encontrarOuCriar, equipamentosDe };
