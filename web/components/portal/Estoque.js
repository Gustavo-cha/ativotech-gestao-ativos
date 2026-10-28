'use client';

import { PackageCheck, Bookmark, Wrench, UserCheck, Hammer, TrendingDown, TrendingUp, Truck, Building2 } from 'lucide-react';
import { SITUACAO_ESTOQUE } from '@/lib/constants';
import { relativo } from '@/lib/format';
import { Skeleton, CategoriaIcon, Badge } from '../ui';

const ICONES = { disponivel: PackageCheck, reservado: Bookmark, preparacao: Hammer, transito: Truck, 'em-uso': UserCheck, manutencao: Wrench };
const CAMPO = { disponivel: 'disponivel', reservado: 'reservado', preparacao: 'preparacao', transito: 'transito', 'em-uso': 'emUso', manutencao: 'manutencao' };
export const PROPRIETARIOS = ['H&CO', 'H&CO B2Finance'];

// Estoque separado por proprietário: "H&CO — 12 disponíveis", "H&CO B2Finance — 8 disponíveis"
export function EstoquePorProprietario({ r, detalhado = false, ativo = '', onEscolher }) {
  if (!r) return <div className="owner-cards">{PROPRIETARIOS.map((p) => <Skeleton key={p} h={detalhado ? 118 : 96} r={14} />)}</div>;
  return (
    <div className="owner-cards" role={onEscolher ? 'radiogroup' : undefined} aria-label="Estoque por proprietário">
      {r.proprietarios.map((p) => {
        const Tag = onEscolher ? 'button' : 'div';
        const sel = ativo === p.proprietario;
        return (
          <Tag key={p.proprietario} type={onEscolher ? 'button' : undefined} role={onEscolher ? 'radio' : undefined} aria-checked={onEscolher ? sel : undefined}
            className={`owner-card ${p.proprietario === 'H&CO B2Finance' ? 'b2f' : ''} ${sel ? 'on' : ''}`} onClick={onEscolher ? () => onEscolher(sel ? '' : p.proprietario) : undefined}>
            <span className="owner-card-head"><Building2 size={15} /> {p.proprietario}</span>
            <span className="owner-card-num"><strong>{p.equipamentosDisponiveis}</strong> equipamento{p.equipamentosDisponiveis === 1 ? '' : 's'} disponíve{p.equipamentosDisponiveis === 1 ? 'l' : 'is'}</span>
            <span className="owner-card-sub">
              {p.notebooksDisponiveis} notebook{p.notebooksDisponiveis === 1 ? '' : 's'} · {p.acessoriosDisponiveis} acessório{p.acessoriosDisponiveis === 1 ? '' : 's'}
              {detalhado && p.saldoProjetado !== undefined && (p.saldoProjetado < 0
                ? <span className="txt-red"> · faltam {-p.saldoProjetado} notebook{p.saldoProjetado === -1 ? '' : 's'} para a fila</span>
                : p.reservados ? <> · {p.reservados} reservado{p.reservados === 1 ? '' : 's'}</> : null)}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

// Situação dos notebooks numa linha compacta (mesmos números para RH e TI)
export function EstoqueIndicadores({ r }) {
  if (!r) return <Skeleton h={64} />;
  return (
    <div className="stat-strip">
      {Object.keys(ICONES).map((k) => {
        const I = ICONES[k];
        return (
          <div key={k} className={`stat tone-${SITUACAO_ESTOQUE[k].tom}`} title={SITUACAO_ESTOQUE[k].desc}>
            <span className="stat-label"><I size={13} aria-hidden="true" /> {k === 'manutencao' ? 'Manutenção' : SITUACAO_ESTOQUE[k].label}</span>
            <strong>{r[CAMPO[k]]}</strong>
          </div>
        );
      })}
    </div>
  );
}

// Barra empilhada com a distribuição do estoque
export function EstoqueDistribuicao({ r }) {
  if (!r) return <Skeleton h={60} />;
  const partes = Object.keys(ICONES).map((k) => ({ k, v: r[CAMPO[k]] }));
  const total = partes.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="stack-wrap">
      <div className="stack-bar" role="img" aria-label={partes.map((p) => `${SITUACAO_ESTOQUE[p.k].label}: ${p.v}`).join(', ')}>
        {partes.filter((p) => p.v).map((p) => (
          <span key={p.k} className={`stack-seg tone-${SITUACAO_ESTOQUE[p.k].tom}`} style={{ flexGrow: p.v }} title={`${SITUACAO_ESTOQUE[p.k].label}: ${p.v}`}>
            {p.v / total > 0.08 && p.v}
          </span>
        ))}
      </div>
      <div className="legend legend-inline wrap">
        {partes.map((p) => <span key={p.k}><i style={{ background: `var(--${SITUACAO_ESTOQUE[p.k].tom}-fg)` }} />{SITUACAO_ESTOQUE[p.k].label} · {p.v}</span>)}
      </div>
    </div>
  );
}

// Demanda pendente x disponíveis
export function SaldoProjetado({ r }) {
  if (!r) return <Skeleton h={70} />;
  const falta = r.saldoProjetado < 0;
  const I = falta ? TrendingDown : TrendingUp;
  return (
    <div className={`saldo-card tone-${falta ? 'red' : r.saldoProjetado === 0 ? 'amber' : 'green'}`}>
      <span className="saldo-icon"><I size={18} /></span>
      <div>
        <strong>{falta ? (r.saldoProjetado === -1 ? 'Falta 1 notebook' : `Faltam ${-r.saldoProjetado} notebooks`) : r.saldoProjetado === 0 ? 'Estoque no limite' : `Sobram ${r.saldoProjetado} após atender a fila`}</strong>
        <p className="muted small">{r.demandaPendente} pedido{r.demandaPendente === 1 ? '' : 's'} sem reserva · {r.disponivel} disponíve{r.disponivel === 1 ? 'l' : 'is'}{r.proprietario ? ` (${r.proprietario})` : ''}</p>
      </div>
    </div>
  );
}

export function AoVivo({ em }) {
  return <span className="live-note">Atualizado automaticamente{em ? ` · ${relativo(em)}` : ''}</span>;
}

// Disponibilidade por tipo, separada por proprietário (o que pode ser pedido)
export function CatalogoDisponivel({ r, detalhado = false, proprietario = '' }) {
  if (!r) return <Skeleton h={160} />;
  const donos = proprietario ? [proprietario] : PROPRIETARIOS;
  return (
    <div className={`catalogo ${donos.length > 1 ? 'catalogo-2' : ''}`}>
      {donos.map((dono) => {
        const itens = r.catalogo.filter((c) => (c.proprietario || 'H&CO') === dono && (c.tipo === 'ativo' || c.disponivel > 0 || detalhado));
        return (
          <div key={dono}>
            {donos.length > 1 && <h3 className="pick-group"><Building2 size={13} /> {dono}</h3>}
            <ul className="cat-list">
              {itens.map((c) => (
                <li key={c.chave} className={c.disponivel === 0 ? 'zero' : ''}>
                  <CategoriaIcon categoria={c.categoria} boxed size={14} />
                  <span className="grow"><strong>{c.nome}</strong>{detalhado && (c.reservado || c.demanda) ? <small className="muted">{c.reservado} reservado(s){c.demanda ? ` · ${c.demanda} aguardando` : ''}</small> : null}</span>
                  {detalhado && c.abaixoMinimo && <Badge tom={c.disponivel === 0 ? 'red' : 'amber'}>{c.disponivel === 0 ? 'Esgotado' : 'Repor'}</Badge>}
                  <span className={`cat-qtd ${c.disponivel === 0 ? 'zero' : ''}`}>{c.disponivel}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
