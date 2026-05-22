const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('excel-file');
const btnReset = document.getElementById('btn-reset');
const tooltipEl = document.getElementById('custom-tooltip');

let dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], outros: [], auditoria: [] };
let repositorioCompletoPorID = {};

let itemArrastadoContexto = null;
let cardSendoArrastado = null;
let linhaSendoArrastada = null;

// --- ENGINE DO SISTEMA DE TUTORIAL INTERATIVO ---
let passoAtualTutorial = 0;
const passosTutorial = [
    {
        elementId: 'tour-upload',
        title: '1. Importação',
        text: 'Clique aqui ou arraste o arquivo (Excel: .xlsx, .xls ou .csv) para carregar e processar os dados.'
    },
    {
        elementId: 'tour-busca',
        title: '2. Busca',
        text: 'Digite um nome ou ID do processo. O painel vai ocultar colunas vazias, destacar os termos e puxar as tabelas com resultados direto para o início.'
    },
    {
        elementId: 'tour-abas',
        title: '3. Filtros por Aba',
        text: 'Alterne rapidamente as visões para focar em status específicos ou abra a aba "Auditoria" para ver erros.'
    },
    {
        elementId: 'tour-kpi',
        title: '4. Contador Geral',
        text: 'Exibe o total de registros ativos na tela em tempo real. Se uma pesquisa estiver selecionada, mostrará apenas a soma dos itens encontrados.'
    },
    {
        elementId: 'tour-colunas',
        title: '5. Colunas',
        text: 'Você pode arrastar as linhas de uma coluna para a outra para mudar o status do cliente, ou arrastar os cabeçalhos para reordenar as tabelas.'
    },
    {
        elementId: 'tour-acoes',
        title: '6. Ações Rápidas',
        text: 'Use os botões de ação para: copiar o nome do cliente com 1 clique, marcar o registro como verificado/auditado ou deletá-lo do painel.'
    }
];

function iniciarTutorialInterativo() {
    passoAtualTutorial = 0;
    document.getElementById('tutorial-overlay').style.display = 'block';
    document.getElementById('tutorial-popover').style.display = 'flex';
    renderizarPassoTutorial();
}

function renderizarPassoTutorial() {
    // Remove destaques anteriores
    document.querySelectorAll('.tutorial-highlight-mask').forEach(el => el.classList.remove('tutorial-highlight-mask'));

    const passo = passosTutorial[passoAtualTutorial];
    const elementoAlvo = document.getElementById(passo.elementId);
    const popover = document.getElementById('tutorial-popover');

    if (elementoAlvo) {
        elementoAlvo.classList.add('tutorial-highlight-mask');

        // Posicionamento inteligente do balão de texto baseado no item focado
        const rect = elementoAlvo.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 12;
        let left = rect.left + window.scrollX;

        if (left + 320 > window.innerWidth) {
            left = window.innerWidth - 340;
        }
        if (top + 200 > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - 180;
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
    }

    document.getElementById('tutorial-title').innerText = passo.title;
    document.getElementById('tutorial-text').innerText = passo.text;

    const btnNext = document.getElementById('btn-tutorial-next');
    if (passoAtualTutorial === passosTutorial.length - 1) {
        btnNext.innerText = 'Concluir';
    } else {
        btnNext.innerText = 'Avançar';
    }
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
// --- FIM DA ENGINE DO TUTORIAL ---

document.addEventListener('mouseover', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        tooltipEl.innerText = target.getAttribute('data-tooltip');
        tooltipEl.style.opacity = '1';
    }
});

document.addEventListener('mousemove', function (e) {
    if (tooltipEl.style.opacity === '1') {
        let left = e.clientX + 12;
        let top = e.clientY + 12;

        if (left + tooltipEl.offsetWidth > window.innerWidth) {
            left = e.clientX - tooltipEl.offsetWidth - 12;
        }
        if (top + tooltipEl.offsetHeight > window.innerHeight) {
            top = e.clientY - tooltipEl.offsetHeight - 12;
        }

        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
    }
});

document.addEventListener('mouseout', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        tooltipEl.style.opacity = '0';
    }
});

