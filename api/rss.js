// api/rss.js - Vercel serverless function
import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail']
  }
});

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { feeds, keywords } = req.body;

  if (!feeds || !Array.isArray(feeds)) {
    return res.status(400).json({ error: 'Feeds array is required' });
  }

  try {
    const allArticles = [];

    // Fetch all feeds in parallel
    const feedPromises = feeds.map(async (feed) => {
      try {
        const parsedFeed = await parser.parseURL(feed.url);
        
        return parsedFeed.items.map((item, index) => {
          // Clean description by removing HTML tags
          let description = item.contentSnippet || item.content || item.description || '';
          description = description.replace(/<[^>]*>/g, '').substring(0, 300);
          
          // Find matching keywords
          const text = (item.title + ' ' + description).toLowerCase();
          const matchedKeywords = keywords ? keywords.filter(keyword => 
            text.includes(keyword.toLowerCase())
          ) : [];

          return {
            id: `${feed.name}-${index}-${Date.now()}`,
            title: item.title || 'No title',
            description: description,
            link: item.link,
            pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
            source: feed.name,
            matchedKeywords,
            // Only include if keywords match (if keywords provided)
            isRelevant: !keywords || keywords.length === 0 || matchedKeywords.length > 0
          };
        }).filter(article => article.isRelevant);
        
      } catch (error) {
        console.error(`Error fetching ${feed.name}:`, error);
        return [];
      }
    });

    const feedResults = await Promise.all(feedPromises);
    
    // Flatten and sort by date
    feedResults.forEach(articles => allArticles.push(...articles));
    allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Limit to most recent 50 articles to avoid overwhelming the frontend
    const limitedArticles = allArticles.slice(0, 50);

    res.status(200).json({
      success: true,
      articles: limitedArticles,
      totalFeeds: feeds.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('RSS parsing error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch RSS feeds',
      message: error.message 
    });
  }
}
