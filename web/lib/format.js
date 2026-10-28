export const moeda = (v, compacto = false) =>
  Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    ...(compacto ? { notation: 'compact', maximumFractionDigits: 1 } : {})
  });

export const numero = (v) => Number(v || 0).toLocaleString('pt-BR');

export const data = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const dataHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const isoLocal = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const parseISO = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
};

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function relativo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  const fut = diff < 0;
  const s = Math.abs(diff);
  const v = s < 60 ? 'agora' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : s < 2592000 ? `${Math.round(s / 86400)} d` : `${Math.round(s / 2592000)} meses`;
  if (v === 'agora') return 'agora';
  return fut ? `em ${v}` : `há ${v}`;
}

export function duracaoMin(min) {
  const a = Math.abs(min);
  if (a < 60) return `${a} min`;
  if (a < 1440) return `${Math.round(a / 60)} h`;
  return `${Math.round(a / 1440)} d`;
}

export const idade = (meses) => {
  if (meses === null || meses === undefined) return '—';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const r = meses % 12;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}${r ? ` e ${r} m` : ''}`;
};

export const iniciais = (nome = '') =>
  nome.split(/\s+/).filter((p) => p && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase())).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
