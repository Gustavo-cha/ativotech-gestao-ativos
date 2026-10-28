// Alerta sonoro — o único som do sistema. A interface é silenciosa: cliques, abas, janelas e salvamentos não tocam nada.
// Toca apenas quando chega uma nova solicitação para a TI (pode ser desligado em Configurações).
// Sintetizado com Web Audio API — nenhum arquivo de áudio é baixado.
let ctx = null;
let volumeAlerta = 0.6;

export const configurarAlerta = (v) => { volumeAlerta = typeof v === 'number' ? v : volumeAlerta; };

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Navegadores só liberam áudio depois de uma interação do usuário (clique/tecla).
export const audioBloqueado = () => {
  if (typeof window === 'undefined') return false;
  if (!ctx) return !(navigator.userActivation?.hasBeenActive ?? false);
  return ctx.state !== 'running';
};
export function desbloquearAudio() {
  const ac = audio();
  if (!ac) return Promise.resolve(false);
  return (ac.state === 'running' ? Promise.resolve() : ac.resume()).then(() => ac.state === 'running').catch(() => false);
}

function nota(freq, inicio, dur, vol) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + inicio;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  const v = Math.max(0.0002, 0.16 * vol * volumeAlerta);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Dois toques curtos e discretos
export function apitar() {
  try { nota(880, 0, 0.16, 1); nota(1175, 0.14, 0.22, 0.9); } catch { /* áudio indisponível */ }
}
