'use client';

// Gerenciamento de Usuários — Operadores (TI) com permissão administrativa.
import { useEffect, useMemo, useState } from 'react';
import {
  Users, UserPlus, Pencil, KeyRound, ShieldCheck, Check, Minus, Search, Wrench, ClipboardList, Radio, BadgeCheck, Ban, Lock,
  MoreHorizontal, Copy, Unlock, Ticket, Settings2, AlertTriangle, Shield, CalendarClock, Mail
} from 'lucide-react';
import { PageHeader, Avatar, Badge, Modal, Field, Switch, Skeleton, ErroApi, Segmented, Menu, MenuItem, Progress } from '@/components/ui';
import KpiCard from '@/components/KpiCard';
import { Requisitos, REQUISITOS } from '@/components/auth/SenhaForm';
import AvisoEmail from '@/components/AvisoEmail';
import { useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { relativo, data as fmtData, dataHora, isoLocal } from '@/lib/format';
import { TOM_PERFIL } from '@/lib/constants';

const PERMS = [
  ['solicitacoes:criar', 'Abrir solicitações de equipamentos'],
  ['solicitacoes:acompanhar', 'Acompanhar as próprias solicitações (status, envio e rastreio)'],
  ['estoque:ver', 'Consultar o estoque disponível (resumido)'],
  ['solicitacoes:gerenciar', 'Ver todas as solicitações, analisar, reservar, preparar e enviar'],
  ['notificacoes:receber', 'Receber alertas de novas solicitações'],
  ['estoque:gerenciar', 'Registrar entradas, saídas, ajustes e conferências'],
  ['ativos:gerenciar', 'Cadastrar e editar equipamentos'],
  ['historico:ver', 'Ver trilha de auditoria'],
  ['usuarios:gerenciar', 'Criar, editar, ativar e desativar usuários'],
  ['licencas:gerenciar', 'Gerenciar licenças'],
  ['notificacoes:gerenciar', 'Configuração e fila de e-mails'],
  ['sistema:admin', 'Backup e restauração do sistema']
];
const LIC = {
  ativa: { label: 'Ativa', tom: 'green', icone: BadgeCheck },
  pendente: { label: 'Pendente', tom: 'amber', icone: CalendarClock },
  suspensa: { label: 'Suspensa', tom: 'red', icone: Ban },
  expirada: { label: 'Expirada', tom: 'slate', icone: CalendarClock }
};
const LicencaBadge = ({ u }) => {
  const l = LIC[u.licenca?.efetiva] || LIC.pendente;
  return <Badge tom={l.tom}><l.icone size={11} aria-hidden="true" /> {l.label}{u.licenca?.validaAte && u.licenca.efetiva === 'ativa' ? ` até ${fmtData(u.licenca.validaAte)}` : ''}</Badge>;
};

export default function GerenciamentoUsuarios() {
  const { usuario: eu } = useAuth();
  const { toast } = useToast();
  const { data, erro, recarregar } = useApi(() => api.usuarios.listar(), []);
  const { data: perfis } = useApi(() => api.usuarios.perfis(), []);
  const { data: lic } = useApi(() => api.licencas.obter(), []);
  const { data: conectados } = useApi(() => api.usuarios.conectados(), []);
  const [editando, setEditando] = useState(null); // usuário ou {} para novo
  const [licencaDe, setLicencaDe] = useState(null);
  const [senhaDe, setSenhaDe] = useState(null);
  const [gerada, setGerada] = useState(null); // { usuario, senha }
  const [ajustarTotal, setAjustarTotal] = useState(false);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const online = new Set(conectados?.usuarios || []);
  const bloqueado = (u) => u.situacao !== 'ativo';
  const FILTROS = { todos: () => true, ativos: (u) => !bloqueado(u), bloqueados: bloqueado, ti: (u) => u.perfil === 'ti', rh: (u) => u.perfil === 'rh' };
  const lista = useMemo(() => (data || []).filter(FILTROS[filtro]).filter((u) => `${u.nome} ${u.email} ${u.departamento}`.toLowerCase().includes(q.toLowerCase())), [data, filtro, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const contar = (f) => (data || []).filter(f).length;
  const tem = (perfil, p, admin) => (perfis?.permissoes[perfil] || []).includes(p) || (admin && (perfis?.permissoesAdmin || []).includes(p));

  async function acao(fn, sucesso, som = 'sucesso') {
    try {
      const r = await fn();
      if (sucesso) toast({ tipo: 'sucesso', titulo: sucesso, som });
      return r;
    } catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível concluir', msg: e.message }); return null; }
  }
  const alternarAtivo = (u, ativo) => acao(() => api.usuarios.ativar(u.id, ativo), ativo ? `${u.nome}: conta ativada` : `${u.nome}: conta desativada (sessões encerradas)`, ativo ? 'sucesso' : 'excluir');

  const situacaoTexto = (u) => (u.situacao === 'desativado' ? 'Conta desativada' : u.situacao === 'sem_licenca' ? 'Sem licença ativa' : u.situacao === 'bloqueio_temporario' ? `Bloqueado por tentativas (${u.bloqueioMinutos} min)` : u.trocarSenha && u.temSenha ? 'Troca de senha pendente' : 'Pode entrar');

  return (
    <div className="page">
      <PageHeader icone={Users} titulo="Gerenciamento de Usuários" subtitulo="Contas, perfis de acesso e licenças. Somente Operadores com permissão administrativa veem esta área — as regras são aplicadas pela API.">
        <button type="button" className="btn btn-primary" onClick={() => setEditando({})}><UserPlus size={16} /> Novo usuário</button>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />
      <AvisoEmail />

      <section className="card lic-card">
        <div className="lic-head">
          <div>
            <h2 className="section-title"><Ticket size={17} /> Licenças</h2>
            <p className="muted small">Cada usuário com licença ativa ocupa uma vaga. Sem licença ativa, a pessoa não entra — mesmo com e-mail e senha corretos.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setAjustarTotal(true)} disabled={!lic}><Settings2 size={14} /> Ajustar quantidade</button>
        </div>
        {!lic ? <Skeleton h={90} /> : (
          <>
            <div className="lic-numeros">
              <div><span>Contratadas</span><strong>{lic.total}</strong></div>
              <div><span>Em uso</span><strong>{lic.utilizadas}</strong></div>
              <div className={lic.disponiveis === 0 ? 'zero' : ''}><span>Disponíveis</span><strong>{lic.disponiveis}</strong></div>
            </div>
            <Progress valor={(lic.utilizadas / (lic.total || 1)) * 100} tom={lic.disponiveis === 0 ? 'red' : lic.disponiveis <= 2 ? 'amber' : 'green'} label="Licenças em uso" altura={8} />
            <div className="lic-status">
              {Object.entries(LIC).map(([k, v]) => <span key={k}><Badge tom={v.tom}>{v.label}</Badge> {lic.porStatus?.[k] || 0}</span>)}
              <span className="muted small">Controle interno · pronto para integração com um serviço de licenciamento</span>
            </div>
            {lic.disponiveis === 0 && <p className="inline-warn"><AlertTriangle size={14} /> Todas as licenças estão em uso. Novos usuários entram como “pendente” até liberar ou contratar vagas.</p>}
          </>
        )}
      </section>

      <div className="kpi-grid auto">
        <KpiCard icone={Users} tom="blue" titulo="Usuários cadastrados" valor={data ? data.length : null} sub={`${contar((u) => u.perfil === 'ti')} Operadores · ${contar((u) => u.perfil === 'rh')} Solicitantes`} />
        <KpiCard icone={BadgeCheck} tom="green" titulo="Ativos" valor={data ? contar((u) => !bloqueado(u)) : null} sub="Conta ativa e licença válida" />
        <KpiCard icone={Lock} tom="red" titulo="Bloqueados" valor={data ? contar(bloqueado) : null} sub="Desativados, sem licença ou por tentativas" destaque={contar((u) => u.situacao === 'bloqueio_temporario') > 0} />
        <KpiCard icone={Radio} tom="cyan" titulo="Conectados agora" valor={conectados ? online.size : null} sub="Com o canal em tempo real aberto" />
      </div>

      <div className="card no-pad">
        <div className="toolbar">
          <div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou área…" aria-label="Buscar usuários" /></div>
          <Segmented label="Filtro" valor={filtro} onChange={setFiltro} opcoes={[{ id: 'todos', label: 'Todos' }, { id: 'ativos', label: 'Ativos' }, { id: 'bloqueados', label: 'Bloqueados' }, { id: 'ti', label: 'Operadores' }, { id: 'rh', label: 'Solicitantes' }]} />
        </div>
        {!data ? <div className="pad"><Skeleton h={200} /></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Conta</th><th>Licença</th><th>Criado em</th><th>Último acesso</th><th className="num"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {lista.length === 0 && <tr className="no-click"><td colSpan={7} className="muted center pad">Nenhum usuário neste filtro.</td></tr>}
                {lista.map((u) => {
                  const proprio = u.id === eu.id;
                  return (
                    <tr key={u.id} className={`no-click ${bloqueado(u) ? 'row-off' : ''}`}>
                      <td><div className="cell-person"><span className="avatar-wrap"><Avatar nome={u.nome} size={32} />{online.has(u.id) && <i className="online-dot" title="Conectado agora" />}</span>
                        <div><strong>{u.nome}{proprio && <span className="muted small"> (você)</span>}</strong><small className="muted">{u.email}{u.departamento ? ` · ${u.departamento}` : ''}</small></div></div></td>
                      <td><div className="badge-col"><Badge tom={TOM_PERFIL[u.perfil]}><ShieldCheck size={11} /> {u.perfilNome}</Badge>{u.admin && <Badge tom="violet"><Shield size={11} /> Administrador</Badge>}</div></td>
                      <td>
                        <div className="row-gap">
                          {proprio ? <Badge tom="green" dot>Ativa</Badge> : <Switch checked={u.ativo} onChange={(v) => alternarAtivo(u, v)} label={`${u.ativo ? 'Desativar' : 'Ativar'} a conta de ${u.nome}`} id={`ativo-${u.id}`} />}
                          <span className={`small ${bloqueado(u) ? 'txt-red' : u.trocarSenha && u.temSenha ? 'txt-amber' : 'muted'}`}>{situacaoTexto(u)}</span>
                        </div>
                      </td>
                      <td><button type="button" className="badge-btn" onClick={() => setLicencaDe(u)} disabled={proprio} title={proprio ? 'Você não altera a própria licença' : 'Alterar licença'}><LicencaBadge u={u} /></button></td>
                      <td className="small nowrap" title={dataHora(u.criadoEm)}>{fmtData(u.criadoEm)}{u.criadoPor && <small className="muted block">por {u.criadoPor}</small>}</td>
                      <td className="small nowrap" title={u.ultimoAcesso ? dataHora(u.ultimoAcesso) : ''}>{u.ultimoAcesso ? relativo(u.ultimoAcesso) : <span className="muted">Nunca</span>}{u.sessoesAtivas > 0 && <small className="muted block">{u.sessoesAtivas} sessão(ões)</small>}</td>
                      <td className="num">
                        <Menu trigger={({ alternar }) => <button type="button" className="icon-btn ghost" onClick={alternar} aria-label={`Ações para ${u.nome}`}><MoreHorizontal size={17} /></button>}>
                          <MenuItem icone={Pencil} onClick={() => setEditando(u)}>Editar usuário</MenuItem>
                          {!proprio && <MenuItem icone={Ticket} onClick={() => setLicencaDe(u)}>Alterar licença</MenuItem>}
                          {!proprio && <MenuItem icone={KeyRound} onClick={() => setSenhaDe(u)}>Redefinir senha</MenuItem>}
                          {u.bloqueioMinutos > 0 && <MenuItem icone={Unlock} onClick={() => acao(() => api.usuarios.desbloquear(u.id), `${u.nome} desbloqueado`)}>Remover bloqueio</MenuItem>}
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="perfil-cards">
        {Object.entries(perfis?.perfis || {}).map(([k, p]) => {
          const I = k === 'ti' ? Wrench : ClipboardList;
          return (
            <div key={k} className={`perfil-card tone-${TOM_PERFIL[k]}`}>
              <span className="perfil-icon"><I size={20} /></span>
              <div><strong>{p.nome}</strong><p className="small muted">{p.desc}</p></div>
            </div>
          );
        })}
      </div>

      <section className="card no-pad">
        <div className="card-head pad-x"><h2><ShieldCheck size={17} /> Matriz de permissões</h2></div>
        {!perfis ? <div className="pad"><Skeleton h={200} /></div> : (
          <div className="table-wrap">
            <table className="table compact perm-table">
              <thead><tr><th>Permissão</th><th className="center">Solicitante (RH)</th><th className="center">Operador (TI)</th><th className="center">Operador administrador</th></tr></thead>
              <tbody>
                {PERMS.map(([p, label]) => (
                  <tr key={p} className="no-click">
                    <td>{label} <code className="muted small">{p}</code></td>
                    {[['rh', false], ['ti', false], ['ti', true]].map(([perfil, admin], i) => (
                      <td key={i} className="center">{tem(perfil, p, admin) ? <Check size={16} className="txt-green" aria-label="Sim" /> : <Minus size={16} className="muted" aria-label="Não" />}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UsuarioModal usuario={editando} perfis={perfis?.perfis} eu={eu} lic={lic} fechar={() => setEditando(null)}
        criado={(u, senha) => { setEditando(null); if (senha) setGerada({ usuario: u, senha }); }} />
      <LicencaModal usuario={licencaDe} lic={lic} fechar={() => setLicencaDe(null)} />
      <SenhaModal usuario={senhaDe} fechar={() => setSenhaDe(null)} gerou={(u, senha) => { setSenhaDe(null); setGerada({ usuario: u, senha }); }} />
      <SenhaGeradaModal dados={gerada} fechar={() => setGerada(null)} />
      <TotalModal aberto={ajustarTotal} lic={lic} fechar={() => setAjustarTotal(false)} />
    </div>
  );
}

// ---------- Criar / editar ----------
function CamposLicenca({ valor, onChange, lic, ocupaVaga, erros = {} }) {
  const semVaga = lic && lic.disponiveis === 0 && !ocupaVaga;
  return (
    <>
      <Field label="Licença" id="u-lic" erro={erros.licenca} dica={valor.status === 'ativa' && semVaga ? 'Sem licenças disponíveis — use "Pendente" ou libere uma vaga.' : 'Ativa ocupa uma vaga; pendente e suspensa não dão acesso.'}>
        <div className="chip-select" role="radiogroup" aria-label="Status da licença">
          {['ativa', 'pendente', 'suspensa'].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={valor.status === s} className={`chip tone-${LIC[s].tom} ${valor.status === s ? 'on' : ''}`} onClick={() => onChange({ ...valor, status: s })}>{LIC[s].label}</button>
          ))}
        </div>
      </Field>
      <Field label="Válida até" id="u-validade" erro={erros.validaAte} dica="Opcional. Depois da data, a licença expira e o acesso é bloqueado.">
        <input id="u-validade" type="date" value={valor.validaAte || ''} min={isoLocal()} onChange={(e) => onChange({ ...valor, validaAte: e.target.value })} disabled={valor.status !== 'ativa'} />
      </Field>
    </>
  );
}

function UsuarioModal({ usuario, perfis, eu, lic, fechar, criado }) {
  const { toast } = useToast();
  const novo = usuario && !usuario.id;
  const [d, setD] = useState({});
  const [licenca, setLicenca] = useState({ status: 'ativa', validaAte: '' });
  const [acesso, setAcesso] = useState('gerar');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!usuario) return;
    setD(novo ? { nome: '', email: '', perfil: 'rh', admin: false, departamento: '', ativo: true, notificacoesEmail: true } : { ...usuario });
    setLicenca(novo ? { status: lic?.disponiveis === 0 ? 'pendente' : 'ativa', validaAte: '' } : { status: usuario.licenca?.status || 'pendente', validaAte: usuario.licenca?.validaAte || '' });
    setAcesso('gerar'); setSenha(''); setErros({});
  }, [usuario, novo]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const proprio = usuario?.id === eu.id;

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      if (novo) {
        const r = await api.usuarios.criar({ ...d, licenca, acesso, ...(acesso === 'definir' ? { senha } : {}) });
        toast({ tipo: 'sucesso', titulo: 'Usuário criado', msg: `${r.nome} · ${r.perfilNome}` });
        criado(r, r.senhaTemporaria);
      } else {
        await api.usuarios.atualizar(usuario.id, { ...d, licenca });
        toast({ tipo: 'sucesso', titulo: 'Usuário atualizado', msg: d.nome });
        fechar();
      }
    } catch (err) {
      setErros(err.campos || {});
      toast({ tipo: 'erro', titulo: 'Não foi possível salvar', msg: err.message });
    } finally { setSalvando(false); }
  }

  return (
    <Modal aberto={Boolean(usuario)} onClose={fechar} titulo={novo ? 'Novo usuário' : `Editar ${usuario?.nome}`} subtitulo={novo ? 'O acesso só funciona com conta ativa e licença ativa.' : usuario?.email} icone={novo ? UserPlus : Pencil} largura={660}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" form="form-usuario" className="btn btn-primary" disabled={salvando}>{novo ? 'Criar usuário' : 'Salvar'}</button></>}>
      <form id="form-usuario" className="form-grid" onSubmit={salvar} noValidate>
        <Field label="Nome completo" obrigatorio erro={erros.nome} id="u-nome"><input id="u-nome" value={d.nome || ''} onChange={set('nome')} aria-invalid={!!erros.nome} /></Field>
        <Field label="E-mail corporativo" obrigatorio erro={erros.email} id="u-email"><input id="u-email" type="email" value={d.email || ''} onChange={set('email')} aria-invalid={!!erros.email} placeholder="nome@hco.com" /></Field>
        <Field label="Perfil de acesso" obrigatorio wide erro={erros.perfil} dica={proprio ? 'Você não pode alterar o próprio perfil.' : perfis?.[d.perfil]?.desc}>
          <div className="chip-select" role="radiogroup" aria-label="Perfil">
            {Object.entries(perfis || {}).map(([k, p]) => (
              <button key={k} type="button" role="radio" aria-checked={d.perfil === k} disabled={proprio} className={`chip tone-${TOM_PERFIL[k]} ${d.perfil === k ? 'on' : ''}`} onClick={() => setD((x) => ({ ...x, perfil: k, admin: k === 'ti' ? x.admin : false }))}>{p.nome}</button>
            ))}
          </div>
        </Field>
        {d.perfil === 'ti' && (
          <label className="switch-line field-wide">
            <Switch checked={Boolean(d.admin)} onChange={(v) => !proprio && set('admin')(v)} label="Permissão administrativa" />
            <span><strong>Permissão administrativa</strong> <span className="muted small">— gerencia usuários, licenças e notificações{proprio ? ' (você não altera a sua)' : ''}</span></span>
          </label>
        )}
        <Field label="Departamento" id="u-dep"><input id="u-dep" value={d.departamento || ''} onChange={set('departamento')} placeholder={d.perfil === 'rh' ? 'Recursos Humanos' : 'TI'} /></Field>
        <label className="switch-line">
          <Switch checked={d.notificacoesEmail !== false} onChange={set('notificacoesEmail')} label="Notificações por e-mail" />
          <span className="small"><Mail size={13} /> Receber e-mails de notificação</span>
        </label>
        {!novo && (
          <label className="switch-line field-wide">
            <Switch checked={d.ativo !== false} onChange={(v) => !proprio && set('ativo')(v)} label="Conta ativa" />
            <span>Conta ativa {proprio && <span className="muted small">(não é possível desativar a própria conta)</span>}</span>
          </label>
        )}
        {!proprio && <CamposLicenca valor={licenca} onChange={setLicenca} lic={lic} ocupaVaga={!novo && usuario?.licenca?.efetiva === 'ativa'} erros={erros} />}
        {novo && (
          <Field label="Primeiro acesso" wide id="u-acesso">
            <div className="radio-cards" role="radiogroup" aria-label="Primeiro acesso">
              {[['gerar', 'Gerar senha temporária', 'Recomendado. Mostrada uma vez para você repassar; troca obrigatória no 1º acesso.'],
                ['definir', 'Definir senha temporária', 'Você escolhe a senha; troca obrigatória no 1º acesso.'],
                ['microsoft', 'Somente conta Microsoft', 'Sem senha local. Exige o login Microsoft configurado.']].map(([id, t, s]) => (
                <button key={id} type="button" role="radio" aria-checked={acesso === id} className={`radio-card ${acesso === id ? 'on' : ''}`} onClick={() => { setAcesso(id); }}>
                  <span className="nb-radio" /><span><strong>{t}</strong><small>{s}</small></span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {novo && acesso === 'definir' && (
          <Field label="Senha temporária" obrigatorio wide erro={erros.senha} id="u-senha">
            <input id="u-senha" type="text" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} aria-invalid={!!erros.senha} className="mono" />
            <Requisitos senha={senha} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

// ---------- Licença ----------
function LicencaModal({ usuario, lic, fechar }) {
  const { toast } = useToast();
  const [v, setV] = useState({ status: 'ativa', validaAte: '' });
  const [erros, setErros] = useState({});
  useEffect(() => { if (usuario) { setV({ status: usuario.licenca?.status || 'pendente', validaAte: usuario.licenca?.validaAte || '' }); setErros({}); } }, [usuario]);
  async function salvar() {
    try {
      await api.usuarios.licenca(usuario.id, v);
      toast({ tipo: 'sucesso', titulo: `Licença de ${usuario.nome}: ${LIC[v.status].label.toLowerCase()}`, msg: v.status !== 'ativa' ? 'As sessões abertas foram encerradas.' : undefined });
      fechar();
    } catch (e) { setErros(e.campos || {}); toast({ tipo: 'erro', titulo: 'Não foi possível alterar a licença', msg: e.message }); }
  }
  return (
    <Modal aberto={Boolean(usuario)} onClose={fechar} titulo="Licença do usuário" subtitulo={usuario ? `${usuario.nome} · ${usuario.email}` : ''} icone={Ticket} largura={520}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" onClick={salvar}>Salvar</button></>}>
      {usuario && <p className="small mb-12">Situação atual: <LicencaBadge u={usuario} /></p>}
      <div className="form-grid"><CamposLicenca valor={v} onChange={setV} lic={lic} ocupaVaga={usuario?.licenca?.efetiva === 'ativa'} erros={erros} /></div>
    </Modal>
  );
}

// ---------- Senha ----------
function SenhaModal({ usuario, fechar, gerou }) {
  const { toast } = useToast();
  const [modo, setModo] = useState('gerar');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { setModo('gerar'); setSenha(''); setErro(''); }, [usuario]);
  async function salvar() {
    try {
      const r = await api.usuarios.redefinirSenha(usuario.id, modo === 'definir' ? senha : undefined);
      if (r.senhaTemporaria) gerou(usuario, r.senhaTemporaria);
      else { toast({ tipo: 'sucesso', titulo: 'Senha temporária definida', msg: 'A troca será exigida no próximo acesso.' }); fechar(); }
    } catch (e) { setErro(e.campos?.senha || e.message); }
  }
  const ok = modo === 'gerar' || REQUISITOS.every((r) => r.ok(senha));
  return (
    <Modal aberto={Boolean(usuario)} onClose={fechar} titulo="Redefinir senha" subtitulo={usuario?.email} icone={KeyRound} largura={520}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok} onClick={salvar}>{modo === 'gerar' ? 'Gerar senha temporária' : 'Definir senha'}</button></>}>
      <p className="muted small mb-12">As sessões abertas desse usuário serão encerradas e ele precisará criar uma senha nova no próximo acesso.</p>
      <Segmented label="Modo" valor={modo} onChange={setModo} opcoes={[{ id: 'gerar', label: 'Gerar automaticamente' }, { id: 'definir', label: 'Digitar' }]} />
      {modo === 'definir' && (
        <Field label="Senha temporária" erro={erro} id="rs-senha">
          <input id="rs-senha" type="text" className="mono" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Requisitos senha={senha} />
        </Field>
      )}
      {erro && modo === 'gerar' && <p className="field-error">{erro}</p>}
    </Modal>
  );
}

function SenhaGeradaModal({ dados, fechar }) {
  const { toast } = useToast();
  const copiar = () => navigator.clipboard?.writeText(dados.senha).then(() => toast({ tipo: 'sucesso', titulo: 'Senha copiada' })).catch(() => {});
  return (
    <Modal aberto={Boolean(dados)} onClose={fechar} titulo="Senha temporária gerada" subtitulo={dados ? `${dados.usuario.nome} · ${dados.usuario.email}` : ''} icone={KeyRound} largura={520}
      rodape={<button type="button" className="btn btn-primary" onClick={fechar}>Concluir</button>}>
      <div className="senha-gerada">
        <span className="mono">{dados?.senha}</span>
        <button type="button" className="btn btn-sm" onClick={copiar}><Copy size={14} /> Copiar</button>
      </div>
      <p className="inline-warn"><AlertTriangle size={14} /> Esta senha aparece só agora e não fica salva. Repasse por um canal seguro.</p>
      <p className="muted small mt-8">No primeiro acesso, a pessoa escolhe o portal correto, entra com esta senha e cria a própria.</p>
    </Modal>
  );
}

function TotalModal({ aberto, lic, fechar }) {
  const { toast } = useToast();
  const [total, setTotal] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberto) { setTotal(String(lic?.total || '')); setErro(''); } }, [aberto, lic]);
  async function salvar() {
    try {
      const r = await api.licencas.definirTotal(Number(total));
      toast({ tipo: 'sucesso', titulo: `Licenças contratadas: ${r.total}`, msg: `${r.disponiveis} disponível(is)` });
      fechar();
    } catch (e) { setErro(e.campos?.total || e.message); }
  }
  return (
    <Modal aberto={aberto} onClose={fechar} titulo="Licenças contratadas" subtitulo={lic ? `${lic.utilizadas} em uso no momento` : ''} icone={Ticket} largura={440}
      rodape={<><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="button" className="btn btn-primary" onClick={salvar}>Salvar</button></>}>
      <Field label="Quantidade de licenças" erro={erro} id="lic-total" dica={`Mínimo: ${lic?.utilizadas || 1} (licenças em uso).`}>
        <input id="lic-total" type="number" min={lic?.utilizadas || 1} max={10000} value={total} onChange={(e) => setTotal(e.target.value)} />
      </Field>
    </Modal>
  );
}
