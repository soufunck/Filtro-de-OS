const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('excel-file');
const btnReset = document.getElementById('btn-reset');
const tooltipEl = document.getElementById('custom-tooltip');

let dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], perdidos: [], outros: [], auditoria: [] };
let repositorioCompletoPorID = {};

let itemArrastadoContexto = null;
let cardSendoArrastado = null;
let linhaSendoArrastada = null;
let historicoModificacoes = [];

let filtroHistoricoAtivo = 'todos';

let itensSelecionadosLote = [];

const TAMANHO_LOTE_RENDERIZACAO = 50;

let limitesExibicaoStatus = {
    urgente: TAMANHO_LOTE_RENDERIZACAO,
    sucesso: TAMANHO_LOTE_RENDERIZACAO,
    renegociar: TAMANHO_LOTE_RENDERIZACAO,
    agendada: TAMANHO_LOTE_RENDERIZACAO,
    outros: TAMANHO_LOTE_RENDERIZACAO,
    auditoria: TAMANHO_LOTE_RENDERIZACAO,
    perdidos: TAMANHO_LOTE_RENDERIZACAO
};

let observadoresScrollAtivos = {};

function resetarLimitesExibicaoAoCarregarArquivo() {
    Object.keys(limitesExibicaoStatus).forEach(status => {
        limitesExibicaoStatus[status] = TAMANHO_LOTE_RENDERIZACAO;
    });
}

function criarElementoGatilhoScroll(status, tagNameContainer) {
    const ehTabela = tagNameContainer.toLowerCase() === 'tbody';
    const gatilho = document.createElement(ehTabela ? 'tr' : 'div');

    gatilho.id = `lazy-trigger-${status}`;
    gatilho.className = 'lazy-load-trigger';

    if (ehTabela) {
        gatilho.innerHTML = `
            <td colspan="100%" style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 13px; font-style: italic; background: transparent;">
                Carregando mais registros de ${status}...
            </td>
        `;
    } else {
        gatilho.style.cssText = "text-align: center; padding: 12px; color: var(--text-muted); font-size: 13px; font-style: italic;";
        gatilho.innerText = `Carregando mais...`;
    }

    return gatilho;
}

function removerGatilhoScrollAnterior(status) {
    const gatilhoAntigo = document.getElementById(`lazy-trigger-${status}`);
    if (gatilhoAntigo) gatilhoAntigo.remove();

    if (observadoresScrollAtivos[status]) {
        observadoresScrollAtivos[status].disconnect();
        delete observadoresScrollAtivos[status];
    }
}

