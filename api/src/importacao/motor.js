// Motor da importação: transforma cada linha da planilha em um equipamento do Ativos Tech,
// valida, detecta duplicidades (no arquivo e no cadastro) e calcula o que vai mudar — sem gravar nada.
// A gravação só acontece em confirmar(), depois que o Operador revisou a prévia.
const crypto = require('crypto');
const db = require('../db');
const D = require('../domain');
const E = require('../estoque');
const C = require('../colaboradores');
const config = require('../config');
const M = require('./mapear');

// Campos comparados ao atualizar um equipamento existente
const CAMPOS_DADOS = ['nome', 'categoria', 'marca', 'modelo', 'numeroSerie', 'status', 'responsavel', 'departamento', 'localizacao', 'hostname',
  'sistemaOperacional', 'ip', 'configuracao', 'dataAquisicao', 'valor', 'garantiaAte', 'fornecedor', 'notaFiscal', 'dataEntradaEstoque', 'observacoes', 'proprietario'];
// Erros nesses campos não impedem a importação: o valor é descartado e vira aviso
const OPCIONAIS = ['dataAquisicao', 'garantiaAte', 'ip', 'valor', 'dataEntradaEstoque', 'configuracao', 'marca', 'modelo', 'departamento', 'localizacao',
  'hostname', 'sistemaOperacional', 'fornecedor', 'notaFiscal', 'observacoes'];
const ROTULO = Object.fromEntries(M.CAMPOS.map((c) => [c.id, c.label]));
const chave = (v) => String(v ?? '').trim().toUpperCase();
const vazio = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) || v === 0;

const OPCOES_PADRAO = { proprietarioPadrao: '', statusPadrao: 'Disponível', semPatrimonio: 'serie', decisaoDuplicados: 'ignorar', criarColaboradores: true };

function normalizarOpcoes(o = {}) {
  const r = { ...OPCOES_PADRAO, ...o };
  if (!D.PROPRIETARIOS.includes(r.proprietarioPadrao)) r.proprietarioPadrao = '';
  if (!D.STATUS_ATIVO.includes(r.statusPadrao)) r.statusPadrao = 'Disponível';
  if (!['serie', 'erro'].includes(r.semPatrimonio)) r.semPatrimonio = 'serie';
  if (!['ignorar', 'complementar', 'atualizar'].includes(r.decisaoDuplicados)) r.decisaoDuplicados = 'ignorar';
  r.criarColaboradores = r.criarColaboradores !== false;
  return r;
}

function normalizarMapeamento(colunas, m = {}) {
  const validos = new Set(M.CAMPOS.map((c) => c.id));
  const usados = new Set();
  const r = {};
  for (const col of colunas) {
    const campo = m[col];
    if (campo && validos.has(campo) && !usados.has(campo)) { r[col] = campo; usados.add(campo); } else r[col] = '';
  }
  return r;
}

// Contexto do cadastro atual (índices por patrimônio e série), montado uma vez por prévia
function contextoCadastro() {
  const porPat = new Map();
  const porSerie = new Map();
  for (const a of db.list('ativos')) {
    porPat.set(chave(a.patrimonio), a);
    if (a.numeroSerie) porSerie.set(chave(a.numeroSerie), a);
  }
  const colabs = new Map(db.list('colaboradores').map((c) => [c.email, c]));
  return { porPat, porSerie, colabs };
}

// Valor bruto de um campo na linha (edição manual do Operador tem prioridade)
function bruto(linha, sessao, campo) {
  const ed = sessao.edicoes?.[linha.n];
  if (ed && Object.prototype.hasOwnProperty.call(ed, campo)) return String(ed[campo] ?? '');
  const i = sessao.indicePorCampo[campo];
  return i === undefined ? '' : linha.valores[i];
}

