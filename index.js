const express = require('express');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());  // Middleware to parse JSON

// MongoDB connection
const mongoURI = 'mongodb+srv://austin:yt469t9RPA55JZTx@cluster1.kzl6h.mongodb.net/Axxess_AI?retryWrites=true&w=majority';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define the document schema
const documentSchema = new mongoose.Schema({ 
    title: String, 
    content: String 
});
const Document = mongoose.model('Document', documentSchema);

// POST API for querying AI with relevant document content
app.post('/api/query', async (req, res) => {
    const { question } = req.body;
    try {
        console.log(`Searching for documents relevant to: ${question}`);
        
        // Search MongoDB for multiple documents related to the user's query
        const relevantDocs = await Document.find({
            $or: [
                { content: { $regex: question, $options: 'i' } },
                { title: { $regex: question, $options: 'i' } }
            ]
        }).limit(3);  // Fetch the top 3 most relevant documents

        if (relevantDocs.length === 0) {
            return res.status(404).json({ success: false, message: 'No relevant documents found in the database.' });
        }

        // Combine the content of the top 3 relevant documents
        let combinedContent = relevantDocs.map(doc => doc.content).join('\n\n');

        // Truncate combined content if it's too long for OpenAI
        const maxLength = 4000;  // Adjust this based on OpenAI token limits
        if (combinedContent.length > maxLength) {
            combinedContent = combinedContent.substring(0, maxLength);
        }

        // Log combined content length for debugging
        console.log(`Combined content length: ${combinedContent.length}`);

        // Prepare the request to OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are an AI assistant that provides answers about Medicare Advantage plans.' },
                    { role: 'user', content: `Here is the combined content of relevant documents: ${combinedContent}. Please answer the following question: ${question}` }
                ]
            })
        });

        const data = await response.json();
        const aiAnswer = data.choices[0]?.message?.content;

        if (!aiAnswer) {
            return res.status(500).json({ success: false, message: 'AI did not return a response' });
        }

        // Return the AI response
        res.json({ success: true, answer: aiAnswer });

    } catch (error) {
        console.error('Error processing query:', error);
        res.status(500).json({ success: false, message: 'Error processing query' });
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
