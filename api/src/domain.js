// Regras de negócio, listas de valores e validações de todas as entidades.

const CATEGORIAS = ['Notebook', 'Desktop', 'Monitor', 'Smartphone', 'Tablet', 'Impressora', 'Rede', 'Servidor', 'Periférico', 'Outro'];
const STATUS_ATIVO = ['Disponível', 'Em uso', 'Em manutenção', 'Descartado'];
// Vida útil (anos) usada no cálculo de depreciação linear e alerta de fim de vida
const VIDA_UTIL = { Notebook: 4, Desktop: 5, Monitor: 5, Smartphone: 3, Tablet: 3, Impressora: 5, Rede: 7, Servidor: 6, 'Periférico': 3, Outro: 5 };

// Proprietário do equipamento — os estoques das duas organizações nunca se misturam
const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];
const PROPRIETARIO_PADRAO = 'H&CO';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const TIPOS_EVENTO = ['Manutenção', 'Entrega', 'Devolução', 'Renovação', 'Auditoria', 'Reunião', 'Outro'];

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const hojeISO = () => toISODate(new Date());
function toISODate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function limpar(body, campos) {
  const data = {};
  for (const c of campos) {
    let v = body?.[c];
    if (typeof v === 'string') v = v.trim();
    data[c] = v ?? '';
  }
  return data;
}

function normalizarTags(v) {
  const lista = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(lista.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12);
}

// ---------- Ativos ----------
const CAMPOS_ATIVO = ['patrimonio', 'nome', 'categoria', 'marca', 'modelo', 'numeroSerie', 'status', 'responsavel',
  'departamento', 'localizacao', 'dataAquisicao', 'valor', 'garantiaAte', 'observacoes',
  'hostname', 'sistemaOperacional', 'ip', 'fornecedor', 'notaFiscal', 'tags', 'configuracao', 'dataEntradaEstoque',
  'proprietario', 'colaboradorId'];

function validarAtivo(body, { existentes = [], idAtual = null } = {}) {
  const errors = {};
  const data = limpar(body, CAMPOS_ATIVO);
  data.tags = normalizarTags(body?.tags);

  if (!data.patrimonio) errors.patrimonio = 'Informe o número de patrimônio.';
  else if (String(data.patrimonio).length > 60) errors.patrimonio = 'Máximo de 60 caracteres.';
  else if (existentes.some((a) => a.patrimonio.toLowerCase() === String(data.patrimonio).toLowerCase() && a.id !== idAtual))
    errors.patrimonio = 'Já existe um ativo com este patrimônio.';
  if (!PROPRIETARIOS.includes(data.proprietario)) errors.proprietario = 'Escolha o proprietário do equipamento (H&CO ou H&CO B2Finance).';
  if (!data.colaboradorId) data.colaboradorId = null;
  for (const k of ['marca', 'modelo', 'numeroSerie', 'responsavel', 'departamento', 'localizacao', 'hostname', 'sistemaOperacional', 'fornecedor', 'notaFiscal'])
    if (String(data[k]).length > 120) errors[k] = 'Máximo de 120 caracteres.';
  if (String(data.observacoes).length > 2000) errors.observacoes = 'Máximo de 2000 caracteres.';

  if (!data.nome) errors.nome = 'Informe o nome do ativo.';
  else if (data.nome.length > 120) errors.nome = 'Máximo de 120 caracteres.';

  if (!CATEGORIAS.includes(data.categoria)) errors.categoria = 'Categoria inválida.';
  if (!STATUS_ATIVO.includes(data.status)) errors.status = 'Status inválido.';
  if (data.status === 'Em uso' && !data.responsavel && !data.colaboradorId) errors.responsavel = 'Ativos "Em uso" precisam de um colaborador ou responsável.';

  if (data.dataAquisicao && !isDate(data.dataAquisicao)) errors.dataAquisicao = 'Data inválida.';
  else if (data.dataAquisicao && data.dataAquisicao > hojeISO()) errors.dataAquisicao = 'A aquisição não pode estar no futuro.';
  if (data.garantiaAte && !isDate(data.garantiaAte)) errors.garantiaAte = 'Data inválida.';
  if (isDate(data.dataAquisicao) && isDate(data.garantiaAte) && data.garantiaAte < data.dataAquisicao)
    errors.garantiaAte = 'A garantia não pode terminar antes da aquisição.';

  if (data.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip)) errors.ip = 'IP inválido (ex.: 10.0.0.15).';
  if (data.dataEntradaEstoque && !isDate(data.dataEntradaEstoque)) errors.dataEntradaEstoque = 'Data inválida.';
  else if (data.dataEntradaEstoque && data.dataEntradaEstoque > hojeISO()) errors.dataEntradaEstoque = 'A entrada no estoque não pode estar no futuro.';
  if (!data.dataEntradaEstoque) data.dataEntradaEstoque = data.dataAquisicao || '';
  if (String(data.configuracao).length > 200) errors.configuracao = 'Máximo de 200 caracteres.';

  if (data.valor === '' || data.valor === null) data.valor = 0;
  const valor = Number(data.valor);
  if (Number.isNaN(valor) || valor < 0) errors.valor = 'Valor deve ser maior ou igual a zero.';
  else data.valor = Math.round(valor * 100) / 100;

  return { data, errors };
}

