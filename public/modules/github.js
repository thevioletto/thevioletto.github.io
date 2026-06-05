import { parseLinkHeader } from './utils.js';

function getGitHubHeaders(githubConfig) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (githubConfig.token && githubConfig.token.trim() !== '') {
    headers['Authorization'] = `Bearer ${githubConfig.token}`;
  }

  return headers;
}

async function fetchAllPages(url, githubConfig, maxPages = 100) {
  const allItems = [];
  let currentUrl = url;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    try {
      const response = await fetch(currentUrl, {
        headers: getGitHubHeaders(githubConfig)
      });

      if (!response.ok) {
        if (response.status === 403) {
          const remaining = response.headers.get('X-RateLimit-Remaining');
          const limit = response.headers.get('X-RateLimit-Limit');
          const resetTime = response.headers.get('X-RateLimit-Reset');

          if (remaining === '0') {
            const resetDate = new Date(parseInt(resetTime) * 1000);
            console.warn(
              `GitHub API rate limit reached. Limit: ${limit}/hour. Resets at: ${resetDate.toLocaleString()}`
            );
          } else {
            console.warn(
              `GitHub API rate limit. Remaining: ${remaining}/${limit}`
            );
          }
          break;
        }

        if (response.status === 401) {
          console.error(
            'GitHub API authentication failed. Please check your token.'
          );
          break;
        }

        throw new Error(`GitHub API error: ${response.status}`);
      }

      const items = await response.json();
      if (!Array.isArray(items)) {
        break;
      }

      allItems.push(...items);

      const linkHeader = response.headers.get('Link');
      currentUrl = parseLinkHeader(linkHeader);

      pageCount++;

      if (items.length < 100) {
        break;
      }
    } catch (error) {
      console.error('Error fetching page:', error);
      break;
    }
  }

  return allItems;
}

