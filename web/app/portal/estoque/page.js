'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PackageSearch, FilePlus2, Laptop, Info, Warehouse, ChevronDown } from 'lucide-react';
import { PageHeader, Skeleton, ErroApi, EmptyState, Badge } from '@/components/ui';
import { EstoquePorProprietario, EstoqueIndicadores, EstoqueDistribuicao, SaldoProjetado, AoVivo, CatalogoDisponivel } from '@/components/portal/Estoque';
import { useAuth } from '@/components/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

// Consulta do Solicitante: somente leitura, separada por proprietário (H&CO × H&CO B2Finance)
export default function EstoqueRH() {
  const { pode } = useAuth();
  const [dono, setDono] = useState('');
  const { data: geral, erro, recarregar } = useApi(() => api.estoque.resumo(), []);
  const { data: filtrado } = useApi(() => (dono ? api.estoque.resumo({ proprietario: dono }) : Promise.resolve(null)), [dono]);
  const r = dono ? filtrado : geral;

  return (
    <div className="page">
      <PageHeader icone={PackageSearch} titulo="Estoque disponível" subtitulo="O que pode ser pedido agora, separado por proprietário.">
        {pode('estoque:gerenciar') && <Link href="/estoque" className="btn"><Warehouse size={16} /> Gerenciar estoque</Link>}
        {pode('solicitacoes:criar') && <Link href={`/portal/nova${dono ? `?proprietario=${encodeURIComponent(dono)}` : ''}`} className="btn btn-primary"><FilePlus2 size={16} /> Solicitar</Link>}
      </PageHeader>
      <ErroApi erro={erro} onRetry={recarregar} />

      <EstoquePorProprietario r={geral} ativo={dono} onEscolher={setDono} />

      <section className="card">
        <div className="card-head"><h2>{dono ? `Disponível na ${dono}` : 'Disponível por tipo'}</h2><AoVivo em={geral?.atualizadoEm} /></div>
        <CatalogoDisponivel r={r} proprietario={dono} />
      </section>

      <section className="card no-pad">
        <div className="card-head pad-x"><h2><Laptop size={17} /> Notebooks disponíveis agora</h2></div>
        {!r ? <div className="pad"><Skeleton h={100} /></div> : r.porModelo.length === 0 ? (
          <EmptyState icon={Laptop} titulo="Nenhum notebook livre no momento" texto="Você ainda pode abrir a solicitação: ela entra na fila e a TI providencia." />
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Modelo</th><th>Proprietário</th><th>Configuração</th><th className="num">Qtd.</th></tr></thead>
              <tbody>
                {r.porModelo.map((m) => (
                  <tr key={`${m.proprietario}|${m.modelo}`} className="no-click">
                    <td><strong>{m.modelo}</strong></td>
                    <td><span className={`owner-tag ${m.proprietario === 'H&CO B2Finance' ? 'b2f' : ''}`}>{m.proprietario}</span></td>
                    <td className="small">{m.configuracao || <span className="muted">—</span>}</td>
                    <td className="num"><Badge tom="green">{m.quantidade}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="card more-details">
        <summary><span>Situação dos notebooks e locais</span><ChevronDown size={16} className="chev" aria-hidden="true" /></summary>
        <div className="stack-lg mt-12">
          <EstoqueIndicadores r={r} />
          <EstoqueDistribuicao r={r} />
          {dono && <SaldoProjetado r={r} />}
          {r?.porLocal.length > 0 && (
            <div className="table-wrap"><table className="table compact">
              <thead><tr><th>Local</th><th>Proprietário</th><th className="num">Disponíveis</th><th className="num">Reservados</th><th className="num">Em preparação</th></tr></thead>
              <tbody>{r.porLocal.map((l) => <tr key={`${l.proprietario}|${l.local}`} className="no-click"><td>{l.local}</td><td className="small">{l.proprietario}</td><td className="num">{l.disponivel}</td><td className="num">{l.reservado}</td><td className="num">{l.preparacao}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="muted small info-line"><Info size={14} /> Reservados = separados para admissões. Em preparação = sendo configurados pela TI. Somente a TI cadastra e movimenta o estoque.</p>
        </div>
      </details>
    </div>
  );
}
