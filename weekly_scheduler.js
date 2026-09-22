/**
 * weekly_scheduler.js
 * Orquestador y Gobernanza de Calendario Semanal de Contenidos para Médica Frontera
 * Cumplimiento Estricto de ADR-037 (Protección Anti-Spam & Maximización SEO/GEO)
 * Suite AX - APEX Consilium
 */

const fs = require('fs');
const path = require('path');
const { humanizeClinicalText } = require('./humanizer_filter');

const QUEUE_FILE = path.join(__dirname, 'weekly_content_queue.json');

// Límites Máximos Semanales Inviolables (ADR-037)
const WEEKLY_LIMITS = {
  tiktok_videos: 5,           // 1 diario Lun-Vie (12:00 PM o 7:00 PM)
  youtube_long_form: 1,       // 1 por semana (Jueves 6:00 PM)
  youtube_shorts: 3,          // 3 por semana (Lun, Mié, Vie 1:00 PM)
  instagram_reels: 5,         // Sincronizados con TikTok
  instagram_carousels: 3,     // Mar, Jue, Sáb (11:00 AM)
  facebook_feed: 4,           // Mar, Jue, Vie, Dom
  blog_articles: 1            // Miércoles (9:00 AM)
};

// Matriz de Días y Tipos de Contenido Permitidos
const DAY_SCHEDULE_MATRIX = {
  1: { // Lunes
    slots: [
      { channel: 'tiktok', type: 'spot_bang_motion', format: '9:16', hour: 12 },
      { channel: 'youtube_shorts', type: 'spot_bang_motion', format: '9:16', hour: 13 },
      { channel: 'instagram_reels', type: 'spot_bang_motion', format: '9:16', hour: 12 }
    ]
  },
  2: { // Martes
    slots: [
      { channel: 'tiktok', type: 'whiteboard_animator', format: '9:16', hour: 12 },
      { channel: 'instagram_carousels', type: 'carousel_mixed', format: '1:1', hour: 11 },
      { channel: 'facebook_feed', type: 'carousel_mixed', format: '1:1', hour: 11 }
    ]
  },
  3: { // Miércoles
    slots: [
      { channel: 'blog', type: 'clinical_article_geo', format: 'web', hour: 9 },
      { channel: 'tiktok', type: 'spot_bang_motion', format: '9:16', hour: 12 },
      { channel: 'youtube_shorts', type: 'spot_bang_motion', format: '9:16', hour: 13 },
      { channel: 'instagram_reels', type: 'spot_bang_motion', format: '9:16', hour: 12 }
    ]
  },
  4: { // Jueves
    slots: [
      { channel: 'youtube_long', type: 'explainer_anything2explainer', format: '16:9', hour: 18 },
      { channel: 'tiktok', type: 'whiteboard_animator', format: '9:16', hour: 12 },
      { channel: 'instagram_carousels', type: 'carousel_mixed', format: '1:1', hour: 11 },
      { channel: 'facebook_feed', type: 'carousel_mixed', format: '1:1', hour: 11 }
    ]
  },
  5: { // Viernes
    slots: [
      { channel: 'tiktok', type: 'spot_bang_motion', format: '9:16', hour: 12 },
      { channel: 'youtube_shorts', type: 'spot_bang_motion', format: '9:16', hour: 13 },
      { channel: 'instagram_reels', type: 'spot_bang_motion', format: '9:16', hour: 12 },
      { channel: 'facebook_feed', type: 'spot_bang_motion', format: '9:16', hour: 14 }
    ]
  },
  6: { // Sábado
    slots: [
      { channel: 'instagram_carousels', type: 'carousel_mixed', format: '1:1', hour: 11 },
      { channel: 'facebook_feed', type: 'carousel_mixed', format: '1:1', hour: 11 }
    ]
  },
  0: { // Domingo
    slots: [
      { channel: 'facebook_feed', type: 'case_study_reflective', format: '1:1', hour: 16 }
    ]
  }
};

/**
 * Carga la cola semanal desde disco
 */
function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    const initial = {
      week_id: getWeekId(new Date()),
      created_at: new Date().toISOString(),
      items: [],
      published_history: []
    };
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch (e) {
    console.error(`[Weekly Scheduler] Error al leer cola:`, e);
    return { week_id: getWeekId(new Date()), items: [], published_history: [] };
  }
}

