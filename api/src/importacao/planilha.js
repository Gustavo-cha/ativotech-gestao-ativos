// Leitura de planilhas para a importação: CSV (qualquer separador, UTF-8 ou Windows-1252) e Excel .xlsx.
// O .xlsx é lido aqui mesmo (é um ZIP com XML), sem bibliotecas externas, com limites contra arquivos maliciosos
// (ZIP bomb, milhares de abas, células gigantes).
const zlib = require('zlib');

const LIMITES = { linhas: 10000, colunas: 100, celula: 500, descompactadoMB: 80, entradasZip: 5000 };

class ErroPlanilha extends Error {}

// ---------- CSV ----------
function decodificarTexto(buf) {
  let t = buf.toString('utf8');
  // Planilhas exportadas pelo Excel em português costumam vir em Windows-1252
  if (t.includes('�')) t = buf.toString('latin1');
  return t.replace(/^﻿/, '');
}

function detectarSeparador(texto) {
  const amostra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let melhor = ',';
  let pontos = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const contagens = amostra.map((l) => contarForaDeAspas(l, sep));
    const min = Math.min(...contagens);
    // Separador bom: aparece em todas as linhas, com contagem parecida
    const p = min > 0 ? min * 10 - (Math.max(...contagens) - min) : -1;
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}
function contarForaDeAspas(linha, sep) {
  let n = 0;
  let aspas = false;
  for (const ch of linha) { if (ch === '"') aspas = !aspas; else if (ch === sep && !aspas) n++; }
  return n;
}

function lerCsv(buf) {
  const texto = decodificarTexto(buf);
  const sep = detectarSeparador(texto);
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += ch;
    } else if (ch === '"' && campo === '') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
      if (linhas.length > LIMITES.linhas + 50) break;
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return { linhas, formato: 'CSV', separador: sep === '\t' ? 'tabulação' : sep };
}

// ---------- XLSX (ZIP + XML) ----------
function lerZip(buf) {
  // Fim do diretório central (procura de trás para frente; comentário de até 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ErroPlanilha('Arquivo .xlsx corrompido ou incompleto.');
  const total = buf.readUInt16LE(eocd + 10);
  if (total > LIMITES.entradasZip) throw new ErroPlanilha('Arquivo .xlsx com estrutura muito grande.');
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  let descompactado = 0;
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new ErroPlanilha('Arquivo .xlsx corrompido.');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamReal = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nLen);
    entradas.set(nome, { metodo, tamComp, tamReal, local });
    p += 46 + nLen + eLen + cLen;
  }
  const ler = (nome) => {
    const e = entradas.get(nome);
    if (!e) return null;
    descompactado += e.tamReal;
    if (descompactado > LIMITES.descompactadoMB * 1e6) throw new ErroPlanilha('Planilha grande demais depois de descompactada.');
    const nl = buf.readUInt16LE(e.local + 26);
    const el = buf.readUInt16LE(e.local + 28);
    const ini = e.local + 30 + nl + el;
    const dados = buf.subarray(ini, ini + e.tamComp);
    if (e.metodo === 0) return dados.toString('utf8');
    if (e.metodo === 8) return zlib.inflateRawSync(dados, { maxOutputLength: LIMITES.descompactadoMB * 1e6 }).toString('utf8');
    throw new ErroPlanilha('Compressão do .xlsx não suportada.');
  };
  return { ler, nomes: [...entradas.keys()] };
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTIDADES[e] ?? m;
});
const atributo = (tag, nome) => new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)?.[1];
const textoDe = (xml) => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

// Formatos de número que representam datas (padrões do Excel 14–22, 45–47 e formatos personalizados com d/m/y)
const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function estilosDeData(xml) {
  if (!xml) return [];
  const personalizados = new Map([...xml.matchAll(/<numFmt\s[^>]*>/g)].map((m) => [Number(atributo(m[0], 'numFmtId')), desescapar(atributo(m[0], 'formatCode') || '')]));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] || '';
  return [...xfs.matchAll(/<xf\s[^>]*?\/?>/g)].map((m) => {
    const id = Number(atributo(m[0], 'numFmtId') || 0);
    if (FORMATOS_DATA.has(id)) return true;
    const f = personalizados.get(id);
    return Boolean(f && /[dy]/i.test(f.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%\s]+$/.test(f));
  });
}

