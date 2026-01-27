// YouTube Analytics Dashboard - Application Logic

const CHANNEL_COLORS = ['#FF0000', '#3498db', '#2ecc71', '#9b59b6'];
const STORAGE_KEY = 'yt-dashboard-config';
const REFRESH_INTERVAL = 60_000; // 1 minute for subscriber count refresh

let config = null;
let channelData = [];
let allVideos = [];
let refreshTimer = null;
let currentSort = { field: 'published', direction: 'desc' };

// ── Bootstrap ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    config = JSON.parse(saved);
    showDashboard();
  } else {
    showSetup();
  }

  document.getElementById('save-config').addEventListener('click', onSaveConfig);
  document.getElementById('refresh-btn').addEventListener('click', () => fetchAllData());
  document.getElementById('settings-btn').addEventListener('click', showSetup);
  document.getElementById('channel-filter-select').addEventListener('change', renderVideosTable);

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => onSortColumn(th.dataset.sort));
  });
});

// ── Setup / Config ─────────────────────────────────────────────

function showSetup() {
  document.getElementById('setup-modal').classList.remove('hidden');
  if (config) {
    document.getElementById('api-key').value = config.apiKey || '';
    config.channelIds.forEach((id, i) => {
      const input = document.querySelector(`.channel-input[data-index="${i}"]`);
      if (input) input.value = id;
    });
  }
}

function onSaveConfig() {
  const apiKey = document.getElementById('api-key').value.trim();
  const channelIds = Array.from(document.querySelectorAll('.channel-input'))
    .map(el => el.value.trim())
    .filter(Boolean);

  const errorEl = document.getElementById('setup-error');

  if (!apiKey) {
    errorEl.textContent = 'Please enter a YouTube Data API key.';
    return;
  }
  if (channelIds.length === 0) {
    errorEl.textContent = 'Please enter at least one channel ID.';
    return;
  }
  if (channelIds.length > 4) {
    errorEl.textContent = 'Maximum of 4 channels supported.';
    return;
  }

  errorEl.textContent = '';
  config = { apiKey, channelIds };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  showDashboard();
}

async function showDashboard() {
  document.getElementById('setup-modal').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  await fetchAllData();
  startAutoRefresh();
}

// ── Auto Refresh ───────────────────────────────────────────────

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => fetchSubscriberCounts(), REFRESH_INTERVAL);
}

// ── API Helpers ────────────────────────────────────────────────

async function ytFetch(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  params.key = config.apiKey;
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || res.statusText;
    throw new Error(`YouTube API error: ${msg}`);
  }
  return res.json();
}

// ── Data Fetching ──────────────────────────────────────────────

