import https from 'https';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { githubConfig, firebaseServiceConfig } from '../public/config.js';

const CONFIG = {
  github: githubConfig,
  firebase: firebaseServiceConfig
};

// Initialize Firebase Admin SDK if service account is available
let firebaseApp = null;
let firebaseDb = null;

if (CONFIG.firebase && CONFIG.firebase.project_id) {
  try {
    firebaseApp = initializeApp({
      credential: cert(CONFIG.firebase),
      databaseURL: `https://${CONFIG.firebase.project_id}-default-rtdb.asia-southeast1.firebasedatabase.app`
    });
    firebaseDb = getDatabase(firebaseApp);
    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    console.warn(
      '⚠️  Firebase Admin SDK initialization failed:',
      error.message
    );
  }
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return null;
  const links = linkHeader.split(',');
  for (const link of links) {
    const parts = link.split(';');
    const url = parts[0].trim().replace(/^<|>$/g, '');
    const rel = parts[1]?.trim().toLowerCase();
    if (rel && rel.includes('next')) {
      return url;
    }
  }
  return null;
}

async function fetchAllPages(url, token, maxPages = 10) {
  const allItems = [];
  let currentUrl = url;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    const response = await new Promise((resolve, reject) => {
      const options = {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'GitHub-Pages-Cache'
        }
      };

      // Only add Authorization header if token is provided
      if (token && token.trim() !== '' && token !== 'YOUR_GITHUB_TOKEN_HERE') {
        options.headers['Authorization'] = `Bearer ${token}`;
      }

      https
        .get(currentUrl, options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: data
            });
          });
        })
        .on('error', reject);
    });

    if (response.statusCode !== 200) {
      console.error(`Error: ${response.statusCode}`);
      break;
    }

    const items = JSON.parse(response.data);
    if (!Array.isArray(items)) break;

    allItems.push(...items);

    const linkHeader = response.headers.link;
    currentUrl = parseLinkHeader(linkHeader);
    pageCount++;

    if (items.length < 100) break;
  }

  return allItems;
}

async function uploadToFirebase(contributions) {
  try {
    console.log('\n🔥 Uploading to Firebase...');

    if (!firebaseDb) {
      console.error('❌ Firebase Admin SDK not initialized');
      console.error(
        '� Make sure firebaseServiceConfig is set in public/config.js'
      );
      console.error(
        '   It should contain your service account JSON (project_id, private_key, etc.)'
      );
      return false;
    }

    // Upload to /contributions path
    const ref = firebaseDb.ref('contributions');
    await ref.set(contributions);

    console.log('✅ Successfully uploaded to Firebase!');
    console.log(
      `📍 View at: https://${CONFIG.firebase.project_id}-default-rtdb.asia-southeast1.firebasedatabase.app/contributions.json`
    );
    return true;
  } catch (error) {
    console.error('❌ Error uploading to Firebase:', error.message);
    return false;
  }
}

async function fetchContributions() {
  try {
    const token = CONFIG.github.token;
    const username = CONFIG.github.username || 'thevioletto';

    if (!token || token === 'YOUR_GITHUB_TOKEN_HERE' || token.trim() === '') {
      console.log('⚠️ Skipping contributions (no token)');
      return null;
    }

    console.log('📥 Fetching GitHub contributions...');

    // Fetch repositories (includes private repos with token)
    const reposUrl =
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member';
    const repos = await fetchAllPages(reposUrl, token, 10);
    console.log(`Found ${repos.length} repositories`);

    // Calculate date range: from today going back 365 days
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    oneYearAgo.setHours(0, 0, 0, 0); // Start of that day

    console.log(
      `Date range: ${oneYearAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`
    );

    const allCommits = [];

    const maxRepos = Math.min(repos.length, 50);
    for (let i = 0; i < maxRepos; i++) {
      const repo = repos[i];
      const [owner, repoName] = repo.full_name.split('/');
      const sinceISO = oneYearAgo.toISOString();
      const commitsUrl = `https://api.github.com/repos/${owner}/${repoName}/commits?since=${sinceISO}&author=${username}&per_page=100`;

      try {
        const commits = await fetchAllPages(commitsUrl, token, 10);
        allCommits.push(...commits);
        console.log(`📦 ${repo.full_name}: ${commits.length} commits`);
      } catch (error) {
        // Skip repos that fail
        continue;
      }
    }

    // Process into contribution map (last 365 days from today)
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
      ([dateStr, value]) => ({
        date: dateStr + 'T00:00:00',
        value: value
      })
    );

    console.log(`✅ Processed ${contributions.length} days with contributions`);

    return contributions;
  } catch (error) {
    console.error('❌ Error fetching contributions:', error.message);
    return null;
  }
}

async function main() {
  console.log('Starting data fetch...\n');

  const contributions = await fetchContributions();

  if (contributions) {
    // Upload to Firebase
    await uploadToFirebase(contributions);
  }

  console.log('\nDone! Data uploaded to Firebase');
}

main().catch(console.error);