function processarLinha(linha, sessao, ctx, vistos) {
  const op = sessao.opcoes;
  const erros = {};
  const avisos = [];
  const b = (campo) => bruto(linha, sessao, campo);
  const d = {};

  // Identificação
  d.patrimonio = M.limparTexto(b('patrimonio'), 60);
  d.numeroSerie = M.limparTexto(b('numeroSerie'), 120);
  if (!d.patrimonio && d.numeroSerie && op.semPatrimonio === 'serie') { d.patrimonio = d.numeroSerie; avisos.push('Sem patrimônio: usado o número de série como patrimônio.'); }

  // Textos simples
  for (const k of ['marca', 'modelo', 'responsavel', 'departamento', 'localizacao', 'hostname', 'sistemaOperacional', 'fornecedor', 'notaFiscal']) d[k] = M.limparTexto(b(k));
  d.configuracao = M.limparTexto(b('configuracao'), 200);
  d.observacoes = M.limparTexto(b('observacoes'), 2000);
  d.ip = M.limparTexto(b('ip'), 40);
  d.tags = [...new Set(String(b('tags') || '').split(/[,;|]/).map((t) => t.trim()).filter(Boolean))].slice(0, 12);

  // Categoria (deduzida do nome/modelo quando a coluna não existe)
  const catBruta = b('categoria');
  let categoria = M.normalizarCategoria(catBruta);
  if (categoria === undefined) { avisos.push(`Categoria "${catBruta}" não reconhecida: importado como "Outro".`); categoria = 'Outro'; }
  if (categoria === null) {
    categoria = M.normalizarCategoria(`${b('nome')} ${d.modelo}`) || null;
    if (categoria) avisos.push(`Categoria deduzida pelo nome: ${categoria}.`);
    else { categoria = 'Outro'; avisos.push('Sem categoria: importado como "Outro".'); }
  }
  d.categoria = categoria;

  // Nome (montado a partir de marca/modelo quando faltar)
  d.nome = M.limparTexto(b('nome'));
  if (!d.nome) {
    d.nome = M.limparTexto([d.categoria !== 'Outro' ? d.categoria : '', d.marca, d.modelo].filter(Boolean).join(' ')) || '';
    if (d.nome) avisos.push('Nome montado a partir da categoria, marca e modelo.');
  }

  // Proprietário (obrigatório): coluna da planilha ou o padrão escolhido na importação
  const propBruto = b('proprietario');
  const prop = M.normalizarProprietario(propBruto);
  if (prop === undefined) erros.proprietario = `Proprietário "${propBruto}" não reconhecido. Use H&CO ou H&CO B2Finance.`;
  else d.proprietario = prop || op.proprietarioPadrao;
  if (!d.proprietario && !erros.proprietario) erros.proprietario = 'Proprietário não informado: escolha o proprietário padrão da importação ou preencha a coluna.';

  // Colaborador pelo e-mail corporativo
  let colaborador = null;
  const email = M.limparTexto(b('colaboradorEmail'), 150).toLowerCase();
  if (email) {
    const erroEmail = D.validarEmailCorporativo(email, { obrigatorio: false, dominios: config.dominiosColaborador });
    if (erroEmail) avisos.push(`E-mail "${email}" ignorado: ${erroEmail}`);
    else {
      const existente = ctx.colabs.get(email);
      const nome = d.responsavel || existente?.nome || email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
      if (existente) colaborador = { id: existente.id, email, nome: existente.nome, novo: false };
      else if (op.criarColaboradores) colaborador = { id: null, email, nome, novo: true };
      else avisos.push(`Colaborador ${email} não cadastrado (criação automática desligada).`);
      if (colaborador) d.responsavel = colaborador.nome;
    }
  }

  // Status (deduzido quando não informado: com colaborador = "Em uso")
  const stBruto = b('status');
  let status = M.normalizarStatus(stBruto);
  if (status === undefined) { erros.status = `Status "${stBruto}" não reconhecido. Use Em uso, Disponível, Em manutenção ou Descartado.`; status = null; }
  if (!status && !erros.status) {
    status = colaborador || d.responsavel ? 'Em uso' : op.statusPadrao;
    if (stBruto === '' && sessao.indicePorCampo.status !== undefined) avisos.push(`Status vazio: definido como "${status}".`);
  }
  d.status = status || op.statusPadrao;

  // Datas e valor
  for (const k of ['dataAquisicao', 'garantiaAte', 'dataEntradaEstoque']) {
    const v = M.normalizarData(b(k));
    if (v === undefined) { avisos.push(`${ROTULO[k]} "${b(k)}" inválida: campo deixado em branco.`); d[k] = ''; } else d[k] = v || '';
  }
  const valor = M.normalizarValor(b('valor'));
  if (valor === undefined) { avisos.push(`Valor "${b('valor')}" inválido: considerado 0.`); d.valor = 0; } else d.valor = valor ?? 0;

  // Validação com as mesmas regras do cadastro manual
  const { data, errors } = D.validarAtivo({ ...d, colaboradorId: colaborador ? (colaborador.id || 'novo') : null }, { existentes: [] });
  for (const [k, msg] of Object.entries(errors)) {
    if (OPCIONAIS.includes(k)) { avisos.push(`${ROTULO[k] || k}: ${msg} Campo deixado em branco.`); data[k] = k === 'valor' ? 0 : ''; } else erros[k] ||= msg;
  }
  if (!d.patrimonio) erros.patrimonio = op.semPatrimonio === 'serie' ? 'Sem patrimônio e sem número de série.' : 'Informe o patrimônio.';
  data.colaboradorId = colaborador?.id || null;

  // Duplicidades dentro do próprio arquivo
  const kp = chave(data.patrimonio);
  const ks = chave(data.numeroSerie);
  if (kp && vistos.pat.has(kp)) erros.patrimonio = `Patrimônio repetido no arquivo (linha ${vistos.pat.get(kp)}).`;
  else if (ks && vistos.serie.has(ks) && !ctx.porSerie.has(ks)) erros.numeroSerie = `Número de série repetido no arquivo (linha ${vistos.serie.get(ks)}).`;
  if (kp && !vistos.pat.has(kp)) vistos.pat.set(kp, linha.n);
  if (ks && !vistos.serie.has(ks)) vistos.serie.set(ks, linha.n);

  // Já existe no cadastro? (patrimônio primeiro; depois número de série)
  let existente = ctx.porPat.get(kp) || null;
  let porSerie = false;
  if (!existente && ks) { existente = ctx.porSerie.get(ks) || null; porSerie = Boolean(existente); }
  const resultado = {
    n: linha.n, original: Object.fromEntries(sessao.colunas.map((c, i) => [c, linha.valores[i]])), dados: data, colaborador,
    erros, avisos, existente: null, diferencas: [], situacao: 'novo', acao: 'criar', editada: Boolean(sessao.edicoes?.[linha.n])
  };
  if (Object.keys(erros).length) { resultado.situacao = 'erro'; resultado.acao = 'ignorar'; return resultado; }
  if (!existente) return resultado;

  resultado.situacao = 'existente';
  resultado.existente = { id: existente.id, patrimonio: existente.patrimonio, nome: existente.nome, numeroSerie: existente.numeroSerie, proprietario: E.prop(existente), status: existente.status };
  if (porSerie && chave(existente.patrimonio) !== kp) avisos.push(`Mesmo número de série do ${existente.patrimonio} (cadastrado com outro patrimônio). O patrimônio cadastrado é mantido.`);
  if (!porSerie && ks && existente.numeroSerie && chave(existente.numeroSerie) !== ks) avisos.push(`Número de série diferente do cadastrado (${existente.numeroSerie}).`);
  const decisao = sessao.decisoes?.[linha.n] || sessao.opcoes.decisaoDuplicados;
  resultado.acao = decisao;
  resultado.diferencas = diferencas(existente, data, colaborador, decisao, avisos);
  if (decisao !== 'ignorar' && !resultado.diferencas.length) resultado.acao = 'ignorar';
  return resultado;
}

