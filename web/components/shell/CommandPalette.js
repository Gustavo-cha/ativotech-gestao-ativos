'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Boxes, CalendarPlus, SunMoon, BellRing, Download, CornerDownLeft, Package, CalendarDays, Keyboard, FilePlus2, ClipboardList, LogOut, PackagePlus, Truck, Inbox, FileUp, UserRound } from 'lucide-react';
import { paginasDoUsuario } from '@/lib/nav';
import { useAuth } from '../auth';
import { api } from '@/lib/api';
import { useConfig, useUI } from '../providers';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Paleta de comandos (Ctrl/⌘ + K): navega, executa ações e busca registros
export default function CommandPalette() {
  const ui = useUI();
  const router = useRouter();
  const { config, atualizar, temaEfetivo } = useConfig();
  const { usuario, pode, logout } = useAuth();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [sel, setSel] = useState(0);
  const lista = useRef(null);
  const aberto = ui.janela?.tipo === 'paleta';

  useEffect(() => { if (aberto) { setQ(''); setSel(0); setResultados([]); } }, [aberto]);

  useEffect(() => {
    if (!aberto || q.trim().length < 2) { setResultados([]); return undefined; }
    const t = setTimeout(() => api.busca(q).then(setResultados).catch(() => setResultados([])), 160);
    return () => clearTimeout(t);
  }, [q, aberto]);

  const itens = useMemo(() => {
    const ir = (href) => () => router.push(href);
    const acoes = [
      pode('ativos:gerenciar') && { grupo: 'Ações', label: 'Cadastrar equipamento', icone: Boxes, run: ir('/ativos/novo'), atalho: 'N' },
      pode('estoque:gerenciar') && { grupo: 'Ações', label: 'Registrar entrada de estoque', icone: PackagePlus, run: ir('/estoque?aba=itens&acao=entrada') },
      pode('importacao:executar') && { grupo: 'Ações', label: 'Importar equipamentos (CSV ou Excel)', icone: FileUp, run: ir('/ativos/importar') },
      pode('solicitacoes:gerenciar') && { grupo: 'Ações', label: 'Ver solicitações novas', icone: Inbox, run: ir('/solicitacoes?filtro=novas') },
      pode('solicitacoes:gerenciar') && { grupo: 'Ações', label: 'Envios em trânsito', icone: Truck, run: ir('/envios?aba=transito') },
      pode('solicitacoes:criar') && { grupo: 'Ações', label: 'Nova solicitação de equipamento', icone: FilePlus2, run: ir('/portal/nova'), atalho: pode('ativos:gerenciar') ? undefined : 'N' },
      pode('eventos:gerenciar') && { grupo: 'Ações', label: 'Novo evento na agenda', icone: CalendarPlus, run: () => ui.abrir('evento'), atalho: 'E' },
      { grupo: 'Ações', label: `Mudar para tema ${temaEfetivo() === 'dark' ? 'claro' : 'escuro'}`, icone: SunMoon, run: () => atualizar({ tema: temaEfetivo() === 'dark' ? 'claro' : 'escuro' }) },
      pode('solicitacoes:gerenciar') && { grupo: 'Ações', label: config.alertaNovaSolicitacao ? 'Desligar alerta sonoro de novas solicitações' : 'Ligar alerta sonoro de novas solicitações', icone: BellRing, run: () => atualizar({ alertaNovaSolicitacao: !config.alertaNovaSolicitacao }) },
      pode('ativos:ver') && { grupo: 'Ações', label: 'Exportar inventário (CSV)', icone: Download, run: () => api.ativos.exportar().catch(() => {}) },
      { grupo: 'Ações', label: 'Ver atalhos de teclado', icone: Keyboard, run: () => setTimeout(() => ui.abrir('atalhos'), 10), atalho: '?' },
      { grupo: 'Ações', label: 'Sair da conta', icone: LogOut, run: async () => { await logout(); router.replace('/acesso'); } }
    ].filter(Boolean);
    const paginas = paginasDoUsuario(usuario).map((p, i) => ({ grupo: 'Ir para', label: p.label, sub: p.desc, icone: p.icone, run: ir(p.href), atalho: i < 9 ? `Alt ${i + 1}` : undefined }));
    const ICON = { ativo: Package, evento: CalendarDays, solicitacao: ClipboardList, colaborador: UserRound };
    const GRUPO = { ativo: 'Equipamentos', evento: 'Agenda', solicitacao: 'Solicitações', colaborador: 'Colaboradores' };
    const regs = resultados.map((r) => ({
      grupo: GRUPO[r.tipo], label: r.titulo, sub: r.sub, icone: ICON[r.tipo],
      run: r.tipo === 'ativo' ? ir(`/ativos/${r.id}`) : r.tipo === 'colaborador' ? ir(`/colaboradores?id=${r.id}`)
        : r.tipo === 'solicitacao' ? ir(pode('solicitacoes:gerenciar') ? `/solicitacoes/${r.id}` : `/portal/solicitacoes/${r.id}`) : ir(`/agenda?data=${r.data}`)
    }));
    const t = norm(q.trim());
    const filtra = (arr) => (t ? arr.filter((i) => norm(i.label + ' ' + (i.sub || '')).includes(t)) : arr);
    return [...regs, ...filtra(acoes), ...filtra(paginas)];
  }, [q, resultados, router, ui, config.alertaNovaSolicitacao, atualizar, temaEfetivo, usuario, pode, logout]);

  useEffect(() => { setSel(0); }, [itens.length]);
  useEffect(() => { lista.current?.querySelector('.cmd-item.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  if (!aberto) return null;

  const executar = (item) => { ui.fechar(); item.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && itens[sel]) { e.preventDefault(); executar(itens[sel]); }
    else if (e.key === 'Escape') ui.fechar();
  };

  let grupoAtual = null;
  return (
    <div className="overlay overlay-top" onMouseDown={(e) => e.target === e.currentTarget && ui.fechar()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="cmd-input">
          <Search size={18} aria-hidden="true" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={pode('solicitacoes:gerenciar') ? 'Comando, página, patrimônio, SOL-, colaborador ou código de rastreio…' : 'Nome do colaborador, nº da solicitação ou uma página…'} aria-label="Buscar" role="combobox"
            aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={`cmd-${sel}`} />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmd-list" id="cmd-list" role="listbox" ref={lista}>
          {itens.length === 0 && <li className="cmd-empty">Nada encontrado para “{q}”.</li>}
          {itens.map((it, i) => {
            const I = it.icone;
            const cab = it.grupo !== grupoAtual;
            grupoAtual = it.grupo;
            return (
              <li key={it.grupo + it.label + i} role="presentation">
                {cab && <div className="cmd-group">{it.grupo}</div>}
                <button type="button" id={`cmd-${i}`} role="option" aria-selected={sel === i}
                  className={`cmd-item ${sel === i ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => executar(it)}>
                  <span className="cmd-icon">{I && <I size={16} aria-hidden="true" />}</span>
                  <span className="cmd-text"><span>{it.label}</span>{it.sub && <small>{it.sub}</small>}</span>
                  {it.atalho && <kbd>{it.atalho}</kbd>}
                  {sel === i && <CornerDownLeft size={14} className="cmd-enter" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="cmd-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>
    </div>
  );
}
