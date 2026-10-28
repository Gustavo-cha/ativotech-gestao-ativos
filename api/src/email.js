// Envio de e-mail real por SMTP (nodemailer) ou Microsoft Graph (sendMail com permissão de aplicativo).
// Nada é simulado: sem configuração, o envio falha com um motivo claro e a fila registra "não configurado".
// Credenciais vêm só de variáveis de ambiente e nunca aparecem em logs, respostas da API ou mensagens de erro.
const nodemailer = require('nodemailer');
const config = require('./config');

const cfg = config.email;

function provedor() {
  if (cfg.provedor === 'smtp' || cfg.provedor === 'graph') return cfg.provedor;
  if (cfg.smtp.host) return 'smtp';
  if (cfg.graph.tenantId && cfg.graph.clientId && cfg.graph.clientSecret && cfg.remetente) return 'graph';
  return '';
}

// Diagnóstico para o painel administrativo (sem segredos)
function status() {
  const p = provedor();
  const faltando = [];
  if (!p) faltando.push('EMAIL_PROVEDOR (smtp ou graph) e as variáveis do provedor');
  if (!cfg.remetente) faltando.push('EMAIL_REMETENTE');
  if (p === 'smtp' && !cfg.smtp.host) faltando.push('SMTP_HOST');
  if (p === 'graph') {
    if (!cfg.graph.tenantId) faltando.push('GRAPH_TENANT_ID (ou MS_TENANT_ID)');
    if (!cfg.graph.clientId) faltando.push('GRAPH_CLIENT_ID (ou MS_CLIENT_ID)');
    if (!cfg.graph.clientSecret) faltando.push('GRAPH_CLIENT_SECRET (ou MS_CLIENT_SECRET)');
  }
  return {
    configurado: faltando.length === 0,
    provedor: p || null,
    remetente: cfg.remetente || null,
    servidor: p === 'smtp' ? `${cfg.smtp.host}:${cfg.smtp.porta}` : p === 'graph' ? 'Microsoft Graph' : null,
    faltando,
    linkBase: config.appUrl
  };
}

// Mensagens de erro sem dados sensíveis
const limparErro = (e) => String(e?.message || e || 'Erro desconhecido')
  .replace(/(pass(word)?|senha|secret|token)[=:]\s*\S+/gi, '$1=***').slice(0, 300);

let transporte = null;
function smtp() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: cfg.smtp.host, port: cfg.smtp.porta, secure: cfg.smtp.seguro,
      requireTLS: !cfg.smtp.seguro && cfg.smtp.exigirTls,
      ignoreTLS: !cfg.smtp.seguro && !cfg.smtp.exigirTls,
      auth: cfg.smtp.usuario ? { user: cfg.smtp.usuario, pass: cfg.smtp.senha } : undefined,
      connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000
    });
  }
  return transporte;
}

let tokenGraph = { valor: '', expira: 0 };
async function graphToken() {
  if (tokenGraph.valor && tokenGraph.expira > Date.now() + 60000) return tokenGraph.valor;
  const g = cfg.graph;
  const r = await fetch(`${config.microsoft.authority}/${encodeURIComponent(g.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'client_credentials', scope: `${g.url}/.default` })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Microsoft Graph recusou as credenciais do aplicativo (${j.error || `HTTP ${r.status}`}).`);
  tokenGraph = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenGraph.valor;
}

// Envia uma mensagem. Lança erro (com mensagem limpa) em caso de falha.
async function enviar({ para, nome, assunto, html, texto }) {
  const st = status();
  if (!st.configurado) throw Object.assign(new Error(`Serviço de e-mail não configurado: falta ${st.faltando.join(', ')}.`), { naoConfigurado: true });
  try {
    if (st.provedor === 'smtp') {
      const info = await smtp().sendMail({
        from: { name: cfg.nomeRemetente, address: cfg.remetente }, to: nome ? { name: nome, address: para } : para,
        subject: assunto, html, text: texto, disableFileAccess: true, disableUrlAccess: true
      });
      return { id: info.messageId || '' };
    }
    const token = await graphToken();
    const r = await fetch(`${cfg.graph.url}/v1.0/users/${encodeURIComponent(cfg.remetente)}/sendMail`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { subject: assunto, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: para, name: nome || para } }] },
        saveToSentItems: false
      })
    });
    if (r.status !== 202) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`Microsoft Graph recusou o envio (${j.error?.code || `HTTP ${r.status}`}).`);
    }
    return { id: r.headers.get('request-id') || '' };
  } catch (e) {
    throw new Error(limparErro(e));
  }
}

module.exports = { status, enviar, limparErro };
