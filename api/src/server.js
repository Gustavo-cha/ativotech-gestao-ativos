const config = require('./config'); // carrega api/.env antes de tudo
const { createApp } = require('./app');
const { enderecosRede, ehLocal } = require('./rede');

const servidor = createApp().listen(config.porta, config.apiHost, () => {
  console.log(`Ativos Tech API em http://${config.apiHost}:${config.porta}/api (acessada pelo site, em /api)`);
  const rede = enderecosRede(config.portaWeb).filter((e) => !e.virtual);
  if (rede.length) {
    console.log('Endereço para outras pessoas abrirem o sistema (mesma rede):');
    for (const e of rede) console.log(`   ${e.endereco}`);
  }
  if (ehLocal(config.appUrl)) {
    console.log('Aviso: APP_URL está como "localhost". Os links dos e-mails e o login Microsoft só funcionam neste computador.');
    console.log('       Defina APP_URL no arquivo api/.env com o endereço que as pessoas usam (ex.: um dos endereços acima).');
  }
});
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`A porta ${config.porta} já está em uso — o Ativos Tech já está aberto em outra janela?`);
  else console.error(e);
  process.exit(1);
});