// O que muda num equipamento existente. Nunca apaga um valor cadastrado (valores vazios da planilha são ignorados).
function diferencas(existente, novo, colaborador, decisao, avisos) {
  if (decisao === 'ignorar') return [];
  const difs = [];
  const atual = { ...existente, proprietario: E.prop(existente) };
  for (const k of CAMPOS_DADOS) {
    const v = novo[k];
    if (vazio(v) || String(v) === String(atual[k] ?? '')) continue;
    if (decisao === 'complementar' && !vazio(atual[k])) continue;
    if (k === 'numeroSerie' && atual.numeroSerie) continue; // identificador: nunca sobrescrito
    if (existente.reservadoPara && ['status', 'proprietario', 'categoria'].includes(k)) { avisos.push(`${ROTULO[k] || k} não alterado: o equipamento está reservado para uma solicitação.`); continue; }
    difs.push({ campo: k, label: ROTULO[k] || k, atual: atual[k] ?? '', novo: v });
  }
  if (novo.tags?.length) {
    const uniao = [...new Set([...(existente.tags || []), ...novo.tags])].slice(0, 12);
    if (uniao.length !== (existente.tags || []).length) difs.push({ campo: 'tags', label: 'Tags', atual: existente.tags || [], novo: uniao });
  }
  if (colaborador && colaborador.id !== existente.colaboradorId && (decisao === 'atualizar' || !existente.colaboradorId)) {
    if (existente.reservadoPara) avisos.push('Colaborador não alterado: o equipamento está reservado para uma solicitação.');
    else difs.push({ campo: 'colaboradorId', label: 'Colaborador', atual: E.colaboradorResumo(existente.colaboradorId)?.email || '', novo: colaborador.email });
  }
  return difs;
}

