// Configuração da API a partir de variáveis de ambiente.
// Em desenvolvimento, lê também o arquivo api/.env (se existir). Variáveis já definidas no ambiente têm prioridade.
// Segredos (senhas, client secret, SMTP) NUNCA são registrados em log nem devolvidos pela API.
const fs = require('fs');
const path = require('path');

// api/.env (padrão) ou, se não existir, .env na pasta raiz do projeto
const ARQUIVOS_ENV = process.env.ENV_FILE ? [process.env.ENV_FILE] : [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')];

function carregarEnv(arquivo) {
  if (process.env.NODE_ENV === 'test' || !fs.existsSync(arquivo)) return false;
  // Remove o BOM que o Bloco de Notas do Windows às vezes coloca no início do arquivo
  for (const linha of fs.readFileSync(arquivo, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  return true;
}
const ENV_CARREGADO = ARQUIVOS_ENV.find((a) => carregarEnv(a)) || null;
if (ENV_CARREGADO && require.main && /server\.js$/.test(require.main.filename)) console.log(`Configuração lida de ${ENV_CARREGADO}`);

const env = (k, padrao = '') => (process.env[k] ?? padrao).toString().trim();
const lista = (k, padrao = '') => env(k, padrao).split(',').map((s) => s.trim()).filter(Boolean);
const semBarra = (u) => u.replace(/\/+$/, '');

const config = {
  // Endereços públicos (usados nos links dos e-mails e no retorno do login Microsoft)
  // APP_URL = o endereço que as PESSOAS digitam para abrir o sistema (ex.: http://192.168.0.10:3000 ou https://ativos.hco.com).
  appUrl: semBarra(env('APP_URL', `http://localhost:${env('WEB_PORT', '3000')}`)),
  // A API é servida pelo mesmo endereço do site (/api), então o endereço público dela é o próprio APP_URL.
  // API_PUBLIC_URL só é necessário se a API for publicada em outro domínio.
  apiUrl: '',
  // Rede: a API escuta só no próprio servidor (127.0.0.1) — quem fala com ela é o site, que fica exposto na rede.
  // Use API_HOST=0.0.0.0 apenas se a API precisar ser acessada diretamente por outra máquina.
  apiHost: env('API_HOST', '127.0.0.1'),
  porta: Number(env('PORT', '3001')) || 3001,
  portaWeb: Number(env('WEB_PORT', '3000')) || 3000,
  // Origens externas autorizadas a chamar a API pelo navegador (CORS). Vazio = somente o próprio site.
  corsOrigens: lista('CORS_ORIGIN', '').map(semBarra),

  // Empresas (prefixos) aceitas na tela de acesso. Por enquanto: somente H&CO.
  empresas: [{ prefixo: 'H&CO', nome: 'H&CO' }],
  // Domínios de e-mail corporativo aceitos no cadastro de usuários (vazio = qualquer domínio)
  dominiosEmail: lista('EMAIL_DOMINIOS_PERMITIDOS', 'hco.com').map((d) => d.toLowerCase()),
  // Domínios aceitos no e-mail corporativo dos colaboradores que recebem equipamentos (vazio = qualquer domínio válido)
  dominiosColaborador: lista('EMAIL_DOMINIOS_COLABORADORES', '').map((d) => d.toLowerCase().replace(/^@/, '')),

  // Licenças configuradas na primeira inicialização (depois o Operador administrador ajusta no painel)
  licencasIniciais: Math.max(1, Number(env('LICENCAS_TOTAL', '10')) || 10),

  // Administrador inicial (criado uma única vez, se ainda não existir)
  admin: {
    email: env('ADMIN_EMAIL').toLowerCase(),
    nome: env('ADMIN_NOME'),
    senhaInicial: process.env.ADMIN_INITIAL_PASSWORD || ''
  },

  // Login com Microsoft (Entra ID — OAuth 2.0 / OpenID Connect)
  microsoft: {
    tenantId: env('MS_TENANT_ID'),
    clientId: env('MS_CLIENT_ID'),
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    authority: semBarra(env('MS_AUTHORITY', 'https://login.microsoftonline.com')),
    redirectUri: env('MS_REDIRECT_URI')
  },

  // E-mail: "smtp" ou "graph" (Microsoft Graph, envio pela caixa do remetente). Vazio = detecta pelo que estiver preenchido.
  email: {
    provedor: env('EMAIL_PROVEDOR').toLowerCase(),
    remetente: env('EMAIL_REMETENTE').toLowerCase(),
    nomeRemetente: env('EMAIL_NOME_REMETENTE', 'Ativos Tech'),
    smtp: {
      host: env('SMTP_HOST'),
      porta: Number(env('SMTP_PORTA', '587')) || 587,
      seguro: env('SMTP_SEGURO', 'false') === 'true', // true = TLS direto (465); false = STARTTLS quando disponível
      usuario: env('SMTP_USUARIO'),
      senha: process.env.SMTP_SENHA || '',
      exigirTls: env('SMTP_EXIGIR_TLS', 'true') !== 'false'
    },
    graph: {
      tenantId: env('GRAPH_TENANT_ID') || env('MS_TENANT_ID'),
      clientId: env('GRAPH_CLIENT_ID') || env('MS_CLIENT_ID'),
      clientSecret: process.env.GRAPH_CLIENT_SECRET || process.env.MS_CLIENT_SECRET || '',
      url: semBarra(env('GRAPH_URL', 'https://graph.microsoft.com'))
    }
  }
};
config.apiUrl = semBarra(env('API_PUBLIC_URL')) || config.appUrl;
config.microsoft.redirectUri ||= `${config.apiUrl}/api/auth/microsoft/callback`;

const normPrefixo = (p) => String(p || '').trim().toUpperCase().replace(/\s+/g, '');
config.empresaPorPrefixo = (p) => config.empresas.find((e) => normPrefixo(e.prefixo) === normPrefixo(p)) || null;

module.exports = config;
