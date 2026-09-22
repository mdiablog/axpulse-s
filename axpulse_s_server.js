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
  appId: process.env.TIKTOK_APP_ID || "7688014162606409748",
  clientKey: process.env.TIKTOK_CLIENT_KEY || "sbawk88emjz4g51sxq",
  clientSecret: process.env.TIKTOK_CLIENT_SECRET || "3ZGXgeTYqWqDM8wG9h2NqQtEIWD0F8ch",
  publishEndpoint: "https://open.tiktokapis.com/v2/post/publish/video/init/"
};

const TOKEN_FILE = path.join(__dirname, '.tiktok_token');
let TIKTOK_USER_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

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
 * Despacho Directo a TikTok Content Posting API v2 (FILE_UPLOAD / PUSH)
 * No requiere verificación previa de dominios
 */
async function dispatchTikTokDirect(content, userAccessToken) {
  console.log(`[AXpulse-S] Despachando video a TikTok Content Posting API (FILE_UPLOAD)...`);

  if (!content.video_url) {
    return { success: false, error: "TikTok exige un video_url válido (MP4 vertical 9:16)." };
  }

  try {
    // 1. Descargar el video a buffer en memoria
    console.log(`[AXpulse-S] Descargando video desde ${content.video_url}...`);
    const vidResp = await axios.get(content.video_url, { 
      responseType: 'arraybuffer',
      timeout: 30000 
    });
    const videoBuffer = Buffer.from(vidResp.data);
    const videoSize = videoBuffer.length;
    console.log(`[AXpulse-S] Video descargado: ${videoSize} bytes. Inicializando en TikTok...`);

    // 2. Inicializar publicación directa vía FILE_UPLOAD (Sandbox exige SELF_ONLY)
    const initPayload = {
      post_info: {
        title: content.title || content.headline || "Médica Frontera — Urología Reconstructiva (COFEPRIS 2407012002A00464)",
        privacy_level: content.privacy_level || "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1
      }
    };

    const initResp = await axios.post(TIKTOK_CONFIG.publishEndpoint, initPayload, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      timeout: 45000
    });

    const uploadUrl = initResp.data?.data?.upload_url;
    const publishId = initResp.data?.data?.publish_id;

    if (!uploadUrl) {
      return { success: false, error: "TikTok no devolvió upload_url", details: initResp.data };
    }

    console.log(`[AXpulse-S] Transfiriendo video a TikTok (Publish ID: ${publishId})...`);
    await axios.put(uploadUrl, videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoSize,
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log(`[AXpulse-S] Video subido exitosamente a TikTok!`);
    return {
      success: true,
      publish_id: publishId,
      status: "PUBLISHED_DIRECT",
      message: "Video publicado exitosamente en TikTok vía Content Posting API v2.",
      data: initResp.data
    };

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
        const token = req.body.tiktok_token || TIKTOK_USER_TOKEN || process.env.TIKTOK_ACCESS_TOKEN;
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

/**
 * TikTok OAuth Flow: Login, Callback y Token Exchange
 */
app.get('/api/axpulse-s/auth/tiktok/login', (req, res) => {
  const clientKey = req.query.client_key || TIKTOK_CONFIG.clientKey;
  const redirectUri = encodeURIComponent("https://axpulse-s.onrender.com/api/axpulse-s/auth/tiktok/callback");
  const scope = encodeURIComponent("user.info.basic,video.publish,video.upload");
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&state=axpulse_auth`;
  res.redirect(authUrl);
});

app.get('/api/axpulse-s/auth/tiktok/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res.status(400).send(`<h3>Error de autenticación TikTok:</h3><p>${error}: ${error_description}</p>`);
  }
  if (!code) {
    return res.status(400).send(`<h3>No se recibió código de autorización de TikTok.</h3>`);
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || TIKTOK_CONFIG.clientKey;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || TIKTOK_CONFIG.clientSecret || "";
    const redirectUri = "https://axpulse-s.onrender.com/api/axpulse-s/auth/tiktok/callback";

    console.log(`[AXpulse-S] Intercambiando código OAuth por access token de TikTok...`);
    const params = new URLSearchParams();
    params.append('client_key', clientKey);
    params.append('client_secret', clientSecret);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);

    const tokenResp = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });

    const data = tokenResp.data;
    const accessToken = data.access_token || data.data?.access_token;

    if (accessToken) {
      TIKTOK_USER_TOKEN = accessToken;
      try { fs.writeFileSync(TOKEN_FILE, accessToken, 'utf8'); } catch(e) {}
      console.log(`[AXpulse-S] TikTok Access Token recibido y activado!`);

      // Despacho Inmediato del Video Clínico a TikTok
      let dispatchResult = null;
      try {
        console.log(`[AXpulse-S] Disparando despacho automático del video clínico...`);
        dispatchResult = await dispatchTikTokDirect({
          title: "Médica Frontera — Urología Reconstructiva (COFEPRIS 2407012002A00464)",
          video_url: "https://apexconsilium.com/video/medica_frontera_tiktok_light.mp4",
          privacy_level: "SELF_ONLY"
        }, accessToken);
        console.log(`[AXpulse-S] Despacho automático completado:`, dispatchResult);
      } catch (dispErr) {
        console.error(`[AXpulse-S] Error en despacho automático:`, dispErr.message);
        dispatchResult = { success: false, error: dispErr.message };
      }

      const publishStatusHtml = dispatchResult?.success 
        ? `<div style="margin: 20px 0; padding: 16px; background: #F0FDF4; border-radius: 8px; color: #166534; font-weight: 600; border: 1px solid #BBF7D0;">
             🎉 ¡VIDEO PUBLICADO EN TIKTOK!<br>
             <span style="font-size: 13px; font-weight: normal; color: #15803D;">Publish ID: <code>${dispatchResult.publish_id || 'OK'}</code></span>
           </div>
           <p style="color: #64748B; font-size: 14px;">El video clínico Remotion (tema claro, música + voz-off, COFEPRIS) ya está en <b>@medicafrontera</b>.</p>`
        : `<div style="margin: 20px 0; padding: 16px; background: #FEF2F2; border-radius: 8px; color: #991B1B; font-size: 14px;">
             Aviso de despacho: ${JSON.stringify(dispatchResult?.error || dispatchResult)}
           </div>`;

      return res.send(`
        <html>
          <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 60px; background: #F8FAFC;">
            <div style="background: white; border-radius: 16px; padding: 40px; max-width: 560px; margin: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #E2E8F0;">
              <div style="font-size: 48px; margin-bottom: 16px;">🛡️</div>
              <h2 style="color: #0F172A; margin: 0 0 12px;">Médica Frontera — TikTok Conectado</h2>
              <p style="color: #475569; font-size: 16px; line-height: 1.5;">El token de acceso de <b>@medicafrontera</b> ha sido activado.</p>
              ${publishStatusHtml}
            </div>
          </body>
        </html>
      `);
    } else {
      return res.status(400).json({ error: "No se obtuvo access_token de TikTok", details: data });
    }
  } catch (err) {
    console.error("[AXpulse-S OAuth Token Error]", err.response?.data || err.message);
    return res.status(500).json({ error: "Fallo en intercambio de token", details: err.response?.data || err.message, code });
  }
});

app.post('/api/axpulse-s/auth/tiktok/token', (req, res) => {
  const { token, client_secret, client_key } = req.body;
  if (token) TIKTOK_USER_TOKEN = token;
  if (client_key) TIKTOK_CONFIG.clientKey = client_key;
  if (client_secret) TIKTOK_CONFIG.clientSecret = client_secret;
  return res.json({ 
    success: true, 
    message: "Credenciales de TikTok actualizadas.", 
    token_active: !!TIKTOK_USER_TOKEN 
  });
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

/**
 * Panel Web Oficial de Demostración y Auditoría para TikTok Developer Review
 * GET / (o /demo)
 */
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Médica Frontera — AXpulse-S Social Posting Hub (TikTok Content API)</title>
  <style>
    :root {
      --primary: #0284C7;
      --primary-dark: #0369A1;
      --emerald: #059669;
      --bg: #F8FAFC;
      --card: #FFFFFF;
      --text: #0F172A;
      --text-muted: #64748B;
      --border: #E2E8F0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 40px 20px; line-height: 1.5; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 32px; }
    .header h1 { font-size: 26px; color: var(--text); margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .header p { color: var(--text-muted); font-size: 15px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .card h2 { font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: #1E293B; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #ECFDF5; color: var(--emerald); border: 1px solid #A7F3D0; }
    .badge.oauth { background: #F0F9FF; color: var(--primary); border-color: #BAE6FD; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all 0.2s; border: none; width: 100%; }
    .btn-tiktok { background: #000000; color: #FFFFFF; }
    .btn-tiktok:hover { background: #18181B; }
    .btn-primary { background: var(--primary); color: #FFFFFF; }
    .btn-primary:hover { background: var(--primary-dark); }
    .video-preview { border-radius: 12px; overflow: hidden; background: #000; aspect-ratio: 9/16; max-height: 420px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; }
    .video-preview video { width: 100%; height: 100%; object-fit: cover; }
    .meta-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
    .meta-item:last-child { border-bottom: none; }
    .meta-item span:first-child { color: var(--text-muted); }
    .meta-item span:last-child { font-weight: 500; }
    .compliance-box { background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 10px; padding: 12px; font-size: 12px; color: #475569; margin-top: 16px; }
    .footer { text-align: center; font-size: 13px; color: var(--text-muted); margin-top: 40px; border-top: 1px solid var(--border); padding-top: 20px; }
    .footer a { color: var(--primary); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ Médica Frontera — Hub de Publicación TikTok</h1>
      <p>AXpulse-S Automated Social Dispatcher • Content Posting API v2 • Remotion Clinical Engine</p>
    </div>

    <div class="grid">
      <!-- Columna 1: Autorización y Cuentas -->
      <div class="card">
        <h2>🔗 Conexión de Creador TikTok</h2>
        <div style="margin-bottom: 16px;">
          <span class="badge oauth">OAuth 2.0 Direct</span>
          <span class="badge">App ID: 7688014162606409748</span>
        </div>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 20px;">
          Permite al titular médico conectar su cuenta <b>@medicafrontera</b> para autorizar la publicación directa de cápsulas educativas y avisos de salud.
        </p>

        <a href="/api/axpulse-s/auth/tiktok/login" class="btn btn-tiktok">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>
          Conectar / Renovar Token @medicafrontera
        </a>

        <div style="margin-top: 24px;">
          <h3 style="font-size: 14px; margin-bottom: 10px; color: #334155;">Estado de la Integración:</h3>
          <div class="meta-item">
            <span>Canal:</span>
            <span>TikTok Direct Post v2</span>
          </div>
          <div class="meta-item">
            <span>Método de Subida:</span>
            <span>FILE_UPLOAD (Stream Binario)</span>
          </div>
          <div class="meta-item">
            <span>Scopes Solicitados:</span>
            <span>user.info.basic, video.publish, video.upload</span>
          </div>
          <div class="meta-item">
            <span>Tenant Activo:</span>
            <span>medica_frontera (Hospitalario)</span>
          </div>
        </div>

        <div class="compliance-box">
          ⚖️ <b>Aviso Legal Obligatorio:</b> Aviso de Publicidad COFEPRIS No. 2407012002A00464. Todos los posts incluyen descargo clínico y enlaces a políticas de privacidad conforme a los lineamientos sanitarios de México.
        </div>
      </div>

      <!-- Columna 2: Video Clínico y Despacho -->
      <div class="card">
        <h2>🎬 Video Clínico Listo para Envío</h2>
        <div class="video-preview">
          <video controls poster="https://apexconsilium.com/video/medica_frontera_tiktok_light.mp4">
            <source src="https://apexconsilium.com/video/medica_frontera_tiktok_light.mp4" type="video/mp4">
            Tu navegador no soporta video MP4.
          </video>
        </div>

        <div class="meta-item">
          <span>Resolución:</span>
          <span>1080 x 1920 (Vertical 9:16)</span>
        </div>
        <div class="meta-item">
          <span>Audio:</span>
          <span>Voz-off médica sincronizada + BGM (-18dB)</span>
        </div>
        <div class="meta-item">
          <span>Motor Gráfico:</span>
          <span>Remotion 4.0 (Lienzo Clínico Blanco)</span>
        </div>

        <button onclick="dispatchPost()" id="dispatchBtn" class="btn btn-primary" style="margin-top: 16px;">
          🚀 Disparar Envío a TikTok (@medicafrontera)
        </button>
        <div id="dispatchMsg" style="margin-top: 12px; font-size: 13px; text-align: center;"></div>
      </div>
    </div>

    <div class="footer">
      <p>Médica Frontera • APEX Consilium • <a href="https://medicafrontera.com/privacidad" target="_blank">Aviso de Privacidad</a> • <a href="https://medicafrontera.com/terminos" target="_blank">Términos del Servicio</a></p>
    </div>
  </div>

  <script>
    async function dispatchPost() {
      const btn = document.getElementById('dispatchBtn');
      const msg = document.getElementById('dispatchMsg');
      btn.disabled = true;
      btn.innerText = 'Transfiriendo a TikTok...';
      msg.innerHTML = '<span style="color: #0284C7;">Procesando video binario y contactando TikTok API...</span>';

      try {
        const resp = await fetch('/api/axpulse-s/dispatch-clinical-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline: 'Médica Frontera — Urología Reconstructiva (COFEPRIS 2407012002A00464)',
            copy: 'Procedimientos de alta especialidad urológica y reconstructiva en Médica Frontera.',
            video_url: 'https://apexconsilium.com/video/medica_frontera_tiktok_light.mp4',
            channels: ['tiktok']
          })
        });
        const data = await resp.json();
        if (data.dispatched && data.dispatched[0] && data.dispatched[0].success) {
          msg.innerHTML = '<span style="color: #059669; font-weight: 600;">✅ ¡Publicación exitosa en TikTok! Publish ID: ' + (data.dispatched[0].publish_id || 'OK') + '</span>';
        } else {
          msg.innerHTML = '<span style="color: #DC2626;">Aviso: ' + JSON.stringify(data.dispatched ? data.dispatched[0] : data) + '</span>';
        }
      } catch (e) {
        msg.innerHTML = '<span style="color: #DC2626;">Error: ' + e.message + '</span>';
      } finally {
        btn.disabled = false;
        btn.innerText = '🚀 Disparar Envío a TikTok (@medicafrontera)';
      }
    }
  </script>
</body>
</html>
  `);
});


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[AXpulse-S] Servidor escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