// Prévia completa (todas as linhas) + totais
function previa(sessao) {
  sessao.indicePorCampo = {};
  sessao.colunas.forEach((c, i) => { if (sessao.mapeamento[c]) sessao.indicePorCampo[sessao.mapeamento[c]] = i; });
  const ctx = contextoCadastro();
  const vistos = { pat: new Map(), serie: new Map() };
  const resultados = sessao.linhas.map((l) => processarLinha(l, sessao, ctx, vistos));
  const t = { linhas: resultados.length, criar: 0, atualizar: 0, complementar: 0, ignorar: 0, erros: 0, existentes: 0, comAvisos: 0, colaboradoresNovos: 0 };
  const novosColabs = new Set();
  for (const r of resultados) {
    t[r.acao]++;
    if (r.situacao === 'erro') t.erros++;
    if (r.situacao === 'existente') t.existentes++;
    if (r.avisos.length) t.comAvisos++;
    if (r.acao !== 'ignorar' && r.colaborador?.novo) novosColabs.add(r.colaborador.email);
  }
  t.colaboradoresNovos = novosColabs.size;
  const camposMapeados = Object.values(sessao.mapeamento).filter(Boolean);
  const faltando = [];
  if (!camposMapeados.includes('patrimonio') && !(camposMapeados.includes('numeroSerie') && sessao.opcoes.semPatrimonio === 'serie')) faltando.push('Patrimônio (ou Número de série)');
  if (!camposMapeados.includes('proprietario') && !sessao.opcoes.proprietarioPadrao) faltando.push('Proprietário (coluna ou padrão da importação)');
  sessao.resultados = resultados;
  sessao.totais = t;
  sessao.versao = (sessao.versao || 0) + 1;
  return { totais: t, faltando };
}

// ---------- Gravação ----------
const pastaDetalhes = () => require('path').join(require('path').dirname(db.DATA_FILE), 'importacoes');