function ativarIntersectionObserver(elementoGatilho, status, containerTbody, callbackRender) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                limitesExibicaoStatus[status] += TAMANHO_LOTE_RENDERIZACAO;
                callbackRender();
            }
        });
    }, {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    });

    observer.observe(elementoGatilho);
    observadoresScrollAtivos[status] = observer;
}

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
        contadorUI.innerText = modificacoesAtivas.toLocaleString('pt-BR');
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
                    <p><b>#${acao.id}</b>: ${acao.detalhe}</p>
                    ${elementoAcaoDireta}
                </div>
            </div>
        `;
    }).join('');
}

function filtrarTipoHistorico(tipo, botao) {
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

function selecionarTodosDaColuna(chaveColuna) {
    const listaClientesDaTabela = dadosGlobaisProcessados[chaveColuna];
    if (!listaClientesDaTabela || listaClientesDaTabela.length === 0) return;

    const inputBusca = document.getElementById('search-input') ||
        document.getElementById('input-busca') ||
        document.querySelector('.search-container input') ||
        document.querySelector('input[type="text"]');

    const termoBusca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';

    const clientesAlvo = listaClientesDaTabela.filter(cliente => {
        if (!termoBusca) return true;

        const nome = String(cliente.nome || '').toLowerCase();
        const id = String(cliente.id || '').toLowerCase();
        const desc = String(cliente.descricaoMapeada || '').toLowerCase();
        const status = String(cliente.ultimoStatus || '').toLowerCase();

        return nome.includes(termoBusca) || id.includes(termoBusca) || desc.includes(termoBusca) || status.includes(termoBusca);
    });

    if (clientesAlvo.length === 0) return;

    const todosMarcados = clientesAlvo.every(cliente =>
        itensSelecionadosLote.some(itemSel => String(itemSel.id) === String(cliente.id))
    );

    clientesAlvo.forEach(cliente => {
        const idStr = String(cliente.id);

        if (!todosMarcados) {
            if (!itensSelecionadosLote.some(itemSel => String(itemSel.id) === idStr)) {
                itensSelecionadosLote.push({ id: cliente.id, coluna: chaveColuna });
            }
        } else {
            itensSelecionadosLote = itensSelecionadosLote.filter(itemSel => String(itemSel.id) !== idStr);
        }
    });

    const tbody = document.getElementById(`table-${chaveColuna}`);
    if (tbody) {
        const checkboxesRenderizados = tbody.querySelectorAll('.bulk-row-selector');
        checkboxesRenderizados.forEach(cb => {
            const idCb = cb.getAttribute('data-id');
            cb.checked = itensSelecionadosLote.some(itemSel => String(itemSel.id) === String(idCb));
        });
    }

    atualizarBarraFlutuanteLoteUI();
}

function atualizarBarraFlutuanteLoteUI() {
    const barra = document.getElementById('bulk-actions-bar');
    const contador = document.getElementById('bulk-select-count');
    if (!barra || !contador) return;

    const total = itensSelecionadosLote.length;
    contador.innerText = total.toLocaleString('pt-BR');

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
                    registrarAcaoHistorico('auditoria', cliente.id, `Verificado em massa (${cliente.nome})`);
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
                    registrarAcaoHistorico('auditoria', cliente.id, `Verificação removida em massa (${cliente.nome})`);
                }
            });
            lancarAlerta(`${totalItens} itens desmarcados com sucesso!`, 'success');
        }
    }
    else if (acao === 'excluir') {
        if (confirm(`Deseja DELETAR permanentemente os ${totalItens} itens selecionados do painel?`)) {

            for (let i = itensSelecionadosLote.length - 1; i >= 0; i--) {
                const item = itensSelecionadosLote[i];
                const lista = dadosGlobaisProcessados[item.coluna];
                const index = lista.findIndex(c => c.id === item.id);
                if (index !== -1) {
                    const c = lista[index];
                    const clienteCopia = JSON.parse(JSON.stringify(c));
                    clienteCopia._colunaOriginal = item.coluna;

                    registrarAcaoHistorico('excluir', c.id, `Excluído por ação em massa da coluna ${item.coluna.toUpperCase()} (${c.nome})`, clienteCopia);
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
                registrarAcaoHistorico('editar', cliente.id, `Movido em massa de [${item.coluna.toUpperCase()}] para [${destinoOpicional.toUpperCase()}]`);
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

window.addEventListener('click', function () {
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
        auditoria: document.getElementById('exp-status-auditoria').checked,
        perdidos: document.getElementById('exp-status-perdidos').checked
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
        let textObj = { "ID Processo": item.id };
        if (colunasDesejadas.cliente) textObj["Cliente / Razão Social"] = item.nome;
        if (colunasDesejadas.diagnostico) textObj["Diagnóstico"] = diagnosticoFixo || item.descricaoMapeada || "Não Informado";
        if (colunasDesejadas.status) textObj["Último Status"] = item.ultimoStatus || "Sem Status";
        if (colunasDesejadas.auditado) textObj["Auditado"] = item.verificado ? "Sim" : "Não";
        return textObj;
    };

    if (statusAtivos.sucesso) dadosGlobaisProcessados.sucesso.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Retirado")));
    if (statusAtivos.renegociar) dadosGlobaisProcessados.renegociar.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Renegociar")));
    if (statusAtivos.urgente) dadosGlobaisProcessados.urgente.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Não foi agendada")));
    if (statusAtivos.agendada) dadosGlobaisProcessados.agendada.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Agendada")));
    if (statusAtivos.outros) dadosGlobaisProcessados.outros.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, null)));
    if (statusAtivos.auditoria) dadosGlobaisProcessados.auditoria.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, i.descricaoMapeada || "Inconsistência")));
    if (statusAtivos.perdidos) dadosGlobaisProcessados.perdidos.forEach(i => baseDadosUnificada.push(formatarLinhaCustom(i, "Equipamento perdido")));

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

function exportarFiltroCompleto() {
    let todosItens = [];

    const mapearLista = (lista, diagnosticoPadrao) => {
        return lista.map(item => ({
            id: item.id,
            nome: item.nome,
            diagnostico: diagnosticoPadrao || item.descricaoMapeada || "Não Informado",
            status: item.ultimoStatus || "Sem Status",
            auditado: item.verificado ? "Sim" : "Não"
        }));
    };

    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.sucesso, "Retirado"));
    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.renegociar, "Renegociar"));
    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.urgente, "Não foi agendada"));
    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.agendada, "Agendada"));
    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.outros, null));
    todosItens = todosItens.concat(mapearLista(dadosGlobaisProcessados.perdidos, "Equipamentos perdidos"));

    if (dadosGlobaisProcessados.auditoria.length > 0) {
        todosItens = todosItens.concat(dadosGlobaisProcessados.auditoria.map(item => ({
            id: item.id,
            nome: item.nome,
            diagnostico: item.descricaoMapeada || "Inconsistência de Dados",
            status: item.ultimoStatus || "Erro",
            auditado: item.verificado ? "Sim" : "Não"
        })));
    }

    if (todosItens.length === 0) {
        lancarAlerta("Não existem dados disponíveis para exportação completa.", "error");
        return;
    }

    const cabecalhos = [["ID Processo", "Cliente", "Diagnóstico", "Último Status", "Auditado"]];
    const linhasCorpo = todosItens.map(item => [item.id, item.nome, item.diagnostico, item.status, item.auditado]);
    const matrizFinal = cabecalhos.concat(linhasCorpo);

    const ws = XLSX.utils.aoa_to_sheet(matrizFinal);
    ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 25 }, { wch: 18 }, { wch: 12 }];

    for (let c = 0; c < 5; c++) {
        const refCel = XLSX.utils.encode_cell({ r: 0, c: c });
        if (ws[refCel]) {
            ws[refCel].s = {
                fill: { patternType: "solid", fgColor: { rgb: "FF6B00" } },
                font: { name: "Arial", size: 11, bold: true, color: { rgb: "FFFFFF" } },
                alignment: { horizontal: "center", vertical: "center" }
            };
        }
    }

    for (let r = 1; r < matrizFinal.length; r++) {
        const refCelDiagnostico = XLSX.utils.encode_cell({ r: r, c: 2 });
        const celula = ws[refCelDiagnostico];

        if (celula && celula.v) {
            const valorTexto = String(celula.v).trim().toLowerCase();
            let corFundoHex = null;

            if (valorTexto === 'retirado') {
                corFundoHex = "68ff74";
            } else if (valorTexto === 'renegociar') {
                corFundoHex = "FFEB9C";
            } else if (valorTexto === 'não foi agendada' || valorTexto === 'sem sucesso') {
                corFundoHex = "FFC7CE";
            } else if (valorTexto === 'agendada' || valorTexto === 'o.s agendada') {
                corFundoHex = "0051ff";
            } else if (valorTexto === 'equipamento perdido' || valorTexto === 'equipamentos perdidos') {
                corFundoHex = "FFB266";
            }

            if (corFundoHex) {
                celula.s = {
                    fill: { patternType: "solid", fgColor: { rgb: corFundoHex } },
                    font: { name: "Arial", size: 10, color: { rgb: "000000" } },
                    border: { bottom: { style: "thin", color: { rgb: "E0E0E0" } } }
                };
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado Geral");
    XLSX.writeFile(wb, "Relatorio_Inadimplencia_Completo.xlsx");
    lancarAlerta("Planilha exportada com sucesso!", "success");
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
    { elementId: 'tour-colunas', title: '6. Colunas', text: 'Você pode arrastar as linhas de uma coluna para a outra para mudar o status do cliente, ou arrastar os cabeçalhos para reordenar las tabelas.' },
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

    document.getElementById('file-title').innerText = 'Dados importados';
    document.getElementById('file-name').style.display = 'block';
    document.getElementById('file-name').innerText = `"${file.name}"`;
    document.getElementById('header-img').setAttribute('src', 'https://raw.githubusercontent.com/soufunck/Filtro-de-OS/refs/heads/main/robo_legal.webp')

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
        badge.innerHTML = 'Menu: <span>Dados Antigos</span>';
        lancarAlerta(`Modo "dados antigos" carregado.`, "success");
    } else {
        badge.innerHTML = 'Menu: <span>Dados Atuais</span>';
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

    const parseDataBR = (dataStr) => {
        if (!dataStr || dataStr === 'Sem data') return Infinity;
        const partes = dataStr.split(/[\s/:]+/);
        if (partes.length >= 3) {
            return new Date(partes[2], partes[1] - 1, partes[0], partes[3] || 0, partes[4] || 0).getTime();
        }
        return Infinity;
    };

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

                if (textoParaAnalise.includes('teste')) {
                    return registrarAcaoHistorico('auditoria', 'Sistema', `[${id} - ${nome}] foi removido por ter o diagnóstico "teste".`);
                }

                const termosSemSucesso = [
                    'não retirado', 'nao retirado', 'sem sucesso', 'não foi agendada', 'nao foi agendada',
                    'não deixou equipamentos', 'nao deixou equipamentos', 'efetudo retirada dos equipamentos',
                    'ninguém no local', 'ninguem no local', 'ninguém em casa', 'ninguem em casa',
                    'não possui mais os equipamentos', 'nao possui mais os equipamentos',
                    'mudança', 'mudanca', 'mudou', 'mudaram', 'outro endereço', 'outro endereco',
                    'não mora mais', 'nao mora mais', 'imóvel vazio', 'imovel vazio', 'desocupado',
                    'casa vazia', 'trocou de endereço', 'trocou de endereco', 'transferiu', 'ninguem atendeu',
                    'nao reside mais no local', 'não reside mais no local', 'não possui mais os aparelhos',
                    'recolhidos', 'nao reside mais', 'não reside mais', 'ninguém atendeu', 'ninguem atendeu',
                    'sem contato', 'coletado', 'não tem mais', 'nao tem mais', 'efetuado retirada'
                ];

                const termosSucesso = [
                    'retirado', 'sucesso na retirada', 'entregou os equipamentos',
                    'entregou o equipamento', 'entregou equipamentos', 'entregou',
                    'entregues', 'aparelho recolhido', 'aparelhos recolhidos',
                    'conexão ativada', 'conexao ativada'
                ];

                const termosNegociacao = [
                    'renegociar', 'renegociação', 'renegociacao', 'efetuou pagamento',
                    'efetuou o pagamento', 'pagamento efetuado', 'comprovante', 'pago'
                ];

                const termosAgendados = [
                    'reagendado', 'agendada', 'agendado'
                ];

                if (termosSemSucesso.some(termo => textoParaAnalise.includes(termo))) {
                    descricao = 'Sem sucesso';
                }
                else if (termosSucesso.some(termo => textoParaAnalise.includes(termo))) {
                    descricao = 'Retirado';
                }
                else if (termosNegociacao.some(termo => textoParaAnalise.includes(termo))) {
                    descricao = 'Renegociar';
                }
                else if (termosAgendados.some(termo => textoParaAnalise.includes(termo))) {
                    descricao = 'O.S Agendada';
                }
                else {
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
                descricaoMapeada: `Incluido como O.S Agendada, mas o escopo do assunto diverge de retirada.`,
                ultimoStatus: status, dataHora: dataHora, verificado: false
            });
        }

        if (!repositorioCompletoPorID[id]) repositorioCompletoPorID[id] = [];
        repositorioCompletoPorID[id].push({
            data: dataHora, status: status || 'Não Mapeado',
            descricao: descricao || 'Sem informações complementares', assunto: assunto
        });

        if (!historicoClientes[id]) {
            historicoClientes[id] = {
                id: id,
                nome: nome,
                descricaoMapeada: '',
                ultimoStatus: status,
                dataHora: dataHora,
                verificado: false,
                logsOcorrencia: [],
                tags: []
            };
        } else {
            if (dataHora && dataHora !== 'Sem data') {
                const dataAtualSalva = parseDataBR(historicoClientes[id].dataHora);
                const novaDataEncontrada = parseDataBR(dataHora);

                if (novaDataEncontrada < dataAtualSalva) {
                    historicoClientes[id].dataHora = dataHora;
                }
            }
        }

        if (descricao) historicoClientes[id].descricaoMapeada = descricao;
        if (status) historicoClientes[id].ultimoStatus = status;
        if (nome && !historicoClientes[id].nome) historicoClientes[id].nome = nome;

        historicoClientes[id].logsOcorrencia.push({ desc: descricao.toLowerCase(), status: status.toLowerCase() });
    });

    dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], perdidos: [], outros: [], auditoria: listaAuditoria };
    resetarLimitesExibicaoAoCarregarArquivo();

    Object.values(historicoClientes).forEach(cliente => {
        const descLower = cliente.descricaoMapeada.toLowerCase();
        const statusLower = cliente.ultimoStatus.toLowerCase();

        if (modoProcessoAtivo === 'novo') {
            if (statusLower === 'aberta') dadosGlobaisProcessados.urgente.push(cliente);
            else if (statusLower === 'agendada') dadosGlobaisProcessados.agendada.push(cliente);
            else if (descLower === 'sem sucesso') dadosGlobaisProcessados.urgente.push(cliente);
            else if (descLower === 'retirado') dadosGlobaisProcessados.sucesso.push(cliente);
            else if (descLower === 'renegociar') dadosGlobaisProcessados.renegociar.push(cliente);
            else if (descLower === 'equipamentos perdidos') dadosGlobaisProcessados.perdidos.push(cliente);
            else if (descLower.includes('pagamento realizado, conexão ativada')) dadosGlobaisProcessados.renegociar.push(cliente);
            else if (cliente.descricaoMapeada) dadosGlobaisProcessados.outros.push(cliente);
            else dadosGlobaisProcessados.outros.push(cliente);
        } else {
            if (statusLower === 'aberta' || descLower === 'equipamentos perdidos') dadosGlobaisProcessados.urgente.push(cliente);
            else if (statusLower === 'agendada' || descLower === 'o.s agendada') dadosGlobaisProcessados.agendada.push(cliente);
            else if (descLower === 'sem sucesso' || descLower === 'não retirado') dadosGlobaisProcessados.urgente.push(cliente);
            else if (descLower === 'retirado') dadosGlobaisProcessados.sucesso.push(cliente);
            else if (descLower === 'renegociar') dadosGlobaisProcessados.renegociar.push(cliente);
            else if (cliente.descricaoMapeada) dadosGlobaisProcessados.outros.push(cliente);
            else dadosGlobaisProcessados.outros.push(cliente);
        }
    });

    renderizarPainelCompleto();
}

// RENDERIZAÇÃO
function renderizarPainelCompleto() {
    const totalRegistros =
        dadosGlobaisProcessados.urgente.length +
        dadosGlobaisProcessados.sucesso.length +
        dadosGlobaisProcessados.renegociar.length +
        dadosGlobaisProcessados.agendada.length +
        dadosGlobaisProcessados.outros.length +
        dadosGlobaisProcessados.auditoria.length +
        dadosGlobaisProcessados.perdidos.length;


    document.getElementById('kpi-total-global').innerText = totalRegistros.toLocaleString('pt-BR');
    document.getElementById('kpi-total-title').innerText = "Total de Registros";

    const tabAuditoriaBtn = document.getElementById('tab-auditoria');
    if (tabAuditoriaBtn) {
        if (dadosGlobaisProcessados.auditoria.length > 0) {
            tabAuditoriaBtn.classList.add('has-errors');
            tabAuditoriaBtn.innerText = `Auditoria (${dadosGlobaisProcessados.auditoria.length.toLocaleString('pt-BR')})`;
        } else {
            tabAuditoriaBtn.classList.remove('has-errors');
            tabAuditoriaBtn.innerText = `Erros`;
        }
    }


    const dadosRenegociarCustomizados = dadosGlobaisProcessados.renegociar.map(cliente => {
        let textoBadgeCustomizado = 'Negociado o débito';

        const descLower = (cliente.descricaoMapeada || '').toLowerCase();

        if (descLower.includes('pagamento realizado, conexão ativada')) {
            textoBadgeCustomizado = 'Pagou e reativou';
        } else if (descLower.includes('renegociar')) {
            textoBadgeCustomizado = 'Pediu para renegociar';
        }

        return {
            ...cliente,
            textoBadgeCustomizado: textoBadgeCustomizado
        };
    });

    atualizarTabelaDOM('table-urgente', dadosGlobaisProcessados.urgente, 'badge-urgente', 'Não foi retirado', 'urgente');
    atualizarTabelaDOM('table-sucesso', dadosGlobaisProcessados.sucesso, 'badge-sucesso', 'Retirado com sucesso', 'sucesso');
    atualizarTabelaDOM('table-renegociar', dadosRenegociarCustomizados, 'badge-renegociar', null, 'renegociar', true);
    atualizarTabelaDOM('table-agendada', dadosGlobaisProcessados.agendada, 'badge-agendada', 'Agendada a O.S', 'agendada');
    atualizarTabelaDOM('table-outros', dadosGlobaisProcessados.outros, 'badge-warning', null, 'outros', true);
    atualizarTabelaDOM('table-perdidos', dadosGlobaisProcessados.perdidos, 'badge-perdidos', 'Equipamentos perdidos', 'perdidos', false);

    atualizarTabelaAuditoriaDOM();
    atualizarPillsContagemColunas();
    atualizarPainelModificacoesUI();
}

//
// TABELAS
//

function atualizarTabelaDOM(idElemento, listaClientes, classeBadge, textoBadge, chaveColuna, ehOutros = false) {
    const tbody = document.getElementById(idElemento);
    if (!tbody) return;

    const campoBuscaGlobal = document.getElementById('global-search');
    const termoBusca = campoBuscaGlobal ? campoBuscaGlobal.value.trim().toLowerCase() : '';

    let listaFiltrada = listaClientes;
    if (termoBusca !== '') {
        listaFiltrada = listaClientes.filter(cliente => {
            const dadosBusca = `${cliente.id} ${cliente.nome.toLowerCase()}`;
            return dadosBusca.includes(termoBusca);
        });
    }

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data">Nenhum registro.</td></tr>`;
        removerGatilhoScrollAnterior(chaveColuna);
        return;
    }

    const limiteAtual = limitesExibicaoStatus[chaveColuna] || TAMANHO_LOTE_RENDERIZACAO;
    const itensVisiveis = listaFiltrada.slice(0, limiteAtual);

    tbody.innerHTML = '';

    itensVisiveis.forEach(cliente => {
        const tr = document.createElement('tr');
        tr.setAttribute('draggable', 'true');
        tr.setAttribute('data-id', cliente.id);
        tr.setAttribute('data-origin', chaveColuna);
        tr.setAttribute('data-search', `${cliente.id} ${cliente.nome.toLowerCase()} ${cliente.dataHora}`); tr.setAttribute('data-raw-id', cliente.id);
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

        let badgeTextoFinal = ehOutros ? (cliente.descricaoMapeada || 'Não informado') : textoBadge;

        if (cliente.textoBadgeCustomizado) {
            badgeTextoFinal = cliente.textoBadgeCustomizado;
        } else if (chaveColuna === 'urgente' && cliente.ultimoStatus && cliente.ultimoStatus.toLowerCase() === 'aberta') {
            badgeTextoFinal = 'Em aberto';
        }

        if (chaveColuna === 'urgente' && cliente.ultimoStatus && cliente.ultimoStatus.toLowerCase() === 'aberta') {
            badgeTextoFinal = 'Em aberto';
        }

        const nomeEscapado = cliente.nome.replace(/'/g, "\\'");

        let idExibicao = cliente.id;
        let nomeExibicao = cliente.nome;
        if (termoBusca !== '') {
            idExibicao = aplicarDestaqueString(cliente.id, termoBusca);
            nomeExibicao = aplicarDestaqueString(cliente.nome, termoBusca);
        }

        const tagsAtivasHtml = (cliente.tags || []).map(t => `<span class="tag-pill ${t.classe}">${t.texto}</span>`).join('');

        tr.innerHTML = `
            <td>
                <label class="row-check-container" onclick="event.stopPropagation();" data-tooltip="Selecionar">
                    <input type="checkbox" class="bulk-row-selector" data-id="${cliente.id}" ${itensSelecionadosLote.some(i => i.id === cliente.id) ? 'checked' : ''} onchange="alternarSelecaoItemLote('${cliente.id}', '${chaveColuna}', this)">
                    <span class="row-checkmark"></span>
                </label>
                <span class="client-id match-target-id">${idExibicao}</span>
            </td>
            <td>
                <div class="client-name-wrapper">
                    <div class="client-name match-target-name">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0m4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4m-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10s-3.516.68-4.168 1.332c-.678.678-.83 1.418-.832 1.664z"/></svg> 
                        ${nomeExibicao}
                    </div>
                    
                    <div class="client-date">
                        <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/></svg>
                        Aberto em
                        ${cliente.dataHora || 'Data não informada'}
                    </div>

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

    removerGatilhoScrollAnterior(chaveColuna);

    if (listaFiltrada.length > limiteAtual) {
        const elementoGatilho = criarElementoGatilhoScroll(chaveColuna, 'tbody');
        tbody.appendChild(elementoGatilho);
        ativarIntersectionObserver(elementoGatilho, chaveColuna, tbody, () => {
            atualizarTabelaDOM(idElemento, listaClientes, classeBadge, textoBadge, chaveColuna, ehOutros);
        });
    }
}

function atualizarTabelaAuditoriaDOM() {
    const tbody = document.getElementById('table-auditoria');
    if (!tbody) return;

    const campoBuscaGlobal = document.getElementById('global-search');
    const termoBusca = campoBuscaGlobal ? campoBuscaGlobal.value.trim().toLowerCase() : '';

    let listaFiltrada = dadosGlobaisProcessados.auditoria;
    if (termoBusca !== '') {
        listaFiltrada = dadosGlobaisProcessados.auditoria.filter(err => {
            const dadosBusca = `${err.id} ${err.nome.toLowerCase()}`;
            return dadosBusca.includes(termoBusca);
        });
    }

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data" style="color: var(--sucesso);">Nenhum erro encontrado.</td></tr>`;
        removerGatilhoScrollAnterior('auditoria');
        return;
    }

    const limiteAtual = limitesExibicaoStatus['auditoria'] || TAMANHO_LOTE_RENDERIZACAO;
    const itensVisiveis = listaFiltrada.slice(0, limiteAtual);

    tbody.innerHTML = '';

    itensVisiveis.forEach(err => {
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

        let idExibicao = err.id;
        let nomeExibicao = err.nome;
        if (termoBusca !== '') {
            idExibicao = aplicarDestaqueString(err.id, termoBusca);
            nomeExibicao = aplicarDestaqueString(err.nome, termoBusca);
        }

        tr.innerHTML = `
            <td style="position: relative; padding-left: 36px;">
                <label class="row-check-container" onclick="event.stopPropagation();">
                    <input type="checkbox" class="bulk-row-selector" data-id="${err.id}" ${itensSelecionadosLote.some(i => i.id === err.id) ? 'checked' : ''} onchange="alternarSelecaoItemLote('${err.id}', 'auditoria', this)">
                    <span class="row-checkmark"></span>
                </label>
                <span class="client-id match-target-id" style="background: rgba(244,63,94,0.05); border-color: rgba(244,63,94,0.2); color: #f43f5e;">${idExibicao}</span>
            </td>
            <td>
                <div class="client-name match-target-name" style="color: #f43f5e;">${nomeExibicao}</div>
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

    removerGatilhoScrollAnterior('auditoria');

    if (listaFiltrada.length > limiteAtual) {
        const elementoGatilho = criarElementoGatilhoScroll('auditoria', 'tbody');
        tbody.appendChild(elementoGatilho);
        ativarIntersectionObserver(elementoGatilho, 'auditoria', tbody, () => {
            atualizarTabelaAuditoriaDOM();
        });
    }
}

function filtrarDadosEmTempoReal() {
    const termo = document.getElementById('global-search').value.trim();
    const termoLower = termo.toLowerCase();
    const tabelasIds = ['table-urgente', 'table-sucesso', 'table-renegociar', 'table-agendada', 'table-outros', 'table-auditoria', 'table-perdidos'];
    const subtitle = document.getElementById('kpi-total-subtitle');

    if (termo === '') {
        const somaTotalPadrao = dadosGlobaisProcessados.urgente.length +
            dadosGlobaisProcessados.sucesso.length +
            dadosGlobaisProcessados.renegociar.length +
            dadosGlobaisProcessados.agendada.length +
            dadosGlobaisProcessados.outros.length +
            dadosGlobaisProcessados.auditoria.length +
            dadosGlobaisProcessados.perdidos.length;

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
        });

        atualizarPillsContagemColunas();

        document.getElementById('kpi-total-global').innerText = somaTotalPadrao.toLocaleString('pt-BR');
        document.getElementById('kpi-total-title').innerText = "Total de Registros";
        if (subtitle) subtitle.innerText = '';

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
            const targetIdNode = inlineObterTargetNode(linha, '.match-target-id') || linha.querySelector('.match-target-id');
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
        if (badgeContador) badgeContador.innerText = linhasVisiveisNaTabela.toLocaleString('pt-BR');
        acumularSomaFiltrada += linhasVisiveisNaTabela;

        if (card) {
            if (linhasVisiveisNaTabela > 0) {
                card.style.display = 'flex'; card.style.order = '-1';
            } else {
                card.style.display = 'none'; card.style.order = '';
            }
        }
    });

    document.getElementById('kpi-total-global').innerText = acumularSomaFiltrada.toLocaleString('pt-BR');
    document.getElementById('kpi-total-title').innerText = "Resultados encontrados";
    if (subtitle) subtitle.innerText = `itens encontrados pelo termo: "${termo}"`;
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

    const logs = repositorioCompletoPorID[id] || [];
    const mapaHistorico = new Map();

    logs.forEach((item) => {
        const chave = `${item.data}-${item.assunto || ''}-${item.descricao}-${item.status}`;

        if (mapaHistorico.has(chave)) {
            const registroExistente = mapaHistorico.get(chave);
            registroExistente.repeticoes += 1;
            // Salva os itens idênticos no array de duplicados
            registroExistente.duplicados.push(item);
        } else {
            mapaHistorico.set(chave, {
                ...item,
                repeticoes: 0,
                duplicados: [] // Cria o repositório oculto
            });
        }
    });

    const historicoUnico = Array.from(mapaHistorico.values());

    if (historicoUnico.length === 0) {
        timelineContainer.innerHTML = '<p class="no-data">Nada encontrado.</p>';
    } else {
        historicoUnico.forEach((log, index) => {
            const item = document.createElement('div');
            item.className = 'timeline-item';

            let blocoDuplicados = '';

            if (log.repeticoes > 0) {
                const plural = log.repeticoes > 1 ? 'outros repetidos' : 'outro repetido';

                // Monta os cards ocultos de duplicatas
                const itensOcultosHTML = log.duplicados.map(dup => `
                    <div class="timeline-duplicated-item">
                        <div class="timeline-date">
                            <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/></svg>
                            ${dup.data}
                        </div>

                        <div class="timeline-body">
                            <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>
                            <strong>Assunto</strong>: ${dup.assunto || 'Sem Assunto'}
                        </div>
                        <div class="timeline-body">
                            <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M2 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v11.5a.5.5 0 0 1-.777.416L7 13.101l-4.223 2.815A.5.5 0 0 1 2 15.5z"/><path d="M4.268 1A2 2 0 0 1 6 0h6a2 2 0 0 1 2 2v11.5a.5.5 0 0 1-.777.416L13 13.768V2a1 1 0 0 0-1-1z"/></svg>
                            <strong>Diagnóstico</strong>: ${dup.descricao}
                        </div>
                        <div class="timeline-body">
                            <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
                            <strong>Status</strong>: ${dup.status}
                        </div>
                    </div>
                `).join('');

                blocoDuplicados = `
                    <div style="display: flex; align-items: center; flex-direction: margin-top: 8px;">
                        <div class="timeline-duplicates-alert" style="margin-top: 8px;">${log.repeticoes} ${plural}
                        <button class="btn-ver-repetidos" onclick="
                            const el = document.getElementById('dup-${index}');
                            el.style.display = el.style.display === 'none' ? 'block' : 'none';
                        ">Ver</button></div>
                    </div>

                    <div id="dup-${index}" style="display: none; margin-top: 12px; padding-left: 12px; border-left: 2px dashed rgba(255,107,0,0.3);">
                        ${itensOcultosHTML}
                    </div>
                `;
            }

            item.innerHTML = `
                    <div class="timeline-date">
                        <svg viewBox="0 0 24 24" style="width: 10px; height: 10px; fill: currentColor;"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/></svg>
                        ${log.data}
                    </div>

                    <div class="timeline-body">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>
                        <strong>Assunto</strong>: ${log.assunto || 'Sem Assunto'}
                    </div>
                    <div class="timeline-body">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M2 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v11.5a.5.5 0 0 1-.777.416L7 13.101l-4.223 2.815A.5.5 0 0 1 2 15.5z"/><path d="M4.268 1A2 2 0 0 1 6 0h6a2 2 0 0 1 2 2v11.5a.5.5 0 0 1-.777.416L13 13.768V2a1 1 0 0 0-1-1z"/></svg>
                        <strong>Diagnóstico</strong>: ${log.descricao}
                    </div>
                    <div class="timeline-body">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 10px; height: 10px; fill: currentColor;" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
                        <strong>Status</strong>: ${log.status}
                    </div>
                    ${blocoDuplicados}
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

    btnReset.style.display = 'none';
    document.getElementById('btn-tutorial-guia').style.display = 'none';
    document.getElementById('btn-export-completo').style.display = 'none';
    document.getElementById('results-dashboard').classList.remove('visible');

    atualizarBarraFlutuanteLoteUI();
    dadosGlobaisProcessados = {
        urgente: [],
        sucesso: [],
        renegociar: [],
        agendada: [],
        outros: [],
        auditoria: [],
        perdidos: []
    };

    repositorioCompletoPorID = {};
    resetarLimitesExibicaoAoCarregarArquivo();
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
        'count-auditoria': dadosGlobaisProcessados.auditoria.length,
        'count-perdidos': dadosGlobaisProcessados.perdidos.length
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = Number(value).toLocaleString('pt-BR');
    });
}

function copiarApenasNome(nomeCliente, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(nomeCliente).then(() => lancarAlerta("Copiado para área de transferência.", "success"));
}

const OPCOES_TAGS_SISTEMA = [
    { texto: 'Sem Contato', classe: 'tag-muted' },
    { texto: 'Promessa Pgto', classe: 'tag-renegociar' },
    { texto: 'Sócio Irritado', classe: 'tag-urgente' },
    { texto: 'Retorno Urgente', classe: 'tag-auditoria' },
    { texto: 'Aguardando Retorno', classe: 'tag-agendada' }
];

let clienteIdTagAtivo = null;

function alternarMenuTagsGlobal(idCliente, botaoEl, event) {
    event.stopPropagation();

    let menu = document.getElementById('global-tags-dropdown');

    if (menu && menu.style.display === 'block' && clienteIdTagAtivo === idCliente) {
        menu.style.display = 'none';
        return;
    }

    clienteIdTagAtivo = idCliente;

    let clienteAlvo = null;
    for (const coluna in dadosGlobaisProcessados) {
        clienteAlvo = dadosGlobaisProcessados[coluna].find(c => String(c.id) === String(idCliente));
        if (clienteAlvo) break;
    }

    if (!clienteAlvo) return;
    if (!clienteAlvo.tags) clienteAlvo.tags = [];

    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'global-tags-dropdown';
        menu.className = 'global-tags-menu';
        document.body.appendChild(menu);
    }

    menu.innerHTML = OPCOES_TAGS_SISTEMA.map(opcao => {
        const jaPossui = clienteAlvo.tags.some(t => t.texto === opcao.texto);
        return `
            <div class="tags-menu-item ${jaPossui ? 'active' : ''}" onclick="aplicarTagNoCliente('${opcao.texto}', '${opcao.classe}')">
                <span class="tag-pill ${opcao.classe}">${opcao.texto}</span>
                ${jaPossui ? '<span class="check-icon">✓</span>' : ''}
            </div>
        `;
    }).join('');

    const rect = botaoEl.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    menu.style.left = `${rect.left + window.scrollX - 110}px`;
    menu.style.display = 'block';
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

function ordenarColunaPorData(coluna, btnElement, event) {
    if (event) event.stopPropagation();

    const ordemAtual = btnElement.getAttribute('data-ordem') || 'asc';
    const novaOrdem = ordemAtual === 'asc' ? 'desc' : 'asc';

    btnElement.setAttribute('data-ordem', novaOrdem);
    btnElement.innerHTML = novaOrdem === 'asc' ? 'Z - A' : 'A - Z';

    // Conversor de data BR (DD/MM/YYYY HH:MM) para número (timestamp)
    const parseDataBR = (dataStr) => {
        if (!dataStr || dataStr === 'Sem data') return Infinity;
        const partes = dataStr.split(/[\s/:]+/);
        if (partes.length >= 3) {
            return new Date(partes[2], partes[1] - 1, partes[0], partes[3] || 0, partes[4] || 0).getTime();
        }
        return Infinity;
    };

    // Ordena o array global na memória
    dadosGlobaisProcessados[coluna].sort((a, b) => {
        const tempoA = parseDataBR(a.dataHora);
        const tempoB = parseDataBR(b.dataHora);
        return novaOrdem === 'desc' ? tempoB - tempoA : tempoA - tempoB; // Inverte dependendo do clique
    });

    // Manda desenhar a tela novamente com os dados já organizados
    renderizarPainelCompleto();
}
