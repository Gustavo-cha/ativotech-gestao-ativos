// Cria o primeiro Operador administrador (ou recupera o acesso de um existente) — npm run criar-admin
// A senha é digitada sem aparecer na tela e só o hash (scrypt) é gravado.
// Pode ser usado com a API rodando: ela detecta a alteração no arquivo de dados e recarrega antes do próximo login.
const readline = require('readline');
const config = require('./config');

let linhas = null; // entrada redirecionada (sem terminal): lê linha a linha, sem perder nenhuma

function perguntar(rl, texto, { oculto = false, padrao = '' } = {}) {
  if (!rl.terminal) {
    rl.output.write(`${texto}${padrao ? ` [${padrao}]` : ''}: `);
    return linhas.next().then(({ value = '' }) => { rl.output.write('\n'); return oculto ? value : value.trim() || padrao; });
  }
  return new Promise((resolve) => {
    if (!oculto) return rl.question(`${texto}${padrao ? ` [${padrao}]` : ''}: `, (r) => resolve(r.trim() || padrao));
    const saida = rl.output;
    const escrever = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) saida.write(s); else saida.write('*'.repeat(s.length ? 1 : 0)); };
    rl.question(`${texto}: `, (r) => { rl._writeToOutput = escrever; saida.write('\n'); resolve(r); });
  });
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  if (!rl.terminal) linhas = rl[Symbol.asyncIterator]();
  try {
    console.log('\nAtivos Tech — administrador inicial (Operador TI com permissão administrativa)\n');
    const email = (await perguntar(rl, 'E-mail corporativo', { padrao: config.admin.email })).toLowerCase();
    const nome = await perguntar(rl, 'Nome completo', { padrao: config.admin.nome });
    const senha = await perguntar(rl, 'Senha inicial (temporária)', { oculto: true });
    const confirma = await perguntar(rl, 'Confirme a senha', { oculto: true });
    if (senha !== confirma) throw new Error('As senhas não conferem.');

    const db = require('./db');
    const { criarAdministrador } = require('./administrador');
    const existe = db.list('usuarios').some((u) => u.email === email);
    let redefinir = false;
    if (existe) {
      const r = await perguntar(rl, `${email} já existe. Redefinir a senha e garantir acesso de administrador? (s/N)`);
      if (!/^s/i.test(r)) { console.log('Nada foi alterado.'); return; }
      redefinir = true;
    }
    const r = criarAdministrador({ email, nome, senha, redefinir });
    console.log(`\n✔ ${r.criado ? 'Administrador criado' : 'Acesso recuperado'}: ${r.usuario.email}`);
    console.log('  Perfil: Operador (TI) · permissão administrativa · licença ativa');
    console.log('  No primeiro acesso, o sistema vai pedir para trocar a senha.');
    console.log(`  Arquivo de dados: ${db.DATA_FILE}\n`);
  } catch (e) {
    console.error(`\n✖ ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();