function confirmar(sessao, usuario) {
  const fs = require('fs');
  const path = require('path');
  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  const detalhes = [];
  const resumo = db.transacao(() => {
    const t = { criados: 0, atualizados: 0, complementados: 0, ignorados: 0, erros: 0, colaboradoresCriados: 0 };
    const colabCriados = new Map();
    const colaboradorDe = (r) => {
      if (!r.colaborador) return null;
      if (r.colaborador.id) return r.colaborador.id;
      if (colabCriados.has(r.colaborador.email)) return colabCriados.get(r.colaborador.email);
      const x = C.encontrarOuCriar({ nome: r.colaborador.nome, email: r.colaborador.email, empresa: r.dados.proprietario, departamento: r.dados.departamento }, { origem: `importação ${sessao.arquivo}` });
      if (x.erros) return null;
      if (x.criado) t.colaboradoresCriados++;
      colabCriados.set(r.colaborador.email, x.colaborador.id);
      return x.colaborador.id;
    };
    const ativos = db.list('ativos');
    const patrimonios = new Set(ativos.map((a) => chave(a.patrimonio)));
    for (const r of sessao.resultados) {
      if (r.situacao === 'erro') { t.erros++; detalhes.push({ n: r.n, acao: 'erro', erros: r.erros, avisos: r.avisos, original: r.original }); continue; }
      if (r.acao === 'ignorar') { t.ignorados++; detalhes.push({ n: r.n, acao: 'ignorado', ativoId: r.existente?.id || null, avisos: r.avisos, original: r.original }); continue; }
      if (r.acao === 'criar') {
        if (patrimonios.has(chave(r.dados.patrimonio))) { t.ignorados++; detalhes.push({ n: r.n, acao: 'ignorado', avisos: [...r.avisos, 'Patrimônio cadastrado por outra pessoa durante a revisão.'], original: r.original }); continue; }
        const colaboradorId = colaboradorDe(r);
        const a = { id: crypto.randomUUID(), ...r.dados, colaboradorId, reservadoPara: null, statusDesde: agora, criadoEm: agora, atualizadoEm: agora, importacaoId: id };
        if (colaboradorId) a.responsavel = db.get('colaboradores', colaboradorId)?.nome || a.responsavel;
        ativos.push(a);
        patrimonios.add(chave(a.patrimonio));
        if (E.solicitavel(a)) E.registrarMov({ tipo: 'entrada', alvo: 'ativo', ativo: a, motivo: `Importação · ${sessao.arquivo}` });
        t.criados++;
        detalhes.push({ n: r.n, acao: 'criado', ativoId: a.id, patrimonio: a.patrimonio, avisos: r.avisos, original: r.original, corrigido: sessao.edicoes[r.n] || undefined });
        continue;
      }
      // Atualizar / complementar um existente (guarda os valores anteriores para auditoria e para desfazer)
      const a = db.get('ativos', r.existente.id);
      if (!a) { t.ignorados++; detalhes.push({ n: r.n, acao: 'ignorado', avisos: [...r.avisos, 'O equipamento foi excluído durante a revisão.'], original: r.original }); continue; }
      const antes = {};
      const depois = {};
      for (const dif of r.diferencas) {
        if (dif.campo === 'colaboradorId') {
          const cid = colaboradorDe(r);
          if (!cid) continue;
          antes.colaboradorId = a.colaboradorId || null;
          antes.responsavel = a.responsavel;
          a.colaboradorId = cid;
          a.responsavel = db.get('colaboradores', cid)?.nome || a.responsavel;
          depois.colaboradorId = cid;
          depois.responsavel = a.responsavel;
          continue;
        }
        if (a.reservadoPara && ['status', 'proprietario', 'categoria'].includes(dif.campo)) continue;
        antes[dif.campo] = a[dif.campo] ?? '';
        a[dif.campo] = dif.novo;
        depois[dif.campo] = dif.novo;
      }
      if (depois.status && depois.status !== antes.status) a.statusDesde = agora;
      if (!Object.keys(depois).length) { t.ignorados++; detalhes.push({ n: r.n, acao: 'ignorado', ativoId: a.id, avisos: r.avisos, original: r.original }); continue; }
      // Mesmas regras do cadastro manual depois da mudança
      const { errors } = D.validarAtivo(a, { existentes: [] });
      if (Object.keys(errors).length) {
        Object.assign(a, antes);
        t.erros++;
        detalhes.push({ n: r.n, acao: 'erro', erros: errors, avisos: r.avisos, original: r.original });
        continue;
      }
      a.atualizadoEm = agora;
      if (r.acao === 'atualizar') t.atualizados++; else t.complementados++;
      detalhes.push({ n: r.n, acao: r.acao === 'atualizar' ? 'atualizado' : 'complementado', ativoId: a.id, patrimonio: a.patrimonio, antes, depois, avisos: r.avisos, original: r.original, corrigido: sessao.edicoes[r.n] || undefined });
    }
    const registro = {
      id, arquivo: sessao.arquivo, formato: sessao.formato, em: agora, por: usuario.nome, porId: usuario.id, linhas: sessao.linhas.length,
      totais: t, mapeamento: sessao.mapeamento, opcoes: sessao.opcoes, desfeitaEm: null, desfeitaPor: null
    };
    const lista = db.list('importacoes');
    lista.unshift(registro);
    if (lista.length > 200) lista.length = 200;
    db.log({ acao: 'importou', entidade: 'importacao', entidadeId: id, titulo: sessao.arquivo,
      detalhe: `${t.criados} criado(s) · ${t.atualizados} atualizado(s) · ${t.complementados} complementado(s) · ${t.ignorados} ignorado(s) · ${t.erros} com erro`, salvarAgora: false });
    return registro;
  });
  // Detalhe linha a linha (com os dados originais) fica fora do banco principal, para não deixá-lo pesado
  try {
    fs.mkdirSync(pastaDetalhes(), { recursive: true });
    fs.writeFileSync(path.join(pastaDetalhes(), `${id}.json`), JSON.stringify({ id, colunas: sessao.colunas, linhas: detalhes }));
  } catch (e) {
    console.error(`Importação ${id}: não foi possível gravar o detalhe (${e.message}).`);
  }
  return resumo;
}

