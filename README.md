# YouTube Analytics Dashboard

A real-time dashboard for monitoring up to 4 YouTube channels. Displays subscriber counts, view estimates, and detailed video metrics.

## Features

- **Real-time subscriber counts** — refreshes every 60 seconds
- **Estimated 24-hour views** per channel based on recent video performance
- **15 most recent videos** across all channels with views, likes, and comments
- **Sort and filter** videos by channel, views, likes, or comments
- Dark theme matching YouTube's design language

## Setup

### 1. Get a YouTube Data API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **YouTube Data API v3**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the API key

### 2. Find Channel IDs

Channel IDs look like `UCxxxxxxxxxxxxxxxxxxxxxx`. You can find them:
- In the channel URL: `youtube.com/channel/UC...`
- Using [this tool](https://commentpicker.com/youtube-channel-id.php)

### 3. Run the Dashboard

Open `index.html` in a browser, or serve it locally:

```bash
npx serve .
```

Then enter your API key and channel IDs in the setup screen.

## API Usage Notes

- The YouTube Data API v3 has a default quota of **10,000 units/day**
- Each full dashboard load uses approximately **50–100 quota units** (depending on number of channels)
- Subscriber count refreshes use **~5 units** each (every 60s)
- The "Estimated 24h Views" is calculated from recent video statistics, not the Analytics API (which requires channel ownership + OAuth)
