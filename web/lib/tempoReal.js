// Cliente do canal em tempo real (Server-Sent Events) da API.
// Usa fetch + leitura do corpo (em vez de EventSource) para enviar o token no cabeçalho
// Authorization — o token nunca aparece na URL nem nos logs do servidor.
//
// Estados: 'conectando' → 'ao-vivo' (canal aberto) | 'consulta' (canal caiu: consulta /sync a cada 4 s
// enquanto tenta reconectar com espera crescente) | 'offline' (API inacessível).
import { API_URL, getToken, getRev, setRev, notificarMudanca, api } from './api';

const ESPERA_MAX = 15000;
// Motivo do encerramento da sessão (conta desativada, licença…) — exibido na tela de login
const guardarMotivo = (m) => { try { if (m) sessionStorage.setItem('ativotech:motivo-saida', m); } catch { /* sem storage */ } };
const SEM_DADOS_MS = 45000; // o servidor manda batimento a cada 20 s

export function conectarTempoReal({ aoEvento = () => {}, aoEstado = () => {} } = {}) {
  let ativo = true;
  let ctl = null;
  let tentativa = 0;
  let consulta = null;
  let vigia = null;
  let timer = null;

  const sincronizarRev = (rev) => {
    if (typeof rev !== 'number') return;
    if (getRev() === null) { setRev(rev); return; }
    if (rev !== getRev()) { setRev(rev); notificarMudanca(); }
  };

  // Alternativa enquanto o canal está fora: consulta a revisão periodicamente
  const iniciarConsulta = () => {
    if (consulta) return;
    const verificar = async () => {
      try {
        const { rev } = await api.sync();
        sincronizarRev(rev);
        aoEstado('consulta');
      } catch {
        aoEstado('offline');
      }
    };
    verificar();
    consulta = setInterval(verificar, 4000);
  };
  const pararConsulta = () => { clearInterval(consulta); consulta = null; };

  const armarVigia = () => {
    clearTimeout(vigia);
    vigia = setTimeout(() => ctl?.abort(), SEM_DADOS_MS);
  };

  async function abrir() {
    timer = null;
    if (!ativo) return;
    const token = getToken();
    if (!token) return;
    ctl = new AbortController();
    aoEstado(tentativa ? 'consulta' : 'conectando');
    try {
      const res = await fetch(`${API_URL}/stream`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: ctl.signal, cache: 'no-store' });
      if (res.status === 401) {
        const b = await res.json().catch(() => ({}));
        guardarMotivo(b.codigo && b.codigo !== 'SESSAO' ? b.erro : '');
        window.dispatchEvent(new Event('ativotech:sessao-expirada'));
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const leitor = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      armarVigia();
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        armarVigia();
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloco = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const tipo = /^event: (.+)$/m.exec(bloco)?.[1];
          const bruto = /^data: (.+)$/m.exec(bloco)?.[1];
          if (!tipo) continue; // comentário de batimento
          let dados = null;
          try { dados = bruto ? JSON.parse(bruto) : null; } catch { /* ignora */ }
          if (tipo === 'pronto') {
            tentativa = 0;
            pararConsulta();
            aoEstado('ao-vivo');
            sincronizarRev(dados?.rev);
          } else if (tipo === 'rev') {
            sincronizarRev(dados?.rev);
          } else if (tipo === 'sessao' && dados?.valida === false) {
            guardarMotivo(dados.erro);
            window.dispatchEvent(new Event('ativotech:sessao-expirada'));
            return;
          } else {
            aoEvento(tipo, dados);
            window.dispatchEvent(new CustomEvent(`ativotech:${tipo}`, { detail: dados }));
          }
        }
      }
    } catch {
      /* conexão caiu ou foi abortada */
    } finally {
      clearTimeout(vigia);
    }
    if (!ativo) return;
    // Reconecta com espera crescente; enquanto isso, a consulta periódica mantém as telas atualizadas
    iniciarConsulta();
    const espera = Math.min(ESPERA_MAX, 1000 * 2 ** tentativa++);
    timer = setTimeout(abrir, espera);
  }

  // Ao voltar para a aba ou recuperar a rede, reconecta na hora
  const aoVoltar = () => {
    if (document.hidden || !timer) return;
    clearTimeout(timer);
    tentativa = 0;
    abrir();
  };
  window.addEventListener('online', aoVoltar);
  document.addEventListener('visibilitychange', aoVoltar);

  abrir();

  return () => {
    ativo = false;
    ctl?.abort();
    clearTimeout(timer);
    pararConsulta();
    clearTimeout(vigia);
    window.removeEventListener('online', aoVoltar);
    document.removeEventListener('visibilitychange', aoVoltar);
  };
}
