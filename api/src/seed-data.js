// Dados de exemplo. As datas são relativas ao dia de hoje, para que a agenda,
// os alertas, as admissões e os envios sempre pareçam "vivos" ao abrir o projeto.
const crypto = require('crypto');
const { toISODate } = require('./domain');
const config = require('./config');

const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
const hora = (h) => new Date(Date.now() + h * 3600000).toISOString();
const id = () => crypto.randomUUID();

module.exports = function gerarSeed() {
  const agora = new Date().toISOString();
  const A = (o) => ({ id: id(), marca: '', modelo: '', numeroSerie: '', responsavel: '', departamento: '', localizacao: '',
    observacoes: '', hostname: '', sistemaOperacional: '', ip: '', fornecedor: '', notaFiscal: '', tags: [],
    criadoEm: agora, atualizadoEm: agora, ...o });

  const ativos = [
    A({ patrimonio: 'TI-0001', nome: 'Notebook Dell Latitude 5440', categoria: 'Notebook', marca: 'Dell', modelo: 'Latitude 5440', numeroSerie: 'DL5440-8H2K91', status: 'Em uso', responsavel: 'Ana Ribeiro', departamento: 'Financeiro', localizacao: 'Matriz · 3º andar', dataAquisicao: dia(-610), valor: 6899.9, garantiaAte: dia(485), hostname: 'NB-FIN-ARIBEIRO', sistemaOperacional: 'Windows 11 Pro', ip: '10.10.3.21', fornecedor: 'Dell Brasil', notaFiscal: 'NF 48.211', tags: ['BitLocker', 'VIP'], observacoes: 'Criptografia BitLocker ativa.', statusDesde: hora(-24 * 400) }),
    A({ patrimonio: 'TI-0002', nome: 'Notebook Lenovo ThinkPad T14', categoria: 'Notebook', marca: 'Lenovo', modelo: 'ThinkPad T14 Gen 4', numeroSerie: 'LNT14-PF4X2Z', status: 'Em uso', responsavel: 'Bruno Costa', departamento: 'Auditoria', localizacao: 'Home office', dataAquisicao: dia(-420), valor: 7450, garantiaAte: dia(675), hostname: 'NB-AUD-BCOSTA', sistemaOperacional: 'Windows 11 Pro', ip: '10.10.4.37', fornecedor: 'Lenovo', notaFiscal: 'NF 51.902', tags: ['Remoto'], statusDesde: hora(-24 * 300) }),
    A({ patrimonio: 'TI-0003', nome: 'Monitor LG 27" 4K', categoria: 'Monitor', marca: 'LG', modelo: '27UP850', numeroSerie: 'LG27-114ZRT', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI', dataAquisicao: dia(-320), valor: 2199, garantiaAte: dia(45), fornecedor: 'Kabum Empresas', notaFiscal: 'NF 3.877', observacoes: 'Na caixa, pronto para entrega.', statusDesde: hora(-24 * 30) }),
    A({ patrimonio: 'TI-0004', nome: 'iPhone 15', categoria: 'Smartphone', marca: 'Apple', modelo: 'iPhone 15 128GB', numeroSerie: 'F2LXQ8HJKP', status: 'Em uso', responsavel: 'Carla Mendes', departamento: 'Comercial', localizacao: 'Matriz · 2º andar', dataAquisicao: dia(-280), valor: 5299, garantiaAte: dia(85), sistemaOperacional: 'iOS 19', fornecedor: 'Apple Store', tags: ['MDM'], observacoes: 'Gerenciado via MDM.', statusDesde: hora(-24 * 270) }),
    A({ patrimonio: 'TI-0005', nome: 'Switch Cisco 48 portas', categoria: 'Rede', marca: 'Cisco', modelo: 'Catalyst 9200L-48P', numeroSerie: 'FOC2544X0AB', status: 'Em uso', responsavel: 'Equipe de Infraestrutura', departamento: 'TI', localizacao: 'Rack principal', dataAquisicao: dia(-1210), valor: 18900, garantiaAte: dia(615), hostname: 'SW-CORE-03', ip: '10.10.0.2', fornecedor: 'Cisco Partner', tags: ['Crítico', 'Core'], statusDesde: hora(-24 * 1200) }),
    A({ patrimonio: 'TI-0006', nome: 'Notebook HP EliteBook 840', categoria: 'Notebook', marca: 'HP', modelo: 'EliteBook 840 G8', numeroSerie: 'HP840-5CG1239', status: 'Em manutenção', departamento: 'TI', localizacao: 'Assistência técnica', dataAquisicao: dia(-1500), valor: 5900, garantiaAte: dia(-405), hostname: 'NB-TI-POOL02', sistemaOperacional: 'Windows 10 Pro', fornecedor: 'HP', observacoes: 'Troca de teclado e bateria.', statusDesde: hora(-24 * 19) }),
    A({ patrimonio: 'TI-0007', nome: 'Impressora Brother Laser', categoria: 'Impressora', marca: 'Brother', modelo: 'HL-L6402DW', numeroSerie: 'BRH6402-77Q', status: 'Em uso', responsavel: 'Recepção', departamento: 'Administrativo', localizacao: 'Matriz · Térreo', dataAquisicao: dia(-1310), valor: 3150, garantiaAte: dia(-580), ip: '10.10.1.50', fornecedor: 'Brother', statusDesde: hora(-24 * 1300) }),
    A({ patrimonio: 'TI-0008', nome: 'Desktop Dell OptiPlex 7010', categoria: 'Desktop', marca: 'Dell', modelo: 'OptiPlex 7010', numeroSerie: 'DLOP7010-3JH8', status: 'Descartado', departamento: 'TI', localizacao: 'Descarte certificado', dataAquisicao: dia(-3600), valor: 3200, garantiaAte: dia(-2500), observacoes: 'Disco sanitizado; laudo de descarte emitido.', statusDesde: hora(-24 * 60) }),
    A({ patrimonio: 'TI-0009', nome: 'Servidor Dell PowerEdge R650', categoria: 'Servidor', marca: 'Dell', modelo: 'PowerEdge R650', numeroSerie: 'PER650-77XQ2', status: 'Em uso', responsavel: 'Equipe de Infraestrutura', departamento: 'TI', localizacao: 'Datacenter · Rack A2', dataAquisicao: dia(-900), valor: 68500, garantiaAte: dia(195), hostname: 'SRV-HV-01', sistemaOperacional: 'Windows Server 2022', ip: '10.10.0.10', fornecedor: 'Dell Brasil', notaFiscal: 'NF 39.004', tags: ['Crítico', 'Hyper-V'], statusDesde: hora(-24 * 890) }),
    A({ patrimonio: 'TI-0010', nome: 'MacBook Air M3', categoria: 'Notebook', marca: 'Apple', modelo: 'MacBook Air 13" M3', numeroSerie: 'C02MBA3X91', status: 'Em uso', responsavel: 'Diego Alves', departamento: 'Marketing', localizacao: 'Matriz · 2º andar', dataAquisicao: dia(-150), valor: 11999, garantiaAte: dia(215), hostname: 'MB-MKT-DALVES', sistemaOperacional: 'macOS 16', ip: '10.10.2.44', fornecedor: 'Apple Store', tags: ['Design'], statusDesde: hora(-24 * 148) }),
    A({ patrimonio: 'TI-0011', nome: 'iPad 10ª geração', categoria: 'Tablet', marca: 'Apple', modelo: 'iPad 10 64GB', numeroSerie: 'DMPXK2HQ1', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI', dataAquisicao: dia(-200), valor: 3499, garantiaAte: dia(165), sistemaOperacional: 'iPadOS 19', fornecedor: 'Apple Store', tags: ['MDM'], statusDesde: hora(-24 * 10) }),
    A({ patrimonio: 'TI-0012', nome: 'Firewall Fortinet 60F', categoria: 'Rede', marca: 'Fortinet', modelo: 'FortiGate 60F', numeroSerie: 'FGT60FTK2209', status: 'Em uso', responsavel: 'Equipe de Infraestrutura', departamento: 'TI', localizacao: 'Rack principal', dataAquisicao: dia(-700), valor: 9800, garantiaAte: dia(28), hostname: 'FW-EDGE-01', ip: '10.10.0.1', fornecedor: 'Fortinet Partner', tags: ['Crítico', 'Segurança'], observacoes: 'Licença FortiGuard renova junto com a garantia.', statusDesde: hora(-24 * 690) }),
    A({ patrimonio: 'TI-0013', nome: 'Desktop Lenovo ThinkCentre M70q', categoria: 'Desktop', marca: 'Lenovo', modelo: 'ThinkCentre M70q Gen 4', numeroSerie: 'LNM70Q-5521', status: 'Em uso', responsavel: 'Fernanda Lima', departamento: 'Recursos Humanos', localizacao: 'Matriz · 1º andar', dataAquisicao: dia(-500), valor: 4890, garantiaAte: dia(595), hostname: 'DT-RH-FLIMA', sistemaOperacional: 'Windows 11 Pro', ip: '10.10.1.88', fornecedor: 'Lenovo', statusDesde: hora(-24 * 490) }),
    A({ patrimonio: 'TI-0014', nome: 'Headset Jabra Evolve2 65', categoria: 'Periférico', marca: 'Jabra', modelo: 'Evolve2 65', numeroSerie: 'JB65-11920', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI', dataAquisicao: dia(-90), valor: 1290, garantiaAte: dia(640), fornecedor: 'Kabum Empresas', statusDesde: hora(-24 * 90) }),
    A({ patrimonio: 'TI-0015', nome: 'Notebook Dell Vostro 3520', categoria: 'Notebook', marca: 'Dell', modelo: 'Vostro 3520', numeroSerie: 'DLV3520-0P9', status: 'Em manutenção', departamento: 'Comercial', localizacao: 'Bancada TI', dataAquisicao: dia(-1700), valor: 3899, garantiaAte: dia(-600), hostname: 'NB-COM-POOL05', sistemaOperacional: 'Windows 10 Pro', fornecedor: 'Dell Brasil', observacoes: 'SSD com setores defeituosos.', statusDesde: hora(-24 * 4) }),
    A({ patrimonio: 'TI-0016', nome: 'Monitor Samsung 24"', categoria: 'Monitor', marca: 'Samsung', modelo: 'S24R350', numeroSerie: 'SMS24-87AQ', status: 'Em uso', responsavel: 'Bruno Costa', departamento: 'Auditoria', localizacao: 'Home office', dataAquisicao: dia(-800), valor: 899, garantiaAte: dia(-70), fornecedor: 'Kabum Empresas', statusDesde: hora(-24 * 400) }),
    // Notebooks do estoque (usados pelo portal de solicitações)
    A({ patrimonio: 'TI-0017', nome: 'Notebook Dell Latitude 5450', categoria: 'Notebook', marca: 'Dell', modelo: 'Latitude 5450', numeroSerie: 'DL5450-2KQ771', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI · Matriz', dataAquisicao: dia(-40), dataEntradaEstoque: dia(-38), valor: 7290, garantiaAte: dia(1055), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Dell Brasil', notaFiscal: 'NF 61.020', tags: ['Estoque'], statusDesde: hora(-24 * 38) }),
    A({ patrimonio: 'TI-0018', nome: 'Notebook Dell Latitude 5450', categoria: 'Notebook', marca: 'Dell', modelo: 'Latitude 5450', numeroSerie: 'DL5450-2KQ772', status: 'Disponível', departamento: 'TI', localizacao: 'Bancada TI · Matriz', dataAquisicao: dia(-40), dataEntradaEstoque: dia(-38), valor: 7290, garantiaAte: dia(1055), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Dell Brasil', notaFiscal: 'NF 61.020', tags: ['Estoque'], statusDesde: hora(-24 * 38) }),
    A({ patrimonio: 'TI-0019', nome: 'Notebook Lenovo ThinkPad E14', categoria: 'Notebook', marca: 'Lenovo', modelo: 'ThinkPad E14 Gen 6', numeroSerie: 'LNE14-77PZQ1', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI · Matriz', dataAquisicao: dia(-25), dataEntradaEstoque: dia(-22), valor: 5690, garantiaAte: dia(705), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Lenovo', notaFiscal: 'NF 62.115', tags: ['Estoque'], statusDesde: hora(-24 * 22) }),
    A({ patrimonio: 'TI-0020', nome: 'Notebook Lenovo ThinkPad E14', categoria: 'Notebook', marca: 'Lenovo', modelo: 'ThinkPad E14 Gen 6', numeroSerie: 'LNE14-77PZQ2', status: 'Disponível', departamento: 'TI', localizacao: 'Filial Campinas', dataAquisicao: dia(-25), dataEntradaEstoque: dia(-20), valor: 5690, garantiaAte: dia(705), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Lenovo', notaFiscal: 'NF 62.115', tags: ['Estoque'], statusDesde: hora(-24 * 20) }),
    A({ patrimonio: 'TI-0021', nome: 'Notebook Dell Latitude 5450', categoria: 'Notebook', marca: 'Dell', modelo: 'Latitude 5450', numeroSerie: 'DL5450-2KQ760', status: 'Em uso', responsavel: 'Rafaela Souza', departamento: 'Contabilidade', localizacao: 'Matriz · 3º andar', dataAquisicao: dia(-60), dataEntradaEstoque: dia(-58), valor: 7290, garantiaAte: dia(1035), hostname: 'NB-CTB-RSOUZA', sistemaOperacional: 'Windows 11 Pro', ip: '10.10.3.40', fornecedor: 'Dell Brasil', notaFiscal: 'NF 60.877', tags: ['BitLocker'], statusDesde: hora(-24 * 12) })
,
    A({ patrimonio: 'TI-0022', nome: 'Monitor Dell 24" P2423', categoria: 'Monitor', marca: 'Dell', modelo: 'P2423', numeroSerie: 'DLP24-0091', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI · Matriz', dataAquisicao: dia(-30), dataEntradaEstoque: dia(-28), valor: 1390, garantiaAte: dia(1065), fornecedor: 'Dell Brasil', tags: ['Estoque'], statusDesde: hora(-24 * 28) }),
    A({ patrimonio: 'TI-0023', nome: 'Monitor Dell 24" P2423', categoria: 'Monitor', marca: 'Dell', modelo: 'P2423', numeroSerie: 'DLP24-0092', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI · Matriz', dataAquisicao: dia(-30), dataEntradaEstoque: dia(-28), valor: 1390, garantiaAte: dia(1065), fornecedor: 'Dell Brasil', tags: ['Estoque'], statusDesde: hora(-24 * 28) }),
    // Estoque da H&CO B2Finance
    A({ patrimonio: 'B2F-0101', nome: 'Notebook Lenovo ThinkPad E14', categoria: 'Notebook', marca: 'Lenovo', modelo: 'ThinkPad E14 Gen 6', numeroSerie: 'LNE14-B2F101', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado B2Finance · Barueri', dataAquisicao: dia(-18), dataEntradaEstoque: dia(-16), valor: 5790, garantiaAte: dia(712), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Lenovo', notaFiscal: 'NF 63.410', tags: ['Estoque'], statusDesde: hora(-24 * 16) }),
    A({ patrimonio: 'B2F-0102', nome: 'Notebook Dell Latitude 5450', categoria: 'Notebook', marca: 'Dell', modelo: 'Latitude 5450', numeroSerie: 'DL5450-B2F102', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado B2Finance · Barueri', dataAquisicao: dia(-18), dataEntradaEstoque: dia(-16), valor: 7290, garantiaAte: dia(1077), sistemaOperacional: 'Windows 11 Pro', fornecedor: 'Dell Brasil', notaFiscal: 'NF 63.411', tags: ['Estoque'], statusDesde: hora(-24 * 16) }),
    A({ patrimonio: 'TI-0024', nome: 'Smartphone Samsung Galaxy A55', categoria: 'Smartphone', marca: 'Samsung', modelo: 'Galaxy A55 128GB', numeroSerie: 'SMA55-7781', status: 'Disponível', departamento: 'TI', localizacao: 'Almoxarifado TI · Matriz', dataAquisicao: dia(-45), dataEntradaEstoque: dia(-44), valor: 2299, garantiaAte: dia(320), fornecedor: 'Samsung', tags: ['MDM', 'Estoque'], statusDesde: hora(-24 * 44) })
  ];
  // Configuração de hardware e entrada no estoque dos notebooks
  const CONFIG = {
    'TI-0001': 'Intel Core i5-1345U · 16 GB RAM · SSD 512 GB · 14"', 'TI-0002': 'AMD Ryzen 7 PRO 7840U · 32 GB RAM · SSD 1 TB · 14"',
    'TI-0006': 'Intel Core i5-1145G7 · 8 GB RAM · SSD 256 GB · 14"', 'TI-0010': 'Apple M3 · 16 GB RAM · SSD 512 GB · 13,6"',
    'TI-0015': 'Intel Core i5-1235U · 8 GB RAM · SSD 256 GB · 15,6"', 'TI-0017': 'Intel Core Ultra 5 135U · 16 GB RAM · SSD 512 GB · 14"',
    'TI-0018': 'Intel Core Ultra 5 135U · 16 GB RAM · SSD 512 GB · 14"', 'TI-0019': 'Intel Core i5-1335U · 16 GB RAM · SSD 512 GB · 14"',
    'TI-0020': 'Intel Core i5-1335U · 16 GB RAM · SSD 512 GB · 14"', 'TI-0021': 'Intel Core Ultra 5 135U · 16 GB RAM · SSD 512 GB · 14"',
    'B2F-0101': 'Intel Core i5-1335U · 16 GB RAM · SSD 512 GB · 14"', 'B2F-0102': 'Intel Core Ultra 5 135U · 16 GB RAM · SSD 512 GB · 14"'
  };
  // Proprietário: a maior parte é da H&CO; alguns equipamentos pertencem à H&CO B2Finance (estoques separados)
  const B2F = new Set(['B2F-0101', 'B2F-0102', 'TI-0024', 'TI-0011']);
  for (const a of ativos) {
    a.configuracao = CONFIG[a.patrimonio] || '';
    a.dataEntradaEstoque ||= a.dataAquisicao || '';
    a.reservadoPara = null;
    a.proprietario = B2F.has(a.patrimonio) ? 'H&CO B2Finance' : 'H&CO';
    a.colaboradorId = null;
  }
  const P = Object.fromEntries(ativos.map((a) => [a.patrimonio, a.id]));
  const A_ = (pat) => ativos.find((a) => a.patrimonio === pat);

  // ---------- Agenda (manutenções, entregas, auditorias) ----------
  const E = (o) => ({ id: id(), hora: '', ativoId: null, responsavel: '', descricao: '', concluido: false, criadoEm: agora, atualizadoEm: agora, ...o });
  const eventos = [
    E({ titulo: 'Preparar kits de admissão da semana', tipo: 'Entrega', data: dia(0), hora: '14:00', responsavel: 'Rafael Souza', descricao: 'Imagem corporativa, etiquetas e checklist de acessórios.' }),
    E({ titulo: 'Coleta da transportadora (Jadlog)', tipo: 'Entrega', data: dia(1), hora: '10:00', responsavel: 'Paula Nunes' }),
    E({ titulo: 'Renovar garantia do firewall', tipo: 'Renovação', data: dia(3), ativoId: P['TI-0012'], responsavel: 'Rafael Souza', descricao: 'Cotar renovação FortiCare + FortiGuard.' }),
    E({ titulo: 'Inventário físico do almoxarifado', tipo: 'Auditoria', data: dia(5), hora: '09:00', responsavel: 'Equipe de TI' }),
    E({ titulo: 'Devolução de notebook — desligamento', tipo: 'Devolução', data: dia(2), hora: '16:30', responsavel: 'Paula Nunes' }),
    E({ titulo: 'Reunião de planejamento de compras Q1', tipo: 'Reunião', data: dia(10), hora: '14:00', responsavel: 'Gestão de TI' }),
    E({ titulo: 'Retirada do notebook na assistência', tipo: 'Devolução', data: dia(-1), ativoId: P['TI-0006'], responsavel: 'Rafael Souza' }),
    E({ titulo: 'Entrega do MacBook — Marketing', tipo: 'Entrega', data: dia(-6), ativoId: P['TI-0010'], responsavel: 'Paula Nunes', concluido: true }),
    E({ titulo: 'Recebimento de notebooks (NF 62.115)', tipo: 'Entrega', data: dia(-22), responsavel: 'Rafael Souza', concluido: true })
  ];

  // ---------- Pessoas citadas nos exemplos ----------
  // São apenas nomes nos registros de exemplo — NÃO são contas de acesso. Nenhum usuário é criado pelos dados de exemplo:
  // o primeiro acesso é o administrador inicial (ADMIN_EMAIL / npm run criar-admin) e os demais são cadastrados por ele.
  const UN = { 'usr-ti': 'Rafael Souza', 'usr-ti2': 'Paula Nunes', 'usr-rh': 'Fernanda Lima', 'usr-rh2': 'Juliana Prado' };
  const usuarios = [];

  // ---------- Itens de estoque por quantidade (acessórios) ----------
  const I = (o) => ({ id: id(), unidade: 'un', reservado: 0, ativo: true, descricao: '', localizacao: 'Almoxarifado TI · Matriz', proprietario: 'H&CO', criadoEm: hora(-24 * 60), atualizadoEm: agora, ...o });
  const estoqueItens = [
    I({ nome: 'Mouse sem fio', categoria: 'Periférico', quantidade: 14, minimo: 5 }),
    I({ nome: 'Teclado sem fio ABNT2', categoria: 'Periférico', quantidade: 9, minimo: 4 }),
    I({ nome: 'Headset USB com microfone', categoria: 'Áudio', quantidade: 3, minimo: 4 }),
    I({ nome: 'Mochila para notebook', categoria: 'Acessório', quantidade: 7, minimo: 3 }),
    I({ nome: 'Dock station USB-C', categoria: 'Acessório', quantidade: 2, minimo: 2 }),
    I({ nome: 'Suporte para notebook', categoria: 'Acessório', quantidade: 6, minimo: 2 }),
    I({ nome: 'Cabo HDMI 2 m', categoria: 'Cabo e adaptador', quantidade: 18, minimo: 6 }),
    I({ nome: 'Adaptador USB-C para HDMI', categoria: 'Cabo e adaptador', quantidade: 4, minimo: 3 }),
    // Estoque da H&CO B2Finance (separado do estoque da H&CO)
    I({ nome: 'Mouse sem fio', categoria: 'Periférico', quantidade: 6, minimo: 2, proprietario: 'H&CO B2Finance', localizacao: 'Almoxarifado B2Finance' }),
    I({ nome: 'Mochila para notebook', categoria: 'Acessório', quantidade: 4, minimo: 2, proprietario: 'H&CO B2Finance', localizacao: 'Almoxarifado B2Finance' })
  ];
  const IT = Object.fromEntries(estoqueItens.filter((i) => i.proprietario === 'H&CO').map((i) => [i.nome, i]));

  // ---------- Movimentações iniciais (entradas) ----------
  const M = (h, o) => ({ id: id(), em: hora(-h), itemId: null, ativoId: null, proprietario: 'H&CO', quantidade: 1, saldoApos: null, disponivelApos: null, motivo: '', solicitacaoId: null, numero: null, usuario: 'Rafael Souza', ...o });
  const movimentacoes = [
    ...estoqueItens.map((i) => M(24 * 60, { tipo: 'entrada', alvo: 'item', itemId: i.id, nome: i.nome, proprietario: i.proprietario, quantidade: i.quantidade + (i.nome === 'Mouse sem fio' ? 1 : 0), motivo: 'Saldo inicial', saldoApos: i.quantidade + (i.nome === 'Mouse sem fio' ? 1 : 0) })),
    ...['TI-0017', 'TI-0018', 'TI-0021'].map((pat) => M(24 * 38, { tipo: 'entrada', alvo: 'ativo', ativoId: P[pat], nome: `${pat} · Notebook Dell Latitude 5450`, motivo: 'NF 61.020' })),
    ...['TI-0019', 'TI-0020'].map((pat) => M(24 * 22, { tipo: 'entrada', alvo: 'ativo', ativoId: P[pat], nome: `${pat} · Notebook Lenovo ThinkPad E14`, motivo: 'NF 62.115' })),
    ...['TI-0022', 'TI-0023'].map((pat) => M(24 * 28, { tipo: 'entrada', alvo: 'ativo', ativoId: P[pat], nome: `${pat} · Monitor Dell 24" P2423`, motivo: 'Compra' }))
  ];

  // ---------- Solicitações de equipamentos ----------
  let seqSol = 1000;
  const endSP = { modalidade: 'envio', unidade: '', cep: '04538133', logradouro: 'Av. Brigadeiro Faria Lima', numero: '3477', complemento: 'Apto 82', bairro: 'Itaim Bibi', cidade: 'São Paulo', uf: 'SP', destinatario: '', telefone: '11987654321' };
  const retirada = (unidade) => ({ modalidade: 'retirada', unidade, cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', destinatario: '', telefone: '' });
  const nb = (ativoIds = [], especificacao = '') => ({ id: id(), tipo: 'ativo', categoria: 'Notebook', proprietario: 'H&CO', quantidade: 1, especificacao, ativoIds });
  const at = (categoria, ativoIds = [], quantidade = 1) => ({ id: id(), tipo: 'ativo', categoria, proprietario: 'H&CO', quantidade, especificacao: '', ativoIds });
  const ac = (nome, quantidade = 1, reservado = 0, enviado = 0) => ({ id: id(), tipo: 'acessorio', itemId: IT[nome].id, nome, proprietario: 'H&CO', quantidade, reservado, enviado });
  const S = (o) => {
    const criadoEm = hora(-(o.criadoHa ?? 2));
    const u = o.usuario || 'usr-rh';
    const sol = {
      id: id(), numero: `SOL-${++seqSol}`, solicitanteId: u, solicitanteNome: UN[u], abertoPorId: u, abertoPorNome: UN[u],
      tipo: 'Nova admissão', equipamentoAtual: '', observacoes: '', previsaoEntrega: '', envio: null, rejeitada: false, motivoCancelamento: '',
      proprietario: 'H&CO', emailColaborador: '', colaboradorId: null,
      vistaPorTI: { em: hora(-(o.criadoHa ?? 2) + 0.2), por: UN['usr-ti'] }, notasInternas: [], criadoEm, atualizadoEm: criadoEm, ...o
    };
    sol.entrega = { ...sol.entrega, destinatario: sol.entrega.destinatario || (sol.entrega.modalidade === 'envio' ? o.nomeAdmitido : '') };
    delete sol.criadoHa; delete sol.usuario;
    sol.atualizacoes = [{ id: id(), tipo: 'status', status: 'Pendente', autor: UN[u], autorPerfil: 'rh', texto: 'Solicitação registrada e enviada para a equipe de TI.', em: criadoEm, publico: true },
      ...(o.atualizacoes || []).map((x) => ({ id: id(), publico: true, autor: UN['usr-ti'], autorPerfil: 'ti', tipo: 'status', ...x }))];
    return sol;
  };
  const solicitacoes = [
    S({ nomeAdmitido: 'Marina Costa', departamento: 'Financeiro', cargo: 'Analista Contábil Pleno', dataAdmissao: dia(12), entrega: { ...endSP }, status: 'Pendente', vistaPorTI: null, criadoHa: 3,
      itens: [nb([], '16 GB de RAM (planilhas grandes)'), ac('Mouse sem fio'), ac('Mochila para notebook')], observacoes: 'Usará Excel com muitos dados (fechamento mensal).' }),
    S({ nomeAdmitido: 'Pedro Henrique Alves', departamento: 'Auditoria', cargo: 'Auditor Júnior', dataAdmissao: dia(6), entrega: retirada('Matriz · São Paulo (recepção da TI)'), status: 'Em análise', criadoHa: 30,
      itens: [nb(), at('Monitor')],
      atualizacoes: [{ status: 'Em análise', texto: 'Verificando disponibilidade de modelo com 16 GB.', em: hora(-20) }] }),
    S({ nomeAdmitido: 'Lucas Martins', departamento: 'Comercial', cargo: 'Executivo de Contas', dataAdmissao: dia(4), entrega: { ...endSP, cep: '13015904', logradouro: 'Rua Barão de Jaguara', numero: '1481', complemento: 'Sala 12', bairro: 'Centro', cidade: 'Campinas', telefone: '19991234567' },
      status: 'Em preparação', previsaoEntrega: dia(3), criadoHa: 70, itens: [nb([P['TI-0017']]), ac('Mouse sem fio', 1, 1), ac('Headset USB com microfone', 1, 1)],
      atualizacoes: [{ status: 'Em análise', texto: 'Pedido em análise.', em: hora(-60) }, { status: 'Em preparação', texto: 'Notebook TI-0017 reservado. Imagem corporativa sendo instalada.', em: hora(-40) }],
      notasInternas: [{ id: id(), autor: UN['usr-ti'], texto: 'Instalar Salesforce e VPN do cliente.', em: hora(-40) }] }),
    S({ nomeAdmitido: 'Camila Rocha', departamento: 'Marketing', cargo: 'Analista de Marketing', dataAdmissao: dia(2), entrega: { ...endSP, cep: '22041001', logradouro: 'Av. Nossa Senhora de Copacabana', numero: '680', complemento: '', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ', telefone: '21998887766' },
      status: 'Enviado', previsaoEntrega: dia(1), criadoHa: 120, itens: [nb([P['TI-0018']]), ac('Mouse sem fio', 1, 0, 1)],
      envio: { transportadora: 'Jadlog', codigoRastreio: '10084512345678', dataEnvio: dia(-1), entregueEm: '', recebidoPor: '' },
      atualizacoes: [{ status: 'Em preparação', texto: 'Notebook TI-0018 reservado.', em: hora(-100) },
        { status: 'Enviado', texto: 'Enviado pela Jadlog. Rastreio 10084512345678.', em: hora(-20) }] }),
    S({ nomeAdmitido: 'Rafaela Souza', departamento: 'Contabilidade', cargo: 'Assistente Contábil', dataAdmissao: dia(-12), entrega: retirada('Matriz · São Paulo (recepção da TI)'), status: 'Entregue', previsaoEntrega: dia(-13), criadoHa: 24 * 20,
      itens: [nb([P['TI-0021']])], envio: { transportadora: '', codigoRastreio: '', dataEnvio: '', entregueEm: hora(-24 * 12), recebidoPor: 'Rafaela Souza' },
      atualizacoes: [{ status: 'Em preparação', texto: 'Notebook reservado.', em: hora(-24 * 18) }, { status: 'Entregue', texto: 'Retirado pela colaboradora no primeiro dia.', em: hora(-24 * 12) }] }),
    S({ usuario: 'usr-rh2', nomeAdmitido: 'Thiago Nogueira', departamento: 'Design', cargo: 'Designer Sênior', dataAdmissao: dia(15), entrega: { ...endSP, cep: '13087000', logradouro: 'Av. Dr. Romeu Tórtima', numero: '200', complemento: 'Casa 3', bairro: 'Barão Geraldo', cidade: 'Campinas', telefone: '' },
      tipo: 'Outra necessidade', status: 'Aguardando estoque', observacoes: 'Precisa de MacBook Pro para softwares de design.', criadoHa: 50, itens: [nb([], 'MacBook Pro 14"'), ac('Dock station USB-C')],
      atualizacoes: [{ status: 'Aguardando estoque', texto: 'Sem MacBook Pro em estoque. Compra solicitada ao fornecedor.', em: hora(-26) }] }),
    S({ usuario: 'usr-rh2', nomeAdmitido: 'Bianca Ferreira', departamento: 'Comercial', cargo: 'Coordenadora Comercial', dataAdmissao: dia(9), entrega: retirada('Matriz · São Paulo (recepção da TI)'), tipo: 'Substituição de equipamento', equipamentoAtual: 'TI-0002 (ThinkPad T14)',
      status: 'Cancelado', rejeitada: true, motivoCancelamento: 'O equipamento atual está dentro do ciclo de vida e em bom estado.', criadoHa: 90, itens: [nb()],
      atualizacoes: [{ status: 'Cancelado', texto: 'Rejeitada: o equipamento atual está dentro do ciclo de vida e em bom estado.', em: hora(-60) }] }),
    S({ usuario: 'usr-rh2', nomeAdmitido: 'Bruno Teixeira', departamento: 'Jurídico', cargo: 'Advogado Pleno', dataAdmissao: dia(8), entrega: { ...endSP, cep: '01310100', logradouro: 'Av. Paulista', numero: '1578', complemento: '10º andar', bairro: 'Bela Vista', telefone: '11955554444' },
      status: 'Pendente', vistaPorTI: null, criadoHa: 0.4, itens: [nb(), ac('Teclado sem fio ABNT2'), ac('Mouse sem fio'), ac('Suporte para notebook')] })
  ];

  // Reservas ativas apontam de volta para a solicitação; acessórios reservados e enviados ajustam o estoque
  for (const s of solicitacoes) {
    for (const l of s.itens) {
      if (l.tipo === 'ativo' && !['Entregue', 'Cancelado'].includes(s.status)) for (const aid of l.ativoIds) A_(ativos.find((a) => a.id === aid).patrimonio).reservadoPara = s.id;
      if (l.tipo === 'acessorio') IT[l.nome].reservado += l.reservado;
    }
  }
  movimentacoes.unshift(
    M(20, { tipo: 'envio', alvo: 'item', itemId: IT['Mouse sem fio'].id, nome: 'Mouse sem fio', quantidade: 1, motivo: 'Envio Jadlog', solicitacaoId: solicitacoes[3].id, numero: solicitacoes[3].numero, saldoApos: IT['Mouse sem fio'].quantidade }),
    M(20, { tipo: 'envio', alvo: 'ativo', ativoId: P['TI-0018'], nome: 'TI-0018 · Notebook Dell Latitude 5450', motivo: 'Jadlog', solicitacaoId: solicitacoes[3].id, numero: solicitacoes[3].numero }),
    M(40, { tipo: 'reserva', alvo: 'ativo', ativoId: P['TI-0017'], nome: 'TI-0017 · Notebook Dell Latitude 5450', solicitacaoId: solicitacoes[2].id, numero: solicitacoes[2].numero })
  );
  movimentacoes.sort((a, b) => b.em.localeCompare(a.em));

  // ---------- Colaboradores (quem recebe os equipamentos) ----------
  const C = (o) => ({ id: id(), cargo: '', departamento: '', empresa: 'H&CO', matricula: '', telefone: '', localidade: '', observacoes: '', ativo: true, criadoEm: agora, atualizadoEm: agora, ...o });
  const colaboradores = [
    C({ nome: 'Rafaela Souza', email: 'rafaela.souza@hco.com', cargo: 'Assistente Contábil', departamento: 'Contabilidade', localidade: 'Matriz · Barueri' }),
    C({ nome: 'Lucas Martins', email: 'lucas.martins@hco.com', cargo: 'Executivo de Contas', departamento: 'Comercial', localidade: 'Campinas/SP' })
  ];
  A_('TI-0021').colaboradorId = colaboradores[0].id;
  solicitacoes[4].emailColaborador = colaboradores[0].email;
  solicitacoes[4].colaboradorId = colaboradores[0].id;
  solicitacoes[2].emailColaborador = colaboradores[1].email;
  solicitacoes[0].emailColaborador = 'marina.costa@hco.com';

  // ---------- Histórico (auditoria) ----------
  const H = (h, o) => ({ id: id(), em: hora(-h), usuario: UN['usr-ti'], detalhe: '', ...o });
  const historico = [
    H(0.4, { acao: 'solicitou', entidade: 'solicitacao', entidadeId: solicitacoes[7].id, titulo: `${solicitacoes[7].numero} · Bruno Teixeira`, usuario: UN['usr-rh2'], perfil: 'rh', detalhe: 'Nova admissão' }),
    H(3, { acao: 'solicitou', entidade: 'solicitacao', entidadeId: solicitacoes[0].id, titulo: `${solicitacoes[0].numero} · Marina Costa`, usuario: UN['usr-rh'], perfil: 'rh', detalhe: 'Nova admissão' }),
    H(20, { acao: 'enviou', entidade: 'solicitacao', entidadeId: solicitacoes[3].id, titulo: `${solicitacoes[3].numero} · Camila Rocha`, detalhe: 'Jadlog · 10084512345678' }),
    H(40, { acao: 'atualizou', entidade: 'solicitacao', entidadeId: solicitacoes[2].id, titulo: `${solicitacoes[2].numero} · Lucas Martins`, detalhe: 'Status: Em análise → Em preparação' }),
    H(96, { acao: 'moveu', entidade: 'ativo', entidadeId: P['TI-0015'], titulo: 'TI-0015 · Notebook Dell Vostro 3520', detalhe: 'Status: Em uso → Em manutenção' }),
    H(24 * 12, { acao: 'entregou', entidade: 'solicitacao', entidadeId: solicitacoes[4].id, titulo: `${solicitacoes[4].numero} · Rafaela Souza`, detalhe: 'TI-0021 entregue' }),
    H(24 * 22, { acao: 'criou', entidade: 'ativo', entidadeId: P['TI-0019'], titulo: 'TI-0019 · Notebook Lenovo ThinkPad E14' })
  ];

  return {
    versao: 6, ativos, eventos, historico, usuarios, sessoes: [], solicitacoes, estoqueItens, movimentacoes, conferencias: [], notificacoes: [], colaboradores, importacoes: [],
    config: { licencas: { total: config.licencasIniciais } }, seq: { solicitacao: seqSol }
  };
};
