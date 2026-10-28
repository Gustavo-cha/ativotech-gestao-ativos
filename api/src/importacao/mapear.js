// Mapeamento inteligente das colunas da planilha para os campos do Ativos Tech
// e padronização dos valores (status, categoria, proprietário, datas, valores em R$…).
// Reconhece nomes usados no Desk Manager, SharePoint/Lists, Intune, Atera e planilhas em português, inglês e espanhol.
const D = require('../domain');

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Campos de destino. "sinonimos" são comparados já normalizados (sem acento, minúsculas, só letras e números).
const CAMPOS = [
  { id: 'patrimonio', label: 'Patrimônio', obrigatorio: true, sinonimos: ['patrimonio', 'n patrimonio', 'no patrimonio', 'numero patrimonio', 'numero do patrimonio', 'cod patrimonio', 'codigo patrimonio', 'asset tag', 'tag', 'tag patrimonio', 'etiqueta', 'asset id', 'asset number', 'asset no', 'id do ativo', 'codigo do ativo', 'cod ativo', 'inventario', 'n inventario', 'plaqueta', 'activo fijo', 'numero de activo'] },
  { id: 'numeroSerie', label: 'Número de série', sinonimos: ['numero de serie', 'n serie', 'no serie', 'n de serie', 'serie', 'serial', 'serial number', 'serialnumber', 'sn', 's n', 'service tag', 'servicetag', 'numero serie', 'serial no', 'nro serie'] },
  { id: 'nome', label: 'Nome / descrição', sinonimos: ['nome', 'nome do ativo', 'nome do equipamento', 'equipamento', 'descricao', 'descricao do equipamento', 'item', 'asset name', 'name', 'title', 'titulo', 'produto', 'product', 'dispositivo', 'ativo', 'description'] },
  { id: 'categoria', label: 'Categoria', sinonimos: ['categoria', 'category', 'tipo', 'tipo de equipamento', 'tipo do ativo', 'asset type', 'device type', 'type', 'classe', 'class', 'familia', 'grupo', 'tipo de dispositivo'] },
  { id: 'marca', label: 'Marca / fabricante', sinonimos: ['marca', 'fabricante', 'brand', 'manufacturer', 'make', 'vendor brand'] },
  { id: 'modelo', label: 'Modelo', sinonimos: ['modelo', 'model', 'modelo do equipamento', 'device model'] },
  { id: 'status', label: 'Status', sinonimos: ['status', 'situacao', 'estado', 'state', 'condicao', 'status do ativo', 'asset status', 'estado do ativo'] },
  { id: 'proprietario', label: 'Proprietário', sinonimos: ['proprietario', 'proprietario do equipamento', 'owner', 'empresa', 'company', 'organizacao', 'organization', 'dono', 'propriedade', 'empresa proprietaria', 'cliente'] },
  { id: 'colaboradorEmail', label: 'E-mail corporativo do colaborador', sinonimos: ['email', 'e mail', 'email corporativo', 'e mail corporativo', 'email do usuario', 'e mail do usuario', 'email do colaborador', 'user email', 'user principal name', 'upn', 'assigned to email', 'email do responsavel', 'correo', 'correo electronico', 'login'] },
  { id: 'responsavel', label: 'Colaborador / responsável', sinonimos: ['responsavel', 'colaborador', 'usuario', 'user', 'alocado', 'alocado para', 'alocado a', 'assigned to', 'assignee', 'utilizador', 'funcionario', 'nome do usuario', 'usuario responsavel', 'user name', 'usuario asignado', 'em posse de'] },
  { id: 'departamento', label: 'Departamento', sinonimos: ['departamento', 'department', 'setor', 'area', 'centro de custo', 'cost center', 'divisao', 'squad', 'time'] },
  { id: 'localizacao', label: 'Localização', sinonimos: ['localizacao', 'local', 'location', 'site', 'unidade', 'office', 'escritorio', 'filial', 'cidade', 'sala', 'ubicacion'] },
  { id: 'hostname', label: 'Hostname', sinonimos: ['hostname', 'host', 'host name', 'computer name', 'nome do computador', 'nome da maquina', 'device name', 'nome do dispositivo', 'machine name', 'netbios'] },
  { id: 'sistemaOperacional', label: 'Sistema operacional', sinonimos: ['sistema operacional', 'so', 'os', 'operating system', 'sistema', 'os version', 'versao do so'] },
  { id: 'ip', label: 'Endereço IP', sinonimos: ['ip', 'endereco ip', 'ip address', 'ipv4', 'ip local'] },
  { id: 'configuracao', label: 'Configuração de hardware', sinonimos: ['configuracao', 'configuracao de hardware', 'specs', 'especificacao', 'especificacoes', 'hardware', 'processador', 'cpu', 'spec'] },
  { id: 'dataAquisicao', label: 'Data de aquisição', sinonimos: ['data de aquisicao', 'aquisicao', 'data aquisicao', 'data da compra', 'data de compra', 'data compra', 'purchase date', 'acquisition date', 'bought on', 'fecha de compra'] },
  { id: 'valor', label: 'Valor de compra', sinonimos: ['valor', 'valor de compra', 'valor da compra', 'preco', 'price', 'cost', 'custo', 'purchase price', 'valor unitario', 'precio'] },
  { id: 'garantiaAte', label: 'Garantia até', sinonimos: ['garantia', 'garantia ate', 'fim da garantia', 'vencimento da garantia', 'warranty', 'warranty end', 'warranty expiration', 'warranty expires', 'fim garantia', 'garantia final'] },
  { id: 'fornecedor', label: 'Fornecedor', sinonimos: ['fornecedor', 'supplier', 'vendor', 'revendedor', 'proveedor'] },
  { id: 'notaFiscal', label: 'Nota fiscal', sinonimos: ['nota fiscal', 'nf', 'n nf', 'numero nf', 'nfe', 'invoice', 'invoice number', 'factura'] },
  { id: 'dataEntradaEstoque', label: 'Entrada no estoque', sinonimos: ['entrada no estoque', 'data de entrada', 'data entrada', 'entrada', 'received', 'data de recebimento'] },
  { id: 'tags', label: 'Tags', sinonimos: ['tags', 'tag list', 'etiquetas', 'labels', 'marcadores'] },
  { id: 'observacoes', label: 'Observações', sinonimos: ['observacoes', 'observacao', 'obs', 'notes', 'notas', 'comentarios', 'comments', 'remarks', 'anotacoes'] }
];
const POR_ID = Object.fromEntries(CAMPOS.map((c) => [c.id, c]));

