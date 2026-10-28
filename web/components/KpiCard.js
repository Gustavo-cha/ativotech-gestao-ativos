'use client';

import Link from 'next/link';
import { useCountUp } from '@/lib/hooks';
import { useConfig } from './providers';
import { Sparkline } from './charts';

// Cartão de indicador com número animado, ícone e mini gráfico opcional
export default function KpiCard({ icone: I, titulo, valor, formato = (v) => Math.round(v).toLocaleString('pt-BR'), sub, tom = 'blue', href, serie, destaque }) {
  const { config } = useConfig();
  const v = useCountUp(valor ?? 0, { ativo: config.animacoes });
  const conteudo = (
    <>
      <div className="kpi-top">
        <span className={`kpi-icon tone-${tom}`}>{I && <I size={18} aria-hidden="true" />}</span>
        <span className="kpi-title">{titulo}</span>
      </div>
      <div className="kpi-value">{valor === null || valor === undefined ? '—' : formato(v)}</div>
      <div className="kpi-foot">
        {sub && <span className="kpi-sub">{sub}</span>}
        {serie && <Sparkline valores={serie} cor={`var(--${tom}-fg)`} />}
      </div>
    </>
  );
  const cls = `kpi ${destaque ? `kpi-alert tone-${tom}` : ''}`;
  return href ? <Link href={href} className={`${cls} kpi-link`}>{conteudo}</Link> : <div className={cls}>{conteudo}</div>;
}
