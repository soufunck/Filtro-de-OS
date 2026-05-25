const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('excel-file');
const btnReset = document.getElementById('btn-reset');
const tooltipEl = document.getElementById('custom-tooltip');

let dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], outros: [], auditoria: [] };
let repositorioCompletoPorID = {};

let itemArrastadoContexto = null;
let cardSendoArrastado = null;
let linhaSendoArrastada = null;
let historicoModificacoes = [];

let filtroHistoricoAtivo = 'todos';

let itensSelecionadosLote = [];

// 
// LOGS
// 

function registrarAcaoHistorico(tipo, idItem, detalhe, dadosOriginais = null) {
    const agora = new Date().toLocaleTimeString('pt-BR');
    const acao = {
        hora: agora,
        tipo: tipo,
        id: idItem,
        detalhe: detalhe,
        dadosOriginais: dadosOriginais,
        revertido: false
    };

    historicoModificacoes.unshift(acao);
    atualizarPainelModificacoesUI();
    salvarEstadoLocal();
}

function atualizarPainelModificacoesUI() {
    const listaUI = document.getElementById('lista-modificacoes');
    const contadorUI = document.getElementById('mod-counter-badge');
    if (!listaUI) return;

    const modificacoesAtivas = historicoModificacoes.filter(a => a.tipo !== 'upload' && !a.revertido).length;
    if (contadorUI) {
        contadorUI.innerText = modificacoesAtivas;
        contadorUI.style.display = modificacoesAtivas > 0 ? 'inline-block' : 'none';
    }

    if (historicoModificacoes.length === 0) {
        listaUI.innerHTML = '<div class="no-actions">Nenhuma modificação feita ainda.</div>';
        return;
    }

    const campoBusca = document.getElementById('search-historico');
    const termoBusca = campoBusca ? campoBusca.value.toLowerCase().trim() : '';

    const logsFiltrados = historicoModificacoes.filter(acao => {
        const correspondeTipo = (filtroHistoricoAtivo === 'todos' || acao.tipo === filtroHistoricoAtivo);
        const correspondeBusca = acao.id.toLowerCase().includes(termoBusca) || acao.detalhe.toLowerCase().includes(termoBusca);
        return correspondeTipo && correspondeBusca;
    });

    if (logsFiltrados.length === 0) {
        listaUI.innerHTML = '<div class="no-actions">Nenhum registro corresponde ao filtro aplicado.</div>';
        return;
    }

    listaUI.innerHTML = logsFiltrados.map((acao) => {
        const indexReal = historicoModificacoes.indexOf(acao);

        let elementoAcaoDireta = '';
        let classeRevertido = acao.revertido ? 'mod-item-revertido' : '';

        if (acao.revertido) {
            elementoAcaoDireta = `<span class="badge-revertido-status">↩ Desfeito</span>`;
        } else if (acao.tipo === 'excluir') {
            elementoAcaoDireta = `<button class="btn-desfazer-acao" onclick="reverterExclusaoCliente(${indexReal})">↩ Desfazer</button>`;
        }

        return `
            <div class="modificacao-item ${classeRevertido}">
                <div class="mod-item-meta">
                    <span class="mod-hora">[${acao.hora}]</span>
                    <span class="mod-tag mod-${acao.tipo}">${acao.tipo.toUpperCase()}</span>
                </div>
                <div class="mod-item-corpo">
                    <p>Item <b>#${acao.id}</b>: ${acao.detalhe}</p>
                    ${elementoAcaoDireta}
                </div>
            </div>
        `;
    }).join('');
}

function filtrarTipoHistórico(tipo, botao) {
    filtroHistoricoAtivo = tipo;
    document.querySelectorAll('.btn-filter-mod').forEach(btn => btn.classList.remove('active'));
    botao.classList.add('active');
    atualizarPainelModificacoesUI();
}

function reverterExclusaoCliente(indexHistorico) {
    const acao = historicoModificacoes[indexHistorico];
    if (!acao || !acao.dadosOriginais || acao.revertido) return;

    const clienteRecuperado = acao.dadosOriginais;
    const colunaDestino = clienteRecuperado._colunaOriginal;

    const clienteParaInserir = { ...clienteRecuperado };
    delete clienteParaInserir._colunaOriginal;
    dadosGlobaisProcessados[colunaDestino].push(clienteParaInserir);

    acao.revertido = true;

    registrarAcaoHistorico('editar', clienteRecuperado.id, `Exclusão desfeita. Devolvido para a lista [${colunaDestino.toUpperCase()}] (${clienteRecuperado.nome})`);

    renderizarPainelCompleto();
    atualizarPainelModificacoesUI();
    filtrarDadosEmTempoReal();
    lancarAlerta(`Registro de "${clienteRecuperado.nome}" restaurado com sucesso!`, "success");
}

// 
// ACOES MULTIPLAS
// 

function alternarSelecaoItemLote(id, coluna, checkboxEl) {
    if (checkboxEl.checked) {
        if (!itensSelecionadosLote.some(i => i.id === id)) {
            itensSelecionadosLote.push({ id: id, coluna: coluna });
        }
    } else {
        itensSelecionadosLote = itensSelecionadosLote.filter(i => i.id !== id);
    }
    atualizarBarraFlutuanteLoteUI();
}

function atualizarBarraFlutuanteLoteUI() {
    const barra = document.getElementById('bulk-actions-bar');
    const contador = document.getElementById('bulk-select-count');
    if (!barra || !contador) return;

    const total = itensSelecionadosLote.length;
    contador.innerText = total;

    if (total > 0) {
        barra.classList.add('visible');
    } else {
        barra.classList.remove('visible');
    }
}

function limparSelecaoEmLote() {
    itensSelecionadosLote = [];
    document.querySelectorAll('.bulk-row-selector').forEach(chk => chk.checked = false);
    atualizarBarraFlutuanteLoteUI();
}

