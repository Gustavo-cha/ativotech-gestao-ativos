// Cliente HTTP da API Express. Todas as chamadas do front-end passam por aqui.
// - Envia o token de sessão (Authorization: Bearer)
// - Em 401, encerra a sessão local e leva ao login
// - Acompanha a "revisão" dos dados (cabeçalho X-Rev) para a sincronização automática
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CHAVE_TOKEN = 'ativotech:token';

export class ApiError extends Error {
  constructor(message, status, campos) {
    super(message);
    this.status = status;
    this.campos = campos || {};
  }
}

// ---------- Sessão ----------
let token = null;
export function getToken() {
  if (token) return token;
  try { token = typeof window !== 'undefined' ? localStorage.getItem(CHAVE_TOKEN) : null; } catch { token = null; }
  return token;
}
export function setToken(t) {
  token = t || null;
  limparCache();
  try { if (t) localStorage.setItem(CHAVE_TOKEN, t); else localStorage.removeItem(CHAVE_TOKEN); } catch { /* sem storage */ }
}

// ---------- Sincronização ----------
let revConhecida = null;
export const getRev = () => revConhecida;
export const setRev = (r) => { revConhecida = r; };

// Avisa o app (menu, sino, painéis) que os dados mudaram
export const notificarMudanca = () => typeof window !== 'undefined' && window.dispatchEvent(new Event('ativotech:mudou'));

// ---------- Cache de leitura ----------
// Uma resposta GET vale enquanto a revisão dos dados no servidor não mudar (X-Rev): trocar de tela e voltar,
// ou vários componentes pedindo a mesma coisa, não geram novas requisições. Pedidos iguais simultâneos são unificados.
const cache = new Map();
const emAndamento = new Map();
const CACHE_MAX_MS = 60000;
export function limparCache() { cache.clear(); emAndamento.clear(); }
const cacheavel = (path) => !path.startsWith('/auth/') && path !== '/sync' && !path.includes('export.csv');

function lerGet(path) {
  if (!cacheavel(path)) return request(path);
  const c = cache.get(path);
  if (c && revConhecida !== null && c.rev >= revConhecida && Date.now() - c.em < CACHE_MAX_MS) return Promise.resolve(c.dados);
  if (emAndamento.has(path)) return emAndamento.get(path);
  const p = request(path, {}, (dados, rev) => {
    if (rev !== null) cache.set(path, { dados, rev, em: Date.now() });
    if (cache.size > 120) cache.delete(cache.keys().next().value);
  }).finally(() => emAndamento.delete(path));
  emAndamento.set(path, p);
  return p;
}

async function request(path, options = {}, aoLer) {
  const t = getToken();
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(options.headers || {}) }
    });
  } catch {
    throw new ApiError(`Não foi possível conectar à API em ${API_URL}. Ela está rodando?`, 0);
  }
  const mutacao = options.method && options.method !== 'GET';
  const revResp = res.headers.get('X-Rev') !== null ? Number(res.headers.get('X-Rev')) : null;
  // Nossa própria alteração: atualiza a revisão conhecida para não recarregar duas vezes
  if (mutacao && res.ok && revResp !== null) revConhecida = revResp;
  if (!mutacao && revConhecida === null && revResp !== null) revConhecida = revResp;

  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/microsoft')) {
    setToken(null);
    const b = await res.clone().json().catch(() => ({}));
    // Motivo (conta desativada, licença, perfil alterado…) é mostrado na tela de login
    if (typeof window !== 'undefined') {
      try { if (b.codigo && b.codigo !== 'SESSAO') sessionStorage.setItem('ativotech:motivo-saida', b.erro); } catch { /* sem storage */ }
      window.dispatchEvent(new Event('ativotech:sessao-expirada'));
    }
  }
  if (res.status === 204) {
    if (mutacao) notificarMudanca();
    return null;
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 && body.codigo === 'TROCA_SENHA' && typeof window !== 'undefined') window.dispatchEvent(new Event('ativotech:trocar-senha'));
  if (!res.ok) throw new ApiError(body.erro || `Erro ${res.status}`, res.status, body.campos);
  if (mutacao && !path.startsWith('/auth/')) notificarMudanca();
  if (!mutacao && aoLer) aoLer(body, revResp);
  return body;
}

// Envio de arquivo (importação): corpo binário, sem JSON
async function enviarArquivo(path, arquivo) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/octet-stream', 'X-Arquivo-Nome': encodeURIComponent(arquivo.name) },
    body: arquivo
  }).catch(() => { throw new ApiError(`Não foi possível conectar à API em ${API_URL}.`, 0); });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.erro || (res.status === 413 ? 'Arquivo grande demais (limite de 12 MB).' : `Erro ${res.status}`), res.status, body.campos);
  return body;
}

