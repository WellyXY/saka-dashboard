#!/usr/bin/env node
/**
 * Saka Dashboard API Proxy Server
 * Proxies TikHub API calls to hide API key from frontend
 *
 * Usage: node api-server.js
 * Runs on http://localhost:3456
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load API key from env
const envPath = '/home/node/.claude/scripts/env.sh';
let API_KEY = process.env.TIKHUB_API_KEY || '';
if (!API_KEY && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/TIKHUB_API_KEY="([^"]+)"/);
  if (match) API_KEY = match[1];
}

const BASE_URL = 'https://api.tikhub.io';
const PORT = 3456;

function apiGet(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${endpoint}${qs ? '?' + qs : ''}`;
    https.get(url, { headers: { 'Authorization': `Bearer ${API_KEY}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getUserData(username) {
  // Get user info
  const infoRes = await apiGet('/api/v1/instagram/v1/fetch_user_info_by_username', { username });
  if (infoRes.code !== 200) throw new Error('Failed to get user info');

  const user = infoRes.data.data.user;
  const userId = user.id;

  // Get posts/reels
  const postsRes = await apiGet('/api/v1/instagram/v1/fetch_user_posts', { user_id: userId, count: 50 });
  const posts = postsRes.code === 200 ? (postsRes.data.items || []) : [];

  return {
    profile: {
      username: user.username,
      fullName: user.full_name,
      bio: user.biography || '',
      profilePic: user.profile_pic_url_hd || user.profile_pic_url,
      followers: user.edge_followed_by?.count || 0,
      following: user.edge_follow?.count || 0,
      postsCount: user.edge_owner_to_timeline_media?.count || posts.length
    },
    posts: posts.map(item => ({
      id: item.pk || item.id,
      caption: item.caption?.text || '',
      likes: item.like_count || 0,
      comments: item.comment_count || 0,
      type: item.media_type === 2 || item.video_versions ? 'Reel' : 'Photo',
      thumbnail: getImageUrl(item),
      timestamp: item.taken_at
    }))
  };
}

function getImageUrl(item) {
  if (item.image_versions2?.candidates?.[0]?.url) return item.image_versions2.candidates[0].url;
  if (item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url)
    return item.carousel_media[0].image_versions2.candidates[0].url;
  return null;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/user') {
    const username = url.searchParams.get('username') || 'saka.yiumo';
    try {
      const data = await getUserData(username);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
  } else if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Saka Dashboard API running on http://localhost:${PORT}`);
  console.log(`   GET /api/user?username=saka.yiumo`);
  console.log(`   GET /health`);
});