// Campos calculados devolvidos pela API (não são gravados)
function enriquecerAtivo(a) {
  const hoje = hojeISO();
  const vida = VIDA_UTIL[a.categoria] || 5;
  let idadeMeses = null;
  let valorAtual = a.valor;
  if (isDate(a.dataAquisicao)) {
    idadeMeses = Math.max(0, Math.floor(diasEntre(a.dataAquisicao, hoje) / 30.44));
    valorAtual = Math.round(Math.max(0, a.valor * (1 - idadeMeses / (vida * 12))) * 100) / 100;
  }
  let diasGarantia = null;
  let garantiaStatus = 'sem';
  if (isDate(a.garantiaAte)) {
    diasGarantia = diasEntre(hoje, a.garantiaAte);
    garantiaStatus = diasGarantia < 0 ? 'vencida' : diasGarantia <= 60 ? 'vencendo' : 'vigente';
  }
  return {
    ...a,
    vidaUtilAnos: vida,
    idadeMeses,
    valorAtual: a.status === 'Descartado' ? 0 : valorAtual,
    diasGarantia,
    garantiaStatus,
    fimDeVida: idadeMeses !== null && idadeMeses >= vida * 12,
    diasNoStatus: a.statusDesde ? diasEntre(a.statusDesde.slice(0, 10), hoje) : null
  };
}

// ---------- Eventos (agenda) ----------
const CAMPOS_EVENTO = ['titulo', 'tipo', 'data', 'hora', 'ativoId', 'responsavel', 'descricao', 'concluido'];

function validarEvento(body, { ativos = [] } = {}) {
  const errors = {};
  const data = limpar(body, CAMPOS_EVENTO);
  data.concluido = body?.concluido === true || body?.concluido === 'true';
  if (!data.titulo) errors.titulo = 'Informe um título.';
  if (!TIPOS_EVENTO.includes(data.tipo)) errors.tipo = 'Tipo inválido.';
  if (!isDate(data.data)) errors.data = 'Informe uma data válida.';
  if (data.hora && !isHora(data.hora)) errors.hora = 'Hora inválida (HH:MM).';
  if (data.ativoId && !ativos.some((a) => a.id === data.ativoId)) errors.ativoId = 'Ativo não encontrado.';
  if (!data.ativoId) data.ativoId = null;
  return { data, errors };
}

