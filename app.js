// OQS Media — YouTube Analytics Dashboard

const CHANNEL_COLORS = ['#ffffff', '#3498db', '#2ecc71', '#9b59b6'];
const REFRESH_INTERVAL = 60_000; // 1 minute for subscriber count refresh
const API_BASE = 'http://localhost:3001'; // Backend server URL

let channelData = [];
let allVideos = [];
let regularVideos = [];
let shortsVideos = [];
let refreshTimer = null;
let currentSort = { videos: { field: 'views', direction: 'desc' }, shorts: { field: 'views', direction: 'desc' } };

// ── Bootstrap ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Hide setup modal since credentials are hardwired
  document.getElementById('setup-modal').classList.add('hidden');
  showDashboard();

  document.getElementById('refresh-btn').addEventListener('click', () => fetchAllData());
  document.getElementById('channel-filter-select').addEventListener('change', renderVideosTable);
  document.getElementById('shorts-filter-select').addEventListener('change', renderShortsTable);

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => onSortColumn(th.dataset.sort, th.dataset.table));
  });
});

// ── Dashboard Setup ────────────────────────────────────────────

async function showDashboard() {
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

async function fetchFromBackend(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error || res.statusText;
      throw new Error(`API error: ${msg}`);
    }
    return res.json();
  } catch (err) {
    console.error(`Failed to fetch from ${endpoint}:`, err);
    throw err;
  }
}

// ── Data Fetching ──────────────────────────────────────────────

async function fetchAllData() {
  showLoading(true);
  try {
    const data = await fetchFromBackend('/api/youtube-data');

    channelData = data.channelData;
    allVideos = data.allVideos;
    regularVideos = data.regularVideos;
    shortsVideos = data.shortsVideos;

    // Render everything
    renderTopPerformer();
    renderChannelCards();
    renderViewsChart();
    renderLineChart();
    populateChannelFilter();
    renderVideosTable();
    renderShortsTable();
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
    const data = await fetchFromBackend('/api/subscriber-counts');

    data.subscriberData.forEach(item => {
      const ch = channelData.find(c => c.id === item.id);
      if (ch) {
        ch.subscribers = item.subscribers;
        ch.totalViews = item.totalViews;
      }
    });

    renderTopPerformer();
    renderChannelCards();
    updateTimestamp();
  } catch (err) {
    console.error('Subscriber refresh failed:', err);
  }
}

// ── Video Type Separation ──────────────────────────────────────

function separateVideoTypes() {
  regularVideos = allVideos.filter(v => !v.isShort);
  shortsVideos = allVideos.filter(v => v.isShort);

  regularVideos.sort((a, b) => b.views - a.views);
  shortsVideos.sort((a, b) => b.views - a.views);
}

// ── Rendering ──────────────────────────────────────────────────

