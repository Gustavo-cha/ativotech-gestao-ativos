import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { AppProviders } from '@/components/providers';
import AppShell from '@/components/shell/AppShell';
import { AuthProvider } from '@/components/auth';

export const metadata = {
  title: { default: 'Ativos Tech — Gestão de ativos e logística de TI', template: '%s · Ativos Tech' },
  description: 'Solicitações de equipamentos do RH, controle de estoque, preparação e envio de notebooks e acessórios para novas admissões.'
};

export const viewport = { themeColor: '#0b1324' };

// Aplica tema, cor de destaque e preferências antes da renderização (evita "piscar").
const preScript = `
try {
  var c = JSON.parse(localStorage.getItem('ativotech:config') || '{}');
  var r = document.documentElement;
  if (c.tema === 'escuro') r.setAttribute('data-theme', 'dark');
  else if (c.tema === 'claro') r.setAttribute('data-theme', 'light');
  r.dataset.accent = c.acento || 'azul';
  r.dataset.density = c.densidade || 'confortavel';
  r.dataset.motion = c.animacoes === false ? 'off' : 'on';
  if (c.sidebarRecolhida) r.dataset.side = 'collapsed';
} catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning data-accent="azul">
      <head>
        <script dangerouslySetInnerHTML={{ __html: preScript }} />
      </head>
      <body>
        <AppProviders>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
