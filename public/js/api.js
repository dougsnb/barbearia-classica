(function (window) {
  'use strict';

  const STORAGE_TOKEN = 'barbearia_token';
  const STORAGE_USUARIO = 'barbearia_usuario';

  const DIAS_SEMANA = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];

  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN);
  }

  function getUsuario() {
    try {
      const raw = localStorage.getItem(STORAGE_USUARIO);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  function salvarSessao(token, usuario) {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USUARIO, JSON.stringify(usuario));
  }

  function limparSessao() {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USUARIO);
  }

  function sair() {
    limparSessao();
    window.location.href = '/login.html';
  }

  function protegerPagina(perfilExigido) {
    const token = getToken();
    const usuario = getUsuario();

    if (!token || !usuario) {
      limparSessao();
      window.location.href = '/login.html?expirada=1';
      return null;
    }

    if (perfilExigido && usuario.perfil !== perfilExigido) {
      if (usuario.perfil === 'ADMIN') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/cliente.html';
      }
      return null;
    }

    return usuario;
  }

  function escaparHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatarMoeda(valor) {
    const numero = Number(valor) || 0;
    return numero.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function formatarDataHora(dataHoraSql) {
    if (!dataHoraSql) return '—';
    const limpo = String(dataHoraSql).replace('T', ' ').trim();
    const match = limpo.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) return String(dataHoraSql);
    return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
  }

  function formatarData(dataSql) {
    if (!dataSql) return '—';
    const match = String(dataSql).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(dataSql);
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function formatarHora(dataHoraSql) {
    if (!dataHoraSql) return '—';
    const match = String(dataHoraSql).match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : String(dataHoraSql);
  }

  function hojeISO() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function nomeDiaSemana(dia) {
    return DIAS_SEMANA[Number(dia)] || `Dia ${dia}`;
  }

  function garantirToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function mostrarToast(mensagem, tipo = 'info', duracaoMs = 4200) {
    const container = garantirToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.setAttribute('role', 'status');

    const texto = document.createElement('span');
    texto.textContent = mensagem;

    const btnFechar = document.createElement('button');
    btnFechar.type = 'button';
    btnFechar.className = 'toast-close';
    btnFechar.setAttribute('aria-label', 'Fechar notificação');
    btnFechar.textContent = '×';

    const remover = () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };

    btnFechar.addEventListener('click', remover);
    toast.appendChild(texto);
    toast.appendChild(btnFechar);
    container.appendChild(toast);

    if (duracaoMs > 0) {
      setTimeout(remover, duracaoMs);
    }
  }

  function confirmarAcao({
    titulo = 'Confirmar ação',
    mensagem = 'Deseja continuar?',
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Voltar',
    perigoso = false,
  }) {
    return new Promise((resolve) => {
      let backdrop = document.getElementById('global-confirm-modal');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'global-confirm-modal';
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
            <div class="modal-header">
              <h3 id="confirm-modal-title" class="card-title"></h3>
              <button type="button" class="toast-close" id="confirm-modal-close" aria-label="Fechar">×</button>
            </div>
            <p id="confirm-modal-msg" class="muted-text"></p>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost" id="confirm-modal-cancel"></button>
              <button type="button" class="btn" id="confirm-modal-ok"></button>
            </div>
          </div>
        `;
        document.body.appendChild(backdrop);
      }

      const titleEl = backdrop.querySelector('#confirm-modal-title');
      const msgEl = backdrop.querySelector('#confirm-modal-msg');
      const okBtn = backdrop.querySelector('#confirm-modal-ok');
      const cancelBtn = backdrop.querySelector('#confirm-modal-cancel');
      const closeBtn = backdrop.querySelector('#confirm-modal-close');

      titleEl.textContent = titulo;
      msgEl.textContent = mensagem;
      okBtn.textContent = textoConfirmar;
      cancelBtn.textContent = textoCancelar;
      okBtn.className = `btn ${perigoso ? 'btn-danger' : 'btn-primary'}`;

      const limpar = (resultado) => {
        backdrop.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onBackdrop);
        resolve(resultado);
      };

      const onOk = () => limpar(true);
      const onCancel = () => limpar(false);
      const onBackdrop = (e) => {
        if (e.target === backdrop) limpar(false);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onBackdrop);

      backdrop.classList.add('open');
      okBtn.focus();
    });
  }

  async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (config.body && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(endpoint, config);

    let data = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    }

    if (response.status === 401 && !endpoint.includes('/api/auth/login')) {
      limparSessao();
      const naTelaLogin = window.location.pathname.endsWith('/login.html');
      if (!naTelaLogin) {
        window.location.href = '/login.html?expirada=1';
      }
      const err = new Error(data.erro || 'Sessão expirada. Faça login novamente.');
      err.status = 401;
      err.data = data;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(data.erro || data.mensagem || `Erro na requisição (${response.status}).`);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  window.BarbeariaAPI = {
    getToken,
    getUsuario,
    salvarSessao,
    limparSessao,
    sair,
    protegerPagina,
    escaparHtml,
    formatarMoeda,
    formatarDataHora,
    formatarData,
    formatarHora,
    hojeISO,
    nomeDiaSemana,
    mostrarToast,
    confirmarAcao,
    request,
  };
})(window);
