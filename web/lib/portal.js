'use client';

// Utilitários compartilhados do portal (estado salvo por usuário neste navegador)
import { useLocalState } from './hooks';

export function useAlertasDispensados() {
  return useLocalState('ativotech:alertas-dispensados', []);
}

// Última atualização vista de cada solicitação (para destacar novidades ao RH)
export function useVistos() {
  return useLocalState('ativotech:solicitacoes-vistas', {});
}

// Última mensagem escrita por outra pessoa (ex.: a TI respondendo ao RH)
export function ultimaNovidade(s, usuario) {
  const ext = (s.atualizacoes || []).filter((a) => a.autor !== usuario?.nome);
  return ext.length ? ext[ext.length - 1] : null;
}

export const naoLida = (s, usuario, vistos) => {
  const n = ultimaNovidade(s, usuario);
  return Boolean(n && (!vistos[s.id] || n.em > vistos[s.id]));
};