function lerDetalhes(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try { return JSON.parse(require('fs').readFileSync(require('path').join(pastaDetalhes(), `${id}.json`), 'utf8')); } catch { return null; }
}

// Desfaz uma importação: remove os criados (se não mudaram depois) e restaura os campos alterados (se ainda estão como a importação deixou)
function desfazer(registro, usuario) {
  const det = lerDetalhes(registro.id);
  if (!det) return null;
  return db.transacao(() => {
    const r = { removidos: 0, restaurados: 0, mantidos: [] };
    const reg = db.list('importacoes').find((x) => x.id === registro.id);
    for (const l of det.linhas) {
      if (l.acao === 'criado') {
        const a = db.get('ativos', l.ativoId);
        if (!a) continue;
        if (a.reservadoPara || a.atualizadoEm > reg.em) { r.mantidos.push(`${a.patrimonio} (alterado depois da importação)`); continue; }
        const arr = db.list('ativos');
        arr.splice(arr.indexOf(a), 1);
        if (E.solicitavel(a)) E.registrarMov({ tipo: 'saida', alvo: 'ativo', ativo: a, motivo: `Importação desfeita · ${registro.arquivo}` });
        r.removidos++;
      } else if (l.acao === 'atualizado' || l.acao === 'complementado') {
        const a = db.get('ativos', l.ativoId);
        if (!a) continue;
        let mudou = false;
        for (const [k, v] of Object.entries(l.antes || {})) {
          if (JSON.stringify(a[k] ?? '') === JSON.stringify(l.depois[k] ?? '')) { a[k] = v; mudou = true; } else r.mantidos.push(`${a.patrimonio}: ${k} alterado depois da importação`);
        }
        if (mudou) { a.atualizadoEm = new Date().toISOString(); r.restaurados++; }
      }
    }
    reg.desfeitaEm = new Date().toISOString();
    reg.desfeitaPor = usuario.nome;
    reg.desfeita = r;
    db.log({ acao: 'desfez', entidade: 'importacao', entidadeId: reg.id, titulo: reg.arquivo, detalhe: `${r.removidos} removido(s) · ${r.restaurados} restaurado(s)${r.mantidos.length ? ` · ${r.mantidos.length} mantido(s) por terem sido alterados depois` : ''}`, salvarAgora: false });
    return r;
  });
}

module.exports = { previa, confirmar, desfazer, lerDetalhes, normalizarOpcoes, normalizarMapeamento, OPCOES_PADRAO };