const qs = (o = {}) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
  return s ? `?${s}` : '';
};
const body = (method, data) => ({ method, body: JSON.stringify(data ?? {}) });

// Download autenticado (CSV, backup): busca com o token e salva o arquivo
export async function baixar(path, nomePadrao) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(b.erro || `Erro ${res.status}`, res.status);
  }
  const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || nomePadrao;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const api = {
  auth: {
    empresa: (prefixo) => lerGet(`/auth/empresa${qs({ prefixo })}`),
    metodos: () => lerGet('/auth/metodos'),
    politicaSenha: () => lerGet('/auth/politica-senha'),
    login: (email, senha, prefixo, perfil) => request('/auth/login', body('POST', { email, senha, prefixo, perfil })),
    microsoftUrl: (prefixo, perfil, voltar) => `${API_URL}/auth/microsoft/iniciar${qs({ prefixo, perfil, voltar })}`,
    microsoftTrocar: (codigo) => request('/auth/microsoft/trocar', body('POST', { codigo })),
    me: () => lerGet('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    trocarSenha: (atual, nova, confirmacao) => request('/auth/senha', body('POST', { atual, nova, confirmacao })),
    preferencias: (d) => request('/auth/preferencias', body('PATCH', d))
  },
  sync: () => request('/sync'),
  ativos: {
    listar: (f) => lerGet(`/ativos${qs(f)}`),
    pagina: (f) => lerGet(`/ativos${qs({ pagina: 1, limite: 25, ...f })}`),
    opcoes: () => lerGet('/ativos?campos=min'),
    meta: () => lerGet('/ativos/meta'),
    obter: (id) => lerGet(`/ativos/${id}`),
    criar: (d) => request('/ativos', body('POST', d)),
    atualizar: (id, d) => request(`/ativos/${id}`, body('PUT', d)),
    mudarStatus: (id, status, responsavel) => request(`/ativos/${id}/status`, body('PATCH', { status, responsavel })),
    lote: (ids, acao, status, extra = {}) => request('/ativos/lote', body('POST', { ids, acao, status, ...extra })),
    excluir: (id) => request(`/ativos/${id}`, { method: 'DELETE' }),
    exportar: (f) => baixar(`/ativos/export.csv${qs(f)}`, 'ativos.csv')
  },
  eventos: {
    listar: (f) => lerGet(`/eventos${qs(f)}`),
    meta: () => lerGet('/eventos/meta'),
    criar: (d) => request('/eventos', body('POST', d)),
    atualizar: (id, d) => request(`/eventos/${id}`, body('PUT', d)),
    excluir: (id) => request(`/eventos/${id}`, { method: 'DELETE' })
  },
  solicitacoes: {
    listar: (f) => lerGet(`/solicitacoes${qs(f)}`),
    meta: () => lerGet('/solicitacoes/meta'),
    obter: (id) => lerGet(`/solicitacoes/${id}`),
    criar: (d) => request('/solicitacoes', body('POST', d)),
    comentar: (id, texto) => request(`/solicitacoes/${id}/atualizacoes`, body('POST', { texto })),
    cancelar: (id, motivo) => request(`/solicitacoes/${id}/cancelar`, body('POST', { motivo })),
    catalogo: () => lerGet('/solicitacoes/catalogo'),
    // { status, mensagem, envio?: {transportadora, codigoRastreio, dataEnvio, previsaoEntrega}, recebidoPor? }
    status: (id, status, extras = {}) => request(`/solicitacoes/${id}/status`, body('PATCH', { status, ...extras })),
    rejeitar: (id, motivo) => request(`/solicitacoes/${id}/rejeitar`, body('POST', { motivo })),
    visto: (id) => request(`/solicitacoes/${id}/visto`, { method: 'POST' }),
    disponiveis: (id, linha) => lerGet(`/solicitacoes/${id}/itens/${linha}/disponiveis`),
    reservarLinha: (id, linha, d) => request(`/solicitacoes/${id}/itens/${linha}`, body('PUT', d)),
    reservarTudo: (id) => request(`/solicitacoes/${id}/reservar-tudo`, { method: 'POST' }),
    envio: (id, d) => request(`/solicitacoes/${id}/envio`, body('PATCH', d)),
    previsao: (id, previsaoEntrega) => request(`/solicitacoes/${id}/previsao`, body('PATCH', { previsaoEntrega })),
    colaborador: (id, emailColaborador) => request(`/solicitacoes/${id}/colaborador`, body('PATCH', { emailColaborador })),
    nota: (id, texto) => request(`/solicitacoes/${id}/notas`, body('POST', { texto }))
  },
  estoque: {
    // detalhe: false = só os números (sem a lista de equipamentos); proprietario: 'H&CO' | 'H&CO B2Finance' | ''
    resumo: ({ proprietario = '', detalhe = false } = {}) => lerGet(`/estoque/resumo${qs({ proprietario, detalhe: detalhe ? '' : '0' })}`),
    equipamentos: (f = {}) => lerGet(`/estoque/equipamentos${qs(typeof f === 'string' ? { categoria: f } : f)}`),
    itens: (proprietario = '') => lerGet(`/estoque/itens${qs({ proprietario })}`),
    criarItem: (d) => request('/estoque/itens', body('POST', d)),
    atualizarItem: (id, d) => request(`/estoque/itens/${id}`, body('PUT', d)),
    movimentar: (id, tipo, quantidade, motivo) => request(`/estoque/itens/${id}/movimentar`, body('POST', { tipo, quantidade, motivo })),
    movimentacoes: (f) => lerGet(`/estoque/movimentacoes${qs(f)}`),
    consistencia: () => lerGet('/estoque/consistencia'),
    conferir: (patrimonios, observacao, proprietario) => request('/estoque/conferencia', body('POST', { patrimonios, observacao, proprietario })),
    conferencias: () => lerGet('/estoque/conferencias')
  },
  usuarios: {
    listar: () => lerGet('/usuarios'),
    perfis: () => lerGet('/usuarios/perfis'),
    criar: (d) => request('/usuarios', body('POST', d)),
    atualizar: (id, d) => request(`/usuarios/${id}`, body('PUT', d)),
    redefinirSenha: (id, senha) => request(`/usuarios/${id}/senha`, body('POST', senha ? { senha } : {})),
    ativar: (id, ativo) => request(`/usuarios/${id}/ativo`, body('PATCH', { ativo })),
    licenca: (id, d) => request(`/usuarios/${id}/licenca`, body('PATCH', d)),
    desbloquear: (id) => request(`/usuarios/${id}/desbloquear`, { method: 'POST' }),
    conectados: () => lerGet('/stream/conectados')
  },
  licencas: {
    obter: () => lerGet('/licencas'),
    definirTotal: (total) => request('/licencas', body('PUT', { total }))
  },
  notificacoes: {
    status: () => lerGet('/notificacoes/status'),
    listar: (f) => lerGet(`/notificacoes${qs(f)}`),
    reenviar: (ids) => request('/notificacoes/reenviar', body('POST', ids ? { ids } : {})),
    teste: () => request('/notificacoes/teste', { method: 'POST' })
  },
  colaboradores: {
    listar: (f) => lerGet(`/colaboradores${qs(f)}`),
    obter: (id) => lerGet(`/colaboradores/${id}`),
    criar: (d) => request('/colaboradores', body('POST', d)),
    atualizar: (id, d) => request(`/colaboradores/${id}`, body('PUT', d)),
    vincular: (id, ativoId, vincular = true) => request(`/colaboradores/${id}/equipamentos`, body('POST', { ativoId, vincular }))
  },
  importacao: {
    analisar: (arquivo) => enviarArquivo('/importacao/analisar', arquivo),
    previa: (id, f) => request(`/importacao/${id}/previa${qs(f)}`),
    configurar: (id, d, f) => request(`/importacao/${id}/configuracao${qs(f)}`, body('PUT', d)),
    linha: (id, n, d) => request(`/importacao/${id}/linhas/${n}`, body('PATCH', d)),
    confirmar: (id, versao) => request(`/importacao/${id}/confirmar`, body('POST', { confirmar: true, versao })),
    descartar: (id) => request(`/importacao/${id}`, { method: 'DELETE' }),
    relatorio: (id) => baixar(`/importacao/${id}/relatorio.csv`, 'correcoes.csv'),
    historico: () => request('/importacao'),
    relatorioFinal: (id) => baixar(`/importacao/historico/${id}/relatorio.csv`, 'importacao.csv'),
    desfazer: (id) => request(`/importacao/historico/${id}/desfazer`, { method: 'POST' })
  },
  contadores: () => lerGet('/contadores'),
  dashboard: () => lerGet('/dashboard'),
  alertas: (f) => lerGet(`/alertas${qs(f)}`),
  historico: (f) => lerGet(`/historico${qs(f)}`),
  busca: (q) => lerGet(`/busca${qs({ q })}`),
  reset: () => request('/admin/reset', { method: 'POST' }),
  backup: () => baixar('/admin/backup', 'ativotech-backup.json')
};
