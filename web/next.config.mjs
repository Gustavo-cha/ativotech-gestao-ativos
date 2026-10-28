import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Esconde o botão "N" do modo de desenvolvimento, que ficava por cima do rodapé do menu lateral
  devIndicators: false,
  // Define a pasta "web" como raiz do projeto (evita aviso por causa do package.json da pasta principal).
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) }
};

export default nextConfig;
