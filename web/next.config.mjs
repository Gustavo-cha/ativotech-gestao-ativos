import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Endereço INTERNO da API, visto pelo servidor do site (não pelo navegador).
// O navegador sempre fala com o próprio endereço do site (/api/...), e o site repassa para a API.
// Assim o sistema funciona em qualquer computador, IP, nome de rede ou domínio, sem "localhost" fixo no código.
// Observação: este valor é gravado no momento do "npm run build" — se mudar, gere o build de novo.
const API_INTERNA = (process.env.API_INTERNAL_URL || `http://127.0.0.1:${process.env.API_PORT || process.env.PORT_API || 3001}`).replace(/\/+$/, '');

// Modo de desenvolvimento acessado de outro aparelho da rede (ex.: 192.168.0.10). Em produção não se aplica.
const ORIGENS_DEV = (process.env.ALLOWED_DEV_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Esconde o botão "N" do modo de desenvolvimento, que ficava por cima do rodapé do menu lateral
  devIndicators: false,
  // Define a pasta "web" como raiz do projeto (evita aviso por causa do package.json da pasta principal).
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  allowedDevOrigins: ORIGENS_DEV,
  experimental: {
    // O canal em tempo real (/api/stream) fica aberto; ele manda um sinal a cada 20 s, bem abaixo deste limite
    proxyTimeout: 120000
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNA}/api/:path*` }];
  }
};

export default nextConfig;
