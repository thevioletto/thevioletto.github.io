import { getTimeAgo, escapeHtml } from './utils.js';
import { logger } from './logger.js';

export async function fetchListenBrainzTracks(listenbrainzConfig = {}) {
  const widget =
    document.getElementById('listenbrainz-widget') ||
    document.getElementById('music-widget');

  if (!widget) return;

  logger.info('[listenbrainz] widget initialization started', {
    hasUserToken: Boolean(listenbrainzConfig.userToken),
    username: listenbrainzConfig.username
  });

  // Show loading state
  widget.innerHTML = `
    <div class="loading-state">
      <img src="./public/assets/nuko-loading.gif" alt="Loading" class="loading-gif" />
      <p class="loading-text">Hmm.. What Did I Listen To?</p>
    </div>
  `;

  try {
    let username = (listenbrainzConfig.username || '').trim();
    const userToken = (listenbrainzConfig.userToken || '').trim();

    // If username is not explicitly provided, try resolving it from userToken
    if (!username && userToken && userToken !== 'YOUR_LISTENBRAINZ_USER_TOKEN') {
      try {
        const tokenRes = await fetch('https://api.listenbrainz.org/1/validate-token', {
          headers: {
            Authorization: `Token ${userToken}`
          }
        });
        const tokenData = await tokenRes.json();
        if (tokenData.valid && tokenData.user_name) {
          username = tokenData.user_name;
        }
      } catch (tokenErr) {
        logger.warn('[listenbrainz] failed to validate user token:', tokenErr);
      }
    }

    // Fallback to default username if still empty
    if (!username) {
      username = 'thevioletto';
    }

    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache'
    };
    if (userToken && userToken !== 'YOUR_LISTENBRAINZ_USER_TOKEN') {
      headers.Authorization = `Token ${userToken}`;
    }

    // First try fetching playing-now track
    let track = null;
    let isNowPlaying = false;

    const playingUrl = `https://api.listenbrainz.org/1/user/${encodeURIComponent(username)}/playing-now`;
    logger.debug('[listenbrainz] checking playing-now', { url: playingUrl });

    try {
      const playingRes = await fetch(playingUrl, { cache: 'no-store', headers });
      if (playingRes.ok) {
        const playingData = await playingRes.json();
        if (playingData?.payload?.listens?.length > 0) {
          track = playingData.payload.listens[0];
          isNowPlaying = true;
          logger.info('[listenbrainz] now playing track detected');
        }
      }
    } catch (playingErr) {
      logger.warn('[listenbrainz] playing-now request failed:', playingErr);
    }

    // If not currently playing, fetch the most recent listen
    if (!track) {
      const listensUrl = `https://api.listenbrainz.org/1/user/${encodeURIComponent(username)}/listens?count=1`;
      logger.debug('[listenbrainz] fetching recent listens', { url: listensUrl });

      const listensRes = await fetch(listensUrl, { cache: 'no-store', headers });
      if (!listensRes.ok) {
        throw new Error(`ListenBrainz API error: ${listensRes.status}`);
      }
      const listensData = await listensRes.json();
      if (listensData?.payload?.listens?.length > 0) {
        track = listensData.payload.listens[0];
        isNowPlaying = false;
        logger.info('[listenbrainz] recent track loaded');
      }
    }

    if (!track) {
      widget.innerHTML = `
        <div class="error-state">
          <img src="./public/assets/nuko-cry-2.gif" alt="Error" class="error-gif" />
          <p class="error-text">Couldn't Find Anything</p>
        </div>
      `;
      return;
    }

    displayListenBrainzTrack(track, isNowPlaying, widget);
  } catch (error) {
    logger.error('[listenbrainz] error:', error);
    widget.innerHTML = `
      <div class="error-state">
        <img src="./public/assets/nuko-cry-2.gif" alt="Error" class="error-gif" />
        <p class="error-text">Couldn't Find Anything</p>
      </div>
    `;
  }
}

function displayListenBrainzTrack(track, isNowPlaying, widget) {
  const trackMetadata = track.track_metadata || {};
  const trackName = trackMetadata.track_name || 'Unknown Track';

  // Extract artist name
  let artistName = trackMetadata.artist_name || 'Unknown Artist';
  if (
    Array.isArray(trackMetadata.mbid_mapping?.artists) &&
    trackMetadata.mbid_mapping.artists.length > 0
  ) {
    const artistNames = trackMetadata.mbid_mapping.artists
      .map((a) => (a.artist_credit_name || '') + (a.join_phrase || ''))
      .join('')
      .trim();
    if (artistNames) {
      artistName = artistNames;
    }
  }

  // Cover Art resolution
  const mbidMapping = trackMetadata.mbid_mapping;
  let imageUrl = '';
  if (mbidMapping?.caa_release_mbid && mbidMapping?.caa_id) {
    imageUrl = `https://coverartarchive.org/release/${mbidMapping.caa_release_mbid}/${mbidMapping.caa_id}-250.jpg`;
  } else if (mbidMapping?.release_mbid) {
    imageUrl = `https://coverartarchive.org/release/${mbidMapping.release_mbid}/front-250`;
  }

  const timeAgo = isNowPlaying
    ? 'Now playing'
    : getTimeAgo(track.listened_at);

  const fallbackArt = './public/assets/nuko-vibe.gif';

  widget.innerHTML = `
    <div class="track-item">
      <img
        src="${escapeHtml(imageUrl || fallbackArt)}"
        alt="Album art"
        class="track-art"
        onerror="this.onerror=null;this.src='${fallbackArt}';" />
      <div class="track-info">
        <div class="track-name">${escapeHtml(trackName)}</div>
        <div class="track-artist">${escapeHtml(artistName)}</div>
      </div>
      <div class="track-time">${timeAgo}</div>
    </div>
  `;
}
