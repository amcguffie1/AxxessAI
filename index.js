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
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

// Define the document schema and collection
const documentSchema = new mongoose.Schema({
    Title: String,
    content: Object
});

const Document = mongoose.model('Document', documentSchema, 'MA Plans 2024'); // Explicitly set the collection name

// POST API for querying AI with MongoDB and OpenAI
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/query', async (req, res) => {
    const { question } = req.body;

    try {
        console.log("Normalized question:", question);

        // Fetch all documents from MongoDB collection
        console.log("Querying MongoDB for documents...");
        const documents = await Document.find({});

        if (!documents || documents.length === 0) {
            console.log("No documents found in the database.");
            return res.status(404).json({ success: false, message: 'No documents available in the database.' });
        }

        console.log(`Documents retrieved: ${documents.length}`);

        // Combine all documents into a single text block for the OpenAI query
        const combinedContent = documents.map(doc => doc.content.full_text || doc.content).join('\n');
        console.log("Combined content ready for OpenAI API.");

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
                    { role: 'system', content: "You are an AI assistant that has access to Medicare Advantage plan documents. Answer confidently, but if there isn't enough information from the user's query, ask for clarification and use context clues to guide the conversation." },
                    { role: 'user', content: `Here is the combined content from all available documents: ${combinedContent}` },
                    { role: 'user', content: `Answer the following question: ${question}` }
                ]
            })
        });

        const data = await response.json();
        const aiAnswer = data.choices[0]?.message?.content;

        if (!aiAnswer) {
            console.log("AI did not return a response.");
            return res.status(500).json({ success: false, message: 'AI did not return a response' });
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