const indiceColuna = (ref) => {
  const letras = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

function serialParaData(v, data1904) {
  const base = data1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.round(Number(v) * 86400000));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function lerXlsx(buf) {
  const zip = lerZip(buf);
  const workbook = zip.ler('xl/workbook.xml');
  if (!workbook) throw new ErroPlanilha('Não encontrei a pasta de trabalho dentro do .xlsx.');
  const data1904 = /date1904="(1|true)"/.test(workbook);
  const abas = [...workbook.matchAll(/<sheet\s[^>]*\/?>/g)].map((m) => ({ nome: desescapar(atributo(m[0], 'name') || ''), rid: atributo(m[0], 'r:id') }));
  if (!abas.length) throw new ErroPlanilha('A planilha não tem abas.');
  const rels = zip.ler('xl/_rels/workbook.xml.rels') || '';
  const alvo = (rid) => {
    const m = [...rels.matchAll(/<Relationship\s[^>]*\/?>/g)].find((r) => atributo(r[0], 'Id') === rid);
    const t = m ? atributo(m[0], 'Target') : null;
    return t ? (t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`) : null;
  };
  const compartilhadas = [...(zip.ler('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const ehData = estilosDeData(zip.ler('xl/styles.xml'));

  // Primeira aba com dados
  for (const aba of abas) {
    const caminho = alvo(aba.rid) || 'xl/worksheets/sheet1.xml';
    const xml = zip.ler(caminho);
    if (!xml) continue;
    const linhas = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      if (!r[2]) { linhas.push([]); continue; }
      const linha = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const corpo = c[2] || '';
        const ref = atributo(attrs, 'r');
        const col = ref ? indiceColuna(ref) : linha.length;
        if (col >= LIMITES.colunas) continue;
        const t = atributo(attrs, 't');
        const s = Number(atributo(attrs, 's') || 0);
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
        let valor = '';
        if (t === 's') valor = compartilhadas[Number(v)] ?? '';
        else if (t === 'inlineStr') valor = textoDe(corpo);
        else if (t === 'b') valor = v === '1' ? 'Sim' : 'Não';
        else if (t === 'str' || t === 'e') valor = desescapar(v || '');
        else if (v !== undefined) valor = ehData[s] ? serialParaData(v, data1904) : desescapar(v);
        linha[col] = valor;
      }
      linhas.push(Array.from(linha, (x) => x ?? ''));
      if (linhas.length > LIMITES.linhas + 50) break;
    }
    if (linhas.some((l) => l.some((x) => String(x).trim()))) return { linhas, formato: 'Excel (.xlsx)', aba: aba.nome };
  }
  throw new ErroPlanilha('A planilha está vazia.');
}

// ---------- Entrada principal ----------
function lerPlanilha(buf, nomeArquivo = '') {
  if (!buf || !buf.length) throw new ErroPlanilha('Arquivo vazio.');
  const ext = String(nomeArquivo).toLowerCase().split('.').pop();
  let r;
  if (buf[0] === 0x50 && buf[1] === 0x4b) r = lerXlsx(buf);
  else if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new ErroPlanilha('Formato .xls antigo não suportado. No Excel, use "Salvar como" → Pasta de Trabalho do Excel (.xlsx) ou CSV.');
  else if (['xlsx', 'xlsm'].includes(ext)) throw new ErroPlanilha('O arquivo não parece ser um .xlsx válido.');
  else if (buf.subarray(0, 512).includes(0)) throw new ErroPlanilha('Formato não reconhecido. Envie um arquivo .csv ou .xlsx.');
  else r = lerCsv(buf);

  // Cabeçalho = primeira linha com conteúdo; linhas totalmente vazias são descartadas
  const limpa = r.linhas.map((l) => l.map((x) => String(x ?? '').replace(/\u0000/g, '').trim().slice(0, LIMITES.celula)));
  const iCab = limpa.findIndex((l) => l.filter(Boolean).length >= 1);
  if (iCab < 0) throw new ErroPlanilha('A planilha está vazia.');
  const bruto = limpa[iCab].slice(0, LIMITES.colunas);
  // Colunas sem nome ou repetidas recebem um nome único
  const vistos = new Map();
  const colunas = bruto.map((c, i) => {
    let nome = c || `Coluna ${i + 1}`;
    const n = (vistos.get(nome) || 0) + 1;
    vistos.set(nome, n);
    if (n > 1) nome = `${nome} (${n})`;
    return nome;
  });
  const dados = [];
  for (let i = iCab + 1; i < limpa.length; i++) {
    const l = limpa[i];
    if (!l.some(Boolean)) continue;
    dados.push({ n: i + 1, valores: colunas.map((_, j) => l[j] ?? '') });
  }
  if (!dados.length) throw new ErroPlanilha('A planilha tem cabeçalho, mas nenhuma linha de dados.');
  if (dados.length > LIMITES.linhas) throw new ErroPlanilha(`A planilha tem ${dados.length} linhas. O limite por importação é ${LIMITES.linhas} — divida o arquivo.`);
  return { colunas, linhas: dados, formato: r.formato, aba: r.aba || null, separador: r.separador || null };
}

module.exports = { lerPlanilha, ErroPlanilha, LIMITES };
