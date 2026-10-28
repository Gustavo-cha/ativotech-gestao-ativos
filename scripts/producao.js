// Inicia o Ativos Tech em modo servidor (produção): API + site, num único comando.
//   • O site fica aberto na rede (0.0.0.0:WEB_PORT) — é o endereço que as pessoas usam.
//   • A API fica só no próprio servidor (127.0.0.1:PORT); o site repassa /api para ela.
//   • Um único banco de dados (api/data/db.json) atende todos os computadores.
// Se um dos dois parar, o outro também é encerrado (para um gerenciador de serviço reiniciar tudo).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const web = path.join(raiz, 'web');
const portaWeb = process.env.WEB_PORT || '3000';

if (!fs.existsSync(path.join(web, '.next', 'BUILD_ID'))) {
  console.error('O site ainda não foi preparado para produção. Rode primeiro:  npm run build   (ou use  npm run servidor)');
  process.exit(1);
}
const nextBin = require.resolve('next/dist/bin/next', { paths: [web] });

const filhos = [];
let encerrando = false;
function iniciar(nome, args, cwd) {
  const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' } });
  const prefixar = (s) => (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => s.write(`[${nome}] ${l}\n`));
  p.stdout.on('data', prefixar(process.stdout));
  p.stderr.on('data', prefixar(process.stderr));
  p.on('exit', (codigo) => {
    if (encerrando) return;
    console.error(`[${nome}] parou (código ${codigo}). Encerrando o Ativos Tech.`);
    parar(codigo || 1);
  });
  filhos.push(p);
}
function parar(codigo = 0) {
  encerrando = true;
  for (const p of filhos) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(codigo), 500);
}
process.on('SIGINT', () => parar(0));
process.on('SIGTERM', () => parar(0));

iniciar('API', [path.join('src', 'server.js')], path.join(raiz, 'api'));
iniciar('WEB', [nextBin, 'start', '-H', process.env.WEB_HOST || '0.0.0.0', '-p', portaWeb], web);
