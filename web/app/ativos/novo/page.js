'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import AtivoForm from '@/components/forms/AtivoForm';
import { PageHeader } from '@/components/ui';

function Conteudo() {
  const params = useSearchParams();
  const categoria = params.get('categoria');
  const proprietario = ['H&CO', 'H&CO B2Finance'].includes(params.get('proprietario')) ? params.get('proprietario') : '';
  const padrao = { ...(categoria === 'Notebook' ? { categoria, departamento: 'TI', tags: ['Estoque'] } : categoria ? { categoria } : {}), ...(proprietario ? { proprietario } : {}) };
  return (
    <div className="page">
      <Link href="/ativos" className="back-link"><ArrowLeft size={15} /> Inventário</Link>
      <PageHeader icone={PackagePlus} titulo="Novo equipamento" subtitulo="Campos com * são obrigatórios. Rede, compra e observações são opcionais." />
      <AtivoForm padrao={padrao} />
    </div>
  );
}

export default function NovoAtivo() {
  return <Suspense fallback={null}><Conteudo /></Suspense>;
}