/**
 * Guarda la cola semanal
 */
function saveQueue(data) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Genera un ID de semana ISO
 */
function getWeekId(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo < 10 ? '0' + weekNo : weekNo}`;
}

/**
 * Cuenta cuántos elementos se han programado o publicado en la semana actual por canal
 */
function countWeeklyDispatches(queueData, channel) {
  const currentWeek = getWeekId(new Date());
  const activeItems = (queueData.items || []).filter(it => it.week_id === currentWeek && it.channel === channel);
  const publishedItems = (queueData.published_history || []).filter(it => it.week_id === currentWeek && it.channel === channel);
  return activeItems.length + publishedItems.length;
}

/**
 * Encola un nuevo contenido validando límites anti-spam y aplicando humanizer
 */
function enqueueContentItem(item) {
  const queue = loadQueue();
  const currentWeek = getWeekId(new Date());

  // Limpieza y filtro de humanizer sobre el copy y guion
  const humanized = humanizeClinicalText(item.copy || item.script || item.headline || "");

  // Validación de cuota anti-spam
  const limitKeyMap = {
    'tiktok': 'tiktok_videos',
    'youtube_long': 'youtube_long_form',
    'youtube_shorts': 'youtube_shorts',
    'instagram_reels': 'instagram_reels',
    'instagram_carousels': 'instagram_carousels',
    'facebook_feed': 'facebook_feed',
    'blog': 'blog_articles'
  };

  const limitKey = limitKeyMap[item.channel];
  if (limitKey && WEEKLY_LIMITS[limitKey]) {
    const currentCount = countWeeklyDispatches(queue, item.channel);
    if (currentCount >= WEEKLY_LIMITS[limitKey]) {
      return {
        success: false,
        error: `[ADR-037 Anti-Spam Guard] Límite semanal alcanzado para ${item.channel} (${currentCount}/${WEEKLY_LIMITS[limitKey]}). Publicar más penalizaría el SEO/GEO y la retención.`
      };
    }
  }

  const newItem = {
    id: `content_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    week_id: currentWeek,
    channel: item.channel,
    content_type: item.content_type || 'spot_bang_motion', // spot_bang_motion | explainer_anything2explainer | whiteboard_animator | carousel_mixed
    headline: item.headline || '',
    copy: humanized.cleanText,
    script: item.script ? humanizeClinicalText(item.script).cleanText : '',
    video_url: item.video_url || null,
    image_urls: item.image_urls || [],
    cofepris_folio: "2407012002A00464",
    scheduled_day: item.scheduled_day || 1, // 0 = Dom, 1 = Lun, etc.
    scheduled_hour: item.scheduled_hour || 12,
    status: 'scheduled', // scheduled | rendering_cloud | ready_to_publish | published | error
    created_at: new Date().toISOString()
  };

  queue.items.push(newItem);
  saveQueue(queue);

  return {
    success: true,
    item: newItem,
    slop_detected: humanized.detectedPatterns
  };
}

/**
 * Obtiene el estado actual del calendario semanal y cuotas
 */
function getWeeklyScheduleStatus() {
  const queue = loadQueue();
  const currentWeek = getWeekId(new Date());

  const quotas = {};
  for (const [key, max] of Object.entries(WEEKLY_LIMITS)) {
    const channelMap = {
      'tiktok_videos': 'tiktok',
      'youtube_long_form': 'youtube_long',
      'youtube_shorts': 'youtube_shorts',
      'instagram_reels': 'instagram_reels',
      'instagram_carousels': 'instagram_carousels',
      'facebook_feed': 'facebook_feed',
      'blog_articles': 'blog'
    };
    const ch = channelMap[key];
    const used = countWeeklyDispatches(queue, ch);
    quotas[key] = {
      channel: ch,
      current: used,
      max: max,
      remaining: Math.max(0, max - used),
      status: used >= max ? 'CAP_REACHED' : 'OPEN'
    };
  }

  return {
    week_id: currentWeek,
    server_time: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
    quotas,
    total_queued: (queue.items || []).length,
    queued_items: queue.items,
    day_matrix: DAY_SCHEDULE_MATRIX
  };
}

module.exports = {
  WEEKLY_LIMITS,
  DAY_SCHEDULE_MATRIX,
  loadQueue,
  saveQueue,
  enqueueContentItem,
  getWeeklyScheduleStatus,
  getWeekId
};