// ---------- Sugestão de mapeamento ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

function pontuar(coluna, campo) {
  const c = norm(coluna);
  if (!c) return 0;
  let melhor = 0;
  for (const s of campo.sinonimos) {
    if (c === s) return 1;
    // "Serial Number (BIOS)" contém "serial number"; evita casar palavras curtas por acaso
    if (s.length >= 4 && (` ${c} `).includes(` ${s} `)) melhor = Math.max(melhor, 0.8);
    else if (c.length >= 4 && (` ${s} `).includes(` ${c} `)) melhor = Math.max(melhor, 0.6);
  }
  return melhor;
}

// Olha também o conteúdo: coluna cheia de e-mails, IPs ou datas
function pontuarConteudo(amostras, campo) {
  const vals = amostras.filter(Boolean);
  if (!vals.length) return 0;
  const frac = (fn) => vals.filter(fn).length / vals.length;
  if (campo.id === 'colaboradorEmail') return frac((v) => EMAIL.test(v)) >= 0.6 ? 0.7 : 0;
  if (campo.id === 'ip') return frac((v) => IPV4.test(v)) >= 0.6 ? 0.7 : 0;
  if (campo.id === 'proprietario') return frac((v) => /h\s*&\s*co|hco|b2f/i.test(v)) >= 0.6 ? 0.65 : 0;
  return 0;
}

function sugerirMapeamento(colunas, linhas) {
  const candidatos = [];
  colunas.forEach((col, i) => {
    const amostras = linhas.slice(0, 50).map((l) => l.valores[i]);
    for (const campo of CAMPOS) {
      const p = Math.max(pontuar(col, campo), pontuarConteudo(amostras, campo));
      if (p > 0) candidatos.push({ coluna: col, campo: campo.id, p });
    }
  });
  // Atribuição gulosa: maior confiança primeiro, cada campo e cada coluna uma única vez
  candidatos.sort((a, b) => b.p - a.p);
  const mapa = Object.fromEntries(colunas.map((c) => [c, '']));
  const confianca = {};
  const usados = new Set();
  for (const c of candidatos) {
    if (mapa[c.coluna] || usados.has(c.campo)) continue;
    mapa[c.coluna] = c.campo;
    confianca[c.coluna] = c.p >= 0.95 ? 'alta' : c.p >= 0.7 ? 'media' : 'baixa';
    usados.add(c.campo);
  }
  return { mapeamento: mapa, confianca };
}

