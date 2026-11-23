(function () {
  'use strict';

  const api = window.BarbeariaAPI;
  const usuario = api.protegerPagina('ADMIN');
  if (!usuario) return;

  let barbeirosCache = [];
  let servicosCache = [];
  let barbeiroHorariosAtual = null;

  // Cabeçalho
  document.getElementById('admin-name-display').textContent = usuario.nome;
  document.getElementById('btn-sair').addEventListener('click', api.sair);

  // Navegação por abas
  const tabBtns = document.querySelectorAll('.tabs .tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      tabBtns.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(targetId).classList.add('active');
    });
  });

  function mostrarAlerta(el, msg, tipo = 'error') {
    el.textContent = msg;
    el.className = `alert-banner ${tipo} visible`;
  }

  function limparAlerta(el) {
    el.textContent = '';
    el.className = 'alert-banner';
  }

  // ============================================================================
  // ABA 1: RELATÓRIOS E AGENDA (UC09, UC13)
  // ============================================================================

  const filtroDataInicio = document.getElementById('filtro-data-inicio');
  const filtroDataFim = document.getElementById('filtro-data-fim');
  const filtroBarbeiro = document.getElementById('filtro-barbeiro');
  const filtroStatus = document.getElementById('filtro-status');
  const agendaAlert = document.getElementById('agenda-alert');
  const agendaTbody = document.getElementById('agenda-tbody');

  const statTotal = document.getElementById('stat-total');
  const statAgendados = document.getElementById('stat-agendados');
  const statConcluidos = document.getElementById('stat-concluidos');
  const statCancelados = document.getElementById('stat-cancelados');

  async function carregarAgenda() {
    limparAlerta(agendaAlert);
    const query = new URLSearchParams();
    if (filtroDataInicio.value) query.set('data_inicio', filtroDataInicio.value);
    if (filtroDataFim.value) query.set('data_fim', filtroDataFim.value);
    if (filtroBarbeiro.value) query.set('id_barbeiro', filtroBarbeiro.value);
    if (filtroStatus.value) query.set('status', filtroStatus.value);

    try {
      const qs = query.toString();
      const resp = await api.request(`/api/admin/agendamentos${qs ? `?${qs}` : ''}`);
      const lista = resp.agendamentos || [];
      const totais = resp.totais || {
        total: lista.length,
        agendados: lista.filter((a) => a.status === 'AGENDADO').length,
        concluidos: lista.filter((a) => a.status === 'CONCLUIDO').length,
        cancelados: lista.filter((a) => a.status === 'CANCELADO').length,
      };

      statTotal.textContent = totais.total;
      statAgendados.textContent = totais.agendados;
      statConcluidos.textContent = totais.concluidos;
      statCancelados.textContent = totais.cancelados;

      if (lista.length === 0) {
        agendaTbody.innerHTML = `
          <tr>
            <td colspan="7" class="muted-text" style="text-align: center; padding: 2rem;">
              Nenhum agendamento encontrado para os filtros selecionados.
            </td>
          </tr>
        `;
        return;
      }

      agendaTbody.innerHTML = '';
      lista.forEach((ag) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="tabular">${api.escaparHtml(api.formatarDataHora(ag.data_hora_inicio))}</td>
          <td>
            <div><strong>${api.escaparHtml(ag.nome_cliente)}</strong></div>
            <div class="muted-text" style="font-size: 0.8rem;">${api.escaparHtml(ag.email_cliente)}</div>
          </td>
          <td>${api.escaparHtml(ag.nome_servico)}</td>
          <td>${api.escaparHtml(ag.nome_barbeiro)}</td>
          <td class="tabular">${api.formatarMoeda(ag.preco)}</td>
          <td><span class="status-badge status-${api.escaparHtml(ag.status)}">${api.escaparHtml(ag.status)}</span></td>
          <td>
            <div class="row-wrap">
              ${
                ag.status === 'AGENDADO'
                  ? `<button type="button" class="btn btn-success btn-sm btn-concluir">Concluir Atendimento</button>
                     <button type="button" class="btn btn-danger btn-sm btn-cancelar-adm">Cancelar</button>`
                  : '<span class="muted-text">—</span>'
              }
            </div>
          </td>
        `;

        if (ag.status === 'AGENDADO') {
          tr.querySelector('.btn-concluir').addEventListener('click', () => concluirAtendimento(ag));
          tr.querySelector('.btn-cancelar-adm').addEventListener('click', () => cancelarPeloAdmin(ag));
        }

        agendaTbody.appendChild(tr);
      });
    } catch (err) {
      mostrarAlerta(agendaAlert, `Erro ao consultar agenda: ${err.message}`, 'error');
    }
  }

  async function concluirAtendimento(ag) {
    const ok = await api.confirmarAcao({
      titulo: 'Concluir Atendimento',
      mensagem: `Confirmar conclusão do atendimento de ${ag.nome_cliente} (${ag.nome_servico})?`,
      textoConfirmar: 'Concluir Atendimento',
      textoCancelar: 'Voltar',
    });
    if (!ok) return;

    try {
      const resp = await api.request(`/api/admin/agendamentos/${ag.id_agendamento}/concluir`, {
        method: 'PATCH',
      });
      api.mostrarToast(resp.mensagem || 'Atendimento concluído!', 'success');
      await carregarAgenda();
    } catch (err) {
      mostrarAlerta(agendaAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    }
  }

  async function cancelarPeloAdmin(ag) {
    const ok = await api.confirmarAcao({
      titulo: 'Cancelar Agendamento',
      mensagem: `Deseja cancelar o atendimento de ${ag.nome_cliente} marcado para ${api.formatarDataHora(ag.data_hora_inicio)}?`,
      textoConfirmar: 'Sim, cancelar',
      textoCancelar: 'Voltar',
      perigoso: true,
    });
    if (!ok) return;

    try {
      const resp = await api.request(`/api/admin/agendamentos/${ag.id_agendamento}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELADO' },
      });
      api.mostrarToast(resp.mensagem || 'Agendamento cancelado.', 'success');
      await carregarAgenda();
    } catch (err) {
      mostrarAlerta(agendaAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    }
  }

  document.getElementById('btn-filtrar-agenda').addEventListener('click', carregarAgenda);
  document.getElementById('btn-limpar-agenda').addEventListener('click', () => {
    filtroDataInicio.value = '';
    filtroDataFim.value = '';
    filtroBarbeiro.value = '';
    filtroStatus.value = '';
    carregarAgenda();
  });

  document.getElementById('btn-disparar-lembretes').addEventListener('click', async () => {
    const btn = document.getElementById('btn-disparar-lembretes');
    btn.disabled = true;
    btn.textContent = 'Executando...';
    limparAlerta(agendaAlert);

    try {
      const resp = await api.request('/api/admin/lembretes/executar', { method: 'POST' });
      const tipo = resp.resultado && resp.resultado.ignorado ? 'warning' : 'success';
      mostrarAlerta(agendaAlert, resp.mensagem, tipo);
      api.mostrarToast(resp.mensagem, tipo === 'warning' ? 'info' : 'success');
    } catch (err) {
      mostrarAlerta(agendaAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Disparar Lembretes Agora';
    }
  });

  // ============================================================================
  // ABA 2: BARBEIROS E HORÁRIOS DE TRABALHO (UC10, UC11, RN08)
  // ============================================================================

  const barbeirosAlert = document.getElementById('barbeiros-alert');
  const barbeirosTbody = document.getElementById('barbeiros-tbody');
  const formBarbeiro = document.getElementById('form-barbeiro');
  const barbeiroIdInput = document.getElementById('barbeiro-id');
  const barbeiroNomeInput = document.getElementById('barbeiro-nome');
  const barbeiroTelefoneInput = document.getElementById('barbeiro-telefone');
  const barbeiroAtivoInput = document.getElementById('barbeiro-ativo');
  const barbeiroFormTitle = document.getElementById('barbeiro-form-title');
  const btnCancelarEdicaoBarbeiro = document.getElementById('btn-cancelar-edicao-barbeiro');

  function limparFormBarbeiro() {
    barbeiroIdInput.value = '';
    formBarbeiro.reset();
    barbeiroAtivoInput.checked = true;
    barbeiroFormTitle.textContent = 'Cadastrar Barbeiro';
    btnCancelarEdicaoBarbeiro.style.display = 'none';
  }

  btnCancelarEdicaoBarbeiro.addEventListener('click', limparFormBarbeiro);

  async function carregarBarbeirosAdmin() {
    try {
      const resp = await api.request('/api/barbeiros?todos=true');
      barbeirosCache = resp.barbeiros || [];

      // Atualiza filtro da Aba 1
      const selecionado = filtroBarbeiro.value;
      filtroBarbeiro.innerHTML =
        '<option value="">Todos os barbeiros</option>' +
        barbeirosCache
          .map((b) => `<option value="${b.id_barbeiro}">${api.escaparHtml(b.nome)}</option>`)
          .join('');
      if (selecionado) filtroBarbeiro.value = selecionado;

      if (barbeirosCache.length === 0) {
        barbeirosTbody.innerHTML = `
          <tr>
            <td colspan="5" class="muted-text" style="text-align: center; padding: 2rem;">
              Nenhum barbeiro cadastrado.
            </td>
          </tr>
        `;
        return;
      }

      barbeirosTbody.innerHTML = '';
      barbeirosCache.forEach((b) => {
        const tr = document.createElement('tr');
        const qtdHorarios = (b.horarios || []).length;
        tr.innerHTML = `
          <td><strong>${api.escaparHtml(b.nome)}</strong></td>
          <td class="tabular">${api.escaparHtml(b.telefone || '—')}</td>
          <td>
            <span class="status-badge ${b.ativo ? 'status-ativo' : 'status-inativo'}">
              ${b.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </td>
          <td class="tabular">${qtdHorarios} turno(s)</td>
          <td>
            <div class="row-wrap">
              <button type="button" class="btn btn-secondary btn-sm btn-editar-barb">Editar</button>
              <button type="button" class="btn btn-secondary btn-sm btn-horarios-barb">Horários de Trabalho</button>
              <button type="button" class="btn ${b.ativo ? 'btn-danger' : 'btn-success'} btn-sm btn-toggle-barb">
                ${b.ativo ? 'Inativar' : 'Ativar'}
              </button>
            </div>
          </td>
        `;

        tr.querySelector('.btn-editar-barb').addEventListener('click', () => {
          limparAlerta(barbeirosAlert);
          barbeiroIdInput.value = b.id_barbeiro;
          barbeiroNomeInput.value = b.nome;
          barbeiroTelefoneInput.value = b.telefone || '';
          barbeiroAtivoInput.checked = Boolean(b.ativo);
          barbeiroFormTitle.textContent = `Editar Barbeiro: ${b.nome}`;
          btnCancelarEdicaoBarbeiro.style.display = 'inline-flex';
          barbeiroNomeInput.focus();
        });

        tr.querySelector('.btn-horarios-barb').addEventListener('click', () => abrirModalHorarios(b));
        tr.querySelector('.btn-toggle-barb').addEventListener('click', () => alternarStatusBarbeiro(b));

        barbeirosTbody.appendChild(tr);
      });
    } catch (err) {
      mostrarAlerta(barbeirosAlert, `Erro ao carregar barbeiros: ${err.message}`, 'error');
    }
  }

  async function alternarStatusBarbeiro(b) {
    limparAlerta(barbeirosAlert);
    const novoAtivo = !b.ativo;
    const acao = novoAtivo ? 'ativar' : 'inativar';

    const ok = await api.confirmarAcao({
      titulo: `${novoAtivo ? 'Ativar' : 'Inativar'} Barbeiro`,
      mensagem: `Deseja ${acao} o barbeiro "${b.nome}"?`,
      textoConfirmar: novoAtivo ? 'Ativar' : 'Inativar',
      textoCancelar: 'Voltar',
      perigoso: !novoAtivo,
    });
    if (!ok) return;

    try {
      const resp = await api.request(`/api/admin/barbeiros/${b.id_barbeiro}`, {
        method: 'PUT',
        body: { ativo: novoAtivo },
      });
      api.mostrarToast(resp.mensagem || 'Status atualizado.', 'success');
      await carregarBarbeirosAdmin();
    } catch (err) {
      // Exibe alerta detalhado caso haja agendamentos futuros impedindo inativação (RN08)
      mostrarAlerta(barbeirosAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    }
  }

  formBarbeiro.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparAlerta(barbeirosAlert);

    const id = barbeiroIdInput.value;
    const payload = {
      nome: barbeiroNomeInput.value.trim(),
      telefone: barbeiroTelefoneInput.value.trim(),
      ativo: barbeiroAtivoInput.checked,
    };

    if (!payload.nome) {
      mostrarAlerta(barbeirosAlert, 'Informe o nome do barbeiro.', 'error');
      return;
    }

    const btn = document.getElementById('btn-salvar-barbeiro');
    btn.disabled = true;

    try {
      const resp = id
        ? await api.request(`/api/admin/barbeiros/${id}`, { method: 'PUT', body: payload })
        : await api.request('/api/admin/barbeiros', { method: 'POST', body: payload });

      api.mostrarToast(resp.mensagem, 'success');
      limparFormBarbeiro();
      await carregarBarbeirosAdmin();
    } catch (err) {
      mostrarAlerta(barbeirosAlert, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Modal de Horários de Trabalho (UC11)
  const modalHorarios = document.getElementById('modal-horarios');
  const horariosBarbeiroNome = document.getElementById('horarios-barbeiro-nome');
  const horariosAlert = document.getElementById('horarios-alert');
  const horariosLista = document.getElementById('horarios-lista');
  const formHorario = document.getElementById('form-horario');

  function fecharModalHorarios() {
    modalHorarios.classList.remove('open');
    modalHorarios.setAttribute('aria-hidden', 'true');
    barbeiroHorariosAtual = null;
  }

  document.getElementById('btn-fechar-horarios').addEventListener('click', fecharModalHorarios);
  document.getElementById('btn-concluir-horarios').addEventListener('click', fecharModalHorarios);
  modalHorarios.addEventListener('click', (e) => {
    if (e.target === modalHorarios) fecharModalHorarios();
  });

  async function carregarHorariosDoBarbeiro(idBarbeiro) {
    limparAlerta(horariosAlert);
    horariosLista.innerHTML = '<div class="skeleton-box" style="height: 54px;"></div>';

    try {
      const resp = await api.request(`/api/admin/barbeiros/${idBarbeiro}/horarios`);
      const horarios = resp.horarios || [];

      if (horarios.length === 0) {
        horariosLista.innerHTML = `
          <div class="empty-state" style="padding: 1.25rem;">
            <p style="margin-bottom: 0;">Nenhum turno cadastrado para este barbeiro.</p>
          </div>
        `;
        return;
      }

      horariosLista.innerHTML = '';
      horarios.forEach((h) => {
        const item = document.createElement('div');
        item.className = 'row-between';
        item.style.padding = '0.65rem 0.9rem';
        item.style.backgroundColor = 'var(--surface-input)';
        item.style.border = '1px solid var(--border)';
        item.style.borderRadius = 'var(--radius-sm)';

        item.innerHTML = `
          <div>
            <strong>${api.escaparHtml(api.nomeDiaSemana(h.dia_semana))}</strong>
            <span class="muted-text"> · </span>
            <span class="tabular" style="color: var(--gold);">${api.escaparHtml(h.hora_inicio)} – ${api.escaparHtml(h.hora_fim)}</span>
          </div>
          <button type="button" class="btn btn-danger btn-sm btn-del-horario">Remover</button>
        `;

        item.querySelector('.btn-del-horario').addEventListener('click', async () => {
          try {
            await api.request(`/api/admin/horarios/${h.id_horario}`, { method: 'DELETE' });
            api.mostrarToast('Turno removido.', 'success');
            await Promise.all([
              carregarHorariosDoBarbeiro(idBarbeiro),
              carregarBarbeirosAdmin(),
            ]);
          } catch (err) {
            mostrarAlerta(horariosAlert, err.message, 'error');
          }
        });

        horariosLista.appendChild(item);
      });
    } catch (err) {
      horariosLista.innerHTML = '';
      mostrarAlerta(horariosAlert, err.message, 'error');
    }
  }

  async function abrirModalHorarios(barbeiro) {
    barbeiroHorariosAtual = barbeiro;
    horariosBarbeiroNome.textContent = barbeiro.nome;
    modalHorarios.classList.add('open');
    modalHorarios.setAttribute('aria-hidden', 'false');
    await carregarHorariosDoBarbeiro(barbeiro.id_barbeiro);
  }

  formHorario.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!barbeiroHorariosAtual) return;
    limparAlerta(horariosAlert);

    const payload = {
      dia_semana: Number(document.getElementById('horario-dia').value),
      hora_inicio: document.getElementById('horario-inicio').value,
      hora_fim: document.getElementById('horario-fim').value,
    };

    const btn = document.getElementById('btn-add-horario');
    btn.disabled = true;

    try {
      await api.request(`/api/admin/barbeiros/${barbeiroHorariosAtual.id_barbeiro}/horarios`, {
        method: 'POST',
        body: payload,
      });
      api.mostrarToast('Turno adicionado com sucesso.', 'success');
      await Promise.all([
        carregarHorariosDoBarbeiro(barbeiroHorariosAtual.id_barbeiro),
        carregarBarbeirosAdmin(),
      ]);
    } catch (err) {
      mostrarAlerta(horariosAlert, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================================
  // ABA 3: SERVIÇOS (UC12, RN08)
  // ============================================================================

  const servicosAdminAlert = document.getElementById('servicos-admin-alert');
  const servicosAdminTbody = document.getElementById('servicos-admin-tbody');
  const formServico = document.getElementById('form-servico');
  const servicoIdInput = document.getElementById('servico-id');
  const servicoNomeInput = document.getElementById('servico-nome');
  const servicoPrecoInput = document.getElementById('servico-preco');
  const servicoDuracaoInput = document.getElementById('servico-duracao');
  const servicoDescricaoInput = document.getElementById('servico-descricao');
  const servicoAtivoInput = document.getElementById('servico-ativo');
  const servicoFormTitle = document.getElementById('servico-form-title');
  const btnCancelarEdicaoServico = document.getElementById('btn-cancelar-edicao-servico');

  function limparFormServico() {
    servicoIdInput.value = '';
    formServico.reset();
    servicoAtivoInput.checked = true;
    servicoFormTitle.textContent = 'Cadastrar Serviço';
    btnCancelarEdicaoServico.style.display = 'none';
  }

  btnCancelarEdicaoServico.addEventListener('click', limparFormServico);

  async function carregarServicosAdmin() {
    try {
      const resp = await api.request('/api/servicos?todos=true');
      servicosCache = resp.servicos || [];

      if (servicosCache.length === 0) {
        servicosAdminTbody.innerHTML = `
          <tr>
            <td colspan="6" class="muted-text" style="text-align: center; padding: 2rem;">
              Nenhum serviço cadastrado.
            </td>
          </tr>
        `;
        return;
      }

      servicosAdminTbody.innerHTML = '';
      servicosCache.forEach((s) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${api.escaparHtml(s.nome)}</strong></td>
          <td class="muted-text">${api.escaparHtml(s.descricao || '—')}</td>
          <td class="tabular">${Number(s.duracao_min)} min</td>
          <td class="tabular" style="color: var(--gold);">${api.formatarMoeda(s.preco)}</td>
          <td>
            <span class="status-badge ${s.ativo ? 'status-ativo' : 'status-inativo'}">
              ${s.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </td>
          <td>
            <div class="row-wrap">
              <button type="button" class="btn btn-secondary btn-sm btn-editar-serv">Editar</button>
              <button type="button" class="btn ${s.ativo ? 'btn-danger' : 'btn-success'} btn-sm btn-toggle-serv">
                ${s.ativo ? 'Inativar' : 'Ativar'}
              </button>
            </div>
          </td>
        `;

        tr.querySelector('.btn-editar-serv').addEventListener('click', () => {
          limparAlerta(servicosAdminAlert);
          servicoIdInput.value = s.id_servico;
          servicoNomeInput.value = s.nome;
          servicoPrecoInput.value = Number(s.preco).toFixed(2);
          servicoDuracaoInput.value = s.duracao_min;
          servicoDescricaoInput.value = s.descricao || '';
          servicoAtivoInput.checked = Boolean(s.ativo);
          servicoFormTitle.textContent = `Editar Serviço: ${s.nome}`;
          btnCancelarEdicaoServico.style.display = 'inline-flex';
          servicoNomeInput.focus();
        });

        tr.querySelector('.btn-toggle-serv').addEventListener('click', () => alternarStatusServico(s));
        servicosAdminTbody.appendChild(tr);
      });
    } catch (err) {
      mostrarAlerta(servicosAdminAlert, `Erro ao carregar serviços: ${err.message}`, 'error');
    }
  }

  async function alternarStatusServico(s) {
    limparAlerta(servicosAdminAlert);
    const novoAtivo = !s.ativo;
    const acao = novoAtivo ? 'ativar' : 'inativar';

    const ok = await api.confirmarAcao({
      titulo: `${novoAtivo ? 'Ativar' : 'Inativar'} Serviço`,
      mensagem: `Deseja ${acao} o serviço "${s.nome}"?`,
      textoConfirmar: novoAtivo ? 'Ativar' : 'Inativar',
      textoCancelar: 'Voltar',
      perigoso: !novoAtivo,
    });
    if (!ok) return;

    try {
      const resp = await api.request(`/api/admin/servicos/${s.id_servico}`, {
        method: 'PUT',
        body: { ativo: novoAtivo },
      });
      api.mostrarToast(resp.mensagem || 'Status atualizado.', 'success');
      await carregarServicosAdmin();
    } catch (err) {
      mostrarAlerta(servicosAdminAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    }
  }

  formServico.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparAlerta(servicosAdminAlert);

    const id = servicoIdInput.value;
    const payload = {
      nome: servicoNomeInput.value.trim(),
      descricao: servicoDescricaoInput.value.trim(),
      preco: Number(servicoPrecoInput.value),
      duracao_min: Number(servicoDuracaoInput.value),
      ativo: servicoAtivoInput.checked,
    };

    if (!payload.nome) {
      mostrarAlerta(servicosAdminAlert, 'Informe o nome do serviço.', 'error');
      return;
    }
    if (!Number.isFinite(payload.preco) || payload.preco <= 0) {
      mostrarAlerta(servicosAdminAlert, 'Informe um preço maior que zero.', 'error');
      return;
    }
    if (!Number.isInteger(payload.duracao_min) || payload.duracao_min <= 0) {
      mostrarAlerta(servicosAdminAlert, 'Informe a duração em minutos (inteiro positivo).', 'error');
      return;
    }

    const btn = document.getElementById('btn-salvar-servico');
    btn.disabled = true;

    try {
      const resp = id
        ? await api.request(`/api/admin/servicos/${id}`, { method: 'PUT', body: payload })
        : await api.request('/api/admin/servicos', { method: 'POST', body: payload });

      api.mostrarToast(resp.mensagem, 'success');
      limparFormServico();
      await carregarServicosAdmin();
    } catch (err) {
      mostrarAlerta(servicosAdminAlert, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Inicialização do painel
  Promise.all([carregarBarbeirosAdmin(), carregarServicosAdmin(), carregarAgenda()]);
})();
