const fs = require('fs');

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

async function getInstagramMedia() {
    if (!ACCESS_TOKEN) {
        // Fallback to mock data if access token is not set
        const mockData = fs.readFileSync('posts.json', 'utf8');
        console.log(JSON.parse(mockData));
    } else {
        const url = `https://graph.instagram.com/me/media?fields=id,caption,media_url,media_type,permalink,thumbnail_url&access_token=${ACCESS_TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
    }
}

getInstagramMedia();