// Migração automática do banco (db.json) para a versão 4:
//  • remove os chamados de suporte técnico (e o histórico deles);
//  • deixa só dois perfis: Operador (TI) e Solicitante (RH);
//  • converte solicitações antigas (só notebook) para o formato com itens, entrega e envio;
//  • cria o estoque de itens por quantidade (acessórios) se ainda não existir.
// Versão 5:
//  • contas de demonstração (…@ativotech.local) são desativadas, perdem a senha e a licença (os registros ficam no histórico);
//  • todo usuário passa a ter licença; Operadores existentes viram administradores;
//  • sessões antigas são encerradas (o login agora exige prefixo da empresa e perfil);
//  • nova fila de notificações por e-mail e configuração de licenças.
// Versão 6:
//  • proprietário do equipamento (H&CO ou H&CO B2Finance) em ativos, acessórios, solicitações e movimentações —
//    registros existentes recebem "H&CO" (o Operador pode corrigir em lote na tela de Ativos);
//  • cadastro de colaboradores (e-mail corporativo) e vínculo colaborador ↔ equipamento;
//  • índice das importações de planilhas (o detalhe de cada importação fica em data/importacoes/).
// Os ativos cadastrados são sempre preservados.
const crypto = require('crypto');
const config = require('./config');

const VERSAO = 6;
const COLECOES = ['ativos', 'eventos', 'historico', 'solicitacoes', 'usuarios', 'sessoes', 'conferencias', 'estoqueItens', 'movimentacoes', 'notificacoes', 'colaboradores', 'importacoes'];
const PADRAO = 'H&CO';
const DEMO_IDS = new Set(['usr-ti', 'usr-ti2', 'usr-rh', 'usr-rh2', 'usr-admin']);
const ehDemo = (u) => DEMO_IDS.has(u.id) || /@ativotech\.local$/i.test(u.email || '');
const MAPA_STATUS = {
  'Aberto': 'Pendente', 'Em análise': 'Em análise', 'Aguardando equipamento': 'Aguardando estoque', 'Aprovado': 'Em análise',
  'Em preparação': 'Em preparação', 'Pronto para envio': 'Em preparação', 'Atendido': 'Entregue', 'Cancelado': 'Cancelado'
};

