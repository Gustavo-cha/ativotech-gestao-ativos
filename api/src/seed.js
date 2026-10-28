// Restaura os dados de exemplo (equipamentos, estoque e solicitações): npm run seed
// Usuários, licenças e sessões são mantidos. Para criar o administrador inicial: npm run criar-admin
require('./config');
const db = require('./db');

db.reset();
console.log(`Dados de exemplo restaurados em ${db.DATA_FILE} (usuários mantidos).`);
