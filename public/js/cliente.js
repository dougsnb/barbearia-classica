(function () {
  'use strict';

  const api = window.BarbeariaAPI;
  const usuario = api.protegerPagina();
  if (!usuario) return;

  const params = new URLSearchParams(window.location.search);
  const servicoInicialParam = params.get('servico');

  // Estado da tela
  let servicosLista = [];
  let barbeirosLista = [];
  let slotSelecionado = null;
  let agendamentoRemarcar = null;
  let slotRemarcarSelecionado = null;

  // Elementos do DOM
  const userNameDisplay = document.getElementById('user-name-display');
  const linkAdmin = document.getElementById('link-admin');
  const btnSair = document.getElementById('btn-sair');

  const selectServico = document.getElementById('select-servico');
  const servicoResumo = document.getElementById('servico-resumo');
  const selectBarbeiro = document.getElementById('select-barbeiro');
  const inputData = document.getElementById('input-data');
  const slotsContainer = document.getElementById('slots-container');
  const slotsStatus = document.getElementById('slots-status');
  const agendamentoResumo = document.getElementById('agendamento-resumo');
  const resumoDetalhe = document.getElementById('resumo-detalhe');
  const agendamentoAlert = document.getElementById('agendamento-alert');
  const btnConfirmar = document.getElementById('btn-confirmar-agendamento');

  const meusAlert = document.getElementById('meus-alert');
  const proximosList = document.getElementById('proximos-list');
  const historicoList = document.getElementById('historico-list');
  const proximosCount = document.getElementById('proximos-count');
  const historicoCount = document.getElementById('historico-count');
  const btnAtualizarMeus = document.getElementById('btn-atualizar-meus');

  // Modal remarcar
  const modalRemarcar = document.getElementById('modal-remarcar');
  const remarcarInfo = document.getElementById('remarcar-info');
  const remarcarAlert = document.getElementById('remarcar-alert');
  const remarcarBarbeiro = document.getElementById('remarcar-barbeiro');
  const remarcarData = document.getElementById('remarcar-data');
  const remarcarSlots = document.getElementById('remarcar-slots');
  const btnRemarcarConfirmar = document.getElementById('btn-remarcar-confirmar');
  const btnRemarcarCancelar = document.getElementById('btn-remarcar-cancelar');
  const btnRemarcarFechar = document.getElementById('btn-remarcar-fechar');

  userNameDisplay.textContent = usuario.nome;
  if (usuario.perfil === 'ADMIN') {
    linkAdmin.style.display = 'inline-flex';
  }
  btnSair.addEventListener('click', api.sair);

  const hoje = api.hojeISO();
  const dataInicial = new Date(`${hoje}T12:00:00`);
  dataInicial.setDate(dataInicial.getDate() + 1);
  const anoInicial = dataInicial.getFullYear();
  const mesInicial = String(dataInicial.getMonth() + 1).padStart(2, '0');
  const diaInicial = String(dataInicial.getDate()).padStart(2, '0');
  const proximaData = `${anoInicial}-${mesInicial}-${diaInicial}`;
  inputData.min = hoje;
  inputData.value = proximaData;
  remarcarData.min = hoje;

  function mostrarAlerta(el, msg, tipo = 'error') {
    el.textContent = msg;
    el.className = `alert-banner ${tipo} visible`;
  }

  function limparAlerta(el) {
    el.textContent = '';
    el.className = 'alert-banner';
  }

  function atualizarResumoServico() {
    const id = Number(selectServico.value);
    const servico = servicosLista.find((s) => s.id_servico === id);
    if (!servico) {
      servicoResumo.textContent = '';
      return;
    }
    servicoResumo.textContent = `${api.formatarMoeda(servico.preco)} · ${servico.duracao_min} min`;
  }

  function atualizarResumoReserva() {
    const idServico = Number(selectServico.value);
    const servico = servicosLista.find((s) => s.id_servico === idServico);
    if (!servico || !slotSelecionado) {
      agendamentoResumo.style.display = 'none';
      return;
    }

    const barbeiroTexto =
      selectBarbeiro.value === 'sem_preferencia'
        ? `Sem preferência (disponível: ${slotSelecionado.barbeiros_disponiveis.map((b) => b.nome).join(', ')})`
        : selectBarbeiro.options[selectBarbeiro.selectedIndex].text;

    resumoDetalhe.textContent = `${servico.nome} (${api.formatarMoeda(servico.preco)} · ${servico.duracao_min} min) · ${barbeiroTexto} · ${api.formatarData(inputData.value)} das ${slotSelecionado.hora_inicio} às ${slotSelecionado.hora_fim}`;
    agendamentoResumo.style.display = 'block';
  }

  async function carregarCatalogoInicial() {
    try {
      const [resServicos, resBarbeiros] = await Promise.all([
        api.request('/api/servicos'),
        api.request('/api/barbeiros'),
      ]);

      servicosLista = resServicos.servicos || [];
      barbeirosLista = resBarbeiros.barbeiros || [];

      if (servicosLista.length === 0) {
        selectServico.innerHTML = '<option value="">Nenhum serviço ativo disponível</option>';
      } else {
        selectServico.innerHTML = servicosLista
          .map(
            (s) =>
              `<option value="${s.id_servico}">${api.escaparHtml(s.nome)} — ${api.formatarMoeda(s.preco)} (${s.duracao_min} min)</option>`
          )
          .join('');

        if (
          servicoInicialParam &&
          servicosLista.some((s) => String(s.id_servico) === String(servicoInicialParam))
        ) {
          selectServico.value = servicoInicialParam;
        }
      }

      selectBarbeiro.innerHTML =
        '<option value="sem_preferencia">Sem preferência (Primeiro disponível)</option>' +
        barbeirosLista
          .map((b) => `<option value="${b.id_barbeiro}">${api.escaparHtml(b.nome)}</option>`)
          .join('');

      atualizarResumoServico();
      await carregarDisponibilidade();
    } catch (err) {
      mostrarAlerta(agendamentoAlert, `Erro ao carregar serviços/barbeiros: ${err.message}`, 'error');
    }
  }

  async function carregarDisponibilidade() {
    limparAlerta(agendamentoAlert);
    slotSelecionado = null;
    atualizarResumoReserva();

    const idServico = selectServico.value;
    const idBarbeiro = selectBarbeiro.value;
    const data = inputData.value;

    if (!idServico || !data) {
      slotsContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>Selecione um serviço e uma data para consultar os horários.</p>
        </div>
      `;
      slotsStatus.textContent = '';
      return;
    }

    slotsStatus.textContent = 'Consultando agenda...';
    slotsContainer.innerHTML = '<div class="skeleton-box" style="grid-column: 1 / -1; height: 64px;"></div>';

    try {
      const query = new URLSearchParams({
        data,
        id_servico: idServico,
        id_barbeiro: idBarbeiro,
      });
      const resp = await api.request(`/api/agendamentos/disponibilidade?${query.toString()}`);
      const slots = resp.slots || [];

      if (slots.length === 0) {
        slotsStatus.textContent = '0 horários livres';
        slotsContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <p>Não há horários disponíveis para esta data, serviço ou barbeiro. Tente outro dia ou escolha "Sem preferência".</p>
          </div>
        `;
        return;
      }

      slotsStatus.textContent = `${slots.length} horário(s) livre(s)`;
      slotsContainer.innerHTML = '';

      slots.forEach((slot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-btn';

        const subTexto =
          idBarbeiro === 'sem_preferencia'
            ? `${slot.barbeiros_disponiveis.length} barbeiro(s)`
            : `até ${slot.hora_fim}`;

        btn.innerHTML = `
          <span>${api.escaparHtml(slot.hora_inicio)}</span>
          <span class="slot-sub">${api.escaparHtml(subTexto)}</span>
        `;

        btn.addEventListener('click', () => {
          slotsContainer.querySelectorAll('.slot-btn').forEach((el) => el.classList.remove('selected'));
          btn.classList.add('selected');
          slotSelecionado = slot;
          atualizarResumoReserva();
        });

        slotsContainer.appendChild(btn);
      });
    } catch (err) {
      slotsStatus.textContent = 'Erro na consulta';
      slotsContainer.innerHTML = '';
      mostrarAlerta(agendamentoAlert, err.message, 'error');
    }
  }

  selectServico.addEventListener('change', () => {
    atualizarResumoServico();
    carregarDisponibilidade();
  });
  selectBarbeiro.addEventListener('change', carregarDisponibilidade);
  inputData.addEventListener('change', carregarDisponibilidade);

  btnConfirmar.addEventListener('click', async () => {
    limparAlerta(agendamentoAlert);
    if (!slotSelecionado) {
      mostrarAlerta(agendamentoAlert, 'Selecione um horário disponível antes de confirmar.', 'warning');
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Confirmando...';

    try {
      const resp = await api.request('/api/agendamentos', {
        method: 'POST',
        body: {
          id_servico: Number(selectServico.value),
          id_barbeiro: selectBarbeiro.value,
          data_hora_inicio: slotSelecionado.data_hora_inicio,
        },
      });

      const ag = resp.agendamento;
      api.mostrarToast('Agendamento confirmado com sucesso!', 'success');
      mostrarAlerta(
        agendamentoAlert,
        `Reserva #${ag.id_agendamento} confirmada com ${ag.nome_barbeiro} em ${api.formatarDataHora(ag.data_hora_inicio)}.`,
        'success'
      );

      slotSelecionado = null;
      atualizarResumoReserva();
      await Promise.all([carregarDisponibilidade(), carregarMeusAgendamentos()]);
    } catch (err) {
      mostrarAlerta(agendamentoAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
      await carregarDisponibilidade();
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = 'Confirmar Agendamento';
    }
  });

  // ============================================================================
  // MEUS AGENDAMENTOS (PRÓXIMOS + HISTÓRICO)
  // ============================================================================

  function renderCardAgendamento(ag, permitirAcoes) {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.backgroundColor = 'var(--surface-input)';

    const inicioFmt = api.formatarDataHora(ag.data_hora_inicio);
    const fimHora = api.formatarHora(ag.data_hora_fim);

    card.innerHTML = `
      <div class="row-between" style="align-items: flex-start;">
        <div class="stack-sm" style="gap: 0.35rem;">
          <div class="row-wrap">
            <strong style="font-size: 1.05rem;">${api.escaparHtml(ag.nome_servico)}</strong>
            <span class="status-badge status-${api.escaparHtml(ag.status)}">${api.escaparHtml(ag.status)}</span>
          </div>
          <div class="muted-text">
            <span>Barbeiro: <strong style="color: var(--text);">${api.escaparHtml(ag.nome_barbeiro)}</strong></span>
            <span> · </span>
            <span class="tabular">${api.escaparHtml(inicioFmt)} – ${api.escaparHtml(fimHora)}</span>
            <span> · </span>
            <span class="tabular" style="color: var(--gold);">${api.formatarMoeda(ag.preco)}</span>
          </div>
        </div>
        ${
          permitirAcoes
            ? `<div class="row-wrap">
                 <button type="button" class="btn btn-secondary btn-sm btn-remarcar">Remarcar</button>
                 <button type="button" class="btn btn-danger btn-sm btn-cancelar">Cancelar</button>
               </div>`
            : ''
        }
      </div>
    `;

    if (permitirAcoes) {
      card.querySelector('.btn-cancelar').addEventListener('click', () => solicitarCancelamento(ag));
      card.querySelector('.btn-remarcar').addEventListener('click', () => abrirModalRemarcar(ag));
    }

    return card;
  }

  async function carregarMeusAgendamentos() {
    limparAlerta(meusAlert);
    try {
      const resp = await api.request('/api/agendamentos/meus');
      const lista = resp.agendamentos || [];

      const proximos = lista
        .filter((ag) => ag.status === 'AGENDADO')
        .sort((a, b) => a.data_hora_inicio.localeCompare(b.data_hora_inicio));

      const historico = lista.filter((ag) => ag.status !== 'AGENDADO');

      proximosCount.textContent = `${proximos.length} ativo(s)`;
      historicoCount.textContent = `${historico.length} registro(s)`;

      if (proximos.length === 0) {
        proximosList.innerHTML = `
          <div class="empty-state">
            <p>Você não possui atendimentos agendados no momento.</p>
          </div>
        `;
      } else {
        proximosList.innerHTML = '';
        proximos.forEach((ag) => proximosList.appendChild(renderCardAgendamento(ag, true)));
      }

      if (historico.length === 0) {
        historicoList.innerHTML = `
          <div class="empty-state">
            <p>Ainda não há atendimentos concluídos ou cancelados no seu histórico.</p>
          </div>
        `;
      } else {
        historicoList.innerHTML = '';
        historico.forEach((ag) => historicoList.appendChild(renderCardAgendamento(ag, false)));
      }
    } catch (err) {
      mostrarAlerta(meusAlert, `Erro ao carregar seus agendamentos: ${err.message}`, 'error');
    }
  }

  async function solicitarCancelamento(ag) {
    limparAlerta(meusAlert);
    const confirmado = await api.confirmarAcao({
      titulo: 'Cancelar Agendamento',
      mensagem: `Deseja cancelar "${ag.nome_servico}" com ${ag.nome_barbeiro} marcado para ${api.formatarDataHora(ag.data_hora_inicio)}?`,
      textoConfirmar: 'Sim, cancelar',
      textoCancelar: 'Manter horário',
      perigoso: true,
    });

    if (!confirmado) return;

    try {
      const resp = await api.request(`/api/agendamentos/${ag.id_agendamento}/cancelar`, {
        method: 'PUT',
      });
      api.mostrarToast(resp.mensagem || 'Agendamento cancelado com sucesso.', 'success');
      await Promise.all([carregarMeusAgendamentos(), carregarDisponibilidade()]);
    } catch (err) {
      mostrarAlerta(meusAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    }
  }

  // ============================================================================
  // MODAL DE REMARCAÇÃO (UC05)
  // ============================================================================

  function fecharModalRemarcar() {
    modalRemarcar.classList.remove('open');
    modalRemarcar.setAttribute('aria-hidden', 'true');
    agendamentoRemarcar = null;
    slotRemarcarSelecionado = null;
  }

  async function carregarSlotsRemarcacao() {
    limparAlerta(remarcarAlert);
    slotRemarcarSelecionado = null;
    btnRemarcarConfirmar.disabled = true;

    if (!agendamentoRemarcar || !remarcarData.value) return;

    remarcarSlots.innerHTML = '<div class="skeleton-box" style="grid-column: 1 / -1; height: 56px;"></div>';

    try {
      const query = new URLSearchParams({
        data: remarcarData.value,
        id_servico: String(agendamentoRemarcar.id_servico),
        id_barbeiro: remarcarBarbeiro.value,
      });

      const resp = await api.request(`/api/agendamentos/disponibilidade?${query.toString()}`);
      const slots = resp.slots || [];

      if (slots.length === 0) {
        remarcarSlots.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <p>Nenhum horário disponível nesta data. Tente outro dia.</p>
          </div>
        `;
        return;
      }

      remarcarSlots.innerHTML = '';
      slots.forEach((slot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-btn';
        btn.innerHTML = `
          <span>${api.escaparHtml(slot.hora_inicio)}</span>
          <span class="slot-sub">até ${api.escaparHtml(slot.hora_fim)}</span>
        `;
        btn.addEventListener('click', () => {
          remarcarSlots.querySelectorAll('.slot-btn').forEach((el) => el.classList.remove('selected'));
          btn.classList.add('selected');
          slotRemarcarSelecionado = slot;
          btnRemarcarConfirmar.disabled = false;
        });
        remarcarSlots.appendChild(btn);
      });
    } catch (err) {
      remarcarSlots.innerHTML = '';
      mostrarAlerta(remarcarAlert, err.message, 'error');
    }
  }

  async function abrirModalRemarcar(ag) {
    agendamentoRemarcar = ag;
    slotRemarcarSelecionado = null;
    limparAlerta(remarcarAlert);
    btnRemarcarConfirmar.disabled = true;

    remarcarInfo.textContent = `Serviço: ${ag.nome_servico} (${ag.duracao_min} min) · Horário atual: ${api.formatarDataHora(ag.data_hora_inicio)}`;

    remarcarBarbeiro.innerHTML =
      '<option value="sem_preferencia">Sem preferência (Primeiro disponível)</option>' +
      barbeirosLista
        .map((b) => `<option value="${b.id_barbeiro}">${api.escaparHtml(b.nome)}</option>`)
        .join('');
    remarcarBarbeiro.value = String(ag.id_barbeiro);

    const dataAtual = String(ag.data_hora_inicio).slice(0, 10);
    remarcarData.value = dataAtual >= hoje ? dataAtual : hoje;

    modalRemarcar.classList.add('open');
    modalRemarcar.setAttribute('aria-hidden', 'false');

    await carregarSlotsRemarcacao();
  }

  remarcarBarbeiro.addEventListener('change', carregarSlotsRemarcacao);
  remarcarData.addEventListener('change', carregarSlotsRemarcacao);
  btnRemarcarCancelar.addEventListener('click', fecharModalRemarcar);
  btnRemarcarFechar.addEventListener('click', fecharModalRemarcar);
  modalRemarcar.addEventListener('click', (e) => {
    if (e.target === modalRemarcar) fecharModalRemarcar();
  });

  btnRemarcarConfirmar.addEventListener('click', async () => {
    if (!agendamentoRemarcar || !slotRemarcarSelecionado) return;
    limparAlerta(remarcarAlert);

    btnRemarcarConfirmar.disabled = true;
    btnRemarcarConfirmar.textContent = 'Salvando...';

    try {
      const resp = await api.request(`/api/agendamentos/${agendamentoRemarcar.id_agendamento}/remarcar`, {
        method: 'PUT',
        body: {
          id_barbeiro: remarcarBarbeiro.value,
          data_hora_inicio: slotRemarcarSelecionado.data_hora_inicio,
        },
      });

      api.mostrarToast(resp.mensagem || 'Agendamento remarcado com sucesso!', 'success');
      fecharModalRemarcar();
      await Promise.all([carregarMeusAgendamentos(), carregarDisponibilidade()]);
    } catch (err) {
      mostrarAlerta(remarcarAlert, err.message, 'error');
      api.mostrarToast(err.message, 'error');
    } finally {
      btnRemarcarConfirmar.disabled = false;
      btnRemarcarConfirmar.textContent = 'Confirmar Remarcação';
    }
  });

  btnAtualizarMeus.addEventListener('click', carregarMeusAgendamentos);

  carregarCatalogoInicial();
  carregarMeusAgendamentos();
})();
