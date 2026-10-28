'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu as MenuIcon, Search, Bell, Sun, Moon, VolumeX, Plus, Boxes, CalendarPlus, Settings, Keyboard, CheckCheck, LogOut, FilePlus2, ShieldCheck, BellRing, PackagePlus, Inbox, FileUp } from 'lucide-react';
import { tituloDaRota } from '@/lib/nav';
import { Menu, MenuItem, Avatar, Badge } from '../ui';
import { useConfig, useUI, useToast } from '../providers';
import { useAuth } from '../auth';
import { TOM_SEVERIDADE, TOM_SOLICITACAO, TOM_PERFIL } from '@/lib/constants';
import { useMontado } from '@/lib/hooks';
import { relativo } from '@/lib/format';
import { ultimaNovidade } from '@/lib/portal';
import { api } from '@/lib/api';

// Abre o destino de um alerta (usado pelo sino e pela central de alertas)
export function irParaAlerta(a, router) {
  const l = a.link || {};
  if (l.tipo === 'ativo') router.push(`/ativos/${l.id}`);
  else if (l.tipo === 'ativos') router.push(`/ativos${l.filtro ? `?${l.filtro}` : ''}`);
  else if (l.tipo === 'solicitacao') router.push(`/solicitacoes/${l.id}`);
  else if (l.tipo === 'estoque') router.push(l.aba ? `/estoque?aba=${l.aba}` : '/estoque');
  else router.push(`/agenda?data=${l.data}`);
}

// Só aparece quando há problema de conexão — "ao vivo" é o estado normal e não precisa ocupar espaço
const CONEXAO = {
  consulta: { cls: 'wait', txt: 'Sincronizando', dica: 'Canal em tempo real indisponível — atualizando periodicamente enquanto reconecta' },
  offline: { cls: 'off', txt: 'Offline', dica: 'Sem conexão com a API — tentando de novo' }
};

