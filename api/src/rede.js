// Endereços pelos quais o servidor pode ser acessado na rede local (para mostrar ao administrador).
const os = require('os');

function enderecosRede(porta) {
  const lista = [];
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue; // loopback e IP automático sem rede
      // Adaptadores virtuais (WSL, Hyper-V, Docker, VirtualBox, VPN) não servem para outras pessoas
      const virtual = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|br-|veth|Loopback|tun|tap|utun/i.test(nome);
      lista.push({ interface: nome, endereco: `http://${i.address}:${porta}`, virtual });
    }
  }
  return lista.sort((a, b) => Number(a.virtual) - Number(b.virtual));
}

const ehLocal = (url) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(url || '');

module.exports = { enderecosRede, ehLocal };
