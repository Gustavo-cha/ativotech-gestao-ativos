'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navDoUsuario, NAV_CONFIG, inicioDoUsuario } from '@/lib/nav';
import { useAuth } from '../auth';
import { Avatar } from '../ui';
import { useConfig, useUI } from '../providers';

export default function Sidebar({ contadores, mobileAberto, fecharMobile }) {
  const path = usePathname();
  const { config, atualizar } = useConfig();
  const ui = useUI();
  const { usuario } = useAuth();
  const nav = navDoUsuario(usuario);
  const rh = usuario.perfil !== 'ti';
  const recolhida = config.sidebarRecolhida;
  const alternar = () => atualizar({ sidebarRecolhida: !recolhida });
  const rotulo = recolhida ? 'Expandir menu' : 'Recolher menu';
  const ativo = (href) => (href === '/' || href === '/portal' ? path === href : path === href || path.startsWith(`${href}/`) || (href === '/portal/solicitacoes' && path.startsWith('/portal/solicitacoes')));

  const Item = ({ item }) => {
    const I = item.icone;
    const n = item.badge ? contadores[item.badge] : 0;
    return (
      <Link href={item.href} className={`nav-item ${ativo(item.href) ? 'active' : ''}`} onClick={() => { fecharMobile(); }}
        title={recolhida ? item.label : undefined} aria-current={ativo(item.href) ? 'page' : undefined}>
        <I size={19} aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
        {n > 0 && <span className={`nav-badge ${item.badge === 'alertas' ? 'hot' : ''} ${item.badge === 'novas' ? 'hot pulse' : ''}`} aria-label={`${n} ${item.badge === 'novas' ? 'novas' : 'pendentes'}`}>{n > 99 ? '99+' : n}</span>}
      </Link>
    );
  };

  return (
    <>
      {mobileAberto && <div className="sidebar-scrim" onClick={fecharMobile} />}
      <aside className={`sidebar ${recolhida ? 'collapsed' : ''} ${mobileAberto ? 'mobile-open' : ''}`} aria-label="Menu principal">
        {/* Alça na borda do menu: sempre à vista no computador, alterna entre menu completo e só ícones */}
        <button type="button" className="side-toggle" onClick={alternar} aria-label={rotulo} aria-expanded={!recolhida}
          title={`${rotulo} (Ctrl + B)`}>
          {recolhida ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
        </button>

        <Link href={inicioDoUsuario(usuario)} className="side-brand" onClick={fecharMobile}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 7l8-4 8 4-8 4-8-4z" fill="currentColor" opacity=".95" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity=".7" /></svg>
          </span>
          <span className="brand-text"><strong>Ativos Tech</strong><small>{rh ? 'Portal de equipamentos' : 'Logística de equipamentos'}</small></span>
        </Link>

        {rh ? (
          <Link href="/portal/nova" className="side-new" onClick={fecharMobile} title="Nova solicitação">
            <Plus size={18} aria-hidden="true" /><span className="nav-label">Nova solicitação</span>
          </Link>
        ) : (
          <button type="button" className="side-new" onClick={() => { ui.abrir('novo-rapido'); fecharMobile(); }} title="Criar novo">
            <Plus size={18} aria-hidden="true" /><span className="nav-label">Criar novo</span>
          </button>
        )}

        <nav className="side-nav">
          {nav.map((s) => (
            <div key={s.secao} className="nav-section">
              <span className="nav-section-title">{s.secao}</span>
              {s.itens.map((i) => <Item key={i.href} item={i} />)}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-user" title={`${usuario.nome} · ${usuario.perfilNome}`}>
            <Avatar nome={usuario.nome} size={32} />
            <span className="nav-label"><strong>{usuario.nome}</strong><small>{usuario.perfilNome}</small></span>
          </div>
          <Item item={NAV_CONFIG} />
          <button type="button" className="nav-item collapse-btn" onClick={alternar}
            aria-label={rotulo} aria-expanded={!recolhida} title={recolhida ? `${rotulo} (Ctrl + B)` : undefined}>
            {recolhida ? <ChevronsRight size={19} aria-hidden="true" /> : <ChevronsLeft size={19} aria-hidden="true" />}
            <span className="nav-label">{rotulo}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
