const axios = require('axios');

// CodeChef Papers API configuration
const CODECHEF_API = 'https://papers.codechefvit.com/api';

// Cache configuration
let codechefCache = {
    data: null,
    timestamp: 0
};
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Configure axios for CodeChef API
const codechefClient = axios.create({
    baseURL: CODECHEF_API,
    timeout: 10000
});

async function searchCodeChefPapers(query) {
    try {
        console.log('🔍 Searching CodeChef Papers with query:', {
            courseCode: query.courseCode || 'not provided',
            courseName: query.courseName || 'not provided',
            paperType: query.paperType || 'all'
        });

        const { courseCode, courseName, paperType } = query;
        
        // Build the subject query - CodeChef uses "Course Name [CODE]" format
        let subjectQuery = '';
        if (courseName && courseCode) {
            subjectQuery = `${courseName} [${courseCode}]`;
        } else if (courseName) {
            subjectQuery = courseName;
        } else if (courseCode) {
            subjectQuery = courseCode;
        }

        if (!subjectQuery) {
            console.log('⚠️ No search query provided');
            return [];
        }

        console.log('📡 Making API request to CodeChef with subject:', subjectQuery);

        // Call the CodeChef API
        const response = await codechefClient.get('/papers', {
            params: {
                subject: subjectQuery
            }
        });

        if (!response.data || !response.data.papers) {
            console.log('⚠️ No papers found in CodeChef response');
            return [];
        }

        const papers = response.data.papers;
        console.log(`✅ Found ${papers.length} papers from CodeChef`);

        // Transform CodeChef papers to match your existing format
        const transformedPapers = papers.map(paper => ({
            // Original CodeChef data
            ...paper,
            // Standardized fields for your app
            source: 'CodeChef-VIT',
            title: `${paper.subject} - ${paper.exam} (${paper.year})`,
            courseCode: extractCourseCode(paper.subject),
            examType: paper.exam,
            downloadUrl: paper.file_url,
            thumbnailUrl: paper.thumbnail_url,
            metadata: {
                slot: paper.slot,
                semester: paper.semester,
                campus: paper.campus,
                hasAnswerKey: paper.answer_key_included
            }
        }));

        // Filter by paper type if specified
        if (paperType && paperType !== 'all') {
            const filtered = transformedPapers.filter(paper => {
                const normalizedPaperType = paperType.toUpperCase();
                const normalizedExamType = paper.exam.toUpperCase();
                return normalizedExamType.includes(normalizedPaperType);
            });
            console.log(`🔎 Filtered to ${filtered.length} papers matching type: ${paperType}`);
            return filtered;
        }

        return transformedPapers;

    } catch (error) {
        console.error('❌ Error searching CodeChef Papers:', error.message);
        // Return empty array instead of throwing to allow other sources to work
        return [];
    }
}

// Helper function to extract course code from subject string
function extractCourseCode(subject) {
    const match = subject.match(/\[([A-Z]+\d+[A-Z]*)\]/);
    return match ? match[1] : '';
}

module.exports = {
    searchCodeChefPapers
};