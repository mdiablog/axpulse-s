/**
 * AXpulse-S: Dispatcher Multi-Tenant y Enrutador Social de Alta Fidelidad
 * APEX Consilium - Ecosistema AXWorks
 * Integración Directa: Meta Graph API / Zernio API + TikTok Content Posting API + Remotion 4.0
 * CERO SIMULACIÓN - CERO MAKE PARA META
 */

const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3099;
const FABRIC_STUDIO_URL = process.env.FABRIC_STUDIO_URL || "https://apex-fabric-studio.onrender.com";

// Configuración de APIs Directas de Redes Sociales (Zernio & Meta Graph API)
const ZERNIO_CONFIG = {
  baseUrl: "https://zernio.com/api/v1",
  keys: {
    apexconsilium: "sk_9b5177e01aa66dfe4aba12aa21d4784ab0fba93f5f840ca03560115a6ac2d4e3",
    medicafrontera: "sk_48a428af12758b8c091a7c2d2a4c8cb75bf669281959378de3e9723d4f511c11"
  }
};

// Configuración Oficial de TikTok Developers (Medica Frontera App)
const TIKTOK_CONFIG = {
  appId: "7688014162606409748",
  clientKey: "awgxmeuvkr2dfcm6",
  publishEndpoint: "https://open.tiktokapis.com/v2/post/publish/video/init/"
};

// Configuración de Notificaciones Telegram (@AXWorks_bot)
const TELEGRAM_CONFIG = {
  token: "8979622088:AAEp0C5DprxBgQoO1WAbL2AE5AgSCmjYy6g",
  chatId: "8914386793" // Raul Rivera
};

/**
 * Despacho Directo a Meta (Facebook / Instagram) vía API Directa
 */
