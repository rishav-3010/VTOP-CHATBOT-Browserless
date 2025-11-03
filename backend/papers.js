const axios = require('axios');

// GitHub API configuration
const GITHUB_REPO = 'puneet-chandna/VIT-PYQPs-Paaji';
const GITHUB_API = 'https://api.github.com';
const PAPERS_PATH = 'all papers';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Add your GitHub token here

// Cache configuration
let papersCache = {
    data: null,
    timestamp: 0,
    error: null,
    retryAfter: 0
};
const CACHE_DURATION = 3600000; // 1 hour in milliseconds
const RATE_LIMIT_CACHE_DURATION = 300000; // 5 minutes for rate limit errors

// Configure axios with authentication if token is available
const githubClient = axios.create({
    baseURL: GITHUB_API,
    headers: GITHUB_TOKEN ? {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
    } : {}
});

// Rate limit handling
async function handleRateLimit(error) {
    if (error.response && error.response.status === 403) {
        const resetTime = error.response.headers['x-ratelimit-reset'];
        if (resetTime) {
            const waitTime = (resetTime * 1000) - Date.now();
            papersCache.retryAfter = Date.now() + Math.max(waitTime, 0);
            papersCache.error = {
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: new Date(papersCache.retryAfter).toISOString()
            };
            throw papersCache.error;
        }
    }
    throw error;
}

async function getAllPapers() {
    console.log('🔍 Fetching papers from GitHub...');
    
    // Check if we're still in rate limit cooldown
    if (papersCache.retryAfter && Date.now() < papersCache.retryAfter) {
        console.log('⏳ Rate limit cooldown active, using cached error');
        throw papersCache.error;
    }

    // Check cache first
    if (papersCache.data && (Date.now() - papersCache.timestamp) < CACHE_DURATION) {
        console.log('📦 Using cached papers data');
        return papersCache.data;
    }
    
    console.log('🌐 Cache expired or empty, fetching fresh data...');

    try {
        // Get all files from the papers directory
        const response = await githubClient.get(`/repos/${GITHUB_REPO}/contents/${PAPERS_PATH}`);
        
        // Process and structure the data
        const papers = [];
        
        for (const subject of response.data) {
            if (subject.type === 'dir') {
                // Get files in each subject directory
                try {
                    // Get files in each subject directory
                    const subjectFiles = await githubClient.get(subject.url);
                    
                    for (const file of subjectFiles.data) {
                        // Parse filename to extract metadata
                        const metadata = parseFileName(file.name, subject.name);
                        if (metadata) {
                            papers.push({
                                ...metadata,
                                subjectFolder: subject.name,
                                downloadUrl: file.download_url,
                                htmlUrl: file.html_url
                            });
                        }
                    }
                } catch (subjectError) {
                    console.warn(`Error fetching files for subject ${subject.name}:`, subjectError.message);
                    // Continue with other subjects even if one fails
                    continue;
                }
            }
        }

        // Update cache
        papersCache = {
            data: papers,
            timestamp: Date.now(),
            error: null,
            retryAfter: 0
        };

        return papers;
    } catch (error) {
        return handleRateLimit(error);
    }
}

function parseFileName(filename, subjectFolder) {
    // Common patterns in filenames
    const patterns = {
        courseCode: /([A-Z]+\d+[A-Z]*)/i,
        examType: /(CAT ?[12]|FAT|model)/i,
        year: /20\d{2}/,
        term: /(fall|winter|summer)/i
    };

    // Skip non-paper files
    if (!filename.match(/\.(pdf|docx?)$/i)) {
        return null;
    }

    const metadata = {
        filename,
        title: filename.replace(/\.[^/.]+$/, ''), // Remove extension
        courseCode: '',
        examType: '',
        year: '',
        term: '',
        subject: subjectFolder
    };

    // Extract course code
    const courseCodeMatch = filename.match(patterns.courseCode) || 
                          subjectFolder.match(patterns.courseCode);
    if (courseCodeMatch) {
        metadata.courseCode = courseCodeMatch[1].toUpperCase();
    }

    // Extract exam type
    const examTypeMatch = filename.match(patterns.examType);
    if (examTypeMatch) {
        metadata.examType = examTypeMatch[1].toUpperCase()
            .replace(' ', '')
            .replace('MODEL', 'Sample Paper');
    }

    // Extract year
    const yearMatch = filename.match(patterns.year);
    if (yearMatch) {
        metadata.year = yearMatch[0];
    }

    // Extract term
    const termMatch = filename.match(patterns.term);
    if (termMatch) {
        metadata.term = termMatch[1].charAt(0).toUpperCase() + termMatch[1].slice(1);
    }

    return metadata;
}

async function searchPapers(query) {
    try {
        console.log('🔎 Starting paper search with query:', {
            courseCode: query.courseCode || 'not provided',
            courseName: query.courseName || 'not provided',
            paperType: query.paperType || 'all'
        });
        
        const allPapers = await getAllPapers();
        const { courseCode, courseName, paperType } = query;
        
        console.log(`📚 Found ${allPapers.length} total papers, applying filters...`);

        const results = allPapers.filter(paper => {
            // Match course code if provided
            if (courseCode && !paper.courseCode.toLowerCase().includes(courseCode.toLowerCase()) &&
                !paper.subject.toLowerCase().includes(courseCode.toLowerCase())) {
                return false;
            }

            // Match course name if provided
            if (courseName && !paper.subject.toLowerCase().includes(courseName.toLowerCase())) {
                return false;
            }

            // Match paper type if provided and not 'all'
            if (paperType && paperType !== 'all') {
                const normalizedPaperType = paperType.toUpperCase();
                const normalizedExamType = paper.examType.toUpperCase();
                
                if (!normalizedExamType.includes(normalizedPaperType)) {
                    return false;
                }
            }

            return true;
        });

        console.log(`✨ Search complete! Found ${results.length} matching papers`);
        if (results.length > 0) {
            console.log('📝 Sample match:', {
                title: results[0].title,
                courseCode: results[0].courseCode,
                examType: results[0].examType
            });
        }

        return results;
    } catch (error) {
        console.error('Error searching papers:', error);
        throw error;
    }
}

module.exports = {
    searchPapers,
    getAllPapers
};