// OQS Media — YouTube Analytics Backend Server

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Hard-wired credentials
const API_KEY = 'AIzaSyAy2lvTU_Uurhxp6BXS_8yOBvsd0B1OMN4';
const CHANNEL_IDS = [
  'UCj87bMLg-sb319zhcJrxz6A',  // Spectator
  'UCMxiv15iK_MFayY_3fU9loQ',  // UnHerd
  'UCJMC-44oT9l97ra5iemDPiA',  // (Channel 3)
  'UChvbiD-vtewbaXD71UCa-pA',  // (Channel 4)
];

const STORAGE_KEY = 'yt-dashboard-config';
const CHANNEL_COLORS = ['#ffffff', '#3498db', '#2ecc71', '#9b59b6'];

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Helper function to make YouTube API calls
async function ytFetch(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  params.key = API_KEY;
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || res.statusText;
    throw new Error(`YouTube API error: ${msg}`);
  }
  return res.json();
}

// Check if duration is a YouTube Short
function isYouTubeShort(duration, title) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return false;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds <= 60 && totalSeconds > 0) return true;
  if (title.toLowerCase().includes('#shorts') || title.toLowerCase().includes('#short')) return true;

  return false;
}

// Fetch recent videos for a channel
async function fetchRecentVideos(channelId, channelTitle, channelColor) {
  try {
    // Step 1: Search for recent uploads
    const searchRes = await ytFetch('search', {
      part: 'snippet',
      channelId: channelId,
      order: 'date',
      type: 'video',
      maxResults: 15,
    });

    const videoIds = (searchRes.items || []).map(v => v.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    // Step 2: Get full statistics and content details
    const statsRes = await ytFetch('videos', {
      part: 'snippet,statistics,contentDetails',
      id: videoIds.join(','),
    });

    return (statsRes.items || []).map(v => ({
      id: v.id,
      title: v.snippet.title,
      thumbnail: v.snippet.thumbnails.medium?.url || v.snippet.thumbnails.default?.url,
      publishedAt: v.snippet.publishedAt,
      channelId: channelId,
      channelTitle: channelTitle,
      channelColor: channelColor,
      views: parseInt(v.statistics.viewCount, 10) || 0,
      likes: parseInt(v.statistics.likeCount, 10) || 0,
      comments: parseInt(v.statistics.commentCount, 10) || 0,
      duration: v.contentDetails?.duration || '',
      isShort: isYouTubeShort(v.contentDetails?.duration || '', v.snippet.title),
    }));
  } catch (err) {
    console.error(`Failed to fetch videos for channel ${channelId}:`, err);
    return [];
  }
}

// Main API endpoint
app.get('/api/youtube-data', async (req, res) => {
  try {
    // Fetch channel info
    const channelRes = await ytFetch('channels', {
      part: 'snippet,statistics',
      id: CHANNEL_IDS.join(','),
    });

    const channelData = (channelRes.items || []).map((ch, i) => ({
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
    const videoPromises = channelData.map(ch =>
      fetchRecentVideos(ch.id, ch.title, ch.color)
    );
    const videoResults = await Promise.all(videoPromises);
    const allVideos = videoResults.flat();

    // Separate shorts
    const regularVideos = allVideos.filter(v => !v.isShort).sort((a, b) => b.views - a.views);
    const shortsVideos = allVideos.filter(v => v.isShort).sort((a, b) => b.views - a.views);

    res.json({
      channelData,
      allVideos,
      regularVideos,
      shortsVideos,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint for subscriber-only refresh (lighter weight)
app.get('/api/subscriber-counts', async (req, res) => {
  try {
    const channelRes = await ytFetch('channels', {
      part: 'statistics',
      id: CHANNEL_IDS.join(','),
    });

    const subscriberData = (channelRes.items || []).map(item => ({
      id: item.id,
      subscribers: parseInt(item.statistics.subscriberCount, 10) || 0,
      totalViews: parseInt(item.statistics.viewCount, 10) || 0,
    }));

    res.json({ subscriberData, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Subscriber refresh error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`YouTube Dashboard backend running on http://localhost:${PORT}`);
  console.log(`Monitoring ${CHANNEL_IDS.length} channels`);
});
