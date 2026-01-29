/**
 * Multi-channel notification system.
 * Supports Discord, Slack, Telegram, and Email.
 */

import { createTransport } from 'nodemailer';

// --- Discord ---

export async function sendDiscord(webhookUrl, message) {
  if (!webhookUrl) return;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
}

export function formatDiscordStudy(study) {
  const payStr = study.pay_amount ? `$${study.pay_amount}` : 'N/A';
  const durStr = study.duration_minutes ? `${study.duration_minutes}min` : 'N/A';
  return [
    `**NEW STUDY** on **${study.platform}**`,
    `> **${study.title}**`,
    `> Pay: ${payStr} | Duration: ${durStr}`,
    study.url ? `> ${study.url}` : '',
    `> Hourly equiv: $${study.pay_amount && study.duration_minutes ? ((study.pay_amount / study.duration_minutes) * 60).toFixed(0) : '?'}/hr`,
  ].filter(Boolean).join('\n');
}

// --- Slack ---

export async function sendSlack(webhookUrl, message) {
  if (!webhookUrl) return;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
}

// --- Telegram ---

export async function sendTelegram(botToken, chatId, message) {
  if (!botToken || !chatId) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
  if (!res.ok) throw new Error(`Telegram send failed: ${res.status}`);
}

// --- Email ---

export async function sendEmail(config, subject, body) {
  if (!config.host || !config.user) return;
  const transporter = createTransport({
    host: config.host,
    port: config.port || 587,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  await transporter.sendMail({
    from: config.user,
    to: config.to || config.user,
    subject,
    text: body,
  });
}

// --- Unified Notifier ---

export async function notifyAll(studies) {
  if (!studies || studies.length === 0) return;

  const errors = [];

  for (const study of studies) {
    const message = formatStudyMessage(study);

    // Discord
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscord(process.env.DISCORD_WEBHOOK_URL, formatDiscordStudy(study));
      } catch (e) { errors.push(`Discord: ${e.message}`); }
    }

    // Slack
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await sendSlack(process.env.SLACK_WEBHOOK_URL, message);
      } catch (e) { errors.push(`Slack: ${e.message}`); }
    }

    // Telegram
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        await sendTelegram(
          process.env.TELEGRAM_BOT_TOKEN,
          process.env.TELEGRAM_CHAT_ID,
          message
        );
      } catch (e) { errors.push(`Telegram: ${e.message}`); }
    }

    // Email
    if (process.env.SMTP_USER) {
      try {
        await sendEmail(
          {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            to: process.env.NOTIFY_EMAIL,
          },
          `[ZoomArb] New $${study.pay_amount || '?'} study on ${study.platform}`,
          message
        );
      } catch (e) { errors.push(`Email: ${e.message}`); }
    }
  }

  if (errors.length > 0) {
    console.error('Notification errors:', errors);
  }
}

function formatStudyMessage(study) {
  const payStr = study.pay_amount ? `$${study.pay_amount}` : 'N/A';
  const durStr = study.duration_minutes ? `${study.duration_minutes}min` : 'N/A';
  const hourly = study.pay_amount && study.duration_minutes
    ? `$${((study.pay_amount / study.duration_minutes) * 60).toFixed(0)}/hr`
    : 'N/A';

  return [
    `NEW STUDY on ${study.platform}`,
    `Title: ${study.title}`,
    `Pay: ${payStr} (${hourly} effective)`,
    `Duration: ${durStr}`,
    study.url ? `Link: ${study.url}` : '',
    study.description ? `\n${study.description.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n');
}