async function fetchAllData() {
  showLoading(true);
  try {
    // Fetch channel info
    const channelRes = await ytFetch('channels', {
      part: 'snippet,statistics',
      id: config.channelIds.join(','),
    });

    channelData = (channelRes.items || []).map((ch, i) => ({
      id: ch.id,
      title: ch.snippet.title,
      customUrl: ch.snippet.customUrl || '',
      thumbnail: ch.snippet.thumbnails.default.url,
      subscribers: parseInt(ch.statistics.subscriberCount, 10) || 0,
      totalViews: parseInt(ch.statistics.viewCount, 10) || 0,
      videoCount: parseInt(ch.statistics.videoCount, 10) || 0,
      color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
    }));

    // Fetch recent videos for each channel in parallel
    const videoPromises = channelData.map(ch => fetchRecentVideos(ch));
    const videoResults = await Promise.all(videoPromises);

    allVideos = videoResults.flat();

    // Sort by publish date desc by default
    allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Render everything
    renderChannelCards();
    renderViewsChart();
    populateChannelFilter();
    renderVideosTable();
    updateTimestamp();
  } catch (err) {
    console.error(err);
    alert(`Failed to fetch data: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function fetchSubscriberCounts() {
  try {
    const channelRes = await ytFetch('channels', {
      part: 'statistics',
      id: config.channelIds.join(','),
    });

    (channelRes.items || []).forEach(item => {
      const ch = channelData.find(c => c.id === item.id);
      if (ch) {
        ch.subscribers = parseInt(item.statistics.subscriberCount, 10) || 0;
        ch.totalViews = parseInt(item.statistics.viewCount, 10) || 0;
      }
    });

    renderChannelCards();
    updateTimestamp();
  } catch (err) {
    console.error('Subscriber refresh failed:', err);
  }
}

async function fetchRecentVideos(channel) {
  // Step 1: Search for recent uploads
  const searchRes = await ytFetch('search', {
    part: 'snippet',
    channelId: channel.id,
    order: 'date',
    type: 'video',
    maxResults: 15,
  });

  const videoIds = (searchRes.items || []).map(v => v.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  // Step 2: Get full statistics for those videos
  const statsRes = await ytFetch('videos', {
    part: 'snippet,statistics',
    id: videoIds.join(','),
  });

  return (statsRes.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    thumbnail: v.snippet.thumbnails.medium?.url || v.snippet.thumbnails.default?.url,
    publishedAt: v.snippet.publishedAt,
    channelId: channel.id,
    channelTitle: channel.title,
    channelColor: channel.color,
    views: parseInt(v.statistics.viewCount, 10) || 0,
    likes: parseInt(v.statistics.likeCount, 10) || 0,
    comments: parseInt(v.statistics.commentCount, 10) || 0,
  }));
}

// ── Rendering ──────────────────────────────────────────────────

function renderChannelCards() {
  const container = document.getElementById('channel-cards');
  container.innerHTML = channelData.map((ch, i) => `
    <div class="channel-card">
      <div class="channel-color-bar" style="background: ${ch.color}"></div>
      <div class="channel-card-header">
        <img class="channel-avatar" src="${ch.thumbnail}" alt="${ch.title}" />
        <div>
          <div class="channel-name">${escapeHtml(ch.title)}</div>
          <div class="channel-handle">${escapeHtml(ch.customUrl)}</div>
        </div>
      </div>
      <div class="channel-stats">
        <div class="stat-box">
          <div class="stat-label">Subscribers</div>
          <div class="stat-value subscribers">${formatNumber(ch.subscribers)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Views</div>
          <div class="stat-value views">${formatNumber(ch.totalViews)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Videos</div>
          <div class="stat-value videos">${formatNumber(ch.videoCount)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Est. 24h Views</div>
          <div class="stat-value recent-views">${formatNumber(estimate24hViews(ch))}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderViewsChart() {
  const container = document.getElementById('views-chart');
  const estimates = channelData.map(ch => estimate24hViews(ch));
  const maxViews = Math.max(...estimates, 1);

  container.innerHTML = channelData.map((ch, i) => {
    const heightPct = (estimates[i] / maxViews) * 100;
    return `
      <div class="chart-bar-group">
        <div class="channel-label" style="color: ${ch.color}">${escapeHtml(ch.title)}</div>
        <div class="chart-bar-wrapper">
          <div class="chart-bar" style="height: ${Math.max(heightPct, 5)}%; background: ${ch.color}"></div>
        </div>
        <div class="chart-bar-value" style="color: ${ch.color}">${formatNumber(estimates[i])}</div>
      </div>
    `;
  }).join('');
}

function populateChannelFilter() {
  const select = document.getElementById('channel-filter-select');
  // Keep "All Channels" option, remove the rest
  select.innerHTML = '<option value="all">All Channels</option>';
  channelData.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = ch.title;
    select.appendChild(opt);
  });
}

function renderVideosTable() {
  const tbody = document.getElementById('videos-tbody');
  const filterChannel = document.getElementById('channel-filter-select').value;

  let videos = filterChannel === 'all'
    ? [...allVideos]
    : allVideos.filter(v => v.channelId === filterChannel);

  // Apply sort
  videos.sort((a, b) => {
    let aVal, bVal;
    if (currentSort.field === 'published') {
      aVal = new Date(a.publishedAt);
      bVal = new Date(b.publishedAt);
    } else {
      aVal = a[currentSort.field];
      bVal = b[currentSort.field];
    }
    const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return currentSort.direction === 'desc' ? -cmp : cmp;
  });

  // Limit to 15
  videos = videos.slice(0, 15);

  tbody.innerHTML = videos.map(v => `
    <tr>
      <td><img class="video-thumbnail" src="${v.thumbnail}" alt="" loading="lazy" /></td>
      <td class="video-title"><a href="https://youtube.com/watch?v=${v.id}" target="_blank">${escapeHtml(v.title)}</a></td>
      <td><span class="video-channel-badge" style="background: ${v.channelColor}22; color: ${v.channelColor}; border: 1px solid ${v.channelColor}44;">${escapeHtml(v.channelTitle)}</span></td>
      <td class="video-date">${formatDate(v.publishedAt)}</td>
      <td>${formatNumber(v.views)}</td>
      <td>${formatNumber(v.likes)}</td>
      <td>${formatNumber(v.comments)}</td>
    </tr>
  `).join('');

  if (videos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No videos found.</td></tr>';
  }
}

function onSortColumn(field) {
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    currentSort.field = field;
    currentSort.direction = 'desc';
  }

  // Update active class on headers
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.toggle('active', th.dataset.sort === field);
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === field) {
      arrow.innerHTML = currentSort.direction === 'desc' ? '&#9662;' : '&#9652;';
    } else {
      arrow.innerHTML = '&#9662;';
    }
  });

  renderVideosTable();
}

// ── Utility ────────────────────────────────────────────────────

function estimate24hViews(channel) {
  // Estimate based on recent video views from the last 24 hours
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentVideos = allVideos.filter(
    v => v.channelId === channel.id && new Date(v.publishedAt).getTime() >= oneDayAgo
  );

  if (recentVideos.length > 0) {
    // Sum views from videos published in last 24 hours
    return recentVideos.reduce((sum, v) => sum + v.views, 0);
  }

  // Fallback: estimate from most recent videos' average daily rate
  const channelVideos = allVideos.filter(v => v.channelId === channel.id);
  if (channelVideos.length === 0) return 0;

  let totalDailyRate = 0;
  channelVideos.slice(0, 5).forEach(v => {
    const ageMs = Date.now() - new Date(v.publishedAt).getTime();
    const ageDays = Math.max(ageMs / (24 * 60 * 60 * 1000), 1);
    totalDailyRate += v.views / ageDays;
  });

  return Math.round(totalDailyRate);
}

function formatNumber(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs < 1) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
  if (diffHrs < 48) return 'Yesterday';

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

function updateTimestamp() {
  const el = document.getElementById('last-updated');
  el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}
