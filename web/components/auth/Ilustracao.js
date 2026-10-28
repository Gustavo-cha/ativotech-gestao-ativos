'use client';

// Cena isométrica de infraestrutura de TI (racks, notebook, celular, rede e caixa de envio), desenhada em SVG.
// A geometria é calculada por projeção isométrica — nítida em qualquer tela e sem imagem externa para baixar.
import { useId } from 'react';

const U = 24;
const C = Math.cos(Math.PI / 6) * U;
const S = Math.sin(Math.PI / 6) * U;
const iso = (x, y, z) => [(x - y) * C, (x + y) * S - z * U];
const pts = (lista) => lista.map((p) => iso(...p).map((n) => n.toFixed(1)).join(',')).join(' ');

// Caixa: devolve as três faces visíveis (topo, lateral direita x+w, lateral esquerda y+d)
function caixa(x, y, z, w, d, h) {
  return {
    topo: pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]),
    dir: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]),
    esq: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])
  };
}
function Caixa({ b, cores, borda = 'rgba(148,180,255,.18)' }) {
  return (
    <g strokeWidth="1" stroke={borda} strokeLinejoin="round">
      <polygon points={b.esq} fill={cores[1]} />
      <polygon points={b.dir} fill={cores[2]} />
      <polygon points={b.topo} fill={cores[0]} />
    </g>
  );
}
// Ponto dentro de um plano definido por origem A e vetores AB (u) e AD (v)
const noPlano = (A, B, D) => (u, v) => [0, 1, 2].map((i) => A[i] + u * (B[i] - A[i]) + v * (D[i] - A[i]));
const quadNoPlano = (f, u0, v0, u1, v1) => pts([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]);