function lancarAlerta(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo === 'error' ? 'toast-error' : tipo === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `<span>${mensagem}</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
}

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

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileProccess(e.target.files[0]);
}, false);

function handleFileProccess(file) {
    document.getElementById('file-title').innerText = 'Dados importados de:';
    document.getElementById('file-name').style.display = 'block';
    document.getElementById('file-name').innerText = `"${file.name}"`;

    document.getElementById('header-img').setAttribute('src', 'https://media.discordapp.net/attachments/1197495958582329354/1507106822467879035/32-workman-2.png?ex=6a115adb&is=6a10095b&hm=2aa70b1d6387a4f045327a2bb5d4a9cc8ad5f3b12688015d7a5b4b90a468b0cb&=&format=webp&quality=lossless&width=604&height=572')
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

        // BUSCAR DADOS DO ARQUIVO
        const id = String(idBruto).trim();
        const nome = linha['RAZÃO SOCIAL/NOME'] || linha['RAZAO SOCIAL/NOME'] || '';
        const status = linha['STATUS'] ? String(linha['STATUS']).trim() : '';
        const assunto = linha['ASSUNTO'] ? String(linha['ASSUNTO']).trim() : '';
        const valorDescricao = linha['DESCRIÇÃO'] || linha['DESCRICAO'] || linha['DESCRIAAO'] || linha['DIAGNOSTICO'] || linha['DIAGNÓSTICO'];
        const descricao = valorDescricao ? String(valorDescricao).trim() : '';
        const dataHora = linha['DATA/HORA ABERTURA'] || linha['DATA/HORA'] || 'Sem data';

        if (!nome.trim()) {
            listaAuditoria.push({
                id: id,
                nome: "Identificação nula",
                descricaoMapeada: `Linha ${nLinhaPlanilha}: ID existe, mas a Razão Social está em branco.`,
                ultimoStatus: status,
                dataHora: dataHora,
                verificado: false
            });
        }

        if (status.toLowerCase() === 'agendada' && (!assunto || !assunto.toLowerCase().includes('retirada'))) {
            listaAuditoria.push({
                id: id,
                nome: nome || "Cliente não nomeado",
                descricaoMapeada: `Mapeado como O.S Agendada, porém escopo do assunto diverge de retirada.`,
                ultimoStatus: status,
                dataHora: dataHora,
                verificado: false
            });
        }

        if (!repositorioCompletoPorID[id]) repositorioCompletoPorID[id] = [];
        repositorioCompletoPorID[id].push({
            data: dataHora,
            status: status || 'Não Mapeado',
            descricao: descricao || 'Sem informações complementares',
            assunto: assunto
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

        if (statusLower === 'agendada') {
            dadosGlobaisProcessados.agendada.push(cliente);
        } else if (descLower === 'sem sucesso') {
            dadosGlobaisProcessados.urgente.push(cliente);
        } else if (descLower === 'retirado') {
            dadosGlobaisProcessados.sucesso.push(cliente);
        } else if (descLower === 'renegociar') {
            dadosGlobaisProcessados.renegociar.push(cliente);
        } else if (cliente.descricaoMapeada) {
            dadosGlobaisProcessados.outros.push(cliente);
        }
    });

    renderizarPainelCompleto();
}

function renderizarPainelCompleto() {
    const totalRegistros = dadosGlobaisProcessados.urgente.length + dadosGlobaisProcessados.sucesso.length +
        dadosGlobaisProcessados.renegociar.length + dadosGlobaisProcessados.agendada.length +
        dadosGlobaisProcessados.outros.length + dadosGlobaisProcessados.auditoria.length;

    document.getElementById('kpi-total-global').innerText = totalRegistros;
    document.getElementById('kpi-total-title').innerText = "Total de Registros Ativos";
    document.getElementById('kpi-total-subtitle').innerText = "Consolidado Geral das Tabelas";

    const tabAuditoriaBtn = document.getElementById('tab-auditoria');
    if (dadosGlobaisProcessados.auditoria.length > 0) {
        tabAuditoriaBtn.classList.add('has-errors');
        tabAuditoriaBtn.innerText = `Auditoria (${dadosGlobaisProcessados.auditoria.length})`;
    } else {
        tabAuditoriaBtn.classList.remove('has-errors');
        tabAuditoriaBtn.innerText = `Auditoria de Erros`;
    }

    atualizarTabelaDOM('table-urgente', dadosGlobaisProcessados.urgente, 'badge-urgente', 'Não foi agendada', 'urgente');
    atualizarTabelaDOM('table-sucesso', dadosGlobaisProcessados.sucesso, 'badge-sucesso', 'Retirado', 'sucesso');
    atualizarTabelaDOM('table-renegociar', dadosGlobaisProcessados.renegociar, 'badge-renegociar', 'Renegociar', 'renegociar');
    atualizarTabelaDOM('table-agendada', dadosGlobaisProcessados.agendada, 'badge-agendada', 'O.S Agendada', 'agendada');
    atualizarTabelaDOM('table-outros', dadosGlobaisProcessados.outros, 'badge-warning', null, 'outros', true);

    atualizarTabelaAuditoriaDOM();
    atualizarPillsContagemColunas();
}

function atualizarTabelaDOM(idElemento, listaClientes, classeBadge, textoBadge, chaveColuna, ehOutros = false) {
    const tbody = document.getElementById(idElemento);
    tbody.innerHTML = '';

    if (listaClientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data">Nenhum registro pendente.</td></tr>`;
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
            if (!e.target.closest('.btn-action')) abrirModalHistorico(cliente.id, cliente.nome);
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

        tr.innerHTML = `
                <td><span class="client-id match-target-id">${cliente.id}</span></td>
                <td>
                    <div class="client-name-wrapper">
                        <div class="client-name match-target-name">${cliente.nome}</div>
                        <span class="badge ${classeBadge}">${badgeTextoFinal}</span>
                    </div>
                </td>
                <td class="col-btn">
                    <div class="actions-group">
                        <button class="btn-action btn-copy" data-tooltip="Copiar nome" onclick="copiarApenasNome('${nomeEscapado}', event)">
                            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        </button>
                        <button class="btn-action btn-check ${cliente.verificado ? 'active-check' : ''}" data-tooltip="Marcar como verificado" onclick="alternarVerificacaoCliente('${cliente.id}', '${chaveColuna}', event)">
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
    tbody.innerHTML = '';

    if (dadosGlobaisProcessados.auditoria.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-data" style="color: var(--sucesso);">Nenhum erro encontrato.</td></tr>`;
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

            tr.onclick = (e) => { if (!e.target.closest('.btn-action')) abrirModalHistorico(err.id, err.nome); };

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

        tr.innerHTML = `
                <td><span class="client-id match-target-id" style="background: rgba(244,63,94,0.05); border-color: rgba(244,63,94,0.2); color: #f43f5e;">${err.id}</span></td>
                <td>
                    <div class="client-name match-target-name" style="color: #f43f5e;">${err.nome}</div>
                    <span class="badge badge-error-reason">${err.descricaoMapeada}</span>
                </td>
                <td class="col-btn">
                    <div class="actions-group">
                        ${ehLinhaFaltaID ? '' : `<button class="btn-action btn-copy" data-tooltip="Copiar Nome" onclick="copiarApenasNome('${nomeEscapado}', event)"><svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>`}
                        <button class="btn-action btn-check ${err.verificado ? 'active-check' : ''}" data-tooltip="Marcar como verificado" onclick="alternarVerificacaoCliente('${err.id}', 'auditoria', event)">
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
            const card = tbody.closest('.grid-card');
            const linhas = tbody.querySelectorAll('tr');

            card.style.display = '';
            card.style.order = '';

            linhas.forEach(linha => {
                linha.style.display = '';
                const targetIdNode = linha.querySelector('.match-target-id');
                const targetNameNode = inlineObterTargetNode(linha, '.match-target-name');
                if (targetIdNode) targetIdNode.innerText = linha.getAttribute('data-raw-id') || '';
                if (targetNameNode) targetNameNode.innerText = linha.getAttribute('data-raw-name') || '';
            });

            const nLinhasEfetivas = tbody.querySelectorAll('tr:not(:has(.no-data))').length;
            document.getElementById(idTab.replace('table-', 'count-')).innerText = nLinhasEfetivas;
            somaTotalPadrao += nLinhasEfetivas;
        });

        document.getElementById('kpi-total-global').innerText = somaTotalPadrao;
        document.getElementById('kpi-total-title').innerText = "Total de Registros Ativos";
        document.getElementById('kpi-total-subtitle').innerText = "Consolidado Geral das Tabelas";
        return;
    }

    let acumularSomaFiltrada = 0;

    tabelasIds.forEach(idTab => {
        const tbody = document.getElementById(idTab);
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

        document.getElementById(idTab.replace('table-', 'count-')).innerText = linhasVisiveisNaTabela;
        acumularSomaFiltrada += linhasVisiveisNaTabela;

        if (linhasVisiveisNaTabela > 0) {
            card.style.display = 'flex';
            card.style.order = '-1';
        } else {
            card.style.display = 'none';
            card.style.order = '';
        }
    });

    document.getElementById('kpi-total-global').innerText = acumularSomaFiltrada;
    document.getElementById('kpi-total-title').innerText = "Resultados Encontrados";
    document.getElementById('kpi-total-subtitle').innerText = `Filtrado pelo termo: "${termo}"`;
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
    tooltipEl.style.opacity = '0';
    const lista = dadosGlobaisProcessados[coluna];
    const cliente = lista.find(c => c.id === id);
    if (!cliente) return;

    if (confirm(cliente.verificado ? `Reverter checagem para:\n"${cliente.nome}"?` : `Definir como verificado:\n"${cliente.nome}"?`)) {
        cliente.verificado = !cliente.verificado;
        renderizarPainelCompleto();
        lancarAlerta("Status atualizado.", "success");
        filtrarDadosEmTempoReal();
    }
}

function removerClienteDoPainel(id, coluna, event) {
    event.stopPropagation();
    tooltipEl.style.opacity = '0';
    const lista = dadosGlobaisProcessados[coluna];
    const index = lista.findIndex(c => c.id === id);
    if (index === -1) return;

    const cliente = lista[index];
    if (confirm(`Tem certeza que deseja DELETAR o registro de "${cliente.nome}"?`)) {
        lista.splice(index, 1);
        renderizarPainelCompleto();
        lancarAlerta("Registro deletado.", "error");
        filtrarDadosEmTempoReal();
    }
}

function abrirModalHistorico(id, nome) {
    const modal = document.getElementById('history-modal');
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
                    <div class="timeline-body"><strong>Contexto:</strong> ${log.assunto || 'Sem Assunto'}</div>
                    <div class="timeline-body"><strong>Mapeamento:</strong> ${log.descricao}</div>
                    <span class="timeline-status"><strong>Status:</strong> ${log.status}</span></span>
                `;
            timelineContainer.appendChild(item);
        });
    }
    modal.classList.add('open');
}

