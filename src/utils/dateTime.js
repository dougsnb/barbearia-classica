/**
 * Utilitários de data e hora sem ambiguidade de fuso horário para o MySQL DATETIME.
 * Utiliza o offset configurado em DB_TIMEZONE (padrão -03:00 / Horário de Brasília).
 */

function obterOffsetMinutos() {
  const tz = String(process.env.DB_TIMEZONE || '-03:00').trim();
  const match = tz.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return -180;
  const sinal = match[1] === '-' ? -1 : 1;
  return sinal * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Retorna a data/hora atual ajustada para o fuso configurado (ex.: -03:00).
 * As propriedades UTC* do objeto Date retornado representam o horário local da barbearia.
 */
function agoraNoFuso() {
  const offsetMin = obterOffsetMinutos();
  return new Date(Date.now() + offsetMin * 60000);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hojeYYYYMMDD() {
  const d = agoraNoFuso();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function minutosAtuaisNoDia() {
  const d = agoraNoFuso();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function validarDataYYYYMMDD(dataStr) {
  if (typeof dataStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return false;
  }
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    dt.getUTCFullYear() === ano &&
    dt.getUTCMonth() === mes - 1 &&
    dt.getUTCDate() === dia
  );
}

/**
 * Retorna 0 (Domingo) a 6 (Sábado) para uma string YYYY-MM-DD.
 */
function obterDiaSemana(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/**
 * Converte "HH:MM" ou "HH:MM:SS" para total de minutos desde 00:00.
 */
function timeParaMinutos(timeStr) {
  const partes = String(timeStr).trim().split(':');
  const h = Number(partes[0]);
  const m = Number(partes[1] || 0);
  return h * 60 + m;
}

/**
 * Converte minutos desde 00:00 para "HH:MM".
 */
function minutosParaHHMM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * Converte um Date (vindo do mysql2) ou string DATETIME para { data: 'YYYY-MM-DD', horaMin: number, sql: 'YYYY-MM-DD HH:MM:SS' }.
 */
function parseDateTimeMysql(valor) {
  if (valor instanceof Date) {
    const ano = valor.getFullYear();
    const mes = pad2(valor.getMonth() + 1);
    const dia = pad2(valor.getDate());
    const h = valor.getHours();
    const m = valor.getMinutes();
    const s = valor.getSeconds();
    return {
      data: `${ano}-${mes}-${dia}`,
      horaMin: h * 60 + m,
      sql: `${ano}-${mes}-${dia} ${pad2(h)}:${pad2(m)}:${pad2(s)}`,
    };
  }

  const str = String(valor).trim().replace('T', ' ');
  const match = str.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const h = Number(match[2]);
  const m = Number(match[3]);
  const s = Number(match[4] || 0);
  return {
    data: match[1],
    horaMin: h * 60 + m,
    sql: `${match[1]} ${pad2(h)}:${pad2(m)}:${pad2(s)}`,
  };
}

/**
 * Normaliza entrada de data_hora_inicio (ex.: "2026-11-20 14:30" ou "2026-11-20T14:30:00")
 * e calcula data_hora_fim somando duracaoMin.
 */
function calcularIntervaloSql(dataHoraInicioStr, duracaoMin) {
  const parsed = parseDateTimeMysql(dataHoraInicioStr);
  if (!parsed || !validarDataYYYYMMDD(parsed.data)) {
    return null;
  }

  const inicioMin = parsed.horaMin;
  const fimMin = inicioMin + Number(duracaoMin);
  if (inicioMin < 0 || inicioMin >= 1440 || fimMin > 1440) {
    return null;
  }

  const inicioSql = `${parsed.data} ${minutosParaHHMM(inicioMin)}:00`;
  const fimSql =
    fimMin === 1440
      ? `${parsed.data} 23:59:59`
      : `${parsed.data} ${minutosParaHHMM(fimMin)}:00`;

  return {
    data: parsed.data,
    diaSemana: obterDiaSemana(parsed.data),
    inicioMin,
    fimMin,
    inicioHHMM: minutosParaHHMM(inicioMin),
    fimHHMM: minutosParaHHMM(fimMin),
    inicioSql,
    fimSql,
  };
}

/**
 * Compara um slot ("YYYY-MM-DD" + hora em minutos) com o momento atual da barbearia.
 */
function ehPassadoOuAgora(dataStr, inicioMin) {
  const hoje = hojeYYYYMMDD();
  if (dataStr < hoje) return true;
  if (dataStr > hoje) return false;
  return inicioMin <= minutosAtuaisNoDia();
}

function formatarDataHoraBR(valor) {
  const parsed = parseDateTimeMysql(valor);
  if (!parsed) return String(valor);
  const [ano, mes, dia] = parsed.data.split('-');
  return `${dia}/${mes}/${ano} às ${minutosParaHHMM(parsed.horaMin)}`;
}

module.exports = {
  agoraNoFuso,
  hojeYYYYMMDD,
  minutosAtuaisNoDia,
  validarDataYYYYMMDD,
  obterDiaSemana,
  timeParaMinutos,
  minutosParaHHMM,
  parseDateTimeMysql,
  calcularIntervaloSql,
  ehPassadoOuAgora,
  formatarDataHoraBR,
};
