'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UsersRound, Plus, Search, Mail, X, Pencil, Laptop, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader, Segmented, Skeleton, EmptyState, ErroApi, Drawer, Field, Avatar, Badge, StatusBadge, CategoriaIcon, Modal } from '@/components/ui';
import { SolicitacaoBadge } from '@/components/portal/Status';
import { useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { useApi, useDebounce } from '@/lib/hooks';
import { api } from '@/lib/api';
import { data as fmtData } from '@/lib/format';

const EMPRESAS = ['H&CO', 'H&CO B2Finance'];
const VAZIO = { nome: '', email: '', empresa: 'H&CO', cargo: '', departamento: '', matricula: '', localidade: '', telefone: '', observacoes: '' };

function Colaboradores() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { pode } = useAuth();
  const [q, setQ] = useState('');
  const busca = useDebounce(q.trim(), 250);
  const [empresa, setEmpresa] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editar, setEditar] = useState(null); // {} = novo
  const aberto = params.get('id');
  const { data: r, erro, carregando, recarregar } = useApi(() => api.colaboradores.listar({ q: busca, empresa, pagina, limite: 25 }), [busca, empresa, pagina]);
  useEffect(() => { setPagina(1); }, [busca, empresa]);
  const abrir = (id) => router.replace(id ? `/colaboradores?id=${id}` : '/colaboradores', { scroll: false });

  async function salvar(d) {
    try {
      const c = d.id ? await api.colaboradores.atualizar(d.id, d) : await api.colaboradores.criar(d);
      toast({ tipo: 'sucesso', titulo: d.id ? 'Colaborador atualizado' : 'Colaborador cadastrado', msg: c.email });
      setEditar(null);
      if (!d.id) abrir(c.id);
      return true;
    } catch (e) {
      toast({ tipo: 'erro', titulo: 'Não foi possível salvar', msg: e.message });
      return e.campos || {};
    }
  }

  return (
    <div className="page">
      <PageHeader icone={UsersRound} titulo="Colaboradores" subtitulo="Quem recebe os equipamentos, identificado pelo e-mail corporativo.">
        {pode('colaboradores:gerenciar') && <button type="button" className="btn btn-primary" onClick={() => setEditar({})}><Plus size={16} /> Novo colaborador</button>}
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />
      <div className="card no-pad">
        <div className="toolbar">
          <div className="search-input"><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail, departamento ou matrícula…" aria-label="Buscar colaboradores" /></div>
          <Segmented label="Empresa" valor={empresa} onChange={setEmpresa} opcoes={[{ id: '', label: 'Todas' }, ...EMPRESAS.map((e) => ({ id: e, label: e }))]} />
        </div>
        {carregando && !r ? <div className="pad"><Skeleton h={200} /></div> : !r?.itens.length ? (
          <EmptyState icon={UsersRound} titulo={busca || empresa ? 'Nenhum colaborador encontrado' : 'Nenhum colaborador cadastrado'}
            texto="Colaboradores são cadastrados aqui, ao alocar um equipamento, na entrega de uma solicitação (pelo e-mail informado pelo RH) ou na importação de planilhas." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Colaborador</th><th>Empresa</th><th>Cargo / departamento</th><th className="num">Equipamentos</th></tr></thead>
              <tbody>
                {r.itens.map((c) => (
                  <tr key={c.id} onClick={() => abrir(c.id)} className={`${aberto === c.id ? 'selected' : ''} ${c.ativo === false ? 'row-off' : ''}`}>
                    <td><div className="cell-person"><Avatar nome={c.nome} size={28} /><div className="cell-stack"><strong>{c.nome}</strong><small className="muted">{c.email}</small></div></div></td>
                    <td><span className={`owner-tag ${c.empresa === 'H&CO B2Finance' ? 'b2f' : ''}`}>{c.empresa === 'H&CO B2Finance' ? 'B2Finance' : 'H&CO'}</span></td>
                    <td className="small">{[c.cargo, c.departamento].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                    <td className="num">{c.equipamentos || <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r && r.paginas > 1 && (
          <div className="table-foot">
            <span className="muted small">{r.total} colaborador(es)</span>
            <div className="pager">
              <button type="button" className="icon-btn" disabled={r.pagina <= 1} onClick={() => setPagina(r.pagina - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
              <span className="small">{r.pagina} / {r.paginas}</span>
              <button type="button" className="icon-btn" disabled={r.pagina >= r.paginas} onClick={() => setPagina(r.pagina + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      <Detalhe id={aberto} fechar={() => abrir(null)} editar={setEditar} podeEditar={pode('colaboradores:gerenciar')} />
      <ColaboradorModal inicial={editar} fechar={() => setEditar(null)} salvar={salvar} />
    </div>
  );
}

function Detalhe({ id, fechar, editar, podeEditar }) {
  const { data: c } = useApi(() => (id ? api.colaboradores.obter(id) : Promise.resolve(null)), [id]);
  return (
    <Drawer aberto={Boolean(id)} onClose={fechar} label="Colaborador" largura={520}>
      {!c || c.id !== id ? <div className="pad"><Skeleton h={300} /></div> : (
        <>
          <header className="drawer-head">
            <Avatar nome={c.nome} size={44} />
            <div className="grow"><h2>{c.nome}</h2><a href={`mailto:${c.email}`} className="small"><Mail size={13} /> {c.email}</a></div>
            {podeEditar && <button type="button" className="icon-btn" onClick={() => editar(c)} aria-label="Editar"><Pencil size={16} /></button>}
            <button type="button" className="icon-btn ghost" onClick={fechar} aria-label="Fechar"><X size={18} /></button>
          </header>
          <div className="drawer-body">
          <dl className="conta-dl">
            <div><dt>Empresa</dt><dd>{c.empresa}</dd></div>
            {c.cargo && <div><dt>Cargo</dt><dd>{c.cargo}</dd></div>}
            {c.departamento && <div><dt>Departamento</dt><dd>{c.departamento}</dd></div>}
            {c.matricula && <div><dt>Matrícula</dt><dd>{c.matricula}</dd></div>}
            {c.localidade && <div><dt>Localidade</dt><dd>{c.localidade}</dd></div>}
            {c.ativo === false && <div><dt>Situação</dt><dd>Inativo</dd></div>}
          </dl>
          <h3 className="sub-title"><Laptop size={15} /> Equipamentos ({c.equipamentosLista.length})</h3>
          {c.equipamentosLista.length === 0 ? <p className="muted small">Nenhum equipamento vinculado.</p> : (
            <ul className="row-list compact">
              {c.equipamentosLista.map((a) => (
                <li key={a.id}><Link href={`/ativos/${a.id}`} className="row-item">
                  <CategoriaIcon categoria={a.categoria} boxed size={14} />
                  <span className="grow"><strong className="mono">{a.patrimonio}</strong> <span>{a.nome}</span><small className="muted">{a.proprietario}{a.numeroSerie ? ` · ${a.numeroSerie}` : ''}</small></span>
                  <StatusBadge status={a.status} />
                </Link></li>
              ))}
            </ul>
          )}
          <h3 className="sub-title"><ClipboardList size={15} /> Solicitações</h3>
          {c.solicitacoes.length === 0 ? <p className="muted small">Nenhuma solicitação vinculada.</p> : (
            <ul className="row-list compact">
              {c.solicitacoes.map((s) => (
                <li key={s.id}><Link href={`/solicitacoes/${s.id}`} className="row-item">
                  <span className="grow"><strong className="mono">{s.numero}</strong><small className="muted">admissão {fmtData(s.dataAdmissao)} · {s.proprietario || 'H&CO'}</small></span>
                  <SolicitacaoBadge status={s.status} />
                </Link></li>
              ))}
            </ul>
          )}
          {c.observacoes && <><h3 className="sub-title">Observações</h3><p className="small pre">{c.observacoes}</p></>}
          <p className="muted small mt-12">Cadastrado {fmtData(c.criadoEm)}{c.origem && c.origem !== 'cadastro' ? ` · origem: ${c.origem}` : ''}</p>
          {c.ativo === false && <Badge tom="slate">Inativo</Badge>}
          </div>
        </>
      )}
    </Drawer>
  );
}

function ColaboradorModal({ inicial, fechar, salvar }) {
  const [d, setD] = useState(VAZIO);
  const [erros, setErros] = useState({});
  useEffect(() => { if (inicial) { setD({ ...VAZIO, ...inicial }); setErros({}); } }, [inicial]);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  async function enviar() {
    const r = await salvar(d);
    if (r !== true) setErros(r);
  }
  const campo = (k, label, props = {}) => (
    <Field label={label} erro={erros[k]} id={`cb-${k}`} obrigatorio={props.obrigatorio} wide={props.wide}>
      <input id={`cb-${k}`} value={d[k] || ''} onChange={set(k)} aria-invalid={!!erros[k]} type={props.type || 'text'} placeholder={props.placeholder} />
    </Field>
  );
  return (
    <Modal aberto={Boolean(inicial)} onClose={fechar} titulo={inicial?.id ? `Editar ${inicial.nome}` : 'Novo colaborador'} icone={UsersRound} largura={620}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" onClick={enviar}>Salvar</button></>}>
      <div className="form-grid">
        {campo('nome', 'Nome completo', { obrigatorio: true })}
        {campo('email', 'E-mail corporativo', { obrigatorio: true, type: 'email', placeholder: 'nome.sobrenome@hco.com' })}
        <Field label="Empresa" obrigatorio erro={erros.empresa} wide id="cb-empresa">
          <Segmented label="Empresa" valor={d.empresa} onChange={set('empresa')} opcoes={EMPRESAS.map((e) => ({ id: e, label: e }))} />
        </Field>
        {campo('cargo', 'Cargo')}
        {campo('departamento', 'Departamento')}
        {campo('matricula', 'Matrícula')}
        {campo('localidade', 'Localidade', { placeholder: 'Barueri, home office…' })}
        <Field label="Observações" erro={erros.observacoes} wide id="cb-obs"><textarea id="cb-obs" rows={2} value={d.observacoes || ''} onChange={set('observacoes')} /></Field>
        {inicial?.id && (
          <Field label="Situação" wide id="cb-ativo" dica="Colaboradores inativos não aparecem na busca ao alocar equipamentos.">
            <Segmented label="Situação" valor={d.ativo === false ? 'inativo' : 'ativo'} onChange={(v) => setD((x) => ({ ...x, ativo: v === 'ativo' }))} opcoes={[{ id: 'ativo', label: 'Ativo' }, { id: 'inativo', label: 'Inativo' }]} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="page"><Skeleton h={400} /></div>}><Colaboradores /></Suspense>;
}
