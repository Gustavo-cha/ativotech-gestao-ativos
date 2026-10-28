'use client';

// Notificações por e-mail: configuração do serviço (sem segredos), fila de envios, falhas e reenvio.
import { useState } from 'react';
import { Mail, Send, RotateCcw, CheckCircle2, XCircle, Clock, AlertTriangle, Server, Inbox, Loader2, Info } from 'lucide-react';
import { PageHeader, Badge, Skeleton, ErroApi, EmptyState, Segmented } from '@/components/ui';
import KpiCard from '@/components/KpiCard';
import { useToast } from '@/components/providers';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { relativo, dataHora } from '@/lib/format';

const ST = {
  enviado: { label: 'Enviado', tom: 'green', icone: CheckCircle2 },
  pendente: { label: 'Pendente', tom: 'blue', icone: Clock },
  enviando: { label: 'Enviando', tom: 'cyan', icone: Loader2 },
  falhou: { label: 'Falhou', tom: 'red', icone: XCircle },
  nao_configurado: { label: 'Não configurado', tom: 'amber', icone: AlertTriangle }
};
const TIPO = { nova_solicitacao: 'Nova solicitação → TI', atualizacao_ti: 'Atualização da TI → RH', interacao_rh: 'Mensagem do RH → TI' };

export default function Notificacoes() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [filtro, setFiltro] = useState('');
  const [testando, setTestando] = useState(false);
  const { data: st, erro, recarregar } = useApi(() => api.notificacoes.status(), []);
  const { data: lista } = useApi(() => api.notificacoes.listar({ status: filtro, limite: 200 }), [filtro]);
  const c = st?.contagem || {};
  const pendentesReenvio = (c.falhou || 0) + (c.nao_configurado || 0);

  async function testar() {
    setTestando(true);
    try {
      const r = await api.notificacoes.teste();
      toast({ tipo: 'sucesso', titulo: 'E-mail de teste enviado', msg: `Confira a caixa de ${r.para}.` });
    } catch (e) { toast({ tipo: 'erro', titulo: 'O teste falhou', msg: e.message }); }
    setTestando(false);
  }
  async function reenviar(ids) {
    try {
      const r = await api.notificacoes.reenviar(ids);
      toast({ tipo: 'sucesso', titulo: `${r.reenviadas} notificação(ões) na fila de novo` });
      recarregar();
    } catch (e) { toast({ tipo: 'erro', titulo: 'Não foi possível reenviar', msg: e.message }); }
  }

  return (
    <div className="page">
      <PageHeader icone={Mail} titulo="Notificações por e-mail" subtitulo="Avisos automáticos de novas solicitações (para a TI) e de atualizações (para o RH). Cada interação gera no máximo um e-mail por pessoa.">
        <button type="button" className="btn" onClick={testar} disabled={!st?.configurado || testando}>{testando ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Enviar teste para mim</button>
        <button type="button" className="btn btn-primary" onClick={() => reenviar()} disabled={!st?.configurado || !pendentesReenvio}><RotateCcw size={16} /> Reenviar falhas ({pendentesReenvio})</button>
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      {!st ? <Skeleton h={120} /> : (
        <section className={`card email-cfg ${st.configurado ? 'ok' : 'off'}`}>
          <div className="email-cfg-top">
            <span className={`email-cfg-icone tone-${st.configurado ? 'green' : 'red'}`}>{st.configurado ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}</span>
            <div>
              <h2>{st.configurado ? 'Serviço de e-mail configurado' : 'Serviço de e-mail não configurado'}</h2>
              <p className="muted small">{st.configurado ? 'As notificações são enviadas automaticamente em segundo plano, com até 3 tentativas.' : 'Nenhum e-mail está sendo enviado. As notificações ficam registradas como "não configurado" e podem ser reenviadas depois.'}</p>
            </div>
          </div>
          <dl className="email-cfg-dl">
            <div><dt>Provedor</dt><dd>{st.provedor === 'smtp' ? 'SMTP' : st.provedor === 'graph' ? 'Microsoft Graph' : '—'}</dd></div>
            <div><dt>Servidor</dt><dd><Server size={13} /> {st.servidor || '—'}</dd></div>
            <div><dt>Remetente</dt><dd>{st.remetente || '—'}</dd></div>
            <div><dt>Links nos e-mails</dt><dd className="mono small">{st.linkBase}</dd></div>
          </dl>
          {!st.configurado && (
            <div className="email-cfg-falta">
              <strong className="small">Falta configurar no arquivo api/.env (ou nas variáveis de ambiente da API):</strong>
              <ul>{st.faltando.map((f) => <li key={f} className="mono small">{f}</li>)}</ul>
              <p className="small muted"><Info size={13} /> Depois de configurar, reinicie a API e use “Enviar teste para mim”. O teste vai para {usuario.email}.</p>
            </div>
          )}
        </section>
      )}

      <div className="kpi-grid auto">
        <KpiCard icone={CheckCircle2} tom="green" titulo="Enviados" valor={st ? c.enviado || 0 : null} />
        <KpiCard icone={Clock} tom="blue" titulo="Na fila" valor={st ? (c.pendente || 0) + (c.enviando || 0) : null} sub="Pendentes ou em nova tentativa" />
        <KpiCard icone={XCircle} tom="red" titulo="Falharam" valor={st ? c.falhou || 0 : null} sub="Após 3 tentativas" destaque={c.falhou > 0} />
        <KpiCard icone={AlertTriangle} tom="amber" titulo="Sem serviço configurado" valor={st ? c.nao_configurado || 0 : null} sub="Aguardando configuração" />
      </div>

      <div className="card no-pad">
        <div className="toolbar">
          <Segmented label="Status" valor={filtro} onChange={setFiltro} opcoes={[{ id: '', label: 'Todos' }, { id: 'enviado', label: 'Enviados' }, { id: 'pendente', label: 'Na fila' }, { id: 'falhou', label: 'Falharam' }, { id: 'nao_configurado', label: 'Não configurado' }]} />
        </div>
        {!lista ? <div className="pad"><Skeleton h={200} /></div> : lista.length === 0 ? <EmptyState icon={Inbox} titulo="Nenhuma notificação" texto="Os e-mails aparecem aqui quando uma solicitação é aberta ou atualizada." /> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Para</th><th>Assunto</th><th>Status</th><th>Detalhe</th><th /></tr></thead>
              <tbody>
                {lista.map((n) => {
                  const s = ST[n.status] || ST.pendente;
                  return (
                    <tr key={n.id} className="no-click">
                      <td className="small nowrap" title={dataHora(n.criadoEm)}>{relativo(n.criadoEm)}</td>
                      <td className="small">{TIPO[n.tipo] || n.tipo}</td>
                      <td className="small"><strong>{n.paraNome}</strong><small className="muted block">{n.para}</small></td>
                      <td className="small cell-assunto">{n.assunto}</td>
                      <td><Badge tom={s.tom}><s.icone size={11} /> {s.label}</Badge>{n.tentativas > 0 && <small className="muted block">{n.tentativas} tentativa(s)</small>}</td>
                      <td className="small cell-erro">{n.status === 'enviado' ? <span className="muted">{dataHora(n.enviadoEm)}</span> : n.erro || <span className="muted">—</span>}</td>
                      <td className="num">{['falhou', 'nao_configurado'].includes(n.status) && st?.configurado && <button type="button" className="btn btn-sm" onClick={() => reenviar([n.id])}><RotateCcw size={13} /> Reenviar</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