function executarAcaoEmLote(acao, destinoOpicional = null) {
    if (itensSelecionadosLote.length === 0) return;
    const totalItens = itensSelecionadosLote.length;

    if (acao === 'verificar') {
        if (confirm(`Deseja alterar o status de auditoria de ${totalItens} itens selecionados?`)) {
            itensSelecionadosLote.forEach(item => {
                const cliente = dadosGlobaisProcessados[item.coluna].find(c => c.id === item.id);
                if (cliente) {
                    cliente.verificado = true;
                    registrarAcaoHistorico('auditoria', cliente.id, `Verificado em lote (${cliente.nome})`);
                }
            });
            lancarAlerta(`${totalItens} itens validados com sucesso!`, 'success');
        }
    }
    else if (acao === 'desmarcar') {
        if (confirm(`Deseja remover a verificação de ${totalItens} itens selecionados?`)) {
            itensSelecionadosLote.forEach(item => {
                const cliente = dadosGlobaisProcessados[item.coluna].find(c => c.id === item.id);
                if (cliente) {
                    cliente.verificado = false;
                    registrarAcaoHistorico('auditoria', cliente.id, `Verificação removida em lote (${cliente.nome})`);
                }
            });
            lancarAlerta(`${totalItens} itens desmarcados com sucesso!`, 'success');
        }
    }
    else if (acao === 'excluir') {
        if (confirm(`ATENÇÃO: Deseja deletar permanentemente os ${totalItens} itens selecionados do painel?`)) {

            for (let i = itensSelecionadosLote.length - 1; i >= 0; i--) {
                const item = itensSelecionadosLote[i];
                const lista = dadosGlobaisProcessados[item.coluna];
                const index = lista.findIndex(c => c.id === item.id);
                if (index !== -1) {
                    const c = lista[index];
                    const clienteCopia = JSON.parse(JSON.stringify(c));
                    clienteCopia._colunaOriginal = item.coluna;

                    registrarAcaoHistorico('excluir', c.id, `Excluído via ação em lote da coluna ${item.coluna.toUpperCase()} (${c.nome})`, clienteCopia);
                    lista.splice(index, 1);
                }
            }

            lancarAlerta(`${totalItens} registros removidos de forma massiva.`, 'error');
        }
    }
    else if (acao === 'mover' && destinoOpicional) {
        itensSelecionadosLote.forEach(item => {
            if (item.coluna === destinoOpicional) return;

            const listaOrigem = dadosGlobaisProcessados[item.coluna];
            const index = listaOrigem.findIndex(c => c.id === item.id);
            if (index !== -1) {
                const cliente = listaOrigem.splice(index, 1)[0];

                if (destinoOpicional === 'urgente') cliente.descricaoMapeada = 'Sem sucesso';
                else if (destinoOpicional === 'sucesso') cliente.descricaoMapeada = 'Retirado';
                else if (destinoOpicional === 'renegociar') cliente.descricaoMapeada = 'Renegociar';
                else if (destinoOpicional === 'agendada') cliente.ultimoStatus = 'Agendada';

                dadosGlobaisProcessados[destinoOpicional].push(cliente);
                registrarAcaoHistorico('editar', cliente.id, `Movido em lote de [${item.coluna.toUpperCase()}] para [${destinoOpicional.toUpperCase()}]`);
            }
        });
        lancarAlerta(`${totalItens} itens movidos para ${destinoOpicional.toUpperCase()}.`, 'success');
    }

    limparSelecaoEmLote();
    renderizarPainelCompleto();
    filtrarDadosEmTempoReal();
}

function toggleMoverMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('bulk-move-menu');
    menu.classList.toggle('show');
}

// Fecha o dropdown se o usuário clicar em qualquer outro lugar da tela
window.addEventListener('click', function() {
    const menu = document.getElementById('bulk-move-menu');
    if (menu && menu.classList.contains('show')) {
        menu.classList.remove('show');
    }
});

// 
// EXPORTAR
// 

function abrirModalExport() {
    const modal = document.getElementById('export-custom-modal');
    if (modal) modal.classList.add('open');
}

function fecharModalExport() {
    const modal = document.getElementById('export-custom-modal');
    if (modal) modal.classList.remove('open');
}

function processarExportacaoCustomizada() {
    const statusAtivos = {
        urgente: document.getElementById('exp-status-urgente').checked,
        sucesso: document.getElementById('exp-status-sucesso').checked,
        renegociar: document.getElementById('exp-status-renegociar').checked,
        agendada: document.getElementById('exp-status-agendada').checked,
        outros: document.getElementById('exp-status-outros').checked,
        auditoria: document.getElementById('exp-status-auditoria').checked
    };

    const colunasDesejadas = {
        id: true,
        cliente: document.getElementById('exp-col-cliente').checked,
        diagnostico: document.getElementById('exp-col-diag').checked,
        status: document.getElementById('exp-col-status').checked,
        auditado: document.getElementById('exp-col-audit').checked
    };

    let baseDadosUnificada = [];

    const formatarLinhaCustom = (item, diagnosticoFixo) => {
        let linhaObj = { "ID Processo": item.id };
        if (colunasDesejadas.cliente) linhaObj["Cliente / Razão Social"] = item.nome;
        if (colunasDesejadas.diagnostico) linhaObj["Diagnóstico"] = diagnosticoFixo || item.descricaoMapeada || "Não Informado";
        if (colunasDesejadas.status) linhaObj["Último Status"] = item.ultimoStatus || "Sem Status";
        if (colunasDesejadas.auditado) linhaObj["Auditado"] = item.verificado ? "Sim" : "Não";
        return linhaObj;
    };

    if (statusAtivos.sucesso) dadosGlobaisProcessados.sucesso.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Retirado")));
    if (statusAtivos.renegociar) dadosGlobaisProcessados.renegociar.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Renegociar")));
    if (statusAtivos.urgente) dadosGlobaisProcessados.urgente.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Não foi agendada")));
    if (statusAtivos.agendada) dadosGlobaisProcessados.agendada.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Agendada")));
    if (statusAtivos.outros) dadosGlobaisProcessados.outros.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, null)));
    if (statusAtivos.auditoria) dadosGlobaisProcessados.auditoria.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, i.descricaoMapeada || "Inconsistência")));

    if (baseDadosUnificada.length === 0) {
        lancarAlerta("Nenhum dado selecionado corresponde aos seus filtros de exportação.", "error");
        return;
    }

    const ws = XLSX.utils.json_to_sheet(baseDadosUnificada);
    const wb = XLSX.utils.book_new();

    let colWidths = [{ wch: 15 }];
    if (colunasDesejadas.cliente) colWidths.push({ wch: 42 });
    if (colunasDesejadas.diagnostico) colWidths.push({ wch: 26 });
    if (colunasDesejadas.status) colWidths.push({ wch: 18 });
    if (colunasDesejadas.auditado) colWidths.push({ wch: 12 });
    ws['!cols'] = colWidths;

    const numColunasEfetivas = Object.keys(baseDadosUnificada[0]).length;
    for (let c = 0; c < numColunasEfetivas; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: c });
        if (ws[cellRef]) {
            ws[cellRef].s = {
                fill: { patternType: "solid", fgColor: { rgb: "FF6B00" } },
                font: { name: "Arial", size: 11, bold: true, color: { rgb: "FFFFFF" } },
                alignment: { horizontal: "center", vertical: "center" }
            };
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, "Relatório Customizado");
    XLSX.writeFile(wb, "Relatorio_O.S_Customizado.xlsx");

    fecharModalExport();
    lancarAlerta("Exportação customizada concluída!", "success");
}

