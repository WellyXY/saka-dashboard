/**
 * Saka Dashboard API - Cloudflare Worker
 *
 * Deploy to Cloudflare Workers:
 * 1. Go to https://workers.cloudflare.com
 * 2. Create a new Worker
 * 3. Paste this code
 * 4. Add environment variable: TIKHUB_API_KEY
 * 5. Deploy and update CONFIG.apiUrl in index.html
 */

const BASE_URL = 'https://api.tikhub.io';

async function apiGet(endpoint, params, apiKey) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${endpoint}${qs ? '?' + qs : ''}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  return response.json();
}

function getImageUrl(item) {
  if (item.image_versions2?.candidates?.[0]?.url)
    return item.image_versions2.candidates[0].url;
  if (item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url)
    return item.carousel_media[0].image_versions2.candidates[0].url;
  return null;
}

async function getUserData(username, apiKey) {
  // Get user info
  const infoRes = await apiGet(
    '/api/v1/instagram/v1/fetch_user_info_by_username',
    { username },
    apiKey
  );

  if (infoRes.code !== 200) {
    throw new Error('Failed to get user info');
  }

  const user = infoRes.data.data.user;
  const userId = user.id;

  // Get posts
  const postsRes = await apiGet(
    '/api/v1/instagram/v1/fetch_user_posts',
    { user_id: userId, count: 50 },
    apiKey
  );

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

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/user') {
      const username = url.searchParams.get('username') || 'saka.yiumo';

      try {
        const data = await getUserData(username, env.TIKHUB_API_KEY);
        return new Response(
          JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString()
          }),
          { headers: corsHeaders }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok' }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders }
    );
  }
};