// ---------- Solicitações de equipamentos (RH → TI) ----------
const TIPOS_SOLICITACAO = ['Nova admissão', 'Substituição de equipamento', 'Outra necessidade'];
const STATUS_SOLICITACAO = ['Pendente', 'Em análise', 'Aguardando estoque', 'Em preparação', 'Enviado', 'Entregue', 'Cancelado'];
const STATUS_FINAIS = ['Entregue', 'Cancelado'];
// Etapas mostradas na linha do tempo ("Aguardando estoque" é um desvio entre análise e preparação)
const ETAPAS_SOLICITACAO = ['Pendente', 'Em análise', 'Em preparação', 'Enviado', 'Entregue'];
// Transições permitidas — impedem saltos indevidos (ex.: Pendente → Entregue)
const TRANSICOES = {
  'Pendente': ['Em análise', 'Aguardando estoque', 'Em preparação', 'Cancelado'],
  'Em análise': ['Aguardando estoque', 'Em preparação', 'Cancelado'],
  'Aguardando estoque': ['Em análise', 'Em preparação', 'Cancelado'],
  'Em preparação': ['Em análise', 'Aguardando estoque', 'Enviado', 'Entregue', 'Cancelado'],
  'Enviado': ['Entregue'],
  'Entregue': [],
  'Cancelado': []
};
// O solicitante (RH) pode cancelar enquanto a TI ainda não começou a preparar
const RH_PODE_CANCELAR = ['Pendente', 'Em análise', 'Aguardando estoque'];
const MODALIDADES_ENTREGA = ['envio', 'retirada'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const TRANSPORTADORAS = ['Correios (SEDEX)', 'Correios (PAC)', 'Jadlog', 'Loggi', 'Total Express', 'Azul Cargo', 'Motoboy', 'Entrega própria (TI)', 'Outra'];
// Equipamentos com patrimônio que podem ser pedidos (cada unidade é um ativo)
const CATEGORIAS_SOLICITAVEIS = ['Notebook', 'Monitor', 'Smartphone', 'Tablet'];
const CATEGORIAS_ITEM_ESTOQUE = ['Periférico', 'Acessório', 'Cabo e adaptador', 'Áudio', 'Outro'];

const CAMPOS_SOLICITACAO = ['solicitanteNome', 'nomeAdmitido', 'departamento', 'cargo', 'dataAdmissao', 'tipo', 'observacoes', 'equipamentoAtual', 'proprietario', 'emailColaborador'];
const CAMPOS_ENTREGA = ['modalidade', 'unidade', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'destinatario', 'telefone'];
const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// Valida o pedido. "catalogo" = itens de estoque por quantidade (para conferir ids)
function validarSolicitacao(body, { itensEstoque = [], dominios = [] } = {}) {
  const errors = {};
  const data = limpar(body, CAMPOS_SOLICITACAO);
  const req = (k, msg, min = 2) => { if (String(data[k]).length < min) errors[k] = msg; };
  req('solicitanteNome', 'Informe o nome de quem está solicitando.');
  req('nomeAdmitido', 'Informe o nome completo do colaborador.', 3);
  req('departamento', 'Informe o departamento ou área.');
  req('cargo', 'Informe o cargo.');
  for (const k of ['solicitanteNome', 'nomeAdmitido', 'departamento', 'cargo', 'equipamentoAtual'])
    if (String(data[k]).length > 120) errors[k] = 'Máximo de 120 caracteres.';
  if (String(data.observacoes).length > 1000) errors.observacoes = 'Máximo de 1000 caracteres.';
  if (!TIPOS_SOLICITACAO.includes(data.tipo)) errors.tipo = 'Escolha o tipo de solicitação.';
  if (!isDate(data.dataAdmissao)) errors.dataAdmissao = 'Informe uma data válida.';
  else if (data.dataAdmissao < hojeISO()) errors.dataAdmissao = 'A data não pode estar no passado.';
  else if (diasEntre(hojeISO(), data.dataAdmissao) > 365) errors.dataAdmissao = 'Data muito distante (máximo de 1 ano).';
  if (data.tipo === 'Substituição de equipamento' && !data.equipamentoAtual)
    errors.equipamentoAtual = 'Informe o patrimônio ou modelo do equipamento atual.';
  if (!PROPRIETARIOS.includes(data.proprietario)) errors.proprietario = 'Escolha de qual empresa são os equipamentos (H&CO ou H&CO B2Finance).';
  data.emailColaborador = String(data.emailColaborador || '').toLowerCase();
  const erroEmail = validarEmailCorporativo(data.emailColaborador, { obrigatorio: false, dominios });
  if (erroEmail) errors.emailColaborador = erroEmail;

  // Itens pedidos
  const itens = [];
  const brutos = Array.isArray(body?.itens) ? body.itens : [];
  const vistos = new Set();
  for (const it of brutos.slice(0, 15)) {
    const quantidade = Math.floor(Number(it?.quantidade) || 0);
    if (it?.tipo === 'ativo') {
      if (!CATEGORIAS_SOLICITAVEIS.includes(it.categoria)) { errors.itens = `Equipamento inválido: ${it.categoria || '?'}.`; continue; }
      if (quantidade < 1 || quantidade > 3) { errors.itens = `${it.categoria}: quantidade de 1 a 3.`; continue; }
      if (vistos.has(`a:${it.categoria}`)) continue;
      vistos.add(`a:${it.categoria}`);
      itens.push({ tipo: 'ativo', categoria: it.categoria, proprietario: data.proprietario, quantidade, especificacao: String(it.especificacao || '').trim().slice(0, 200) });
    } else if (it?.tipo === 'acessorio') {
      const cat = itensEstoque.find((x) => x.id === it.itemId && x.ativo !== false);
      if (!cat) { errors.itens = 'Um dos acessórios escolhidos não está mais disponível no catálogo.'; continue; }
      if ((cat.proprietario || PROPRIETARIO_PADRAO) !== data.proprietario) { errors.itens = `${cat.nome} pertence ao estoque da ${cat.proprietario || PROPRIETARIO_PADRAO}. Escolha itens do mesmo proprietário da solicitação.`; continue; }
      if (quantidade < 1 || quantidade > 10) { errors.itens = `${cat.nome}: quantidade de 1 a 10.`; continue; }
      if (vistos.has(`i:${cat.id}`)) continue;
      vistos.add(`i:${cat.id}`);
      itens.push({ tipo: 'acessorio', itemId: cat.id, nome: cat.nome, proprietario: data.proprietario, quantidade });
    }
  }
  if (!itens.length && !errors.itens) errors.itens = 'Escolha ao menos um equipamento.';

  // Entrega: envio para endereço (com CEP, número, cidade, UF) ou retirada numa unidade
  const entrega = limpar(body?.entrega || {}, CAMPOS_ENTREGA);
  entrega.cep = soDigitos(entrega.cep);
  entrega.telefone = soDigitos(entrega.telefone);
  entrega.uf = String(entrega.uf).toUpperCase();
  if (!MODALIDADES_ENTREGA.includes(entrega.modalidade)) errors['entrega.modalidade'] = 'Escolha envio ou retirada.';
  else if (entrega.modalidade === 'retirada') {
    if (entrega.unidade.length < 2) errors['entrega.unidade'] = 'Informe a unidade de retirada.';
    for (const k of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']) entrega[k] = '';
  } else {
    if (entrega.cep.length !== 8) errors['entrega.cep'] = 'CEP deve ter 8 dígitos.';
    if (entrega.logradouro.length < 3) errors['entrega.logradouro'] = 'Informe rua/avenida.';
    if (!entrega.numero) errors['entrega.numero'] = 'Informe o número (ou "s/n").';
    if (entrega.bairro.length < 2) errors['entrega.bairro'] = 'Informe o bairro.';
    if (entrega.cidade.length < 2) errors['entrega.cidade'] = 'Informe a cidade.';
    if (!UFS.includes(entrega.uf)) errors['entrega.uf'] = 'UF inválida.';
    if (!entrega.destinatario) entrega.destinatario = data.nomeAdmitido;
  }
  if (entrega.telefone && (entrega.telefone.length < 10 || entrega.telefone.length > 11)) errors['entrega.telefone'] = 'Telefone com DDD (10 ou 11 dígitos).';
  for (const k of CAMPOS_ENTREGA) if (String(entrega[k]).length > 150) errors[`entrega.${k}`] = 'Texto muito longo.';

  return { data: { ...data, itens, entrega }, errors };
}

// Endereço numa linha (para listas, etiquetas e "localização" do ativo entregue)
function enderecoResumo(e) {
  if (!e) return '';
  if (e.modalidade === 'retirada') return `Retirada · ${e.unidade}`;
  const cep = e.cep ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : '';
  return [`${e.logradouro}, ${e.numero}${e.complemento ? ` – ${e.complemento}` : ''}`, e.bairro, `${e.cidade}/${e.uf}`, cep].filter(Boolean).join(' · ');
}

function validarEnvio(body, { exigir = false } = {}) {
  const errors = {};
  const d = limpar(body || {}, ['transportadora', 'codigoRastreio', 'dataEnvio', 'previsaoEntrega']);
  d.codigoRastreio = d.codigoRastreio.toUpperCase().replace(/\s+/g, '');
  if (exigir && !d.transportadora) errors.transportadora = 'Informe a transportadora.';
  if (d.transportadora && !TRANSPORTADORAS.includes(d.transportadora)) errors.transportadora = 'Transportadora inválida.';
  if (d.codigoRastreio && !/^[A-Z0-9-]{4,40}$/.test(d.codigoRastreio)) errors.codigoRastreio = 'Código de rastreamento inválido.';
  if (exigir && !d.dataEnvio) errors.dataEnvio = 'Informe a data de envio.';
  if (d.dataEnvio && !isDate(d.dataEnvio)) errors.dataEnvio = 'Data inválida.';
  else if (d.dataEnvio && d.dataEnvio > hojeISO()) errors.dataEnvio = 'A data de envio não pode estar no futuro.';
  if (d.previsaoEntrega && !isDate(d.previsaoEntrega)) errors.previsaoEntrega = 'Data inválida.';
  else if (d.previsaoEntrega && d.dataEnvio && d.previsaoEntrega < d.dataEnvio) errors.previsaoEntrega = 'A previsão não pode ser antes do envio.';
  return { data: d, errors };
}

// ---------- Itens de estoque por quantidade (mouse, teclado, headset…) ----------
function validarItemEstoque(body, { existentes = [], idAtual = null } = {}) {
  const errors = {};
  const d = limpar(body, ['nome', 'categoria', 'unidade', 'localizacao', 'descricao', 'proprietario']);
  d.minimo = Math.max(0, Math.floor(Number(body?.minimo) || 0));
  d.ativo = body?.ativo === undefined ? true : Boolean(body.ativo);
  if (d.nome.length < 2) errors.nome = 'Informe o nome do item.';
  else if (d.nome.length > 80) errors.nome = 'Máximo de 80 caracteres.';
  else if (existentes.some((x) => x.nome.toLowerCase() === d.nome.toLowerCase() && (x.proprietario || PROPRIETARIO_PADRAO) === d.proprietario && x.id !== idAtual)) errors.nome = `Já existe um item com este nome no estoque da ${d.proprietario}.`;
  if (!PROPRIETARIOS.includes(d.proprietario)) errors.proprietario = 'Escolha o proprietário (H&CO ou H&CO B2Finance).';
  if (!CATEGORIAS_ITEM_ESTOQUE.includes(d.categoria)) errors.categoria = 'Categoria inválida.';
  if (!d.unidade) d.unidade = 'un';
  if (d.minimo > 9999) errors.minimo = 'Valor muito alto.';
  return { data: d, errors };
}

// ---------- Colaboradores (quem recebe e usa os equipamentos) ----------
// dominios: lista de domínios corporativos aceitos (vazia = qualquer domínio válido)
function validarEmailCorporativo(email, { obrigatorio = true, dominios = [] } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return obrigatorio ? 'Informe o e-mail corporativo.' : null;
  if (e.length > 150 || !EMAIL_RE.test(e)) return 'E-mail inválido.';
  if (dominios.length && !dominios.some((d) => e.endsWith(`@${d}`))) return `Use o e-mail corporativo (${dominios.map((d) => `@${d}`).join(' ou ')}).`;
  return null;
}

const CAMPOS_COLABORADOR = ['nome', 'email', 'cargo', 'departamento', 'empresa', 'matricula', 'telefone', 'localidade', 'observacoes'];
function validarColaborador(body, { existentes = [], idAtual = null, dominios = [] } = {}) {
  const errors = {};
  const d = limpar(body, CAMPOS_COLABORADOR);
  d.email = String(d.email).toLowerCase();
  d.telefone = String(d.telefone).replace(/\D/g, '');
  d.ativo = body?.ativo === undefined ? true : Boolean(body.ativo);
  if (d.nome.length < 3) errors.nome = 'Informe o nome completo.';
  else if (d.nome.length > 120) errors.nome = 'Máximo de 120 caracteres.';
  const erroEmail = validarEmailCorporativo(d.email, { dominios });
  if (erroEmail) errors.email = erroEmail;
  else if (existentes.some((c) => c.email === d.email && c.id !== idAtual)) errors.email = 'Já existe um colaborador com este e-mail.';
  if (!PROPRIETARIOS.includes(d.empresa)) errors.empresa = 'Escolha a empresa (H&CO ou H&CO B2Finance).';
  for (const k of ['cargo', 'departamento', 'matricula', 'localidade']) if (String(d[k]).length > 120) errors[k] = 'Máximo de 120 caracteres.';
  if (d.telefone && (d.telefone.length < 10 || d.telefone.length > 13)) errors.telefone = 'Telefone com DDD.';
  if (String(d.observacoes).length > 1000) errors.observacoes = 'Máximo de 1000 caracteres.';
  return { data: d, errors };
}

const statusAtivo = (s) => !STATUS_FINAIS.includes(s);

// Situação do equipamento no estoque (derivada dos dados da TI — nunca editada diretamente)
function situacaoEstoque(ativo, solicitacao) {
  if (ativo.status === 'Descartado') return 'baixado';
  if (ativo.status === 'Em manutenção') return 'manutencao';
  if (ativo.status === 'Em uso') return 'em-uso';
  if (ativo.reservadoPara && solicitacao) {
    if (solicitacao.status === 'Enviado') return 'transito';
    if (solicitacao.status === 'Em preparação') return 'preparacao';
    return 'reservado';
  }
  return 'disponivel';
}

module.exports = {
  PROPRIETARIOS, PROPRIETARIO_PADRAO, EMAIL_RE, validarEmailCorporativo, validarColaborador,
  TIPOS_SOLICITACAO, STATUS_SOLICITACAO, STATUS_FINAIS, ETAPAS_SOLICITACAO, TRANSICOES, RH_PODE_CANCELAR,
  MODALIDADES_ENTREGA, UFS, TRANSPORTADORAS, CATEGORIAS_SOLICITAVEIS, CATEGORIAS_ITEM_ESTOQUE,
  validarSolicitacao, validarEnvio, validarItemEstoque, enderecoResumo, statusAtivo, situacaoEstoque,
  CATEGORIAS, STATUS_ATIVO, VIDA_UTIL, TIPOS_EVENTO,
  validarAtivo, enriquecerAtivo, validarEvento,
  isDate, hojeISO, toISODate, diasEntre
};
