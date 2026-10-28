'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carrega dados e recarrega quando algo muda no servidor (evento "ativotech:mudou").
 * - Mantém os dados atuais na tela enquanto recarrega (sem "piscar" esqueletos).
 * - Agrupa vários avisos seguidos numa única recarga e espera a aba ficar visível para recarregar.
 * - Respostas fora de ordem são descartadas (só vale a última consulta).
 */
export function useApi(fn, deps = [], { auto = true } = {}) {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++seq.current;
    try {
      const r = await fnRef.current();
      if (minha !== seq.current) return;
      setData(r);
      setErro('');
    } catch (e) {
      if (minha !== seq.current) return;
      setErro(e.message);
    } finally {
      if (minha === seq.current) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => {
    if (!auto) return undefined;
    let timer = null;
    let pendente = false;
    const agendar = () => {
      if (document.hidden) { pendente = true; return; }
      clearTimeout(timer);
      timer = setTimeout(recarregar, 150);
    };
    const voltar = () => { if (!document.hidden && pendente) { pendente = false; agendar(); } };
    window.addEventListener('ativotech:mudou', agendar);
    document.addEventListener('visibilitychange', voltar);
    return () => { clearTimeout(timer); window.removeEventListener('ativotech:mudou', agendar); document.removeEventListener('visibilitychange', voltar); };
  }, [recarregar, auto]);

  return { data, erro, carregando, recarregar, setData };
}

// Valor que só muda depois de uma pausa na digitação (busca sem uma requisição por tecla)
export function useDebounce(valor, ms = 250) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

// true somente depois que o componente montou no navegador (evita divergência servidor x cliente)
export function useMontado() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

// Mantido por compatibilidade: os números aparecem direto, sem animação de contagem
export function useCountUp(alvo) {
  return alvo;
}

// Atalho de teclado global
export function useHotkey(teste, acao, deps = []) {
  useEffect(() => {
    const h = (e) => { if (teste(e)) { e.preventDefault(); acao(e); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Estado salvo no navegador e sincronizado entre todos os componentes que usam a mesma chave
export function useLocalState(chave, inicial) {
  const [v, setV] = useState(inicial);
  useEffect(() => {
    const ler = () => {
      try {
        const s = localStorage.getItem(chave);
        if (s !== null) setV(JSON.parse(s));
      } catch { /* sem storage */ }
    };
    ler();
    const h = (e) => { if (e.detail === chave) ler(); };
    window.addEventListener('ativotech:ls', h);
    return () => window.removeEventListener('ativotech:ls', h);
  }, [chave]);
  const set = useCallback((nv) => {
    setV((old) => {
      const val = typeof nv === 'function' ? nv(old) : nv;
      try { localStorage.setItem(chave, JSON.stringify(val)); } catch { /* sem storage */ }
      setTimeout(() => window.dispatchEvent(new CustomEvent('ativotech:ls', { detail: chave })), 0);
      return val;
    });
  }, [chave]);
  return [v, set];
}
