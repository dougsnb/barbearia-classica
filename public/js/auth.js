(function () {
  'use strict';

  const api = window.BarbeariaAPI;
  const params = new URLSearchParams(window.location.search);
  const servicoParam = params.get('servico');

  // Se já estiver autenticado, redireciona direto para o portal adequado
  const tokenAtual = api.getToken();
  const usuarioAtual = api.getUsuario();
  if (tokenAtual && usuarioAtual) {
    if (usuarioAtual.perfil === 'ADMIN') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = servicoParam
        ? `/cliente.html?servico=${encodeURIComponent(servicoParam)}`
        : '/cliente.html';
    }
    return;
  }

  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnCadastro = document.getElementById('tab-btn-cadastro');
  const formLogin = document.getElementById('form-login');
  const formCadastro = document.getElementById('form-cadastro');
  const authAlert = document.getElementById('auth-alert');
  const authHeading = document.getElementById('auth-heading');

  function exibirAlerta(mensagem, tipo = 'error') {
    authAlert.textContent = mensagem;
    authAlert.className = `alert-banner ${tipo} visible`;
  }

  function limparAlerta() {
    authAlert.textContent = '';
    authAlert.className = 'alert-banner';
  }

  function ativarAba(aba) {
    limparAlerta();
    const ehLogin = aba === 'login';

    tabBtnLogin.classList.toggle('active', ehLogin);
    tabBtnLogin.setAttribute('aria-selected', String(ehLogin));
    tabBtnCadastro.classList.toggle('active', !ehLogin);
    tabBtnCadastro.setAttribute('aria-selected', String(!ehLogin));

    formLogin.style.display = ehLogin ? 'flex' : 'none';
    formCadastro.style.display = ehLogin ? 'none' : 'flex';
    authHeading.textContent = ehLogin ? 'Acesse sua conta' : 'Crie sua conta';
  }

  tabBtnLogin.addEventListener('click', () => ativarAba('login'));
  tabBtnCadastro.addEventListener('click', () => ativarAba('cadastro'));

  if (params.get('aba') === 'cadastro') {
    ativarAba('cadastro');
  }

  if (params.get('expirada') === '1') {
    exibirAlerta('Sua sessão expirou ou requer autenticação. Faça login para continuar.', 'warning');
  }

  formLogin.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparAlerta();

    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn = document.getElementById('btn-submit-login');

    if (!email || !senha) {
      exibirAlerta('Preencha seu e-mail e sua senha.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      const resposta = await api.request('/api/auth/login', {
        method: 'POST',
        body: { email, senha },
      });

      api.salvarSessao(resposta.token, resposta.usuario);
      api.mostrarToast(`Bem-vindo(a), ${resposta.usuario.nome}!`, 'success');

      if (resposta.usuario.perfil === 'ADMIN') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = servicoParam
          ? `/cliente.html?servico=${encodeURIComponent(servicoParam)}`
          : '/cliente.html';
      }
    } catch (err) {
      exibirAlerta(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  formCadastro.addEventListener('submit', async (event) => {
    event.preventDefault();
    limparAlerta();

    const nome = document.getElementById('cad-nome').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const btn = document.getElementById('btn-submit-cadastro');

    if (!nome || !email || !senha) {
      exibirAlerta('Nome, e-mail e senha são obrigatórios.', 'error');
      return;
    }

    if (senha.length < 6) {
      exibirAlerta('A senha deve possuir pelo menos 6 caracteres.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    try {
      await api.request('/api/auth/register', {
        method: 'POST',
        body: { nome, email, telefone, senha },
      });

      formCadastro.reset();
      ativarAba('login');
      document.getElementById('login-email').value = email;
      document.getElementById('login-senha').focus();

      exibirAlerta('Conta criada com sucesso! Faça login com seu e-mail e senha.', 'success');
      api.mostrarToast('Cadastro realizado com sucesso!', 'success');
    } catch (err) {
      exibirAlerta(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar Conta';
    }
  });
})();