function fecharModalHistorico() { document.getElementById('history-modal').classList.remove('open'); }
window.onclick = function (e) { if (e.target === document.getElementById('history-modal')) fecharModalHistorico(); }

function resetarDashboardGlobal() {
    if (!confirm("Limpar toda a sessão atual?")) return;
    fileInput.value = '';
    document.getElementById('global-search').value = '';
    document.getElementById('file-title').innerText = 'Clique para abrir o arquivo ou arraste aqui.';
    document.getElementById('file-name').style.display = 'none';

    document.getElementById('header-img').setAttribute('src', 'https://media.discordapp.net/attachments/1197495958582329354/1507106589633544412/14-hello_-_Copia.png?ex=6a115aa3&is=6a100923&hm=e40ffdedeec6aabea1ca983c5534ef3a5158dee9d976652071591b462bef0993&=&format=webp&quality=lossless&width=556&height=572')
    document.getElementById('header-title').innerText = 'Oi! Seja bem-vindo(a)';

    btnReset.style.display = 'none';
    document.getElementById('btn-tutorial-guia').style.display = 'none';
    document.getElementById('results-dashboard').classList.remove('visible');
    dadosGlobaisProcessados = { urgente: [], sucesso: [], renegociar: [], agendada: [], outros: [], auditoria: [] };
    repositorioCompletoPorID = {};
    renderizarPainelCompleto();
    mudarVisaoAba('todas', document.querySelectorAll('.tab-btn')[0]);
}

