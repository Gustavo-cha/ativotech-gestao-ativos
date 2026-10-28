import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <div className="card empty-state big">
        <span className="big-404">404</span>
        <strong>Página não encontrada</strong>
        <p>O endereço acessado não existe ou foi movido.</p>
        <Link href="/" className="btn btn-primary">Ir para o painel</Link>
      </div>
    </div>
  );
}
