import { getTimeAgo, escapeHtml } from './utils.js';
import { logger } from './logger.js';

export async function fetchLastFmTracks(lastfmConfig) {
  const widget = document.getElementById('lastfm-widget');
  if (!widget) return;

  logger.info('[lastfm] widget initialization started', {
    username: lastfmConfig.username,
    limit: lastfmConfig.limit
  });

  // Show loading state
  widget.innerHTML = `
    <div class="loading-state">
      <img src="./public/assets/nuko-loading.gif" alt="Loading" class="loading-gif" />
      <p class="loading-text">Hmm.. What Did I Listen To?</p>
    </div>
  `;

  if (!lastfmConfig.apiKey || lastfmConfig.apiKey === 'YOUR_LASTFM_API_KEY') {
    logger.warn('[lastfm] missing API key');
    widget.innerHTML = `
      <div class="error-state">
        <img src="./public/assets/nuko-cry-2.gif" alt="Error" class="error-gif" />
        <p class="error-text">Please configure Last.fm API key in config.js</p>
      </div>
    `;
    return;
  }

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${lastfmConfig.username}&api_key=${lastfmConfig.apiKey}&format=json&limit=${lastfmConfig.limit}`;
    logger.debug('[lastfm] request', {
      url
    });

    const response = await fetch(url, {
      cache: 'no-store', // Prevent browser caching
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    const data = await response.json();
    logger.debug('[lastfm] response received', {
      hasError: Boolean(data.error)
    });

    if (data.error) {
      throw new Error(data.message);
    }

    const tracks = data.recenttracks.track;
    logger.info('[lastfm] tracks loaded', {
      count: Array.isArray(tracks) ? tracks.length : tracks ? 1 : 0
    });
    displayLastFmTracks(tracks);
  } catch (error) {
    logger.error('Last.fm error:', error);
    widget.innerHTML = `
      <div class="error-state">
        <img src="./public/assets/nuko-cry-2.gif" alt="Error" class="error-gif" />
        <p class="error-text">Couldn't Find Anything</p>
      </div>
    `;
  }
}

function displayLastFmTracks(tracks) {
  const widget = document.getElementById('lastfm-widget');
  if (!widget) return;

  // Normalize tracks to array
  const tracksArray = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];
  logger.debug('[lastfm] normalized track payload', {
    count: tracksArray.length
  });

  if (!tracksArray || tracksArray.length === 0) {
    widget.innerHTML = `
      <div class="error-state">
        <img src="./public/assets/nuko-cry-2.gif" alt="Error" class="error-gif" />
        <p class="error-text">Couldnt Find Anything</p>
      </div>
    `;
    return;
  }

  // Filter tracks: if there's a "now playing" track, only show those
  const hasNowPlaying = tracksArray.some(
    (track) => track['@attr'] && track['@attr'].nowplaying
  );

  const tracksToDisplay = hasNowPlaying
    ? tracksArray.filter((track) => track['@attr'] && track['@attr'].nowplaying)
    : tracksArray;
  logger.info('[lastfm] rendering tracks', {
    nowPlayingOnly: hasNowPlaying,
    renderedCount: tracksToDisplay.length
  });

  widget.innerHTML = tracksToDisplay
    .map((track) => {
      const isNowPlaying = track['@attr'] && track['@attr'].nowplaying;
      const timeAgo = isNowPlaying
        ? 'Now playing'
        : getTimeAgo(track.date?.uts);

      // Get album art - try large first, fallback to medium/extralarge
      const image = Array.isArray(track.image)
        ? track.image.find((img) => img.size === 'large') ||
          track.image.find((img) => img.size === 'extralarge') ||
          track.image.find((img) => img.size === 'medium') ||
          track.image[track.image.length - 1]
        : null;
      const imageUrl = image?.['#text'] || '';

      return `
      <div class="track-item">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Album art" class="track-art" onerror="this.style.display='none'" />` : '<div class="track-art"></div>'}
        <div class="track-info">
          <div class="track-name">${escapeHtml(track.name)}</div>
          <div class="track-artist">${escapeHtml(
            track.artist['#text'] || track.artist
          )}</div>
        </div>
        <div class="track-time">${timeAgo}</div>
      </div>
    `;
    })
    .join('');
}
