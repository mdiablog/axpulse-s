/**
 * cloud_render_bridge.js
 * Módulo de integración entre AXpulse-S y GitHub Actions para Renderizado en la Nube
 * Repositorio: APEX-Remotion/remotion-video-studio
 * Workflow: render-video.yml
 * CERO CONSUMO DE CPU/RAM LOCAL — Compilación desatendida en runners de GitHub
 */

const fs = require('fs');
const path = require('path');

const GITHUB_CONFIG = {
  owner: 'APEX-Remotion',
  repo: 'remotion-video-studio',
  workflowId: 'render-video.yml',
  token: process.env.GITHUB_REMOTION_TOKEN || (fs.existsSync(path.join(__dirname, '.github_token')) ? fs.readFileSync(path.join(__dirname, '.github_token'), 'utf8').trim() : ''),
  ref: 'main'
};

/**
 * Dispara el workflow de renderizado en GitHub Actions
 * @param {string} compositionId Ej: 'MedicaSpotBangMotion' o 'MedicaCannesAd'
 * @param {object} customInputs Parámetros adicionales
 */
async function triggerCloudRender(compositionId, customInputs = {}) {
  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/actions/workflows/${GITHUB_CONFIG.workflowId}/dispatches`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: GITHUB_CONFIG.ref,
        inputs: {
          composition: compositionId,
          ...customInputs
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        status: res.status,
        error: errText
      };
    }

    console.log(`[Cloud Render Bridge] Render disparado exitosamente para ${compositionId}. Status: ${res.status}`);
    return {
      success: true,
      status: res.status,
      compositionId,
      dispatched_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[Cloud Render Bridge ERROR]`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Obtiene el estado de las ejecuciones recientes del workflow
 */
async function getLatestWorkflowRuns(limit = 5) {
  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/actions/workflows/${GITHUB_CONFIG.workflowId}/runs?per_page=${limit}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: res.status, error: errText };
    }

    const data = await res.json();
    const runs = (data?.workflow_runs || []).map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.created_at,
      updated_at: r.updated_at,
      html_url: r.html_url
    }));

    return { success: true, runs };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  triggerCloudRender,
  getLatestWorkflowRuns,
  GITHUB_CONFIG
};