function atualizarPillsContagemColunas() {
    const contUrgente = dadosGlobaisProcessados.urgente.length || document.getElementById('table-urgente').querySelectorAll('tr:not(:has(.no-data))').length;
    document.getElementById('count-urgente').innerText = contUrgente;
    document.getElementById('count-sucesso').innerText = dadosGlobaisProcessados.sucesso.length;
    document.getElementById('count-renegociar').innerText = dadosGlobaisProcessados.renegociar.length;
    document.getElementById('count-agendada').innerText = dadosGlobaisProcessados.agendada.length;
    document.getElementById('count-outros').innerText = dadosGlobaisProcessados.outros.length;
    document.getElementById('count-auditoria').innerText = dadosGlobaisProcessados.auditoria.length;
}

function copiarApenasNome(nomeCliente, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(nomeCliente).then(() => lancarAlerta("Copiado para área de transferência.", "success"));
}

function exportarColunaParaExcel(chaveColuna, nomeArquivo) {
    const listaRaw = dadosGlobaisProcessados[chaveColuna];
    if (!listaRaw || listaRaw.length === 0) return;

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

// DRAG & DROP
const gridConteiner = document.getElementById('main-dashboard-grid');

document.querySelectorAll('.grid-card').forEach(card => {
    const header = card.querySelector('.card-header');
    header.addEventListener('dragstart', (e) => {
        itemArrastadoContexto = 'card'; cardSendoArrastado = card;
        card.classList.add('card-dragging');
    });

    header.addEventListener('dragend', () => {
        card.classList.remove('card-dragging');
        document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('drag-over'));
        cardSendoArrastado = null; itemArrastadoContexto = null;
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (itemArrastadoContexto === 'card' && card !== cardSendoArrastado) card.classList.add('drag-over');
        else if (itemArrastadoContexto === 'row') card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');

        if (itemArrastadoContexto === 'card' && cardSendoArrastado && cardSendoArrastado !== card) {
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
    renderizarPainelCompleto();
    filtrarDadosEmTempoReal();
}