async function dispatchMetaDirect(tenant_id, content, platform = 'facebook') {
  const apiKey = (tenant_id === 'medica_frontera') 
    ? ZERNIO_CONFIG.keys.medicafrontera 
    : ZERNIO_CONFIG.keys.apexconsilium;

  console.log(`[AXpulse-S] Despachando a Meta (${platform}) vía API Directa para tenant: ${tenant_id}...`);

  try {
    const payload = {
      platform: platform, // 'facebook' o 'instagram'
      message: content.body || content.text || content.headline,
      media_url: content.video_url || content.poster_url || content.image_url || null,
      media_type: content.video_url ? 'video' : (content.poster_url ? 'image' : 'text')
    };

    const resp = await axios.post(`${ZERNIO_CONFIG.baseUrl}/social/publish`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return { success: true, status: resp.status, data: resp.data };
  } catch (err) {
    console.error(`[AXpulse-S Meta API Error]`, err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Despacho Directo a TikTok Content Posting API v2
 */
async function dispatchTikTokDirect(content, userAccessToken) {
  console.log(`[AXpulse-S] Despachando video a TikTok Content Posting API...`);

  if (!content.video_url) {
    return { success: false, error: "TikTok exige un video_url válido (MP4 vertical 9:16)." };
  }

  try {
    const payload = {
      post_info: {
        title: content.title || content.headline || "Médica Frontera — Red Quirúrgica de Alta Especialidad",
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: content.video_url
      }
    };

    const resp = await axios.post(TIKTOK_CONFIG.publishEndpoint, payload, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      timeout: 45000
    });

    return { success: true, status: resp.status, data: resp.data };
  } catch (err) {
    console.error(`[AXpulse-S TikTok API Error]`, err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Webhook Universal de Entrada (Single Ingress Router)
 * POST /api/axpulse-s/ingress
 */
app.post('/api/axpulse-s/ingress', async (req, res) => {
  const { tenant_id, action, channels, content, metadata, auth_tokens } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: "Falta el parámetro obligatorio 'tenant_id'." });
  }

  console.log(`[AXpulse-S] Ingress recibido | Tenant: ${tenant_id} | Acción: ${action}`);

  // Pipeline de Multimedia:
  // 1. Si viene video_url (Remotion 4.0 / Anything2Explainer), se respeta con máxima prioridad
  // 2. Si no viene ni video ni imagen, solicitar poster a Fabric Studio
  if (!content.video_url && !content.poster_url && !content.image_url) {
    try {
      console.log(`[AXpulse-S] Solicitando poster estático a Fabric Studio (${FABRIC_STUDIO_URL})...`);
      const fabricResp = await axios.post(`${FABRIC_STUDIO_URL}/api/render`, {
        tenant: tenant_id,
        format: content.format || '1080x1080',
        title: content.title || content.headline || '',
        body: content.body || content.summary || content.text || '',
        tag: content.tag || metadata?.category || ''
      }, { timeout: 25000 });

      if (fabricResp.data && fabricResp.data.publicUrl) {
        content.poster_url = fabricResp.data.publicUrl;
        content.image_url = fabricResp.data.publicUrl;
      }
    } catch (fabricErr) {
      console.warn(`[AXpulse-S Aviso] Fabric Studio offline/timeout: ${fabricErr.message}. Procediendo con texto.`);
    }
  }

  const results = [];
  const targetChannels = Array.isArray(channels) ? channels : ['facebook', 'instagram'];

  for (const ch of targetChannels) {
    if (ch === 'facebook' || ch === 'instagram') {
      // META DIRECT API (CERO MAKE)
      const metaRes = await dispatchMetaDirect(tenant_id, content, ch);
      results.push({ channel: ch, method: "DIRECT_API", ...metaRes });
    } else if (ch === 'tiktok') {
      // TIKTOK CONTENT POSTING API
      const token = auth_tokens?.tiktok || process.env.TIKTOK_ACCESS_TOKEN;
      if (token) {
        const ttRes = await dispatchTikTokDirect(content, token);
        results.push({ channel: ch, method: "TIKTOK_API_V2", ...ttRes });
      } else {
        console.warn(`[AXpulse-S] TikTok seleccionado pero sin user_access_token provisto. Encolando para despacho autenticado.`);
        results.push({ 
          channel: ch, 
          status: "QUEUED_AUTH_REQUIRED", 
          app_id: TIKTOK_CONFIG.appId,
          client_key: TIKTOK_CONFIG.clientKey,
          instructions: "Requiere autorizar OAuth de @medicafrontera para emitir bearer token."
        });
      }
    } else {
      console.log(`[AXpulse-S] Canal ${ch} encolado en buffer.`);
      results.push({ channel: ch, status: "BUFFERED" });
    }
  }

  return res.json({
    success: true,
    tenant_id,
    content_type: content.video_url ? "REMOTION_VIDEO" : (content.poster_url ? "FABRIC_POSTER" : "TEXT"),
    dispatched: results
  });
});

/**
 * Despacho de Contenido Clínico Educativo con Aviso COFEPRIS Mandatorio
 * Cumplimiento con Capítulos 8 y 9 del Whitepaper
 * POST /api/axpulse-s/dispatch-clinical-post
 */
app.post('/api/axpulse-s/dispatch-clinical-post', async (req, res) => {
  const { topic, headline, copy, video_url, channels = ["facebook", "instagram", "tiktok"], metadata = {} } = req.body;

  if (!headline || (!copy && !video_url)) {
    return res.status(400).json({ error: "Faltan 'headline' y ('copy' o 'video_url') para el post clínico." });
  }

  const COFEPRIS_NOTICE = "Aviso de Publicidad COFEPRIS: 2407012002A00464. Procedimiento de alta especialidad sujeto a valoración médica previa.";
  const formattedBody = copy 
    ? `${copy.trim()}\n\n━━━━━━━━━━━━━━━━━━━━━\n🛡️ ${COFEPRIS_NOTICE}\n🌐 Coordinación Clínica: medicafrontera.com`
    : `🛡️ ${COFEPRIS_NOTICE}\n🌐 Coordinación Clínica: medicafrontera.com`;

  const ingressPayload = {
    tenant_id: "medica_frontera",
    action: "clinical_education_post",
    channels: channels,
    content: {
      title: headline,
      headline: headline,
      body: formattedBody,
      video_url: video_url || null,
      format: video_url ? "1080x1920" : "1080x1080",
      theme: "clinical_clean",
      badge: "COFEPRIS 2407012002A00464"
    },
    metadata: {
      ...metadata,
      topic: topic || "himplant_advancement",
      cofepris_folio: "2407012002A00464",
      source: "Whitepaper Dr. Sergio Acosta 2026",
      render_engine: video_url ? "Remotion 4.0 Kinetic" : "Apex Fabric Studio"
    }
  };

  try {
    // Reutilizar lógica de despacho interna
    const results = [];
    for (const ch of channels) {
      if (ch === 'facebook' || ch === 'instagram') {
        const mRes = await dispatchMetaDirect("medica_frontera", ingressPayload.content, ch);
        results.push({ channel: ch, method: "DIRECT_API", ...mRes });
      } else if (ch === 'tiktok') {
        const token = req.body.tiktok_token || process.env.TIKTOK_ACCESS_TOKEN;
        if (token && video_url) {
          const ttRes = await dispatchTikTokDirect(ingressPayload.content, token);
          results.push({ channel: ch, method: "TIKTOK_API_V2", ...ttRes });
        } else {
          results.push({ 
            channel: ch, 
            status: "PENDING_OAUTH_TOKEN", 
            message: "App Medica Frontera (7688014162606409748) lista. Requiere user token de @medicafrontera." 
          });
        }
      } else {
        results.push({ channel: ch, status: "BUFFERED" });
      }
    }

    return res.json({
      success: true,
      service: "Médica Frontera Urología de Alta Especialidad",
      cofepris_compliant: true,
      headline,
      video_included: !!video_url,
      dispatched: results
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Alertas Inmediatas a Telegram (@AXWorks_bot)
 * POST /api/axpulse-s/alert
 */
app.post('/api/axpulse-s/alert', async (req, res) => {
  const { type, tenant_id, customer, details } = req.body;

  if (!type || !tenant_id) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios (type, tenant_id)." });
  }

  const tenantName = (tenant_id === 'medica_frontera') ? "Médica Frontera" : "APEX Consilium";
  const rawPhone = customer?.phone || "";
  const cleanPhone = rawPhone.replace(/\D/g, "");

  let text = "";
  const inlineKeyboard = [];

  if (type === 'hot_lead') {
    text = `🔥 <b>¡HOT LEAD DETECTADO!</b>\n` +
           `━━━━━━━━━━━━━━━━━━━━━\n` +
           `🏢 <b>Tenant:</b> ${tenantName}\n` +
           `👤 <b>Prospecto:</b> ${customer?.name || "No especificado"}\n` +
           `📱 <b>WhatsApp:</b> ${customer?.phone || "No especificado"}\n` +
           `🎯 <b>Interés:</b> ${details?.interest || "Faloplastia Himplant / Valoración"}\n` +
           `💬 <b>Mensaje:</b> <i>"${details?.message || "Sin mensaje"}"</i>\n` +
           `📊 <b>Score IA:</b> <code>${details?.score || 95}/100</code>\n` +
           `⏰ <b>Hora:</b> ${new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })}\n` +
           `━━━━━━━━━━━━━━━━━━━━━\n` +
           `⚡ <i>Acción recomendada: Contactar en menos de 5 minutos.</i>`;

    if (cleanPhone) {
      inlineKeyboard.push([
        { text: "📱 Contactar por WhatsApp", url: `https://wa.me/${cleanPhone}` },
        { text: "📋 Ver en AXcrm", url: "https://apexconsilium.com" }
      ]);
    }
  } else if (type === 'complaint') {
    text = `🚨 <b>¡ALERTA ROJA: QUEJA / CASO CRÍTICO!</b>\n` +
           `━━━━━━━━━━━━━━━━━━━━━\n` +
           `🏢 <b>Tenant:</b> ${tenantName}\n` +
           `👤 <b>Cliente:</b> ${customer?.name || 'Sin nombre'}\n` +
           `⚠️ <b>Motivo:</b> ${details?.reason || 'Reclamo o insatisfacción'}\n` +
           `🛑 <b>Protocolo:</b> Bot IA <b>PAUSADO</b> en su canal.\n` +
           `⏰ <b>Hora:</b> ${new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })}\n` +
           `━━━━━━━━━━━━━━━━━━━━━\n` +
           `🚨 <i>Intervención Humana Inmediata Requerida.</i>`;

    if (cleanPhone) {
      inlineKeyboard.push([
        { text: "🚨 Abrir Chat Urgente en WhatsApp", url: `https://wa.me/${cleanPhone}` }
      ]);
    }
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_CONFIG.token}/sendMessage`;
    const tgRes = await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CONFIG.chatId,
      parse_mode: 'HTML',
      text: text,
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
    }, { timeout: 10000 });

    return res.json({ success: true, telegram_status: tgRes.status, type, tenant_id });
  } catch (err) {
    console.error(`[ERROR Telegram Alert]`, err.response?.data || err.message);
    return res.status(500).json({ error: "Fallo al enviar alerta a Telegram", details: err.message });
  }
});

app.get('/api/axpulse-s/status', (req, res) => {
  res.json({
    status: "ONLINE",
    module: "AXpulse-S Multi-Tenant Router (Zero-Make Architecture)",
    meta_integration: "DIRECT_API (Zernio & Graph API)",
    tiktok_integration: {
      app_id: TIKTOK_CONFIG.appId,
      client_key: TIKTOK_CONFIG.clientKey,
      status: "CONFIGURED"
    },
    video_engine: "Remotion 4.0 Kinetic Subtitles + Apex Fabric Studio",
    telegram_alerts: "ENABLED"
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[AXpulse-S] Servidor escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
