'use client';

// Gráficos em SVG puro (sem bibliotecas), animados e com cores que se adaptam ao tema.
import { useState } from 'react';
import { SERIES } from '@/lib/constants';
import { useCountUp } from '@/lib/hooks';
import { useConfig } from './providers';

export function Donut({ dados, tamanho = 168, espessura = 22, centro, subCentro, cores }) {
  const [foco, setFoco] = useState(null);
  const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
  const r = (tamanho - espessura) / 2;
  const C = 2 * Math.PI * r;
  let acum = 0;
  const destaque = foco !== null ? dados[foco] : null;
  return (
    <div className="donut-wrap">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img"
        aria-label={dados.map((d) => `${d.label}: ${d.valor}`).join(', ')}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={espessura} />
        {dados.map((d, i) => {
          const frac = d.valor / total;
          const len = Math.max(0, frac * C - (dados.filter((x) => x.valor).length > 1 ? 2 : 0));
          const off = -acum * C;
          acum += frac;
          if (!d.valor) return null;
          return (
            <circle key={d.label} cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none"
              stroke={d.cor || (cores || SERIES)[i % SERIES.length]} strokeWidth={foco === i ? espessura + 5 : espessura}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} strokeLinecap="butt"
              transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`} className="donut-seg"
              style={{ animationDelay: `${i * 70}ms` }}
              onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} />
          );
        })}
        <text x="50%" y="48%" textAnchor="middle" className="donut-num">{destaque ? destaque.valor : centro ?? total}</text>
        <text x="50%" y="62%" textAnchor="middle" className="donut-sub">{destaque ? destaque.label : subCentro}</text>
      </svg>
      <ul className="legend">
        {dados.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} className={foco === i ? 'on' : ''}>
            <i style={{ background: d.cor || (cores || SERIES)[i % SERIES.length] }} />
            <span>{d.label}</span>
            <strong>{d.valor}</strong>
            <em>{Math.round((d.valor / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barras horizontais (ranking)
export function HBars({ dados, formato = (v) => v, cor }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <ul className="hbars">
      {dados.map((d, i) => (
        <li key={d.label}>
          <div className="hbar-top"><span>{d.label}</span><strong>{formato(d.valor)}</strong></div>
          <div className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor || cor || SERIES[i % SERIES.length], animationDelay: `${i * 60}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Colunas verticais
export function Columns({ dados, altura = 180, formato = (v) => v, cor = 'var(--accent)' }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="columns" style={{ height: altura }} role="img" aria-label={dados.map((d) => `${d.label}: ${formato(d.valor)}`).join(', ')}>
      {dados.map((d, i) => (
        <div className="col" key={d.label} title={`${d.label}: ${formato(d.valor)}`}>
          <span className="col-val">{formato(d.valor)}</span>
          <span className="col-bar" style={{ height: `${Math.max(2, (d.valor / max) * 100)}%`, background: d.cor || cor, animationDelay: `${i * 60}ms` }} />
          <span className="col-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Área/linha com duas séries (ex.: solicitações abertas x entregues)
export function AreaChart({ series, labels, altura = 170 }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = altura;
  const pad = { t: 12, r: 8, b: 22, l: 26 };
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const n = labels.length;
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const linha = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img"
        aria-label={series.map((s) => `${s.nome}: ${s.valores.reduce((a, b) => a + b, 0)} no período`).join('; ')}
        onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.nome} id={`grad-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.cor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.cor} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-text">{t}</text>
          </g>
        ))}
        {series.map((s, i) => (
          <g key={s.nome}>
            <path d={`${linha(s.valores)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#grad-${i})`} className="area-fill" />
            <path d={linha(s.valores)} fill="none" stroke={s.cor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="area-line" />
          </g>
        ))}
        {labels.map((l, i) => (
          <g key={l + i}>
            {i % 2 === 0 && <text x={x(i)} y={H - 4} textAnchor="middle" className="axis-text">{l}</text>}
            <rect x={x(i) - (W / n) / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="hover-line" />
            {series.map((s) => <circle key={s.nome} cx={x(hover)} cy={y(s.valores[hover])} r="4.5" fill={s.cor} stroke="var(--surface)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{labels[hover]}</strong>
          {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}: {s.valores[hover]}</span>)}
        </div>
      )}
      <div className="legend legend-inline">
        {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
      </div>
    </div>
  );
}

// Medidor circular de porcentagem
export function Ring({ valor, tamanho = 92, espessura = 9, cor = 'var(--accent)', label }) {
  const { config } = useConfig();
  const v = useCountUp(valor, { ativo: config.animacoes });
  const r = (tamanho - espessura) / 2;
  const C = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`${label}: ${valor}%`}>
      <svg width={tamanho} height={tamanho}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={espessura} />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`} />
      </svg>
      <span>{Math.round(v)}%</span>
    </div>
  );
}

export function Sparkline({ valores, cor = 'var(--accent)', w = 90, h = 28 }) {
  const max = Math.max(1, ...valores);
  const pts = valores.map((v, i) => `${(i / Math.max(1, valores.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