function migrar(db, gerarSeed) {
  let mudou = false;
  for (const c of COLECOES) if (!Array.isArray(db[c])) { db[c] = []; mudou = true; }
  db.seq ||= {};
  db.seq.solicitacao ||= 1000;
  if (!db.config || typeof db.config !== 'object') { db.config = {}; mudou = true; }
  if (!db.config.licencas) { db.config.licencas = { total: config.licencasIniciais }; mudou = true; }
  if ((db.versao || 0) >= VERSAO) return mudou;
  if ((db.versao || 0) >= 5) return migrarV6(db);
  if ((db.versao || 0) >= 4) return migrarV5(db);

  const seed = gerarSeed();

  // 1) Chamados de suporte deixam de existir
  delete db.chamados;
  delete db.seq.chamado;
  db.historico = db.historico.filter((h) => h.entidade !== 'chamado');
  for (const e of db.eventos) delete e.chamadoId;

  // 2) Usuários: perfis "admin" e "ti" viram Operador (ti); "rh" vira Solicitante
  if (!db.usuarios.length) db.usuarios = seed.usuarios;
  else for (const u of db.usuarios) {
    if (u.perfil === 'admin') u.perfil = 'ti';
    delete u.escopo;
  }

  // 3) Itens de estoque por quantidade
  if (!db.estoqueItens.length) {
    db.estoqueItens = seed.estoqueItens.map((i) => ({ ...i, reservado: 0 }));
    db.movimentacoes = [...seed.movimentacoes.filter((m) => m.tipo === 'entrada' && m.alvo === 'item'), ...db.movimentacoes];
  }

  // 4) Solicitações no formato antigo → itens + entrega + envio
  if (!db.solicitacoes.length) {
    // Bancos sem solicitações recebem as de exemplo que não dependem de equipamentos inexistentes
    const ids = new Set(db.ativos.map((a) => a.id));
    db.solicitacoes = seed.solicitacoes.filter((s) => s.itens.every((l) => (l.ativoIds || []).every((id) => ids.has(id))) && !s.itens.some((l) => l.reservado || l.enviado));
    db.seq.solicitacao = Math.max(db.seq.solicitacao, seed.seq.solicitacao);
  } else {
    for (const s of db.solicitacoes) {
      if (Array.isArray(s.itens)) continue;
      s.status = MAPA_STATUS[s.status] || 'Pendente';
      s.itens = [{ id: crypto.randomUUID(), tipo: 'ativo', categoria: 'Notebook', quantidade: 1, especificacao: '', ativoIds: s.ativoId ? [s.ativoId] : [] }];
      s.entrega = { modalidade: 'retirada', unidade: s.localidade || 'Matriz', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', destinatario: s.nomeAdmitido, telefone: '' };
      s.envio = s.status === 'Entregue' ? { transportadora: '', codigoRastreio: '', dataEnvio: '', entregueEm: s.atendidoEm || s.atualizadoEm, recebidoPor: s.nomeAdmitido } : null;
      s.vistaPorTI = { em: s.criadoEm, por: 'Migração' };
      for (const a of s.atualizacoes || []) if (a.status) a.status = MAPA_STATUS[a.status] || a.status;
      delete s.ativoId; delete s.localidade; delete s.atendidoEm;
    }
  }

  return migrarV5(db);
}

function migrarV5(db) {
  const agora = new Date().toISOString();
  for (const u of db.usuarios) {
    if (ehDemo(u)) {
      // Senhas de demonstração eram públicas: a conta fica inutilizável até um administrador redefinir
      Object.assign(u, { ativo: false, demo: true, senhaHash: null, salt: null, admin: false, licenca: { status: 'suspensa', validaAte: '', atribuidaEm: '' }, atualizadoEm: agora });
      continue;
    }
    u.empresa ||= config.empresas[0].prefixo;
    if (u.admin === undefined) u.admin = u.perfil === 'ti';
    if (!u.licenca) u.licenca = { status: u.ativo ? 'ativa' : 'suspensa', validaAte: '', atribuidaEm: u.ativo ? agora : '' };
    if (u.notificacoesEmail === undefined) u.notificacoesEmail = true;
  }
  // Garante vagas para quem já estava ativo
  const ativas = db.usuarios.filter((u) => u.licenca?.status === 'ativa').length;
  db.config.licencas.total = Math.max(db.config.licencas.total || 0, ativas, 1);
  db.sessoes = [];
  db.versao = 5;
  return migrarV6(db);
}

function migrarV6(db) {
  let ajustados = 0;
  for (const a of db.ativos) {
    if (!a.proprietario) { a.proprietario = PADRAO; ajustados++; }
    if (a.colaboradorId === undefined) a.colaboradorId = null;
  }
  for (const i of db.estoqueItens) i.proprietario ||= PADRAO;
  for (const s of db.solicitacoes) {
    s.proprietario ||= PADRAO;
    if (s.emailColaborador === undefined) s.emailColaborador = '';
    if (s.colaboradorId === undefined) s.colaboradorId = null;
    for (const l of s.itens || []) l.proprietario ||= s.proprietario;
  }
  const porAtivo = new Map(db.ativos.map((a) => [a.id, a.proprietario]));
  const porItem = new Map(db.estoqueItens.map((i) => [i.id, i.proprietario]));
  for (const m of db.movimentacoes) m.proprietario ||= porAtivo.get(m.ativoId) || porItem.get(m.itemId) || PADRAO;
  if (ajustados) {
    db.historico.unshift({ id: crypto.randomUUID(), em: new Date().toISOString(), acao: 'atualizou', entidade: 'sistema', entidadeId: null,
      titulo: 'Atualização para a versão 6', detalhe: `${ajustados} equipamento(s) existentes receberam o proprietário "${PADRAO}". Revise em Ativos → filtro Proprietário.`, usuario: 'Sistema' });
  }
  db.versao = VERSAO;
  return true;
}

module.exports = { migrar, VERSAO, COLECOES };
