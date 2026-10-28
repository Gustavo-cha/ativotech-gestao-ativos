'use client';

import { Check, X, Clock, AlertTriangle, PackageX, Truck, Copy, PackageCheck, MapPin, Store, Sparkles } from 'lucide-react';
import { Badge } from '../ui';
import { useToast } from '../providers';
import { TOM_SOLICITACAO, ETAPAS_SOLICITACAO } from '@/lib/constants';
import { data as fmtData, dataHora } from '@/lib/format';

export const SolicitacaoBadge = ({ status, rejeitada }) => (
  <Badge tom={TOM_SOLICITACAO[status]} dot>{status === 'Cancelado' && rejeitada ? 'Rejeitada' : status}</Badge>
);

export const NovaBadge = () => <Badge tom="blue" className="badge-nova"><Sparkles size={11} aria-hidden="true" /> NOVA</Badge>;

export function UrgenciaBadge({ s }) {
  if (s.urgencia === 'nenhuma' || s.diasParaAdmissao === null || s.diasParaAdmissao === undefined) return null;
  const d = s.diasParaAdmissao;
  const txt = d < 0 ? `Admissão há ${-d}d` : d === 0 ? 'Admissão hoje' : d === 1 ? 'Admissão amanhã' : `Admissão em ${d} dias`;
  return <Badge tom={s.urgencia === 'critica' ? 'red' : s.urgencia === 'alta' ? 'orange' : 'slate'}><Clock size={11} aria-hidden="true" /> {txt}</Badge>;
}

// Linha do tempo das etapas, como num rastreio de entrega.
// "Aguardando estoque" aparece como pausa entre a análise e a preparação; retirada na unidade não tem "Enviado".
export function EtapasSolicitacao({ s, compacto = false }) {
  const retirada = s.entrega?.modalidade === 'retirada';
  const etapas = ETAPAS_SOLICITACAO.filter((e) => !(retirada && e === 'Enviado'));
  const cancelada = s.status === 'Cancelado';
  const aguardando = s.status === 'Aguardando estoque';
  const atual = aguardando ? etapas.indexOf('Em análise') + 1 : etapas.indexOf(s.status);
  const passou = (s.atualizacoes || []).filter((a) => a.tipo === 'status').map((a) => a.status);
  const ultimaAntesDoCancelamento = cancelada ? Math.max(0, ...passou.map((x) => etapas.indexOf(x)).filter((i) => i >= 0)) : -1;
  return (
    <ol className={`etapas ${compacto ? 'compact' : ''} ${cancelada ? 'cancelada' : ''}`} aria-label={`Andamento: ${s.status}`}>
      {etapas.map((e, i) => {
        const feito = cancelada ? i <= ultimaAntesDoCancelamento : i < atual || s.status === 'Entregue';
        const agora = !cancelada && i === atual && s.status !== 'Entregue';
        const espera = agora && aguardando;
        return (
          <li key={e} className={`etapa ${feito ? 'feito' : ''} ${agora ? 'agora' : ''} ${espera ? 'espera' : ''}`} aria-current={agora ? 'step' : undefined}>
            <span className="etapa-dot">{feito ? <Check size={12} strokeWidth={3} /> : espera ? <PackageX size={12} /> : i + 1}</span>
            {!compacto && <span className="etapa-label">{espera ? 'Aguardando estoque' : e === 'Entregue' && retirada ? 'Retirado' : e}</span>}
          </li>
        );
      })}
      {cancelada && <li className="etapa cancel"><span className="etapa-dot"><X size={12} strokeWidth={3} /></span>{!compacto && <span className="etapa-label">{s.rejeitada ? 'Rejeitada' : 'Cancelada'}</span>}</li>}
    </ol>
  );
}

export function AvisoPrevisao({ s }) {
  if (s.entregaAtrasada) return <p className="inline-warn tone-red"><AlertTriangle size={14} /> A previsão de entrega ({fmtData(s.previsaoEntrega)}) já passou.</p>;
  if (!s.previsaoAposAdmissao) return null;
  return <p className="inline-warn"><AlertTriangle size={14} /> A previsão de entrega é posterior à data de admissão.</p>;
}

// Destino: endereço completo ou unidade de retirada
export function DestinoBox({ e }) {
  if (!e) return null;
  if (e.modalidade === 'retirada') {
    return (
      <div className="destino-box">
        <Store size={18} aria-hidden="true" />
        <div><strong>Retirada na unidade</strong><span>{e.unidade}</span>{e.telefone && <small className="muted">Contato: {fmtTel(e.telefone)}</small>}</div>
      </div>
    );
  }
  return (
    <div className="destino-box">
      <MapPin size={18} aria-hidden="true" />
      <div>
        <strong>{e.destinatario}</strong>
        <span>{e.logradouro}, {e.numero}{e.complemento ? ` – ${e.complemento}` : ''}</span>
        <span>{e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2')}</span>
        {e.telefone && <small className="muted">Contato: {fmtTel(e.telefone)}</small>}
      </div>
    </div>
  );
}
export const fmtTel = (t = '') => (t.length === 11 ? t.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3') : t.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3'));

// Dados do envio: transportadora, rastreio, datas e recebimento
export function RastreioBox({ s }) {
  const { toast } = useToast();
  const env = s.envio;
  if (!env || (!env.transportadora && !env.entregueEm)) return null;
  const copiar = () => {
    navigator.clipboard?.writeText(env.codigoRastreio).then(() => toast({ tipo: 'sucesso', titulo: 'Código copiado' })).catch(() => {});
  };
  return (
    <div className={`rastreio-box ${s.status === 'Entregue' ? 'entregue' : ''}`}>
      <div className="rastreio-top">
        <span className="rastreio-icon">{s.status === 'Entregue' ? <PackageCheck size={20} /> : <Truck size={20} />}</span>
        <div>
          <strong>{env.transportadora || 'Entrega na unidade'}</strong>
          <small className="muted">{s.status === 'Entregue' ? `Entregue em ${dataHora(env.entregueEm)}` : env.dataEnvio ? `Enviado em ${fmtData(env.dataEnvio)}` : 'Envio ainda não registrado'}</small>
        </div>
      </div>
      {env.codigoRastreio && (
        <div className="rastreio-code">
          <span className="muted small">Código de rastreio</span>
          <span className="mono">{env.codigoRastreio}</span>
          <button type="button" className="icon-btn ghost" onClick={copiar} aria-label="Copiar código de rastreio" title="Copiar"><Copy size={15} /></button>
        </div>
      )}
      <dl className="rastreio-dl">
        {s.previsaoEntrega && <div><dt>Previsão</dt><dd className={s.entregaAtrasada ? 'txt-red' : ''}>{fmtData(s.previsaoEntrega)}</dd></div>}
        {env.recebidoPor && <div><dt>Recebido por</dt><dd>{env.recebidoPor}</dd></div>}
      </dl>
    </div>
  );
}