export default function Topbar({ abrirMobile, alertasIds = [], dispensar, naoLidas = [], conexao = 'conectando', novas = [], qtdNovas = 0, somBloqueado, ativarSom }) {
  const path = usePathname();
  const router = useRouter();
  const { atualizar, temaEfetivo } = useConfig();
  const { usuario, pode, logout } = useAuth();
  const { toast } = useToast();
  const ui = useUI();
  const montado = useMontado();
  const escuro = montado && temaEfetivo() === 'dark';
  const mac = montado && /Mac/.test(navigator.platform);
  const rh = !pode('solicitacoes:gerenciar');
  const qtdSino = rh ? naoLidas.length : alertasIds.length + qtdNovas;
  const cx = CONEXAO[conexao];
  // Os alertas completos só são buscados quando o sino é aberto
  const [alertas, setAlertas] = useState(null);
  const carregarAlertas = () => {
    if (rh) return;
    api.alertas({ limite: 30 }).then((l) => { const ok = new Set(alertasIds.map((a) => a.id)); setAlertas(l.filter((a) => ok.has(a.id)).slice(0, 6)); }).catch(() => setAlertas([]));
  };

  async function sair() {
    await logout();
    toast({ tipo: 'info', titulo: 'Sessão encerrada' });
    router.replace('/acesso');
  }

  return (
    <header className="topbar">
      <button type="button" className="icon-btn ghost only-mobile" onClick={abrirMobile} aria-label="Abrir menu"><MenuIcon size={20} /></button>
      <div className="crumbs">
        <strong>{tituloDaRota(path)}</strong>
      </div>

      <button type="button" className="search-pill" onClick={() => ui.abrir('paleta')}>
        <Search size={16} aria-hidden="true" />
        <span>{rh ? 'Buscar…' : 'Buscar solicitação, patrimônio, colaborador…'}</span>
        <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="top-actions">
        {cx && (
          <span className={`live-pill ${cx.cls}`} title={cx.dica} role="status" aria-label={`Conexão: ${cx.txt}`}>
            <i aria-hidden="true" /><span className="hide-md">{cx.txt}</span>
          </span>
        )}

        {somBloqueado && (
          <button type="button" className="sound-pill" onClick={ativarSom} title="O navegador bloqueou o áudio até você interagir com a página">
            <VolumeX size={15} aria-hidden="true" /><span className="hide-sm">Ativar alerta sonoro</span>
          </button>
        )}

        {!rh && qtdNovas > 0 && (
          <Link href="/solicitacoes?filtro=novas" className="novas-pill" aria-label={`${qtdNovas} solicitações novas`}>
            <BellRing size={15} aria-hidden="true" /><strong>{qtdNovas}</strong><span className="hide-md">nova{qtdNovas === 1 ? '' : 's'}</span>
          </Link>
        )}

        {rh ? (
          <Link href="/portal/nova" className="btn btn-primary btn-new"><Plus size={17} aria-hidden="true" /><span className="hide-sm">Nova solicitação</span></Link>
        ) : (
          <Menu trigger={({ alternar, aberto }) => (
            <button type="button" className="btn btn-primary btn-new" onClick={alternar} aria-expanded={aberto}>
              <Plus size={17} aria-hidden="true" /><span className="hide-sm">Novo</span>
            </button>
          )}>
            {pode('ativos:gerenciar') && <MenuItem icone={Boxes} atalho="N" onClick={() => router.push('/ativos/novo')}>Cadastrar equipamento</MenuItem>}
            {pode('estoque:gerenciar') && <MenuItem icone={PackagePlus} onClick={() => router.push('/estoque?aba=itens&acao=entrada')}>Entrada de estoque</MenuItem>}
            {pode('importacao:executar') && <MenuItem icone={FileUp} onClick={() => router.push('/ativos/importar')}>Importar planilha</MenuItem>}
            {pode('solicitacoes:criar') && <MenuItem icone={FilePlus2} onClick={() => router.push('/portal/nova')}>Nova solicitação</MenuItem>}
            {pode('eventos:gerenciar') && <MenuItem icone={CalendarPlus} atalho="E" onClick={() => ui.abrir('evento')}>Nova tarefa na agenda</MenuItem>}
          </Menu>
        )}

        <button type="button" className="icon-btn ghost theme-btn" onClick={() => atualizar({ tema: escuro ? 'claro' : 'escuro' })}
          aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'} title={escuro ? 'Tema claro' : 'Tema escuro'}>
          {escuro ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Menu className="bell-wrap" trigger={({ alternar, aberto }) => (
          <button type="button" className={`icon-btn ghost bell ${qtdSino ? 'has' : ''}`} onClick={() => { if (!aberto) carregarAlertas(); alternar(); }} aria-expanded={aberto}
            aria-label={`Notificações: ${qtdSino}`}>
            <Bell size={18} />
            {qtdSino > 0 && <span className="bell-dot">{qtdSino > 9 ? '9+' : qtdSino}</span>}
          </button>
        )}>
          <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
            {rh ? (
              <>
                <div className="notif-head"><strong>Novidades nas suas solicitações</strong></div>
                {naoLidas.length === 0 && <p className="notif-empty">Nenhuma novidade.</p>}
                <ul>
                  {naoLidas.slice(0, 6).map((s) => {
                    const n = ultimaNovidade(s, usuario);
                    return (
                      <li key={s.id}>
                        <button type="button" className="notif-item" onClick={() => router.push(`/portal/solicitacoes/${s.id}`)}>
                          <i className={`sev sev-${TOM_SOLICITACAO[s.status] === 'green' ? 'blue' : 'amber'}`} />
                          <span><strong>{s.numero} · {s.nomeAdmitido}</strong><small>{s.status} — {n?.texto} · {relativo(n?.em)}</small></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Link href="/portal/solicitacoes" className="notif-all">Ver minhas solicitações</Link>
              </>
            ) : (
              <>
                <div className="notif-head">
                  <strong>Notificações</strong>
                  {alertasIds.length > 0 && (
                    <button type="button" className="link-btn" onClick={() => { dispensar(alertasIds.map((a) => a.id)); setAlertas([]); }}>
                      <CheckCheck size={14} /> Dispensar alertas
                    </button>
                  )}
                </div>
                {novas.length > 0 && (
                  <>
                    <div className="notif-sub"><Inbox size={13} /> Novas solicitações</div>
                    <ul>
                      {novas.slice(0, 5).map((s) => (
                        <li key={s.id}>
                          <button type="button" className="notif-item is-nova" onClick={() => router.push(`/solicitacoes/${s.id}`)}>
                            <i className="sev sev-blue" />
                            <span><strong>{s.numero} · {s.nomeAdmitido}</strong><small>{s.itensResumo} · {s.proprietario} · {relativo(s.criadoEm)}</small></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {alertasIds.length > 0 && <div className="notif-sub">Alertas</div>}
                  </>
                )}
                {alertasIds.length === 0 && novas.length === 0 && <p className="notif-empty">Tudo em dia.</p>}
                {alertasIds.length > 0 && alertas === null && <p className="notif-empty">Carregando…</p>}
                <ul>
                  {(alertas || []).map((a) => (
                    <li key={a.id}>
                      <button type="button" className="notif-item" onClick={() => irParaAlerta(a, router)}>
                        <i className={`sev sev-${TOM_SEVERIDADE[a.severidade]}`} />
                        <span><strong>{a.titulo}</strong><small>{a.descricao}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Link href="/alertas" className="notif-all">Ver todos os alertas</Link>
              </>
            )}
          </div>
        </Menu>

        <Menu trigger={({ alternar }) => (
          <button type="button" className="user-btn" onClick={alternar} aria-label={`Conta de ${usuario.nome}`}>
            <Avatar nome={usuario.nome} size={32} />
          </button>
        )}>
          <div className="menu-user">
            <Avatar nome={usuario.nome} size={36} />
            <span><strong>{usuario.nome}</strong><small>{usuario.email}</small><Badge tom={TOM_PERFIL[usuario.perfil]} className="mt-4"><ShieldCheck size={11} /> {usuario.perfilNome}</Badge></span>
          </div>
          <MenuItem icone={Settings} onClick={() => router.push('/configuracoes')}>Configurações e senha</MenuItem>
          <MenuItem icone={Keyboard} atalho="?" onClick={() => ui.abrir('atalhos')}>Atalhos de teclado</MenuItem>
          <MenuItem icone={LogOut} perigo onClick={sair}>Sair</MenuItem>
        </Menu>
      </div>
    </header>
  );
}