async function fetchUserRepositories(username, githubConfig) {
  const hasToken = githubConfig.token && githubConfig.token.trim() !== '';

  let url;
  if (hasToken) {
    url = `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
  } else {
    url = `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`;
  }

  const repos = await fetchAllPages(url, githubConfig, 10);
  return repos;
}

async function fetchRepositoryCommits(
  owner,
  repo,
  sinceDate,
  authorUsername,
  githubConfig
) {
  const sinceISO = sinceDate.toISOString();
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${sinceISO}&author=${authorUsername}&per_page=100`;

  try {
    const commits = await fetchAllPages(url, githubConfig, 10);
    return commits;
  } catch (error) {
    console.error(`Error fetching commits from ${repo}:`, error);
    return [];
  }
}

export async function fetchGitHubContributions(githubConfig) {
  try {
    // Try to load from Firebase Realtime Database first
    try {
      const firebaseDbUrl =
        'https://uiux-tutorial-website-default-rtdb.asia-southeast1.firebasedatabase.app/contributions.json';
      const cachedResponse = await fetch(firebaseDbUrl, {
        cache: 'no-store', // Prevent browser caching
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }
      });
      if (cachedResponse.ok) {
        const cachedContributions = await cachedResponse.json();
        if (cachedContributions && Array.isArray(cachedContributions)) {
          // Convert date strings back to Date objects
          return cachedContributions.map((item) => ({
            date: new Date(item.date),
            value: item.value
          }));
        }
      }
    } catch (cacheError) {
      console.log('Firebase data not available, fetching from API...');
    }

    console.log('Fetching from API...');

    // Fallback to API if cache doesn't exist
    const username = githubConfig.username;
    // Calculate date range: from today going back 365 days
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    oneYearAgo.setHours(0, 0, 0, 0); // Start of that day

    const repos = await fetchUserRepositories(username, githubConfig);

    if (repos.length === 0) {
      console.warn('No repositories found');
      return [];
    }

    const maxRepos = Math.min(repos.length, 50);
    const reposToProcess = repos.slice(0, maxRepos);

    const allCommits = [];

    for (let i = 0; i < reposToProcess.length; i++) {
      const repo = reposToProcess[i];
      const repoFullName = repo.full_name;
      const [owner, repoName] = repoFullName.split('/');

      const commits = await fetchRepositoryCommits(
        owner,
        repoName,
        oneYearAgo,
        username,
        githubConfig
      );
      allCommits.push(...commits);

      if (i < reposToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const contributionMap = {};

    allCommits.forEach((commit) => {
      if (commit.commit && commit.commit.author && commit.commit.author.date) {
        const date = new Date(commit.commit.author.date);
        // Include commits from oneYearAgo to today (inclusive)
        if (date >= oneYearAgo && date <= today) {
          const dateKey = date.toISOString().split('T')[0];
          contributionMap[dateKey] = (contributionMap[dateKey] || 0) + 1;
        }
      }
    });

    const contributions = Object.entries(contributionMap).map(
      ([dateStr, value]) => {
        const date = new Date(dateStr + 'T00:00:00');
        return {
          date: date,
          value: value
        };
      }
    );

    return contributions;
  } catch (error) {
    console.error('Error fetching GitHub contributions:', error);
    return [];
  }
}

export async function initializeGitHubHeatmap(githubConfig) {
  const heatmapElement = document.getElementById('github-heatmap');
  if (!heatmapElement) return;

  // Show loading state
  heatmapElement.innerHTML = `
    <div class="loading-state">
      <img src="./public/assets/nuko-loading.gif" alt="Loading" class="loading-gif" />
      <p class="loading-text">Did I Code Again?</p>
    </div>
  `;

  try {
    const contributionData = await fetchGitHubContributions(githubConfig);

    if (!contributionData || contributionData.length === 0) {
      heatmapElement.innerHTML = `
        <div class="error-state">
          <img src="./public/assets/nuko-cry.gif" alt="Error" class="error-gif" />
          <p class="error-text">Huh??</p>
        </div>
      `;
      return;
    }

    // Create contribution map for quick lookup
    const contributionMap = new Map();
    contributionData.forEach((item) => {
      const dateKey =
        item.date instanceof Date
          ? item.date.toISOString().split('T')[0]
          : new Date(item.date).toISOString().split('T')[0];
      contributionMap.set(dateKey, item.value);
    });

    // Calculate date range: from today going back 365 days
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 364); // 364 to get 365 days total
    oneYearAgo.setHours(0, 0, 0, 0);

    // Pad the calendar to full weeks so month labels can align to week columns.
    const displayStart = new Date(oneYearAgo);
    displayStart.setDate(displayStart.getDate() - displayStart.getDay());
    displayStart.setHours(0, 0, 0, 0);

    const displayEnd = new Date(today);
    displayEnd.setDate(displayEnd.getDate() + (6 - displayEnd.getDay()));
    displayEnd.setHours(23, 59, 59, 999);

    const allDates = [];
    const currentDate = new Date(displayStart);
    while (currentDate <= displayEnd) {
      allDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Clear loading state and render graph
    heatmapElement.innerHTML = `
      <div class="graph">
        <ul class="months"></ul>
        <ul class="days">
          <li>Sun</li>
          <li>Mon</li>
          <li>Tue</li>
          <li>Wed</li>
          <li>Thu</li>
          <li>Fri</li>
          <li>Sat</li>
        </ul>
        <ul class="squares"></ul>
      </div>
      <div class="graph-tooltip" id="graph-tooltip"></div>
    `;

    const monthsContainer = heatmapElement.querySelector('.months');
    const squaresContainer = heatmapElement.querySelector('.squares');
    const tooltip = heatmapElement.querySelector('#graph-tooltip');

    const totalWeeks = Math.ceil(allDates.length / 7);
    monthsContainer.style.gridTemplateColumns = `repeat(${totalWeeks}, var(--week-width))`;

    // Function to get contribution level (0-4)
    function getLevel(count) {
      if (!count || count === 0) return 0;
      if (count >= 20) return 4;
      if (count >= 10) return 3;
      if (count >= 5) return 2;
      if (count >= 1) return 1;
      return 0;
    }

    // Function to format date for tooltip
    function formatDate(date) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Label each month at the first week where that month appears in-range.
    let previousMonth = -1;
    for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
      const weekDates = allDates.slice(weekIndex * 7, weekIndex * 7 + 7);
      const firstInRangeDate = weekDates.find(
        (date) => date >= oneYearAgo && date <= today
      );

      if (!firstInRangeDate) {
        continue;
      }

      const month = firstInRangeDate.getMonth();
      if (month === previousMonth) {
        continue;
      }

      previousMonth = month;

      const monthLabel = document.createElement('li');
      monthLabel.textContent = firstInRangeDate.toLocaleDateString('en-US', {
        month: 'short'
      });
      monthLabel.style.gridColumn = `${weekIndex + 1}`;
      monthsContainer.appendChild(monthLabel);
    }

    // Generate squares for actual dates
    allDates.forEach((date) => {
      const square = document.createElement('li');
      const isOutOfRange = date < oneYearAgo || date > today;

      if (isOutOfRange) {
        square.setAttribute('data-level', '0');
        square.style.visibility = 'hidden';
        square.setAttribute('aria-hidden', 'true');
        squaresContainer.appendChild(square);
        return;
      }

      const dateKey = date.toISOString().split('T')[0];
      const count = contributionMap.get(dateKey) || 0;
      const level = getLevel(count);

      square.setAttribute('data-level', level);
      square.setAttribute('data-date', dateKey);
      square.setAttribute('data-count', count);

      // Add hover event listeners for tooltip
      square.addEventListener('mouseenter', (e) => {
        const rect = square.getBoundingClientRect();
        const containerRect = heatmapElement.getBoundingClientRect();
        const tooltipText = `${count === 0 ? 'No' : count} ${count === 1 ? 'contribution' : 'contributions'} on ${formatDate(date)}`;
        tooltip.textContent = tooltipText;
        tooltip.style.display = 'block';

        // Calculate position relative to container (absolute positioning)
        // Horizontally centered above the square
        const left =
          rect.left -
          containerRect.left +
          rect.width / 2 -
          tooltip.offsetWidth / 2;
        const top = rect.top - containerRect.top - tooltip.offsetHeight - 8;

        tooltip.style.left = `${Math.max(8, Math.min(left, containerRect.width - tooltip.offsetWidth - 8))}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
      });

      square.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });

      square.addEventListener('mousemove', (e) => {
        const rect = square.getBoundingClientRect();
        const containerRect = heatmapElement.getBoundingClientRect();

        // Calculate position relative to container (absolute positioning)
        // Horizontally centered above the square
        const left =
          rect.left -
          containerRect.left +
          rect.width / 2 -
          tooltip.offsetWidth / 2;
        const top = rect.top - containerRect.top - tooltip.offsetHeight - 8;

        tooltip.style.left = `${Math.max(8, Math.min(left, containerRect.width - tooltip.offsetWidth - 8))}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
      });

      squaresContainer.appendChild(square);
    });
  } catch (error) {
    console.error('GitHub heatmap error:', error);
    heatmapElement.innerHTML = `
      <div class="error-state">
        <img src="./public/assets/nuko-cry.gif" alt="Error" class="error-gif" />
        <p class="error-text">Huh??</p>
      </div>
    `;
  }
}