// ---------- Padronização de valores ----------
const STATUS = [
  ['Em uso', ['em uso', 'in use', 'uso', 'alocado', 'atribuido', 'assigned', 'deployed', 'ativo em uso', 'em producao', 'producao', 'utilizado', 'en uso', 'asignado', 'operacional', 'ativo']],
  ['Disponível', ['disponivel', 'available', 'em estoque', 'estoque', 'in stock', 'stock', 'spare', 'livre', 'nao alocado', 'novo', 'new', 'ready', 'pronto', 'disponible', 'reserva tecnica', 'backup']],
  ['Em manutenção', ['em manutencao', 'manutencao', 'maintenance', 'repair', 'em reparo', 'reparo', 'conserto', 'assistencia', 'assistencia tecnica', 'rma', 'garantia acionada', 'defeito', 'com defeito', 'broken', 'en reparacion']],
  ['Descartado', ['descartado', 'descarte', 'baixado', 'baixa', 'retired', 'disposed', 'inativo', 'sucata', 'doado', 'vendido', 'perdido', 'roubado', 'lost', 'stolen', 'desativado', 'obsoleto']]
];
function normalizarStatus(v) {
  const n = norm(v);
  if (!n) return null;
  for (const [st, nomes] of STATUS) if (nomes.includes(n)) return st;
  for (const [st, nomes] of STATUS) if (nomes.some((x) => x.length > 4 && n.includes(x))) return st;
  return undefined; // não reconhecido
}

const CATEGORIAS = [
  ['Notebook', ['notebook', 'laptop', 'portatil', 'macbook', 'ultrabook', 'thinkpad', 'latitude', 'elitebook', 'probook', 'vostro', 'ideapad', 'chromebook', 'surface laptop']],
  ['Desktop', ['desktop', 'pc', 'computador', 'workstation', 'estacao de trabalho', 'cpu', 'gabinete', 'optiplex', 'thinkcentre', 'imac', 'mac mini', 'all in one', 'aio']],
  ['Monitor', ['monitor', 'display', 'screen', 'tela', 'lcd', 'led']],
  ['Smartphone', ['smartphone', 'celular', 'telefone celular', 'phone', 'mobile', 'iphone', 'galaxy', 'android', 'telemovel', 'movil']],
  ['Tablet', ['tablet', 'ipad', 'tab']],
  ['Impressora', ['impressora', 'printer', 'multifuncional', 'mfp', 'scanner', 'plotter', 'impresora']],
  ['Rede', ['rede', 'network', 'switch', 'roteador', 'router', 'firewall', 'access point', 'ap', 'wifi', 'modem', 'fortigate', 'meraki']],
  ['Servidor', ['servidor', 'server', 'nas', 'storage', 'host', 'poweredge', 'proliant']],
  ['Periférico', ['periferico', 'peripheral', 'mouse', 'teclado', 'keyboard', 'headset', 'fone', 'webcam', 'dock', 'docking', 'dock station', 'acessorio', 'accessory', 'caixa de som', 'camera']]
];
function normalizarCategoria(v) {
  const n = norm(v);
  if (!n) return null;
  if (D.CATEGORIAS.map(norm).includes(n)) return D.CATEGORIAS[D.CATEGORIAS.map(norm).indexOf(n)];
  for (const [cat, nomes] of CATEGORIAS) if (nomes.includes(n)) return cat;
  for (const [cat, nomes] of CATEGORIAS) if (nomes.some((x) => x.length >= 4 && (` ${n} `).includes(` ${x} `))) return cat;
  return undefined;
}

function normalizarProprietario(v) {
  const n = norm(v);
  if (!n) return null;
  if (/b2f|b2 finance|b2finance/.test(n.replace(/\s+/g, '')) || n.includes('b2f')) return 'H&CO B2Finance';
  if (/^h ?co\b|^hco\b|h co\b|^h e co\b/.test(n) || n === 'hco') return 'H&CO';
  return undefined;
}

// Datas: 2024-05-31, 31/05/2024, 31-05-24, 05/31/2024 (quando o dia > 12), 31.05.2024, número de série do Excel
function normalizarData(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m;
  const ok = (a, me, d) => {
    const ano = a < 100 ? 2000 + a : a;
    const dt = new Date(Date.UTC(ano, me - 1, d));
    return dt.getUTCFullYear() === ano && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d && ano >= 1990 && ano <= 2100 ? dt.toISOString().slice(0, 10) : undefined;
  };
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s))) return ok(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s.*)?$/.exec(s))) {
    const a = +m[1];
    const b = +m[2];
    // Padrão brasileiro (dia/mês); se o "mês" passar de 12, só pode ser mês/dia (formato americano)
    return b > 12 && a <= 12 ? ok(+m[3], a, b) : ok(+m[3], b, a);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

// Valores: "R$ 1.234,56", "1,234.56", "1234.5", "US$ 900"
function normalizarValor(v) {
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const virg = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virg > ponto) s = s.replace(/\./g, '').replace(',', '.');
  else if (ponto > virg && virg >= 0) s = s.replace(/,/g, '');
  else if (virg === -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

const limparTexto = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = { CAMPOS, POR_ID, sugerirMapeamento, normalizarStatus, normalizarCategoria, normalizarProprietario, normalizarData, normalizarValor, limparTexto, norm, EMAIL };
