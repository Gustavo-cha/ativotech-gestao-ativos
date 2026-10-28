'use client';

// Componentes básicos reutilizados em todas as telas.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Inbox, Laptop, Monitor, Smartphone, Tablet, Printer, Network, Server, Mouse, Package, Cpu, Headphones, Cable, Backpack } from 'lucide-react';
import { iniciais } from '@/lib/format';
import { TOM_STATUS, GARANTIA } from '@/lib/constants';

export function Badge({ tom = 'slate', children, dot = false, className = '' }) {
  return <span className={`badge tone-${tom} ${className}`}>{dot && <i className="dot" />}{children}</span>;
}
export const StatusBadge = ({ status }) => <Badge tom={TOM_STATUS[status]} dot>{status}</Badge>;
export const GarantiaBadge = ({ status }) => <Badge tom={GARANTIA[status]?.tom}>{GARANTIA[status]?.label}</Badge>;

const ICONES_CATEGORIA = { Notebook: Laptop, Desktop: Cpu, Monitor, Smartphone, Tablet, Impressora: Printer, Rede: Network, Servidor: Server, 'Periférico': Mouse, 'Acessório': Backpack, 'Cabo e adaptador': Cable, 'Áudio': Headphones, Outro: Package };
export function CategoriaIcon({ categoria, size = 18, boxed = false }) {
  const I = ICONES_CATEGORIA[categoria] || Package;
  if (!boxed) return <I size={size} aria-hidden="true" />;
  return <span className={`cat-icon cat-${(categoria || 'outro').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-')}`}><I size={size} aria-hidden="true" /></span>;
}

export function Avatar({ nome, size = 28 }) {
  let h = 0;
  for (const c of nome || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, '--h': h }} title={nome} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function EmptyState({ icon: I = Inbox, titulo, texto, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><I size={26} aria-hidden="true" /></span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

export function Progress({ valor, tom = 'accent', label, altura = 6 }) {
  const v = Math.max(0, Math.min(100, valor || 0));
  return (
    <div className="progress" style={{ height: altura }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`progress-bar ${tom === 'accent' ? '' : `bg-${tom}`}`} style={{ width: `${v}%` }} />
    </div>
  );
}

// Janela modal com animação, ESC para fechar e foco no primeiro campo
export function Modal({ aberto, onClose, titulo, subtitulo, icone: I, children, rodape, largura = 640 }) {
  const ref = useRef(null);
  const abertoEm = useRef(0);
  useEffect(() => {
    if (!aberto) return undefined;
    abertoEm.current = Date.now();
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const t = setTimeout(() => ref.current?.querySelector('input:not([type=hidden]), select, textarea')?.focus(), 60);
    return () => { window.removeEventListener('keydown', h); clearTimeout(t); };
  }, [aberto, onClose]);
  if (!aberto) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && Date.now() - abertoEm.current > 400 && onClose()}>
      <div className="modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header className="modal-head">
          {I && <span className="modal-icon"><I size={18} aria-hidden="true" /></span>}
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="muted small">{subtitulo}</p>}
          </div>
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {rodape && <footer className="modal-foot">{rodape}</footer>}
      </div>
    </div>
  );
}

// Painel lateral deslizante
export function Drawer({ aberto, onClose, children, largura = 560, label }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto, onClose]);
  if (!aberto) return null;
  return (
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" style={{ maxWidth: largura }} role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
    </div>
  );
}

// Abas com indicador deslizante
export function Tabs({ abas, ativa, onChange, className = '' }) {
  const wrap = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector(`[data-id="${CSS.escape(String(ativa))}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [ativa, abas]);
  return (
    <div className={`tabs ${className}`} role="tablist" ref={wrap}>
      {abas.map((a) => {
        const I = a.icone;
        return (
          <button key={a.id} data-id={a.id} role="tab" aria-selected={ativa === a.id} type="button"
            className={`tab ${ativa === a.id ? 'active' : ''}`}
            onClick={() => { if (ativa !== a.id) { onChange(a.id); } }}>
            {I && <I size={15} aria-hidden="true" />}
            {a.label}
            {a.qtd !== undefined && <span className="tab-count">{a.qtd}</span>}
          </button>
        );
      })}
      <span className="tab-indicator" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} />
    </div>
  );
}

// Menu suspenso simples
export function Menu({ trigger, children, align = 'right', className = '' }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    const k = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); };
  }, [aberto]);
  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      {trigger({ aberto, alternar: () => { setAberto((v) => !v); } })}
      {aberto && <div className={`menu menu-${align}`} role="menu" onClick={() => setAberto(false)}>{children}</div>}
    </div>
  );
}
export function MenuItem({ icone: I, children, onClick, perigo, atalho }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${perigo ? 'danger' : ''}`} onClick={onClick}>
      {I && <I size={15} aria-hidden="true" />}<span>{children}</span>{atalho && <kbd>{atalho}</kbd>}
    </button>
  );
}

// Campo de formulário com rótulo e erro
export function Field({ label, erro, obrigatorio, children, wide, dica, id }) {
  return (
    <div className={`field ${wide ? 'field-wide' : ''} ${erro ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}{obrigatorio && <span className="req" aria-hidden="true"> *</span>}</label>
      {children}
      {erro ? <p className="field-error" role="alert">{erro}</p> : dica ? <p className="field-hint">{dica}</p> : null}
    </div>
  );
}

// Interruptor (on/off)
export function Switch({ checked, onChange, label, id }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} id={id}
      className={`switch ${checked ? 'on' : ''}`} onClick={() => { onChange(!checked); }}>
      <span className="switch-thumb" />
    </button>
  );
}

export function Segmented({ opcoes, valor, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {opcoes.map((o) => {
        const I = o.icone;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} className={valor === o.id ? 'on' : ''}
            onClick={() => { onChange(o.id); }} title={o.titulo || o.label}>
            {I && <I size={15} aria-hidden="true" />}{o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ titulo, subtitulo, icone: I, children }) {
  return (
    <div className="page-head">
      <div className="page-title">
        {I && <span className="page-icon"><I size={22} aria-hidden="true" /></span>}
        <div>
          <h1>{titulo}</h1>
          {subtitulo && <p className="muted">{subtitulo}</p>}
        </div>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function ErroApi({ erro, onRetry }) {
  if (!erro) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{erro}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}
