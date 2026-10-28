'use client';

// Sessão do usuário no front-end. A API é quem garante as permissões;
// aqui elas só servem para mostrar/ocultar opções e redirecionar telas.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '@/lib/api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const temPermissao = (usuario, permissao) =>
  Boolean(usuario && (usuario.permissoes?.includes('*') || usuario.permissoes?.includes(permissao)));

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!getToken()) { setUsuario(null); setCarregando(false); return; }
    try {
      setUsuario(await api.auth.me());
    } catch {
      setToken(null);
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Sessão expirada em qualquer chamada → volta ao login
  useEffect(() => {
    const h = () => { setToken(null); setUsuario(null); };
    window.addEventListener('ativotech:sessao-expirada', h);
    return () => window.removeEventListener('ativotech:sessao-expirada', h);
  }, []);

  // Login por e-mail/senha: o servidor confere empresa, portal (perfil), conta e licença
  const login = useCallback(async (email, senha, prefixo, perfil) => {
    const r = await api.auth.login(email, senha, prefixo, perfil);
    setToken(r.token);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  // Sessão já aberta pelo servidor (login Microsoft ou troca de senha devolvem um token novo)
  const usarSessao = useCallback((token, u) => {
    setToken(token);
    setUsuario(u);
  }, []);

  // Troca obrigatória de senha: a API avisa (403 TROCA_SENHA) e o app leva para a tela de nova senha
  useEffect(() => {
    const h = () => setUsuario((u) => (u ? { ...u, trocarSenha: true } : u));
    window.addEventListener('ativotech:trocar-senha', h);
    return () => window.removeEventListener('ativotech:trocar-senha', h);
  }, []);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* já expirada */ }
    setToken(null);
    setUsuario(null);
  }, []);

  const valor = useMemo(() => ({
    usuario, carregando, login, logout, usarSessao, recarregar: carregar, atualizarUsuario: setUsuario,
    pode: (p) => temPermissao(usuario, p),
    perfil: usuario?.perfil || null
  }), [usuario, carregando, login, logout, usarSessao, carregar]);

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}
