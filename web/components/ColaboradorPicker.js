'use client';

// Seleção do colaborador que vai receber o equipamento: busca por nome ou e-mail corporativo
// e, se ainda não existir, cadastro rápido ali mesmo (nome, e-mail, empresa, cargo e departamento).
import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, X, Mail, Loader2 } from 'lucide-react';
import { Field, Avatar, Segmented } from './ui';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';

export const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];
const VAZIO = { nome: '', email: '', empresa: 'H&CO', cargo: '', departamento: '' };

// valor: { colaborador } (existente) | { novo: {…} } | null
export default function ColaboradorPicker({ valor, onChange, erros = {}, empresaPadrao = 'H&CO', id = 'colab', autoFocus = false }) {
  const [q, setQ] = useState('');
  const termo = useDebounce(q, 220);
  const [opcoes, setOpcoes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!aberto || termo.trim().length < 2) { setOpcoes([]); return undefined; }
    let vivo = true;
    setBuscando(true);
    api.colaboradores.listar({ q: termo.trim(), ativos: 1, limite: 8 }).then((l) => vivo && setOpcoes(l)).catch(() => vivo && setOpcoes([])).finally(() => vivo && setBuscando(false));
    return () => { vivo = false; };
  }, [termo, aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (!wrap.current?.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (valor?.colaborador) {
    const c = valor.colaborador;
    return (
      <div className="colab-chip">
        <Avatar nome={c.nome} size={30} />
        <span className="grow"><strong>{c.nome}</strong><small className="muted"><Mail size={12} /> {c.email}</small></span>
        <button type="button" className="icon-btn ghost sm" onClick={() => onChange(null)} aria-label="Trocar colaborador"><X size={16} /></button>
      </div>
    );
  }

  if (valor?.novo) {
    const n = valor.novo;
    const set = (k) => (e) => onChange({ novo: { ...n, [k]: e?.target ? e.target.value : e } });
    const er = (k) => erros[`novoColaborador.${k}`];
    return (
      <div className="colab-novo">
        <div className="row-between"><strong className="small"><UserPlus size={14} /> Novo colaborador</strong>
          <button type="button" className="link-btn small" onClick={() => onChange(null)}>Buscar existente</button></div>
        <div className="form-grid">
          <Field label="Nome completo" obrigatorio erro={er('nome')} id={`${id}-nome`}><input id={`${id}-nome`} value={n.nome} onChange={set('nome')} aria-invalid={!!er('nome')} autoFocus /></Field>
          <Field label="E-mail corporativo" obrigatorio erro={er('email')} id={`${id}-email`}><input id={`${id}-email`} type="email" value={n.email} onChange={set('email')} aria-invalid={!!er('email')} placeholder="nome.sobrenome@hco.com" autoComplete="off" /></Field>
          <Field label="Empresa" obrigatorio erro={er('empresa')} wide id={`${id}-empresa`}>
            <Segmented label="Empresa" valor={n.empresa} onChange={set('empresa')} opcoes={PROPRIETARIOS.map((p) => ({ id: p, label: p }))} />
          </Field>
          <Field label="Cargo" id={`${id}-cargo`}><input id={`${id}-cargo`} value={n.cargo} onChange={set('cargo')} /></Field>
          <Field label="Departamento" id={`${id}-dep`}><input id={`${id}-dep`} value={n.departamento} onChange={set('departamento')} /></Field>
        </div>
      </div>
    );
  }

  const pareceEmail = /@/.test(q);
  return (
    <div className="colab-busca" ref={wrap}>
      <div className="search-input">
        {buscando ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
        <input id={id} value={q} autoComplete="off" autoFocus={autoFocus} onFocus={() => setAberto(true)} onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          placeholder="Nome ou e-mail corporativo do colaborador" aria-label="Buscar colaborador" aria-invalid={!!erros.colaboradorId} />
      </div>
      {aberto && q.trim().length >= 2 && (
        <ul className="colab-opcoes" role="listbox">
          {opcoes.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected="false" onClick={() => { onChange({ colaborador: c }); setQ(''); setAberto(false); }}>
                <Avatar nome={c.nome} size={26} />
                <span className="grow"><strong>{c.nome}</strong><small className="muted">{c.email} · {c.empresa}{c.equipamentos ? ` · ${c.equipamentos} equip.` : ''}</small></span>
              </button>
            </li>
          ))}
          {!buscando && !opcoes.length && <li className="colab-vazio small muted">Nenhum colaborador encontrado.</li>}
          <li>
            <button type="button" className="colab-criar" onClick={() => { onChange({ novo: { ...VAZIO, empresa: empresaPadrao, ...(pareceEmail ? { email: q.trim().toLowerCase() } : { nome: q.trim() }) } }); setAberto(false); }}>
              <UserPlus size={16} /> Cadastrar “{q.trim()}” como novo colaborador
            </button>
          </li>
        </ul>
      )}
      {erros.colaboradorId && <p className="field-error">{erros.colaboradorId}</p>}
    </div>
  );
}