function salvarEstadoLocal() {
    const estado = {
        modo: modoProcessoAtivo,
        dados: dadosGlobaisProcessados,
        repositorio: repositorioCompletoPorID,
        historico: historicoModificacoes
    };
    localStorage.setItem('sistema_os_backup', JSON.stringify(estado));
}

function confirmarSucessoUpload() {
    salvarEstadoLocal();
    registrarAcaoHistorico('upload', 'Sistema', 'Nova planilha de dados importada com sucesso.');
}

// GUIA DE USO
let passoAtualTutorial = 0;
const passosTutorial = [
    { elementId: 'tour-upload', title: '1. Importação', text: 'Clique aqui ou arraste o arquivo (Excel: .xlsx, .xls ou .csv) para carregar e processar os dados.' },
    { elementId: 'tour-busca', title: '2. Busca', text: 'Digite um nome ou ID do processo. O painel vai ocultar colunas vazias, destacar os termos e puxar as tabelas com resultados direto para o início.' },
    { elementId: 'tour-abas', title: '3. Filtros por Aba', text: 'Alterne rapidamente as visões para focar em status específicos ou abra a aba "Auditoria" para ver erros.' },
    { elementId: 'tour-kpi', title: '4. Contador Geral', text: 'Exibe o total de registros. Se uma pesquisa estiver selecionada, mostrará apenas a soma dos itens encontrados.' },
    { elementId: 'btn-export-completo', title: '5. Exportar', text: 'Você pode baixar a planilha configurada ou parametrizar seu arquivo final clicando aqui.' },
    { elementId: 'tour-colunas', title: '6. Colunas', text: 'Você pode arrastar as linhas de uma coluna para a outra para mudar o status do cliente, ou arrastar os cabeçalhos para reordenar as tabelas.' },
    { elementId: 'tour-acoes', title: '7. Ações Rápidas', text: 'Use os botões de ação para: copiar o nome do cliente com 1 clique, marcar o registro como verificado/auditado ou deletá-lo do painel.' }
];

function iniciarTutorialInterativo() {
    passoAtualTutorial = 0;
    document.getElementById('tutorial-overlay').style.display = 'block';
    document.getElementById('tutorial-popover').style.display = 'flex';
    renderizarPassoTutorial();
}

function renderizarPassoTutorial() {
    document.querySelectorAll('.tutorial-highlight-mask').forEach(el => el.classList.remove('tutorial-highlight-mask'));

    const passo = passosTutorial[passoAtualTutorial];
    const elementoAlvo = document.getElementById(passo.elementId);
    const popover = document.getElementById('tutorial-popover');

    if (elementoAlvo) {
        elementoAlvo.classList.add('tutorial-highlight-mask');
        const rect = elementoAlvo.getBoundingClientRect();
        const topoAbsoluto = rect.top + window.scrollY;
        const esquerdaAbsoluta = rect.left + window.scrollX;

        let top = topoAbsoluto + rect.height + 12;
        let left = esquerdaAbsoluta + (rect.width / 2) - (popover.offsetWidth / 2);

        if (top + popover.offsetHeight > document.documentElement.scrollHeight) top = topoAbsoluto - popover.offsetHeight - 12;
        if (left + 320 > window.innerWidth) left = window.innerWidth - 340;

        const margemTela = 16;
        if (left < margemTela) left = margemTela;
        else if (left + popover.offsetWidth > window.innerWidth - margemTela) left = window.innerWidth - popover.offsetWidth - margemTela;

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        popover.style.display = 'flex';
    }

    document.getElementById('tutorial-title').innerText = passo.title;
    document.getElementById('tutorial-text').innerText = passo.text;

    const btnNext = document.getElementById('btn-tutorial-next');
    btnNext.innerText = (passoAtualTutorial === passosTutorial.length - 1) ? 'Concluir' : 'Avançar';
}

function proximoPassoTutorial() {
    if (passoAtualTutorial < passosTutorial.length - 1) {
        passoAtualTutorial++;
        renderizarPassoTutorial();
    } else {
        encerrarTutorialInterativo();
    }
}

function encerrarTutorialInterativo() {
    document.getElementById('tutorial-overlay').style.display = 'none';
    document.getElementById('tutorial-popover').style.display = 'none';
    document.querySelectorAll('.tutorial-highlight-mask').forEach(el => el.classList.remove('tutorial-highlight-mask'));
}

document.addEventListener('mouseover', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        tooltipEl.innerText = target.getAttribute('data-tooltip');
        tooltipEl.style.opacity = '1';
    }
});

document.addEventListener('mousemove', function (e) {
    if (tooltipEl && tooltipEl.style.opacity === '1') {
        let left = e.clientX + 12; let top = e.clientY + 12;
        if (left + tooltipEl.offsetWidth > window.innerWidth) left = e.clientX - tooltipEl.offsetWidth - 12;
        if (top + tooltipEl.offsetHeight > window.innerHeight) top = e.clientY - tooltipEl.offsetHeight - 12;
        tooltipEl.style.left = left + 'px'; tooltipEl.style.top = top + 'px';
    }
});

