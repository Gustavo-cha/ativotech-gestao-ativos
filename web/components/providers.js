'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { configurarAlerta } from '@/lib/sound';

// ---------- Configurações (tema, cor, densidade, transições, alerta sonoro) ----------
// A interface é silenciosa por padrão: o único som é o alerta de nova solicitação (Operador), que pode ser desligado.
export const CONFIG_PADRAO = {
  versao: 2, tema: 'sistema', acento: 'azul', densidade: 'confortavel', animacoes: true, sidebarRecolhida: false,
  // Alerta de nova solicitação (Operador): som curto, repetição (desligada) e notificação do navegador
  alertaNovaSolicitacao: true, volumeAlerta: 0.6, repetirAlerta: false, notificacaoNavegador: false
};
const CHAVE = 'ativotech:config';
// Preferências salvas antes da versão 2 (interface sonora) passam a seguir o padrão silencioso
function migrarConfig(c) {
  if ((c.versao || 1) >= 2) return c;
  const { som, volume, alertasSonoros, nomeUsuario, ...resto } = c;
  return { ...resto, versao: 2, repetirAlerta: false, volumeAlerta: Math.min(c.volumeAlerta ?? 0.6, 0.6) };
}
const ConfigCtx = createContext(null);

function aplicar(cfg) {
  const r = document.documentElement;
  if (cfg.tema === 'sistema') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', cfg.tema === 'escuro' ? 'dark' : 'light');
  r.dataset.accent = cfg.acento;
  r.dataset.density = cfg.densidade;
  r.dataset.motion = cfg.animacoes ? 'on' : 'off';
  // Marca usada antes do carregamento (evita o menu "piscar"): precisa acompanhar a escolha atual,
  // senão o menu fica preso no modo só ícones depois de recarregar a página
  if (cfg.sidebarRecolhida) r.dataset.side = 'collapsed';
  else delete r.dataset.side;
  configurarAlerta(cfg.volumeAlerta);
}

export function useConfig() { return useContext(ConfigCtx); }

// ---------- Toasts ----------
const ToastCtx = createContext(null);
export function useToast() { return useContext(ToastCtx); }
// Confirmações somem rápido; erros e avisos ficam um pouco mais; nunca há som
const DURACAO = { sucesso: 2600, info: 4000, aviso: 6000, erro: 7000 };

// ---------- UI global (janelas e paleta de comandos) ----------
const UICtx = createContext(null);
export function useUI() { return useContext(UICtx); }

export function AppProviders({ children }) {
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let c = CONFIG_PADRAO;
    try { c = { ...CONFIG_PADRAO, ...migrarConfig(JSON.parse(localStorage.getItem(CHAVE) || '{}')) }; } catch { /* ignore */ }
    setConfig(c);
    aplicar(c);
    setPronto(true);
  }, []);

  const atualizar = useCallback((patch) => {
    setConfig((old) => {
      const novo = { ...old, ...patch };
      try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* ignore */ }
      aplicar(novo);
      return novo;
    });
  }, []);

  const temaEfetivo = useCallback(() => {
    if (config.tema !== 'sistema') return config.tema === 'escuro' ? 'dark' : 'light';
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, [config.tema]);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const tid = useRef(0);
  const fecharToast = useCallback((id) => setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x))), []);
  const removerToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const recentes = useRef(new Map());
  const toast = useCallback((t) => {
    const tipo = t.tipo || 'info';
    // Mesma mensagem repetida em poucos segundos não gera outro aviso
    const chave = `${tipo}|${t.titulo}|${t.msg || ''}`;
    const agora = Date.now();
    if (agora - (recentes.current.get(chave) || 0) < 4000) return null;
    recentes.current.set(chave, agora);
    if (recentes.current.size > 50) recentes.current.clear();
    const id = ++tid.current;
    const item = { id, duracao: DURACAO[tipo], ...t, tipo };
    // No máximo 3 avisos visíveis; os mais antigos saem primeiro
    setToasts((old) => [...old.slice(-2), item]);
    setTimeout(() => fecharToast(id), item.duracao);
    return id;
  }, [fecharToast]);

  // Janelas globais
  const [janela, setJanela] = useState(null); // { tipo: 'evento'|'paleta'|'atalhos'|'novo-rapido', dados }
  const ui = useMemo(() => ({
    janela,
    abrir: (tipo, dados = {}) => setJanela({ tipo, dados }),
    fechar: () => setJanela(null),
    menuMobile: false
  }), [janela]);

  const cfgValue = useMemo(() => ({ config, atualizar, pronto, temaEfetivo }), [config, atualizar, pronto, temaEfetivo]);
  const toastValue = useMemo(() => ({ toast, toasts, fecharToast, removerToast }), [toast, toasts, fecharToast, removerToast]);

  return (
    <ConfigCtx.Provider value={cfgValue}>
      <ToastCtx.Provider value={toastValue}>
        <UICtx.Provider value={ui}>{children}</UICtx.Provider>
      </ToastCtx.Provider>
    </ConfigCtx.Provider>
  );
}
