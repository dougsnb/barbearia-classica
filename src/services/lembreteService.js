const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const { formatarDataHoraBR } = require('../utils/dateTime');

let tarefaCron = null;

/**
 * Cria o transporter SMTP do Nodemailer a partir das variáveis de ambiente.
 */
function criarTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function montarHtmlLembrete(ag) {
  const dataHoraFormatada = formatarDataHoraBR(ag.data_hora_inicio);
  const precoFormatado = Number(ag.preco).toFixed(2).replace('.', ',');
  const appUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const portalUrl = `${appUrl}/cliente.html`;

  return `
    <div style="font-family: Arial, sans-serif; background:#111315; color:#F3F4F6; padding:24px; border-radius:8px; max-width:560px;">
      <h2 style="color:#C9A24D; margin-top:0;">Barbearia Clássica — Lembrete de Agendamento</h2>
      <p>Olá, <strong>${ag.nome_cliente}</strong>.</p>
      <p>Este é um lembrete automático do seu horário reservado conosco:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0; background:#1A1D21; border:1px solid #2A2E33;">
        <tr><td style="padding:10px; color:#9CA3AF;">Serviço</td><td style="padding:10px; font-weight:bold;">${ag.nome_servico}</td></tr>
        <tr><td style="padding:10px; color:#9CA3AF;">Barbeiro</td><td style="padding:10px;">${ag.nome_barbeiro}</td></tr>
        <tr><td style="padding:10px; color:#9CA3AF;">Data e Hora</td><td style="padding:10px; color:#C9A24D; font-weight:bold;">${dataHoraFormatada}</td></tr>
        <tr><td style="padding:10px; color:#9CA3AF;">Duração</td><td style="padding:10px;">${ag.duracao_min} min</td></tr>
        <tr><td style="padding:10px; color:#9CA3AF;">Valor</td><td style="padding:10px;">R$ ${precoFormatado}</td></tr>
      </table>
      <p style="font-size:13px; color:#9CA3AF;">Caso precise cancelar, acesse o portal do cliente antes do horário marcado.</p>
      <p><a href="${portalUrl}" style="color:#C9A24D; font-weight:bold;">Acessar meu agendamento</a></p>
    </div>
  `;
}

/**
 * Busca agendamentos próximos (dentro da janela configurada, padrão 120 min)
 * que ainda não possuam lembrete ENVIADO e dispara os e-mails.
 */
async function processarLembretes() {
  const antecedenciaMin = Number(process.env.LEMBRETE_ANTECEDENCIA_MIN) || 120;
  const transporter = criarTransporter();
  const appUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const portalUrl = `${appUrl}/cliente.html`;

  if (!transporter) {
    return { processados: 0, enviados: 0, falhas: 0, ignorado: true };
  }

  let pendentes = [];
  try {
    const [rows] = await db.query(
      `SELECT a.id_agendamento,
              DATE_FORMAT(a.data_hora_inicio, '%Y-%m-%d %H:%i:%s') AS data_hora_inicio,
              u.nome AS nome_cliente,
              u.email AS email_cliente,
              b.nome AS nome_barbeiro,
              s.nome AS nome_servico,
              s.duracao_min,
              s.preco,
              l.id_lembrete
       FROM AGENDAMENTO a
       INNER JOIN USUARIO u ON u.id_usuario = a.id_cliente
       INNER JOIN BARBEIRO b ON b.id_barbeiro = a.id_barbeiro
       INNER JOIN SERVICO s ON s.id_servico = a.id_servico
       LEFT JOIN LEMBRETE l ON l.id_agendamento = a.id_agendamento AND l.canal = 'EMAIL'
       WHERE a.status = 'AGENDADO'
         AND a.data_hora_inicio > NOW()
         AND a.data_hora_inicio <= DATE_ADD(NOW(), INTERVAL ? MINUTE)
         AND (l.id_lembrete IS NULL OR l.status = 'PENDENTE')`,
      [antecedenciaMin]
    );
    pendentes = rows;
  } catch (err) {
    console.error('[LembreteService] Erro ao consultar agendamentos para lembrete:', err.message);
    return { processados: 0, enviados: 0, falhas: 0, erro: err.message };
  }

  let enviados = 0;
  let falhas = 0;
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;

  for (const ag of pendentes) {
    try {
      await transporter.sendMail({
        from: remetente,
        to: ag.email_cliente,
        subject: `Lembrete: ${ag.nome_servico} com ${ag.nome_barbeiro} — Barbearia Clássica`,
        text: `Olá, ${ag.nome_cliente}! Lembramos que seu horário de ${ag.nome_servico} com ${ag.nome_barbeiro} é em ${formatarDataHoraBR(ag.data_hora_inicio)}. Acesse ${portalUrl} para gerenciar seu agendamento.`,
        html: montarHtmlLembrete(ag),
      });

      if (ag.id_lembrete) {
        await db.query(
          `UPDATE LEMBRETE SET status = 'ENVIADO', enviado_em = NOW() WHERE id_lembrete = ?`,
          [ag.id_lembrete]
        );
      } else {
        await db.query(
          `INSERT INTO LEMBRETE (id_agendamento, canal, status, enviado_em) VALUES (?, 'EMAIL', 'ENVIADO', NOW())`,
          [ag.id_agendamento]
        );
      }
      enviados += 1;
    } catch (err) {
      falhas += 1;
      console.error(
        `[LembreteService] Falha ao enviar lembrete do agendamento #${ag.id_agendamento}:`,
        err.message
      );

      if (ag.id_lembrete) {
        await db
          .query(`UPDATE LEMBRETE SET status = 'FALHA' WHERE id_lembrete = ?`, [ag.id_lembrete])
          .catch(() => {});
      } else {
        await db
          .query(
            `INSERT INTO LEMBRETE (id_agendamento, canal, status) VALUES (?, 'EMAIL', 'FALHA')`,
            [ag.id_agendamento]
          )
          .catch(() => {});
      }
    }
  }

  return { processados: pendentes.length, enviados, falhas, ignorado: false };
}

/**
 * Inicializa a rotina recorrente via node-cron (padrão: a cada 15 minutos).
 */
function iniciarCronLembretes() {
  const expressao = process.env.LEMBRETE_CRON_EXPRESSION || '*/15 * * * *';

  if (!cron.validate(expressao)) {
    console.error(`[LembreteService] Expressão cron inválida: "${expressao}". Usando padrão "*/15 * * * *".`);
  }

  const exprFinal = cron.validate(expressao) ? expressao : '*/15 * * * *';

  if (tarefaCron) {
    tarefaCron.stop();
  }

  tarefaCron = cron.schedule(exprFinal, async () => {
    await processarLembretes();
  });

  return tarefaCron;
}

module.exports = {
  criarTransporter,
  processarLembretes,
  iniciarCronLembretes,
};