document.addEventListener('mouseout', function (e) {
    if (e.target.closest('[data-tooltip]')) tooltipEl.style.opacity = '0';
});

function lancarAlerta(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo === 'error' ? 'toast-error' : tipo === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `<span>${mensagem}</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
}

if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); dropZone.style.borderColor = 'rgba(255, 107, 0, 0.25)'; }, false);
    });
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files.length) { fileInput.files = dt.files; handleFileProccess(dt.files[0]); }
    }, false);
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileProccess(e.target.files[0]);
    }, false);
}

function handleFileProccess(file) {
    document.getElementById('btn-export-completo').style.display = 'inline-flex';
    dropZone.classList.add('arquivado');
    dropZone.style.padding = "20px 40px";

    document.getElementById('file-title').innerText = 'Dados importados de:';
    document.getElementById('file-name').style.display = 'block';
    document.getElementById('file-name').innerText = `"${file.name}"`;
    document.getElementById('header-img').setAttribute('src', 'https://raw.githubusercontent.com/soufunck/Filtro-de-OS/refs/heads/main/robo_legal.webp')
    document.getElementById('header-title').innerText = 'Tudo certo!';

    btnReset.style.display = 'block';
    document.getElementById('skeleton-screen').style.display = 'grid';
    document.getElementById('results-dashboard').classList.remove('visible');

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            setTimeout(() => {
                processarEAutoditarDados(jsonData);
                confirmarSucessoUpload();
                document.getElementById('skeleton-screen').style.display = 'none';
                document.getElementById('results-dashboard').classList.add('visible');
                document.getElementById('btn-tutorial-guia').style.display = 'inline-flex';
                lancarAlerta("Arquivos carregados com sucesso.", "success");
            }, 500);
        } catch (err) {
            document.getElementById('skeleton-screen').style.display = 'none';
            lancarAlerta("Erro estrutural no documento importado: " + err, "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

let modoProcessoAtivo = null;

function iniciarSistema(modo) {
    modoProcessoAtivo = modo;
    document.getElementById('splash-screen').classList.add('hidden');

    const badge = document.getElementById('current-mode-badge');
    badge.style.display = 'inline-block';

    if (modo === 'antigo') {
        badge.innerHTML = 'Modo: Dados Antigos';
        lancarAlerta(`Modo "dados antigos" carregado.`, "success");
    } else {
        badge.innerHTML = 'Modo: Dados Atuais';
        lancarAlerta(`Modo "dados atuais" carregado.`, "success");
    }

    const btnVoltar = document.getElementById('btn-voltar-splash');
    if (btnVoltar) btnVoltar.style.display = 'inline-flex';
}

function voltarParaSplash() {
    document.getElementById('splash-screen').classList.remove('hidden');
}

//
// PUXAR DADOS DA PLANILHA UPADA
//

function processarEAutoditarDados(dados) {
    const historicoClientes = {};
    repositorioCompletoPorID = {};
    const listaAuditoria = [];

    dados.forEach((linha, index) => {
        const idBruto = linha['ID'];
        const nLinhaPlanilha = index + 2;

        if (!idBruto) {
            listaAuditoria.push({
                id: `L${nLinhaPlanilha}`,
                nome: "Index de ID Não Localizado",
                descricaoMapeada: "Quebra de integridade: Coluna ID vazia.",
                ultimoStatus: "Inconsistente",
                dataHora: "N/A",
                verificado: false
            });
            return;
        }

        const id = String(idBruto).trim();
        const nome = linha['RAZÃO SOCIAL/NOME'] || linha['RAZAO SOCIAL/NOME'] || linha['Nome'] || linha['NOME'] || '';
        const status = linha['STATUS'] ? String(linha['STATUS']).trim() : '';
        const assunto = linha['ASSUNTO'] ? String(linha['ASSUNTO']).trim() : '';
        const dataHora = linha['DATA/HORA ABERTURA'] || linha['DATA/HORA'] || 'Sem data';

        let descricao = '';

        if (modoProcessoAtivo === 'novo') {
            const valorDescricao = linha['DESCRIÇÃO'] || linha['DESCRICAO'] || linha['DESCRIAAO'] || linha['DIAGNOSTICO'] || linha['DIAGNÓSTICO'] || linha['MENSAGEM'] || linha['Mensagem'];
            descricao = valorDescricao ? String(valorDescricao).trim() : '';
        } else {
            const valorDescricao = linha['DESCRIÇÃO'] || linha['DESCRICAO'] || linha['DIAGNOSTICO'] || linha['DIAGNÓSTICO'] || linha['MENSAGEM'] || linha['Mensagem'] || linha['HISTÓRICO'] || linha['HISTORICO'] || linha['OBSERVAÇÃO'] || linha['OBSERVACAO'] || '';
            const textoBruto = String(valorDescricao).trim();

            if (textoBruto) {
                const textoParaAnalise = textoBruto.toLowerCase();
                if (textoParaAnalise.includes('não retirado') || textoParaAnalise.includes('sem sucesso') || textoParaAnalise.includes('não foi agendada')) {
                    descricao = 'Sem sucesso';
                } else if (textoParaAnalise.includes('reagendado') || textoParaAnalise.includes('agendada')) {
                    descricao = 'O.S Agendada';
                } else if (textoParaAnalise.includes('retirado') || textoParaAnalise.includes('sucesso na retirada')) {
                    descricao = 'Retirado';
                } else if (textoParaAnalise.includes('renegociar') || textoParaAnalise.includes('renegociação')) {
                    descricao = 'Renegociar';
                } else {
                    descricao = textoBruto;
                }
            }
        }

        if (!nome.trim()) {
            listaAuditoria.push({
                id: id, nome: "Identificação nula",
                descricaoMapeada: `Linha ${nLinhaPlanilha}: ID existe, mas a Razão Social está em branco.`,
                ultimoStatus: status, dataHora: dataHora, verificado: false
            });
        }

        if (status.toLowerCase() === 'agendada' && (!assunto || !assunto.toLowerCase().includes('retirada'))) {
            listaAuditoria.push({
                id: id, nome: nome || "Cliente não nomeado",
                descricaoMapeada: `Mapeado como O.S Agendada, porém escopo do assunto diverge de retirada.`,
                ultimoStatus: status, dataHora: dataHora, verificado: false
            });
        }

        if (!repositorioCompletoPorID[id]) repositorioCompletoPorID[id] = [];
        repositorioCompletoPorID[id].push({
            data: dataHora, status: status || 'Não Mapeado',
            descricao: descricao || 'Sem informações complementares', assunto: assunto
        });

        if (!historicoClientes[id]) {
            historicoClientes[id] = { id: id, nome: nome, descricaoMapeada: '', ultimoStatus: status, dataHora: dataHora, verificado: false, logsOcorrencia: [] };
        }
        if (descricao) historicoClientes[id].descricaoMapeada = descricao;
        if (status) historicoClientes[id].ultimoStatus = status;
        if (dataHora) historicoClientes[id].dataHora = dataHora;
        if (nome && !historicoClientes[id].nome) historicoClientes[id].nome = nome;

        historicoClientes[id].logsOcorrencia.push({ desc: descricao.toLowerCase(), status: status.toLowerCase() });
    });

    dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], outros: [], auditoria: listaAuditoria };

    Object.values(historicoClientes).forEach(cliente => {
        const descLower = cliente.descricaoMapeada.toLowerCase();
        const statusLower = cliente.ultimoStatus.toLowerCase();

        if (modoProcessoAtivo === 'novo') {
            if (statusLower === 'agendada') dadosGlobaisProcessados.agendada.push(cliente);
            else if (descLower === 'sem sucesso') dadosGlobaisProcessados.urgente.push(cliente);
            else if (descLower === 'retirado') dadosGlobaisProcessados.sucesso.push(cliente);
            else if (descLower === 'renegociar') dadosGlobaisProcessados.renegociar.push(cliente);
            else if (cliente.descricaoMapeada) dadosGlobaisProcessados.outros.push(cliente);
        } else {
            if (statusLower === 'agendada' || descLower === 'o.s agendada') dadosGlobaisProcessados.agendada.push(cliente);
            else if (descLower === 'sem sucesso' || descLower === 'não retirado') dadosGlobaisProcessados.urgente.push(cliente);
            else if (descLower === 'retirado') dadosGlobaisProcessados.sucesso.push(cliente);
            else if (descLower === 'renegociar') dadosGlobaisProcessados.renegociar.push(cliente);
            else if (cliente.descricaoMapeada) dadosGlobaisProcessados.outros.push(cliente);
        }
    });

    renderizarPainelCompleto();
}

// RENDERIZAÇÃO
function renderizarPainelCompleto() {
    const totalRegistros = dadosGlobaisProcessados.urgente.length + dadosGlobaisProcessados.sucesso.length +
        dadosGlobaisProcessados.renegociar.length + dadosGlobaisProcessados.agendada.length +
        dadosGlobaisProcessados.outros.length + dadosGlobaisProcessados.auditoria.length;

    document.getElementById('kpi-total-global').innerText = totalRegistros;
    document.getElementById('kpi-total-title').innerText = "Total de Registros";

    const tabAuditoriaBtn = document.getElementById('tab-auditoria');
    if (tabAuditoriaBtn) {
        if (dadosGlobaisProcessados.auditoria.length > 0) {
            tabAuditoriaBtn.classList.add('has-errors');
            tabAuditoriaBtn.innerText = `Auditoria (${dadosGlobaisProcessados.auditoria.length})`;
        } else {
            tabAuditoriaBtn.classList.remove('has-errors');
            tabAuditoriaBtn.innerText = `Erros`;
        }
    }

    atualizarTabelaDOM('table-urgente', dadosGlobaisProcessados.urgente, 'badge-urgente', 'Não foi agendada', 'urgente');
    atualizarTabelaDOM('table-sucesso', dadosGlobaisProcessados.sucesso, 'badge-sucesso', 'Retirado com sucesso', 'sucesso');
    atualizarTabelaDOM('table-renegociar', dadosGlobaisProcessados.renegociar, 'badge-renegociar', 'Pediu para negociar os débitos', 'renegociar');
    atualizarTabelaDOM('table-agendada', dadosGlobaisProcessados.agendada, 'badge-agendada', 'O.S Agendada', 'agendada');
    atualizarTabelaDOM('table-outros', dadosGlobaisProcessados.outros, 'badge-warning', null, 'outros', true);

    atualizarTabelaAuditoriaDOM();
    atualizarPillsContagemColunas();
    atualizarPainelModificacoesUI(); // Sincroniza os badges e o estado de filtros
}

//
// TABELAS
//

function atualizarTabelaDOM(idElemento, listaClientes, classeBadge, textoBadge, chaveColuna, ehOutros = false) {
    const tbody = document.getElementById(idElemento);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (listaClientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data">Nenhum registro.</td></tr>`;
        return;
    }

    listaClientes.forEach(cliente => {
        const tr = document.createElement('tr');
        tr.setAttribute('draggable', 'true');
        tr.setAttribute('data-id', cliente.id);
        tr.setAttribute('data-origin', chaveColuna);
        tr.setAttribute('data-search', `${cliente.id} ${cliente.nome.toLowerCase()}`);
        tr.setAttribute('data-raw-id', cliente.id);
        tr.setAttribute('data-raw-name', cliente.nome);

        if (cliente.verificado) tr.classList.add('row-verified');

        tr.onclick = (e) => {
            if (!e.target.closest('.btn-action') && !e.target.closest('.row-check-container')) {
                abrirModalHistorico(cliente.id, cliente.nome);
            }
        };

        tr.addEventListener('dragstart', (e) => {
            itemArrastadoContexto = 'row'; linhaSendoArrastada = tr;
            tr.classList.add('row-dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({ id: cliente.id, origem: chaveColuna }));
        });

        tr.addEventListener('dragend', () => {
            tr.classList.remove('row-dragging');
            document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('drag-over'));
            linhaSendoArrastada = null; itemArrastadoContexto = null;
        });

        const badgeTextoFinal = ehOutros ? (cliente.descricaoMapeada || 'Não informado') : textoBadge;
        const nomeEscapado = cliente.nome.replace(/'/g, "\\'");

        // CORREÇÃO: Checkbox e ID agora dividem o mesmo <td>
        tr.innerHTML = `
            <td>
                <label class="row-check-container" onclick="event.stopPropagation();" data-tooltip="Selecionar">
                    <input type="checkbox" class="bulk-row-selector" data-id="${cliente.id}" ${itensSelecionadosLote.some(i => i.id === cliente.id) ? 'checked' : ''} onchange="alternarSelecaoItemLote('${cliente.id}', '${chaveColuna}', this)">
                    <span class="row-checkmark"></span>
                </label>
                <span class="client-id match-target-id">${cliente.id}</span>
            </td>
            <td>
                <div class="client-name-wrapper">
                    <div class="client-name match-target-name">${cliente.nome}</div>
                    <span class="badge ${classeBadge}">${badgeTextoFinal}</span>
                </div>
            </td>
            <td class="col-btn" style="position: relative;">
                <div class="actions-group">
                    <button class="btn-action btn-copy" data-tooltip="Copiar nome" onclick="copiarApenasNome('${nomeEscapado}', event)">
                        <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                    <button class="btn-action btn-check ${cliente.verificado ? 'active-check' : ''}" 
                        data-tooltip="${cliente.verificado ? 'Desmarcar verificação' : 'Marcar como verificado'}" 
                        onclick="alternarVerificacaoCliente('${cliente.id}', '${chaveColuna}', event)">
                            ${cliente.verificado ? `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`}
                    </button>
                    <button class="btn-action btn-remove" data-tooltip="Remover" onclick="removerClienteDoPainel('${cliente.id}', '${chaveColuna}', event)">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function atualizarTabelaAuditoriaDOM() {
    const tbody = document.getElementById('table-auditoria');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (dadosGlobaisProcessados.auditoria.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data" style="color: var(--sucesso);">Nenhum erro encontrado.</td></tr>`;
        return;
    }

    dadosGlobaisProcessados.auditoria.forEach(err => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-search', `${err.id} ${err.nome.toLowerCase()}`);
        tr.setAttribute('data-raw-id', err.id);
        tr.setAttribute('data-raw-name', err.nome);

        if (err.verificado) tr.classList.add('row-verified');

        const ehLinhaFaltaID = err.id.startsWith('L');

        if (!ehLinhaFaltaID) {
            tr.setAttribute('draggable', 'true');
            tr.setAttribute('data-id', err.id);
            tr.setAttribute('data-origin', 'auditoria');

            tr.onclick = (e) => {
                if (!e.target.closest('.btn-action') && !e.target.closest('.row-check-container')) {
                    abrirModalHistorico(err.id, err.nome);
                }
            };

            tr.addEventListener('dragstart', (e) => {
                itemArrastadoContexto = 'row'; linhaSendoArrastada = tr;
                tr.classList.add('row-dragging');
                e.dataTransfer.setData('text/plain', JSON.stringify({ id: err.id, origin: 'auditoria' }));
            });

            tr.addEventListener('dragend', () => {
                tr.classList.remove('row-dragging');
                document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('drag-over'));
                linhaSendoArrastada = null; itemArrastadoContexto = null;
            });
        }

        const nomeEscapado = err.nome.replace(/'/g, "\\'");

        // CORREÇÃO: Checkbox e ID agora dividem o mesmo <td>
        tr.innerHTML = `
            <td style="position: relative; padding-left: 36px;">
                <label class="row-check-container" onclick="event.stopPropagation();">
                    <input type="checkbox" class="bulk-row-selector" data-id="${err.id}" ${itensSelecionadosLote.some(i => i.id === err.id) ? 'checked' : ''} onchange="alternarSelecaoItemLote('${err.id}', 'auditoria', this)">
                    <span class="row-checkmark"></span>
                </label>
                <span class="client-id match-target-id" style="background: rgba(244,63,94,0.05); border-color: rgba(244,63,94,0.2); color: #f43f5e;">${err.id}</span>
            </td>
            <td>
                <div class="client-name match-target-name" style="color: #f43f5e;">${err.nome}</div>
                <span class="badge badge-error-reason">${err.descricaoMapeada}</span>
            </td>
            <td class="col-btn" style="position: relative;">
                <div class="actions-group">
                    ${ehLinhaFaltaID ? '' : `<button class="btn-action btn-copy" data-tooltip="Copiar Nome" onclick="copiarApenasNome('${nomeEscapado}', event)"><svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>`}
                    <button class="btn-action btn-check ${err.verificado ? 'active-check' : ''}" 
                        data-tooltip="${err.verificado ? 'Desmarcar verificação' : 'Marcar como verificado'}" 
                        onclick="alternarVerificacaoCliente('${err.id}', 'auditoria', event)">
                            ${err.verificado ? `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`}
                    </button>
                    <button class="btn-action btn-remove" data-tooltip="Remover" onclick="removerClienteDoPainel('${err.id}', 'auditoria', event)">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarDadosEmTempoReal() {
    const termo = document.getElementById('global-search').value.trim();
    const termoLower = termo.toLowerCase();
    const tabelasIds = ['table-urgente', 'table-sucesso', 'table-renegociar', 'table-agendada', 'table-outros', 'table-auditoria'];

    if (termo === '') {
        let somaTotalPadrao = 0;
        tabelasIds.forEach(idTab => {
            const tbody = document.getElementById(idTab);
            if (!tbody) return;
            const card = tbody.closest('.grid-card');
            const linhas = tbody.querySelectorAll('tr');

            if (card) { card.style.display = ''; card.style.order = ''; }

            linhas.forEach(linha => {
                linha.style.display = '';
                const targetIdNode = linha.querySelector('.match-target-id');
                const targetNameNode = inlineObterTargetNode(linha, '.match-target-name');
                if (targetIdNode) targetIdNode.innerText = linha.getAttribute('data-raw-id') || '';
                if (targetNameNode) targetNameNode.innerText = inlineObterTextoRaw(linha, 'data-raw-name') || '';
            });

            const nLinhasEfetivas = tbody.querySelectorAll('tr:not(:has(.no-data))').length;
            const badgeContador = document.getElementById(idTab.replace('table-', 'count-'));
            if (badgeContador) badgeContador.innerText = nLinhasEfetivas;
            somaTotalPadrao += nLinhasEfetivas;
        });

        document.getElementById('kpi-total-global').innerText = somaTotalPadrao;
        document.getElementById('kpi-total-title').innerText = "Total de Registros";
        return;
    }

    let acumularSomaFiltrada = 0;

    tabelasIds.forEach(idTab => {
        const tbody = document.getElementById(idTab);
        if (!tbody) return;
        const card = tbody.closest('.grid-card');
        const linhas = tbody.querySelectorAll('tr');
        let linhasVisiveisNaTabela = 0;

        linhas.forEach(linha => {
            if (linha.querySelector('.no-data')) return;

            const dadosBusca = linha.getAttribute('data-search') || '';
            const targetIdNode = linha.querySelector('.match-target-id');
            const targetNameNode = linha.querySelector('.match-target-name');

            const rawId = inlineObterTextoRaw(linha, 'data-raw-id');
            const rawName = inlineObterTextoRaw(linha, 'data-raw-name');

            if (dadosBusca.includes(termoLower)) {
                linha.style.display = '';
                linhasVisiveisNaTabela++;

                if (targetIdNode) targetIdNode.innerHTML = aplicarDestaqueString(rawId, termo);
                if (targetNameNode) targetNameNode.innerHTML = aplicarDestaqueString(rawName, termo);
            } else {
                linha.style.display = 'none';
            }
        });

        const badgeContador = document.getElementById(idTab.replace('table-', 'count-'));
        if (badgeContador) badgeContador.innerText = linhasVisiveisNaTabela;
        acumularSomaFiltrada += linhasVisiveisNaTabela;

        if (card) {
            if (linhasVisiveisNaTabela > 0) {
                card.style.display = 'flex'; card.style.order = '-1';
            } else {
                card.style.display = 'none'; card.style.order = '';
            }
        }
    });

    document.getElementById('kpi-total-global').innerText = acumularSomaFiltrada;
    document.getElementById('kpi-total-title').innerText = "Resultados encontrados";
    const subtitle = document.getElementById('kpi-total-subtitle');
    if (subtitle) subtitle.innerText = `Filtrado pelo termo: "${termo}"`;
}

function inlineObterTargetNode(row, selector) { return row.querySelector(selector); }
function inlineObterTextoRaw(row, attr) { return row.getAttribute(attr) || ''; }

function aplicarDestaqueString(textoOriginal, busca) {
    const buscaEscapada = busca.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${buscaEscapada})`, 'gi');
    return textoOriginal.replace(regex, `<span class="search-highlight">$1</span>`);
}

function alternarVerificacaoCliente(id, coluna, event) {
    event.stopPropagation();
    if (tooltipEl) tooltipEl.style.opacity = '0';
    const lista = dadosGlobaisProcessados[coluna];
    const cliente = lista.find(c => c.id === id);
    if (!cliente) return;

    if (confirm(cliente.verificado ? `Reverter checagem para:\n"${cliente.nome}"?` : `Definir como verificado:\n"${cliente.nome}"?`)) {
        cliente.verificado = !cliente.verificado;
        registrarAcaoHistorico('auditoria', cliente.id, `Status de checagem alterado (${cliente.nome})`);
        renderizarPainelCompleto();
        lancarAlerta("Status atualizado.", "success");
        filtrarDadosEmTempoReal();
    }
}

function removerClienteDoPainel(id, coluna, event) {
    event.stopPropagation();
    if (tooltipEl) tooltipEl.style.opacity = '0';
    const lista = dadosGlobaisProcessados[coluna];
    const index = lista.findIndex(c => c.id === id);
    if (index === -1) return;

    const cliente = lista[index];
    if (confirm(`Tem certeza que deseja DELETAR o registro de "${cliente.nome}"?`)) {
        const clienteCopia = JSON.parse(JSON.stringify(cliente));
        clienteCopia._colunaOriginal = coluna;

        lista.splice(index, 1);

        registrarAcaoHistorico('excluir', id, `Registro excluído da coluna ${coluna.toUpperCase()} (${cliente.nome})`, clienteCopia);

        itensSelecionadosLote = itensSelecionadosLote.filter(i => i.id !== id);
        atualizarBarraFlutuanteLoteUI();

        renderizarPainelCompleto();
        lancarAlerta("Registro deletado.", "error");
        filtrarDadosEmTempoReal();
    }
}

function abrirModalHistorico(id, nome) {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    document.getElementById('modal-client-name').innerText = nome;
    document.getElementById('modal-client-id').innerText = `ID Processo — ${id}`;

    const timelineContainer = document.getElementById('modal-timeline-content');
    timelineContainer.innerHTML = '';

    const logs = repositorioCompletoPorID[id];
    if (!logs || logs.length === 0) {
        timelineContainer.innerHTML = '<p class="no-data">Nada encontrado.</p>';
    } else {
        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                    <div class="timeline-date">${log.data}</div>
                    <div class="timeline-body"><strong>Assunto</strong>: ${log.assunto || 'Sem Assunto'}</div>
                    <div class="timeline-body"><strong>Diagnóstico</strong>: ${log.descricao}</div>
                    <div class="timeline-body"><strong>Status</strong>: ${log.status}</div>
                `;
            timelineContainer.appendChild(item);
        });
    }
    modal.classList.add('open');
}

function fecharModalHistorico() {
    const modal = document.getElementById('history-modal');
    if (modal) modal.classList.remove('open');
}

window.onclick = function (e) {
    if (e.target === document.getElementById('history-modal')) fecharModalHistorico();
}

function resetarDashboardGlobal() {
    if (!confirm("Limpar toda a sessão atual?")) return;

    localStorage.removeItem('sistema_os_backup');
    historicoModificacoes = [];
    itensSelecionadosLote = [];

    fileInput.value = '';
    if (dropZone) {
        dropZone.classList.remove('arquivado');
        dropZone.style.padding = "";
    }

    document.getElementById('global-search').value = '';
    document.getElementById('file-title').innerText = 'Clique para abrir o arquivo ou arraste aqui.';
    document.getElementById('file-name').style.display = 'none';
    document.getElementById('header-img').setAttribute('src', 'https://raw.githubusercontent.com/soufunck/Filtro-de-OS/refs/heads/main/robo_hello.webp')
    document.getElementById('header-title').innerText = 'Oi! Seja bem-vindo(a)';

    btnReset.style.display = 'none';
    document.getElementById('btn-tutorial-guia').style.display = 'none';
    document.getElementById('btn-export-completo').style.display = 'none';
    document.getElementById('results-dashboard').classList.remove('visible');

    atualizarBarraFlutuanteLoteUI();
    dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], outros: [], auditoria: [] };
    repositorioCompletoPorID = {};
    renderizarPainelCompleto();
    mudarVisaoAba('todas', document.querySelectorAll('.tab-btn')[0]);
}

function atualizarPillsContagemColunas() {
    const tUrgente = document.getElementById('table-urgente');
    const contUrgente = dadosGlobaisProcessados.urgente.length || (tUrgente ? tUrgente.querySelectorAll('tr:not(:has(.no-data))').length : 0);

    const elements = {
        'count-urgente': contUrgente,
        'count-sucesso': dadosGlobaisProcessados.sucesso.length,
        'count-renegociar': dadosGlobaisProcessados.renegociar.length,
        'count-agendada': dadosGlobaisProcessados.agendada.length,
        'count-outros': dadosGlobaisProcessados.outros.length,
        'count-auditoria': dadosGlobaisProcessados.auditoria.length
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });
}

function copiarApenasNome(nomeCliente, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(nomeCliente).then(() => lancarAlerta("Copiado para área de transferência.", "success"));
}

function exportarColunaParaExcel(chaveColuna, nomeArquivo) {
    const listaRaw = dadosGlobaisProcessados[chaveColuna];
    if (!listaRaw || listaRaw.length === 0) return lancarAlerta("Não há dados para exportar", "error");

    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';

    const dadosFormatados = listaRaw.map(item => ({
        "ID Processo": item.id,
        "Nome": item.nome,
        "Diagnóstico": item.descricaoMapeada || "Não Informado",
        "Último Status": item.ultimoStatus || "Sem Status",
        "Auditado": item.verificado ? "Sim" : "Não"
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `${nomeArquivo}_Report.xlsx`);
}

function mudarVisaoAba(modo, botao) {
    const grid = document.getElementById('main-dashboard-grid');
    if (!grid) return;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    botao.classList.add('active');

    if (modo === 'todas') {
        grid.classList.remove('tab-active');
        document.querySelectorAll('.grid-card').forEach(card => card.classList.remove('tab-show'));
    } else {
        grid.classList.add('tab-active');
        document.querySelectorAll('.grid-card').forEach(card => {
            if (card.getAttribute('data-col') === modo) card.classList.add('tab-show');
            else card.classList.remove('tab-show');
        });
    }
}

// MOVER COLUNAS E REGISTROS
const gridConteiner = document.getElementById('main-dashboard-grid');

document.querySelectorAll('.grid-card').forEach(card => {
    const header = card.querySelector('.card-header');
    if (header) {
        header.addEventListener('dragstart', (e) => {
            itemArrastadoContexto = 'card'; cardSendoArrastado = card;
            card.classList.add('card-dragging');
        });

        header.addEventListener('dragend', () => {
            card.classList.remove('card-dragging');
            document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('drag-over'));
            cardSendoArrastado = null; itemArrastadoContexto = null;
        });
    }

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (itemArrastadoContexto === 'card' && card !== cardSendoArrastado) card.classList.add('drag-over');
        else if (itemArrastadoContexto === 'row') card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');

        if (itemArrastadoContexto === 'card' && cardSendoArrastado && cardSendoArrastado !== card && gridConteiner) {
            const todosOsCards = Array.from(gridConteiner.children);
            const indiceArrastado = todosOsCards.indexOf(cardSendoArrastado);
            const indiceAlvo = todosOsCards.indexOf(card);
            if (indiceArrastado < indiceAlvo) gridConteiner.insertBefore(cardSendoArrastado, card.nextSibling);
            else gridConteiner.insertBefore(cardSendoArrastado, card);
        }
        else if (itemArrastadoContexto === 'row' && linhaSendoArrastada) {
            const destinoColuna = card.getAttribute('data-col');
            const originColuna = linhaSendoArrastada.getAttribute('data-origin');
            const idCliente = linhaSendoArrastada.getAttribute('data-id');
            if (destinoColuna === originColuna) return;
            transferirClienteDeColuna(idCliente, originColuna, destinoColuna);
        }
    });
});

function transferirClienteDeColuna(id, origem, destino) {
    const indexCliente = dadosGlobaisProcessados[origem].findIndex(c => c.id === id);
    if (indexCliente === -1) return;

    const cliente = dadosGlobaisProcessados[origem].splice(indexCliente, 1)[0];

    if (destino === 'urgente') cliente.descricaoMapeada = 'Sem sucesso';
    else if (destino === 'sucesso') cliente.descricaoMapeada = 'Retirado';
    else if (destino === 'renegociar') cliente.descricaoMapeada = 'Renegociar';
    else if (destino === 'agendada') cliente.ultimoStatus = 'Agendada';

    dadosGlobaisProcessados[destino].push(cliente);
    registrarAcaoHistorico('editar', cliente.id, `Movido manualmente de [${origem.toUpperCase()}] para [${destino.toUpperCase()}]`);

    if (repositorioCompletoPorID[id]) {
        const agora = new Date();
        const dataFormatada = `${agora.getDate().toString().padStart(2, '0')}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${agora.getFullYear()} ${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
        repositorioCompletoPorID[id].unshift({
            data: `${dataFormatada} (Painel)`,
            status: cliente.ultimoStatus,
            descricao: `Movido manualmente para: ${destino.toUpperCase()}`,
            assunto: "Ajuste Operacional Manual"
        });
    }

    const itemEmLote = itensSelecionadosLote.find(i => i.id === id);
    if (itemEmLote) itemEmLote.coluna = destino;

    renderizarPainelCompleto();
    filtrarDadosEmTempoReal();
}
