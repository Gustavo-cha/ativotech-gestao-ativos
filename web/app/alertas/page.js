'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, ShieldAlert, Wrench, Hourglass, CalendarX, ExternalLink, CalendarPlus, EyeOff, RotateCcw, CheckCheck, UserPlus, Warehouse, Inbox, Truck } from 'lucide-react';
import { irParaAlerta } from '@/components/shell/Topbar';
import { PageHeader, Tabs, Badge, EmptyState, Skeleton, ErroApi, Switch } from '@/components/ui';
import { useAlertasDispensados } from '@/components/shell/AppShell';
import { useUI, useToast } from '@/components/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { TOM_SEVERIDADE, NOME_SEVERIDADE } from '@/lib/constants';

const ICONE = { Garantia: ShieldAlert, 'Manutenção': Wrench, 'Ciclo de vida': Hourglass, Agenda: CalendarX, 'Admissão': UserPlus, Estoque: Warehouse, 'Solicitação': Inbox, Envio: Truck };

export default function Alertas() {
  const router = useRouter();
  const ui = useUI();
  const { toast } = useToast();
  const [aba, setAba] = useState('todos');
  const [verDispensados, setVerDispensados] = useState(false);
  const [dispensados, setDispensados] = useAlertasDispensados();
  const { data, erro, carregando, recarregar } = useApi(() => api.alertas(), []);

  const visiveis = useMemo(() => (data || []).filter((a) => verDispensados || !dispensados.includes(a.id)), [data, dispensados, verDispensados]);
  const lista = aba === 'todos' ? visiveis : visiveis.filter((a) => a.severidade === aba);
  const qtd = (s) => visiveis.filter((a) => a.severidade === s).length;

  const dispensar = (id) => { setDispensados((d) => [...d, id]); };
  const restaurar = (id) => { setDispensados((d) => d.filter((x) => x !== id)); };

  const abrir = (a) => irParaAlerta(a, router, ui);

  return (
    <div className="page">
      <PageHeader icone={BellRing} titulo="Central de alertas" subtitulo="Gerados automaticamente: admissões sem equipamento, envios atrasados, solicitações paradas, estoque baixo, garantias e manutenções.">
        <label className="switch-line"><Switch checked={verDispensados} onChange={setVerDispensados} label="Mostrar dispensados" /> Mostrar dispensados</label>
        {lista.some((a) => !dispensados.includes(a.id)) && (
          <button type="button" className="btn" onClick={() => { setDispensados((d) => [...new Set([...d, ...lista.map((a) => a.id)])]); toast({ tipo: 'sucesso', titulo: 'Alertas dispensados' }); }}>
            <CheckCheck size={16} /> Dispensar visíveis
          </button>
        )}
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      <div className="sev-cards">
        {['critico', 'alto', 'medio', 'info'].map((s) => (
          <button key={s} type="button" className={`sev-card tone-${TOM_SEVERIDADE[s]} ${aba === s ? 'on' : ''}`} onClick={() => { setAba(aba === s ? 'todos' : s); }}>
            <strong>{qtd(s)}</strong><span>{NOME_SEVERIDADE[s]}</span>
          </button>
        ))}
      </div>

      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={[
          { id: 'todos', label: 'Todos', qtd: visiveis.length },
          ...['critico', 'alto', 'medio', 'info'].map((s) => ({ id: s, label: NOME_SEVERIDADE[s], qtd: qtd(s) }))
        ]} />
        {carregando ? <div className="pad"><Skeleton h={70} /><Skeleton h={70} style={{ marginTop: 10 }} /></div>
          : lista.length === 0 ? <EmptyState icon={BellRing} titulo="Nenhum alerta aqui ✨" texto="Tudo sob controle nesta categoria." /> : (
            <ul className="alert-list">
              {lista.map((a) => {
                const I = ICONE[a.tipo] || BellRing;
                const disp = dispensados.includes(a.id);
                return (
                  <li key={a.id} className={`alert-row tone-${TOM_SEVERIDADE[a.severidade]} ${disp ? 'dismissed' : ''}`}>
                    <span className="alert-icon"><I size={19} /></span>
                    <div className="grow">
                      <div className="badge-row"><Badge tom={TOM_SEVERIDADE[a.severidade]} dot>{NOME_SEVERIDADE[a.severidade]}</Badge><span className="muted small">{a.tipo}</span></div>
                      <strong>{a.titulo}</strong>
                      <p className="muted">{a.descricao}</p>
                    </div>
                    <div className="alert-actions">
                      <button type="button" className="btn btn-sm" onClick={() => abrir(a)}><ExternalLink size={14} /> Abrir</button>
                      {a.link.tipo === 'ativo' && <>
                        <button type="button" className="btn btn-sm" onClick={() => ui.abrir('evento', { ativoId: a.link.id, tipo: a.tipo === 'Garantia' ? 'Renovação' : 'Manutenção', titulo: a.titulo })}><CalendarPlus size={14} /> Agendar</button>
                      </>}
                      {disp ? <button type="button" className="icon-btn ghost sm" onClick={() => restaurar(a.id)} title="Restaurar" aria-label="Restaurar alerta"><RotateCcw size={16} /></button>
                        : <button type="button" className="icon-btn ghost sm" onClick={() => dispensar(a.id)} title="Dispensar" aria-label="Dispensar alerta"><EyeOff size={16} /></button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
