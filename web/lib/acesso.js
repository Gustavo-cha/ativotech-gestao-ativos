// Escolhas da tela inicial (empresa e portal), lembradas neste navegador para agilizar o próximo acesso.
// Não é segurança: o servidor valida empresa e perfil em todo login e em cada requisição.
const CHAVE = 'ativotech:acesso';

export const PORTAIS = {
  rh: { titulo: 'Portal do Solicitante', sub: 'Solicitante (RH)', desc: 'Abra e acompanhe solicitações de equipamentos para admissões.' },
  ti: { titulo: 'Portal do Operador', sub: 'Operador (TI)', desc: 'Estoque, solicitações, preparação, envios e usuários.' }
};

export function lerAcesso() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; }
}
export function salvarAcesso(dados) {
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...lerAcesso(), ...dados })); } catch { /* sem storage */ }
}

// Só aceita caminhos internos (evita redirecionamento para outro site)
export const voltarSeguro = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') && !v.startsWith('/login') && !v.startsWith('/acesso') ? v : '');

export function lerMotivoSaida() {
  try {
    const m = sessionStorage.getItem('ativotech:motivo-saida');
    sessionStorage.removeItem('ativotech:motivo-saida');
    return m || '';
  } catch { return ''; }
}