export default function IlustracaoInfra({ className = '' }) {
  const id = useId().replace(/:/g, '');
  const g = (n) => `${id}-${n}`;

  // Piso
  const piso = caixa(0, 0, -0.7, 12, 12, 0.7);
  const linhas = [];
  for (let k = 1; k < 12; k++) {
    linhas.push(pts([[k, 0, 0], [k, 12, 0]]).split(' '), pts([[0, k, 0], [12, k, 0]]).split(' '));
  }

  // Racks
  const rack = caixa(1, 1, 0, 2.3, 2.3, 6.4);
  const rack2 = caixa(3.7, 1, 0, 1.7, 2.3, 4);
  const frenteRack = noPlano([1, 3.3, 0], [3.3, 3.3, 0], [1, 3.3, 6.4]);
  const frenteRack2 = noPlano([3.7, 3.3, 0], [5.4, 3.3, 0], [3.7, 3.3, 4]);
  const unidades = Array.from({ length: 9 }, (_, i) => 0.06 + i * 0.104);
  const unidades2 = Array.from({ length: 5 }, (_, i) => 0.08 + i * 0.17);

  // Caixa de envio
  const pacote = caixa(8.6, 1.4, 0, 2.5, 2.1, 1.9);
  const fita = pts([[9.65, 1.4, 1.91], [10.05, 1.4, 1.91], [10.05, 3.5, 1.91], [9.65, 3.5, 1.91]]);
  const etiqueta = noPlano([8.6, 3.5, 0], [11.1, 3.5, 0], [8.6, 3.5, 1.9]);

  // Notebook
  const base = caixa(5.9, 6.2, 0, 3.8, 2.6, 0.22);
  const tela = noPlano([5.9, 6.2, 0.22], [9.7, 6.2, 0.22], [5.9, 5.85, 2.75]);
  const teclado = noPlano([6.2, 6.5, 0.23], [9.4, 6.5, 0.23], [6.2, 7.9, 0.23]);
  const barras = [0.34, 0.58, 0.46, 0.78, 0.62];

  // Celular
  const cel = caixa(2.4, 8.2, 0, 1.05, 1.9, 0.14);
  const telaCel = pts([[2.5, 8.3, 0.15], [3.35, 8.3, 0.15], [3.35, 10, 0.15], [2.5, 10, 0.15]]);

  // Nós de rede flutuando acima da cena e ligações até os equipamentos
  const nos = [[2.2, 2.2, 9.2], [6.6, 3.2, 8.4], [9.6, 6.6, 7.4], [4.6, 7.6, 6.6]];
  const ligacoes = [
    [nos[0], [2.15, 2.15, 6.45]], [nos[0], nos[1]], [nos[1], [9.85, 2.45, 1.95]], [nos[1], nos[2]],
    [nos[2], [7.8, 6, 2.8]], [nos[3], [2.9, 9, 0.2]], [nos[3], nos[1]], [nos[3], [4.5, 2.1, 4.05]]
  ];

  return (
    <svg className={`ilustracao ${className}`} viewBox="-300 -265 600 600" role="img" aria-label="Ilustração: racks de servidores, notebook, celular, rede e caixa de envio de equipamentos">
      <defs>
        <linearGradient id={g('tela')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1d4ed8" /><stop offset="1" stopColor="#0e7490" /></linearGradient>
        <linearGradient id={g('piso')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#15223f" /><stop offset="1" stopColor="#0f1a33" /></linearGradient>
        <radialGradient id={g('brilho')}><stop offset="0" stopColor="#60a5fa" stopOpacity=".55" /><stop offset="1" stopColor="#60a5fa" stopOpacity="0" /></radialGradient>
        <filter id={g('sombra')} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000" floodOpacity=".45" /></filter>
      </defs>

      <ellipse cx="0" cy="250" rx="250" ry="40" fill="#000" opacity=".28" />
      <g className="il-cena" filter={`url(#${g('sombra')})`}>
        {/* Piso com grade */}
        <Caixa b={piso} cores={[`url(#${g('piso')})`, '#0c1529', '#09101f']} />
        <g stroke="rgba(120,160,255,.10)" strokeWidth="1">
          {linhas.map(([a, b], i) => { const [x1, y1] = a.split(','); const [x2, y2] = b.split(','); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />; })}
        </g>

        {/* Racks de servidor */}
        <Caixa b={rack} cores={['#2c3d62', '#1f2c4a', '#17223b']} />
        {unidades.map((v, i) => (
          <g key={i}>
            <polygon points={quadNoPlano(frenteRack, 0.08, v, 0.92, v + 0.082)} fill="#0e1628" stroke="rgba(148,180,255,.14)" />
            <circle className={`il-led ${i % 3 === 0 ? 'b' : ''}`} cx={iso(...frenteRack(0.82, v + 0.041))[0]} cy={iso(...frenteRack(0.82, v + 0.041))[1]} r="2.3" fill={i % 4 === 1 ? '#fbbf24' : i % 3 === 0 ? '#60a5fa' : '#34d399'} style={{ animationDelay: `${i * 0.37}s` }} />
            <polyline points={pts([frenteRack(0.14, v + 0.041), frenteRack(0.6, v + 0.041)])} stroke="rgba(148,180,255,.22)" strokeWidth="1.4" fill="none" />
          </g>
        ))}
        <Caixa b={rack2} cores={['#283a5e', '#1c2946', '#162038']} />
        {unidades2.map((v, i) => (
          <g key={i}>
            <polygon points={quadNoPlano(frenteRack2, 0.1, v, 0.9, v + 0.13)} fill="#0e1628" stroke="rgba(148,180,255,.14)" />
            <circle className="il-led" cx={iso(...frenteRack2(0.78, v + 0.065))[0]} cy={iso(...frenteRack2(0.78, v + 0.065))[1]} r="2.2" fill="#34d399" style={{ animationDelay: `${i * 0.5 + 0.2}s` }} />
          </g>
        ))}

        {/* Caixa de envio */}
        <Caixa b={pacote} cores={['#d6a46a', '#b9854c', '#9c6d3b']} borda="rgba(0,0,0,.18)" />
        <polygon points={fita} fill="#e8c999" opacity=".9" />
        <polygon points={quadNoPlano(etiqueta, 0.12, 0.42, 0.62, 0.82)} fill="#f8fafc" />
        {[0.5, 0.6, 0.7].map((v) => <polyline key={v} points={pts([etiqueta(0.17, v), etiqueta(0.5, v)])} stroke="#64748b" strokeWidth="1.3" fill="none" />)}

        {/* Celular */}
        <Caixa b={cel} cores={['#1e293b', '#111827', '#0b1220']} />
        <polygon points={telaCel} fill={`url(#${g('tela')})`} opacity=".9" />

        {/* Notebook */}
        <Caixa b={base} cores={['#cbd5e1', '#94a3b8', '#7c8ba1']} borda="rgba(15,23,42,.25)" />
        <polygon points={quadNoPlano(teclado, 0, 0, 1, 0.62)} fill="#334155" opacity=".85" />
        <polygon points={quadNoPlano(teclado, 0.36, 0.72, 0.64, 0.95)} fill="#94a3b8" opacity=".9" />
        <polygon points={quadNoPlano(tela, -0.03, -0.02, 1.03, 1.04)} fill="#1e293b" stroke="rgba(15,23,42,.4)" />
        <polygon points={quadNoPlano(tela, 0.03, 0.05, 0.97, 0.96)} fill={`url(#${g('tela')})`} />
        {/* Painel na tela: barras e linha de tendência */}
        {barras.map((h, i) => <polygon key={i} points={quadNoPlano(tela, 0.1 + i * 0.12, 0.12, 0.18 + i * 0.12, 0.12 + h * 0.62)} fill={['#93c5fd', '#67e8f9', '#a5b4fc', '#93c5fd', '#6ee7b7'][i]} opacity=".9" />)}
        <polyline points={pts([tela(0.72, 0.3), tela(0.79, 0.5), tela(0.85, 0.42), tela(0.92, 0.72)])} stroke="#f8fafc" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={quadNoPlano(tela, 0.1, 0.84, 0.55, 0.9)} fill="rgba(255,255,255,.55)" />

        {/* Rede */}
        <g className="il-rede" fill="none" stroke="#60a5fa" strokeWidth="1.6" strokeDasharray="4 7" strokeLinecap="round">
          {ligacoes.map(([a, b], i) => { const [x1, y1] = iso(...a); const [x2, y2] = iso(...b); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ animationDelay: `${-i * 0.4}s` }} opacity=".7" />; })}
        </g>
        {nos.map((n, i) => {
          const [cx, cy] = iso(...n);
          return (
            <g key={i} className="il-no" style={{ animationDelay: `${i * 0.6}s` }}>
              <circle cx={cx} cy={cy} r="20" fill={`url(#${g('brilho')})`} />
              <circle cx={cx} cy={cy} r="7.5" fill="#0b1324" stroke="#93c5fd" strokeWidth="2" />
              <circle cx={cx} cy={cy} r="3" fill={i === 2 ? '#34d399' : '#93c5fd'} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
