// Import necessary modules
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

// Initialize environment variables
dotenv.config();

// MongoDB connection
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://austin:yt469t9RPA55JZTx@cluster1.kzl6h.mongodb.net/Axxess_AI?retryWrites=true&w=majority&appName=Cluster1';

console.log("Attempting to connect to MongoDB...");
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("Connected to MongoDB");
        // Check for existing indexes
        return Document.collection.getIndexes();
    })
    .then(indexes => {
        console.log("Existing indexes:", JSON.stringify(indexes, null, 2));
        // If the text index doesn't exist, create it
        if (!indexes['content.full_text_text_Title_text']) {
            return Document.collection.createIndex({ 'content.full_text': 'text', 'Title': 'text' });
        }
    })
    .then(() => console.log("Text index verified/created"))
    .catch(err => console.error("MongoDB connection or index error:", err));

// Define the document schema and collection
const documentSchema = new mongoose.Schema({
    Title: String,
    content: Object
});

// Add text index to the schema
documentSchema.index({ 'content.full_text': 'text', 'Title': 'text' });

const Document = mongoose.model('Document', documentSchema, 'MA Plans 2024'); // Explicitly set the collection name

// Helper function to parse formulary data
function parseFormularyData(content) {
    try {
        const data = JSON.parse(content);
        const drugInfo = data[0];
        const tierInfo = data[1];

        if (drugInfo && tierInfo) {
            const fullText = drugInfo.text;
            const tier = tierInfo.text;

            // Split the full text into drug name and dosages
            const match = fullText.match(/^(.*?)\s(\d+\s*mg(?:,\s*\d+\s*mg)*)/);
            if (match) {
                const drugName = match[1].trim();
                const dosages = match[2].split(',').map(d => d.trim());

                return {
                    drugName,
                    dosages,
                    tier
                };
            }
        }
    } catch (error) {
        console.error("Error parsing formulary data:", error);
    }
    return null;
}

// Helper function to segment documents
function segmentDocument(doc) {
    const segments = [];
    let content = doc.content.full_text || JSON.stringify(doc.content);

    // Check if content is formulary data
    const formularyData = parseFormularyData(content);
    if (formularyData) {
        const { drugName, dosages, tier } = formularyData;
        content = `Drug: ${drugName}\nDosages: ${dosages.join(', ')}\nTier: ${tier}`;
    }

    const lines = content.split('\n');
    let segment = `Title: ${doc.Title}\n`;
    let segmentLength = segment.length;

    for (const line of lines) {
        if (segmentLength + line.length > 1000) {
            segments.push(segment);
            segment = `Title: ${doc.Title} (continued)\n`;
            segmentLength = segment.length;
        }
        segment += line + '\n';
        segmentLength += line.length + 1;
    }
    if (segment.length > 0) segments.push(segment);
    return segments;
}

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Route to fetch sample documents
app.get('/api/sample-documents', async (req, res) => {
    try {
        const sampleDocuments = await Document.find().limit(2);
        console.log("Sample documents:", JSON.stringify(sampleDocuments, null, 2));
        res.json({ success: true, sampleDocuments });
    } catch (error) {
        console.error("Error fetching sample documents:", error);
        res.status(500).json({ success: false, message: 'Error fetching sample documents' });
    }
});

// Main query route
app.post('/api/query', async (req, res) => {
    const { question } = req.body;

    try {
        console.log("Received question:", question);

        // Enhance search terms
        const searchTerms = question.toLowerCase().split(' ')
            .filter(word => word.length > 2)
            .join(' ');
        
        console.log("Search terms:", searchTerms);

        // Fetch relevant documents from MongoDB collection
        let documents = await Document.find(
            { $text: { $search: searchTerms } },
            { score: { $meta: "textScore" } }
        ).sort({ score: { $meta: "textScore" } }).limit(5);

        if (documents.length === 0) {
            console.log("No exact matches found. Trying a more lenient search...");
            const regexPatterns = searchTerms.split(' ').map(term => new RegExp(term, 'i'));
            
            documents = await Document.find({
                $or: [
                    { Title: { $in: regexPatterns } },
                    { 'content': { $in: regexPatterns } }
                ]
            }).limit(5);
        }

        console.log(`Retrieved ${documents.length} documents`);

        // Segment documents and select most relevant segments
        let allSegments = [];
        documents.forEach(doc => {
            const segments = segmentDocument(doc);
            allSegments = allSegments.concat(segments);
        });

        // Simple relevance scoring (can be improved with more sophisticated methods)
        const scoredSegments = allSegments.map(segment => ({
            segment,
            score: searchTerms.split(' ').filter(term => segment.toLowerCase().includes(term)).length
        }));

        scoredSegments.sort((a, b) => b.score - a.score);

        const topSegments = scoredSegments.slice(0, 5).map(item => item.segment);
        
        const combinedContent = topSegments.join('\n\n');
        console.log("Combined content length:", combinedContent.length);

        // Prepare the request to OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: "You are an AI assistant that has access to Medicare Advantage plan documents and formulary data. The formulary data is structured as 'Drug: [drug name], Dosages: [list of dosages], Tier: [tier number]'. Answer questions based on this information. If a specific drug is mentioned in the question, focus on finding and using that drug's information. If the specific information isn't available in the given context, say so clearly." },
                    { role: 'user', content: `Here is the relevant content from the documents: ${combinedContent}` },
                    { role: 'user', content: `Answer the following question: ${question}` }
                ]
            })
        });

        if (!response.ok) {
            console.error("OpenAI API Error:", await response.text());
            return res.status(500).json({ success: false, message: 'Error calling OpenAI API' });
        }

        const data = await response.json();
        console.log("OpenAI API Response:", JSON.stringify(data, null, 2));

        const aiAnswer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

        if (!aiAnswer) {
            console.log("AI did not return a valid response.");
            return res.status(500).json({ success: false, message: 'AI did not return a valid response' });
        }

        // Return the AI response
        console.log("AI Response:", aiAnswer);
        res.json({ success: true, answer: aiAnswer });
    } catch (error) {
        console.error("Error processing query:", error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});