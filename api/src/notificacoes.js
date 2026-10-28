// Fila de notificações por e-mail (coleção "notificacoes").
//
// • Cada notificação tem uma CHAVE única (ex.: "nova:<solicitação>:<destinatário>") — a mesma interação nunca
//   gera dois e-mails para a mesma pessoa.
// • Status: pendente → enviando → enviado | falhou (após 3 tentativas) | nao_configurado (serviço sem configuração).
// • O envio roda em segundo plano logo após a gravação, sem atrasar a resposta da API nem exigir ação do usuário.
// • Sem serviço configurado, nada é "fingido": o registro fica como não configurado, o erro é registrado (sem segredos)
//   e o painel administrativo mostra o aviso. Depois de configurar, o administrador pode reenviar.
const crypto = require('crypto');
const db = require('./db');
const email = require('./email');
const config = require('./config');
const A = require('./auth');

const MAX_TENTATIVAS = 3;
const ESPERAS = [60000, 5 * 60000];
let processando = false;
let timer = null;
let ultimoAviso = 0;

const lista = () => db.list('notificacoes');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

// ---------- Modelo do e-mail (HTML com estilos em linha + texto simples) ----------
function montarEmail({ titulo, intro, campos, destaque, botao, link }) {
  const linhas = campos.filter(([, v]) => v).map(([k, v]) => `
          <tr><td style="padding:8px 0;color:#5a6475;font-size:13px;width:42%;vertical-align:top">${esc(k)}</td>
              <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe4ec">
      <tr><td style="background:#0b1324;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:.2px">Ativos Tech <span style="color:#93c5fd;font-weight:500">· H&amp;CO</span></td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#0f172a">${esc(titulo)}</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155">${esc(intro)}</p>
        ${destaque ? `<div style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #2563eb;background:#eff6ff;border-radius:8px;color:#1e3a8a;font-size:14px;line-height:1.5">${esc(destaque)}</div>` : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e6ee">${linhas}
        </table>
        <p style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">${esc(botao)}</a></p>
        <p style="margin:10px 0 0;font-size:12px;color:#5a6475;word-break:break-all">Ou copie o endereço: ${esc(link)}</p>
      </td></tr>
      <tr><td style="padding:14px 24px;background:#f7f8fb;color:#5a6475;font-size:12px;line-height:1.5">Mensagem automática do Ativos Tech. Para deixar de receber, desative "Notificações por e-mail" em Configurações.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const texto = [titulo, '', intro, ...(destaque ? ['', destaque] : []), '', ...campos.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', `${botao}: ${link}`].join('\n');
  return { html, texto };
}

// Quem pode receber: conta ativa, licença ativa e preferência ligada
const elegivel = (u) => u && A.motivoBloqueio(u) === null && u.notificacoesEmail !== false && u.email;
const operadores = (excetoId) => db.list('usuarios').filter((u) => u.perfil === 'ti' && u.id !== excetoId && elegivel(u));
const linkSol = (s, perfil) => `${config.appUrl}${perfil === 'ti' ? '/solicitacoes/' : '/portal/solicitacoes/'}${s.id}`;
const resumoItens = (s) => (s.itens || []).map((l) => `${l.tipo === 'ativo' ? l.categoria : l.nome}${l.quantidade > 1 ? ` ×${l.quantidade}` : ''}`).join(' + ');

// ---------- Enfileirar ----------
function enfileirar({ chave, tipo, destinatario, assunto, conteudo, solicitacaoId = null }) {
  if (lista().some((n) => n.chave === chave)) return null; // já registrada: evita duplicidade
  const st = email.status();
  const n = {
    id: crypto.randomUUID(), chave, tipo, para: destinatario.email, paraNome: destinatario.nome, usuarioId: destinatario.id || null,
    assunto, html: conteudo.html, texto: conteudo.texto, solicitacaoId,
    status: st.configurado ? 'pendente' : 'nao_configurado', tentativas: 0, erro: st.configurado ? '' : `Serviço de e-mail não configurado (falta ${st.faltando.join(', ')}).`,
    criadoEm: new Date().toISOString(), enviadoEm: null, proximaTentativa: Date.now()
  };
  lista().unshift(n);
  if (lista().length > 3000) lista().length = 3000;
  if (!st.configurado && Date.now() - ultimoAviso > 10 * 60000) {
    ultimoAviso = Date.now();
    console.warn(`[e-mail] Notificação não enviada: serviço de e-mail não configurado (falta ${st.faltando.join(', ')}).`);
  }
  return n;
}

function agendar() {
  setImmediate(() => { processar().catch((e) => console.error(`[e-mail] ${email.limparErro(e)}`)); });
}

// Nova solicitação → todos os Operadores elegíveis
function novaSolicitacao(s, autor) {
  const criados = [];
  db.transacao(() => {
    for (const op of operadores(autor?.id)) {
      const conteudo = montarEmail({
        titulo: `Nova solicitação ${s.numero}`,
        intro: `${s.solicitanteNome} abriu uma nova solicitação de equipamentos no Ativos Tech.`,
        campos: [['Solicitação', s.numero], ['Solicitante', s.solicitanteNome], ['Colaborador', `${s.nomeAdmitido}${s.emailColaborador ? ` <${s.emailColaborador}>` : ''}`], ['Cargo / área', `${s.cargo} · ${s.departamento}`],
          ['Proprietário dos equipamentos', s.proprietario || 'H&CO'],
          ['Data prevista de admissão', fmtData(s.dataAdmissao)], ['Aberta em', fmtDataHora(s.criadoEm)], ['Itens', resumoItens(s)],
          ['Entrega', s.entrega?.modalidade === 'retirada' ? `Retirada · ${s.entrega.unidade}` : `${s.entrega?.cidade}/${s.entrega?.uf}`]],
        botao: 'Abrir solicitação', link: linkSol(s, 'ti')
      });
      const n = enfileirar({ chave: `nova:${s.id}:${op.id}`, tipo: 'nova_solicitacao', destinatario: op, assunto: `[Ativos Tech] Nova solicitação ${s.numero} — ${s.nomeAdmitido}`, conteudo, solicitacaoId: s.id });
      if (n) criados.push(n);
    }
  });
  if (criados.length) agendar();
  return criados;
}

// Interação da TI (status, mensagem, envio, previsão) → solicitante dono do pedido
// Mensagem/cancelamento do RH → Operadores
function interacao(s, atualizacao, autor) {
  if (!atualizacao || atualizacao.publico === false) return [];
  const criados = [];
  const doRH = autor?.perfil === 'rh';
  const destinos = doRH ? operadores(autor.id) : [db.get('usuarios', s.solicitanteId)].filter((u) => u && u.id !== autor?.id && elegivel(u));
  const titulo = atualizacao.tipo === 'status' ? `${s.numero}: ${atualizacao.status}` : `Atualização em ${s.numero}`;
  db.transacao(() => {
    for (const d of destinos) {
      const conteudo = montarEmail({
        titulo,
        intro: doRH ? `${autor.nome} (RH) interagiu na solicitação de ${s.nomeAdmitido}.` : `A equipe de TI atualizou a solicitação de ${s.nomeAdmitido}.`,
        destaque: atualizacao.texto,
        campos: [['Solicitação', s.numero], ['Colaborador', s.nomeAdmitido], ...(atualizacao.tipo === 'status' ? [['Novo status', atualizacao.status]] : [['Status atual', s.status]]),
          ['Atualizado por', autor?.nome], ['Quando', fmtDataHora(atualizacao.em)],
          ...(s.envio?.codigoRastreio ? [['Transportadora', s.envio.transportadora], ['Código de rastreio', s.envio.codigoRastreio]] : []),
          ...(s.previsaoEntrega ? [['Previsão de entrega', fmtData(s.previsaoEntrega)]] : [])],
        botao: 'Acompanhar solicitação', link: linkSol(s, d.perfil)
      });
      const n = enfileirar({ chave: `atualizacao:${atualizacao.id}:${d.id}`, tipo: doRH ? 'interacao_rh' : 'atualizacao_ti', destinatario: d, assunto: `[Ativos Tech] ${titulo} — ${s.nomeAdmitido}`, conteudo, solicitacaoId: s.id });
      if (n) criados.push(n);
    }
  });
  if (criados.length) agendar();
  return criados;
}

// ---------- Envio em segundo plano ----------
async function processar() {
  if (processando) return;
  processando = true;
  try {
    for (;;) {
      const n = lista().find((x) => x.status === 'pendente' && (x.proximaTentativa || 0) <= Date.now());
      if (!n) break;
      n.status = 'enviando';
      n.tentativas = (n.tentativas || 0) + 1;
      db.salvar();
      const { id } = n;
      // Depois do "await" o objeto pode ter sido substituído (rollback de outra transação): busca de novo pelo id
      const atual = () => lista().find((x) => x.id === id);
      try {
        const r = await email.enviar({ para: n.para, nome: n.paraNome, assunto: n.assunto, html: n.html, texto: n.texto });
        const x = atual();
        if (x) Object.assign(x, { status: 'enviado', tentativas: n.tentativas, enviadoEm: new Date().toISOString(), erro: '', idMensagem: r.id || '' });
      } catch (e) {
        const naoConfig = e.naoConfigurado;
        const fim = naoConfig || n.tentativas >= MAX_TENTATIVAS;
        const x = atual();
        if (x) Object.assign(x, { status: naoConfig ? 'nao_configurado' : fim ? 'falhou' : 'pendente', tentativas: n.tentativas, erro: email.limparErro(e), proximaTentativa: Date.now() + (ESPERAS[n.tentativas - 1] || 0) });
        console.error(`[e-mail] Falha ao enviar "${n.assunto}" para ${n.para} (tentativa ${n.tentativas}): ${email.limparErro(e)}`);
      }
      db.salvar();
    }
  } finally {
    processando = false;
  }
}

function iniciar() {
  for (const n of lista()) if (n.status === 'enviando') n.status = 'pendente';
  if (!timer) {
    timer = setInterval(() => processar().catch(() => {}), 30000);
    timer.unref();
  }
  agendar();
}

function reenviar(ids) {
  const alvo = lista().filter((n) => ids.includes(n.id) && ['falhou', 'nao_configurado'].includes(n.status));
  for (const n of alvo) Object.assign(n, { status: 'pendente', tentativas: 0, erro: '', proximaTentativa: Date.now() });
  if (alvo.length) { db.salvar(); agendar(); }
  return alvo.length;
}

// E-mail de teste (enviado na hora, fora da fila) — confirma que a configuração funciona
async function testar(destinatario) {
  const conteudo = montarEmail({
    titulo: 'Teste de notificação', intro: 'Se você recebeu esta mensagem, o envio de e-mails do Ativos Tech está funcionando.',
    campos: [['Enviado em', fmtDataHora(new Date().toISOString())], ['Servidor', email.status().servidor]], botao: 'Abrir o Ativos Tech', link: config.appUrl
  });
  return email.enviar({ para: destinatario.email, nome: destinatario.nome, assunto: '[Ativos Tech] Teste de notificação', ...conteudo });
}

function resumo() {
  const c = { pendente: 0, enviando: 0, enviado: 0, falhou: 0, nao_configurado: 0 };
  for (const n of lista()) c[n.status] = (c[n.status] || 0) + 1;
  return c;
}

module.exports = { novaSolicitacao, interacao, processar, iniciar, reenviar, testar, resumo, montarEmail };
