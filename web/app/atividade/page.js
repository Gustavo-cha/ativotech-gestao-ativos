'use client';

import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { PageHeader, Tabs, Skeleton, EmptyState, ErroApi } from '@/components/ui';
import { AtividadeItem } from '@/components/AtividadeItem';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { isoLocal } from '@/lib/format';

export default function Atividade() {
  const [aba, setAba] = useState('');
  const [q, setQ] = useState('');
  const { data, erro, carregando, recarregar } = useApi(() => api.historico({ limite: 500 }), []);

  const filtrados = useMemo(() => {
    const t = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return (data || []).filter((h) => (!aba || h.entidade === aba) &&
      (!t || `${h.titulo} ${h.detalhe} ${h.usuario} ${h.acao}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)));
  }, [data, aba, q]);

  // Agrupa por dia
  const grupos = useMemo(() => {
    const hoje = isoLocal();
    const ontem = isoLocal(new Date(Date.now() - 86400000));
    const g = {};
    for (const h of filtrados) {
      const d = isoLocal(new Date(h.em));
      const nome = d === hoje ? 'Hoje' : d === ontem ? 'Ontem' : new Date(h.em).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      (g[nome] ||= []).push(h);
    }
    return Object.entries(g);
  }, [filtrados]);

  const qtd = (e) => (data || []).filter((h) => !e || h.entidade === e).length;

  return (
    <div className="page page-narrow">
      <PageHeader icone={History} titulo="Atividade" subtitulo="Histórico de tudo o que foi criado, alterado ou excluído — trilha de auditoria." />
      <ErroApi erro={erro} onRetry={recarregar} />
      <div className="card no-pad">
        <Tabs ativa={aba} onChange={setAba} className="tabs-card" abas={[
          { id: '', label: 'Tudo', qtd: qtd('') }, { id: 'solicitacao', label: 'Solicitações', qtd: qtd('solicitacao') },
          { id: 'estoque', label: 'Estoque', qtd: qtd('estoque') }, { id: 'ativo', label: 'Equipamentos', qtd: qtd('ativo') },
          { id: 'usuario', label: 'Usuários', qtd: qtd('usuario') }, { id: 'acesso', label: 'Acessos', qtd: qtd('acesso') }
        ]} />
        <div className="toolbar"><div className="search-input"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar histórico…" aria-label="Filtrar histórico" /></div></div>
        <div className="pad">
          {carregando ? <Skeleton h={300} /> : grupos.length === 0 ? <EmptyState icon={History} titulo="Nenhuma atividade encontrada" /> :
            grupos.map(([dia, itens]) => (
              <section key={dia} className="tl-group">
                <h3 className="tl-day">{dia}</h3>
                <ol className="timeline">{itens.map((h) => <AtividadeItem key={h.id} h={h} />)}</ol>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