function renderTopPerformer() {
  const banner = document.getElementById('top-performer-banner');
  if (channelData.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  let topChannel = null;
  let topViews = -1;
  channelData.forEach(ch => {
    const est = estimate24hViews(ch);
    if (est > topViews) {
      topViews = est;
      topChannel = ch;
    }
  });

  if (!topChannel) {
    banner.classList.add('hidden');
    return;
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentCount = allVideos.filter(
    v => v.channelId === topChannel.id && new Date(v.publishedAt).getTime() >= oneDayAgo
  ).length;

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="top-performer-icon">&#9733;</div>
    <div class="top-performer-content">
      <div class="top-performer-label">Top Performer — Last 24 Hours</div>
      <div class="top-performer-channel" style="color: ${topChannel.color === '#ffffff' ? '#fff' : topChannel.color}">
        ${escapeHtml(topChannel.title)}
      </div>
      <div class="top-performer-stats">
        <span>Est. Views: <span class="top-performer-stat-value">${formatNumber(topViews)}</span></span>
        <span>Subscribers: <span class="top-performer-stat-value">${formatNumber(topChannel.subscribers)}</span></span>
        <span>Videos (24h): <span class="top-performer-stat-value">${recentCount}</span></span>
      </div>
    </div>
    <img class="channel-avatar" src="${topChannel.thumbnail}" alt="${escapeHtml(topChannel.title)}" />
  `;
}

function renderChannelCards() {
  const container = document.getElementById('channel-cards');

  let topId = null;
  let topViews = -1;
  channelData.forEach(ch => {
    const est = estimate24hViews(ch);
    if (est > topViews) {
      topViews = est;
      topId = ch.id;
    }
  });

  container.innerHTML = channelData.map((ch) => {
    const avgViews = calculateChannelAverage(ch);
    const currentViews = estimate24hViews(ch);
    const isBeating = currentViews >= avgViews;
    const diffPercent = avgViews > 0 ? Math.round(((currentViews - avgViews) / avgViews) * 100) : 0;
    const performanceText = isBeating
      ? `+${diffPercent}% vs avg`
      : `${diffPercent}% vs avg`;
    const performanceColor = isBeating ? '#2ecc71' : '#e74c3c';

    return `
      <div class="channel-card${ch.id === topId ? ' top-channel' : ''}">
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
            <div class="stat-value recent-views">${formatNumber(currentViews)}</div>
            <div class="performance-indicator" style="color: ${performanceColor}; font-size: 0.85em; margin-top: 0.25rem;">
              ${performanceText}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
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

// ── 30-Day Line Chart ──────────────────────────────────────────

function renderLineChart() {
  const canvas = document.getElementById('performance-canvas');
  const ctx = canvas.getContext('2d');

  // Set up high-DPI canvas
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = rect.width - 48;
  const height = 350;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);

  // Chart dimensions
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Generate 30-day data for each channel
  const now = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }

  const channelDailyData = channelData.map(ch => {
    return days.map(day => {
      const dayStart = day.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const dayVideos = allVideos.filter(v =>
        v.channelId === ch.id &&
        new Date(v.publishedAt).getTime() >= dayStart &&
        new Date(v.publishedAt).getTime() < dayEnd
      );

      if (dayVideos.length > 0) {
        return dayVideos.reduce((sum, v) => sum + v.views, 0);
      }

      const channelVideos = allVideos.filter(v => v.channelId === ch.id);
      if (channelVideos.length === 0) return 0;

      let totalDailyRate = 0;
      channelVideos.slice(0, 5).forEach(v => {
        const ageMs = now.getTime() - new Date(v.publishedAt).getTime();
        const ageDays = Math.max(ageMs / (24 * 60 * 60 * 1000), 1);
        totalDailyRate += v.views / ageDays;
      });

      const variation = 0.8 + Math.random() * 0.4;
      return Math.round(totalDailyRate * variation);
    });
  });

  const allValues = channelDailyData.flat();
  const maxVal = Math.max(...allValues, 1);
  const niceMax = niceNumber(maxVal);

  ctx.clearRect(0, 0, width, height);

  // Draw grid lines
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();

    const val = niceMax - (niceMax / gridLines) * i;
    ctx.fillStyle = '#717171';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(Math.round(val)), padding.left - 10, y + 4);
  }

  // Draw X-axis labels
  ctx.fillStyle = '#717171';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  days.forEach((day, i) => {
    const x = padding.left + (chartW / (days.length - 1)) * i;
    const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (i % 3 === 0 || i === days.length - 1) {
      ctx.fillText(label, x, height - padding.bottom + 20);
    }
  });

  // Draw lines for each channel
  channelDailyData.forEach((data, chIdx) => {
    const color = channelData[chIdx].color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    data.forEach((val, i) => {
      const x = padding.left + (chartW / (days.length - 1)) * i;
      const y = padding.top + chartH - (val / niceMax) * chartH;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    data.forEach((val, i) => {
      const x = padding.left + (chartW / (days.length - 1)) * i;
      const y = padding.top + chartH - (val / niceMax) * chartH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Render legend
  const legendContainer = document.getElementById('line-chart-legend');
  legendContainer.innerHTML = channelData.map(ch => `
    <div class="legend-item">
      <div class="legend-swatch" style="background: ${ch.color}"></div>
      <span>${escapeHtml(ch.title)}</span>
    </div>
  `).join('');
}

function niceNumber(val) {
  const exp = Math.floor(Math.log10(val));
  const base = Math.pow(10, exp);
  const frac = val / base;
  if (frac <= 1.5) return 1.5 * base;
  if (frac <= 2) return 2 * base;
  if (frac <= 3) return 3 * base;
  if (frac <= 5) return 5 * base;
  return 10 * base;
}

function populateChannelFilter() {
  const selects = [
    document.getElementById('channel-filter-select'),
    document.getElementById('shorts-filter-select'),
  ];
  selects.forEach(select => {
    select.innerHTML = '<option value="all">All Channels</option>';
    channelData.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.title;
      select.appendChild(opt);
    });
  });
}

function renderVideosTable() {
  const tbody = document.getElementById('videos-tbody');
  const filterChannel = document.getElementById('channel-filter-select').value;

  let videos = filterChannel === 'all'
    ? [...regularVideos]
    : regularVideos.filter(v => v.channelId === filterChannel);

  const sort = currentSort.videos;
  videos.sort((a, b) => {
    let aVal, bVal;
    if (sort.field === 'published') {
      aVal = new Date(a.publishedAt);
      bVal = new Date(b.publishedAt);
    } else {
      aVal = a[sort.field];
      bVal = b[sort.field];
    }
    const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return sort.direction === 'desc' ? -cmp : cmp;
  });

  videos = videos.slice(0, 15);

  tbody.innerHTML = videos.map((v, idx) => `
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

function renderShortsTable() {
  const tbody = document.getElementById('shorts-tbody');
  const filterChannel = document.getElementById('shorts-filter-select').value;

  let videos = filterChannel === 'all'
    ? [...shortsVideos]
    : shortsVideos.filter(v => v.channelId === filterChannel);

  const sort = currentSort.shorts;
  videos.sort((a, b) => {
    let aVal, bVal;
    if (sort.field === 'published') {
      aVal = new Date(a.publishedAt);
      bVal = new Date(b.publishedAt);
    } else {
      aVal = a[sort.field];
      bVal = b[sort.field];
    }
    const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return sort.direction === 'desc' ? -cmp : cmp;
  });

  videos = videos.slice(0, 15);

  tbody.innerHTML = videos.map((v, idx) => `
    <tr>
      <td><img class="video-thumbnail" src="${v.thumbnail}" alt="" loading="lazy" /></td>
      <td class="video-title"><a href="https://youtube.com/shorts/${v.id}" target="_blank">${escapeHtml(v.title)}</a></td>
      <td><span class="video-channel-badge" style="background: ${v.channelColor}22; color: ${v.channelColor}; border: 1px solid ${v.channelColor}44;">${escapeHtml(v.channelTitle)}</span></td>
      <td class="video-date">${formatDate(v.publishedAt)}</td>
      <td>${formatNumber(v.views)}</td>
      <td>${formatNumber(v.likes)}</td>
      <td>${formatNumber(v.comments)}</td>
    </tr>
  `).join('');

  if (videos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No shorts found.</td></tr>';
  }
}

function onSortColumn(field, table) {
  const sortState = currentSort[table];
  if (sortState.field === field) {
    sortState.direction = sortState.direction === 'desc' ? 'asc' : 'desc';
  } else {
    sortState.field = field;
    sortState.direction = 'desc';
  }

  document.querySelectorAll(`th.sortable[data-table="${table}"]`).forEach(th => {
    th.classList.toggle('active', th.dataset.sort === field);
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === field) {
      arrow.innerHTML = sortState.direction === 'desc' ? '&#9662;' : '&#9652;';
    } else {
      arrow.innerHTML = '&#9662;';
    }
  });

  if (table === 'videos') {
    renderVideosTable();
  } else {
    renderShortsTable();
  }
}

// ── Utility ────────────────────────────────────────────────────

function estimate24hViews(channel) {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentVideos = allVideos.filter(
    v => v.channelId === channel.id && new Date(v.publishedAt).getTime() >= oneDayAgo
  );

  if (recentVideos.length > 0) {
    return recentVideos.reduce((sum, v) => sum + v.views, 0);
  }

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

function calculateChannelAverage(channel) {
  const channelVideos = allVideos.filter(v => v.channelId === channel.id);
  if (channelVideos.length === 0) return 0;

  let totalDailyRate = 0;
  channelVideos.forEach(v => {
    const ageMs = Date.now() - new Date(v.publishedAt).getTime();
    const ageDays = Math.max(ageMs / (24 * 60 * 60 * 1000), 1);
    totalDailyRate += v.views / ageDays;
  });

  return Math.round(totalDailyRate / channelVideos.length);
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
