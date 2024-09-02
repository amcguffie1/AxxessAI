const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());


// Dynamically import node-fetch
const fetchAPI = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log('Connected to MongoDB');
    console.log('Current database:', mongoose.connection.db.databaseName);
});

// Explicitly select the Axxess_AI database
const dbName = 'Axxess_AI';
const axxessDB = mongoose.connection.useDb(dbName);

// Define the document schema and model with the specified collection name
const documentSchema = new mongoose.Schema({
    title: String,
    content: String // Adjust this if the content is an object
});

const Document = axxessDB.model('Document', documentSchema, 'Sonder Health Plan');

// **GET Route for Testing the API**
app.get('/api/test', (req, res) => {
    res.send('API is working!');
});

// **GET Route to List All Document Titles in MongoDB**
app.get('/api/documents', async (req, res) => {
    try {
        console.log("Attempting to fetch documents from Axxess_AI database...");
        const documents = await Document.find({});
        console.log("Documents found:", documents);
        res.json({ success: true, documents });
    } catch (error) {
        console.error("Error fetching documents:", error.message, error.stack);
        res.status(500).json({ success: false, message: 'An error occurred while fetching documents' });
    }
});

// **POST Route for AI Queries**
app.post('/api/query', async (req, res) => {
    const { title, question } = req.body;

    try {
        console.log("Received query for document title:", title);
        console.log("Question:", question);

        // Fetch the relevant document from MongoDB
        const document = await Document.findOne({ title });
        if (!document) {
            console.log("Document not found with title:", title);
            return res.json({ success: false, message: 'Document not found' });
        }

        console.log("Document retrieved:", document);

        if (!document.content) {
            console.log("Document content is empty or undefined");
            return res.json({ success: false, message: 'Document content is empty' });
        }

        // Prepare the messages for OpenAI
        const messages = [
            { role: 'system', content: 'You are an AI assistant specializing in Medicare Advantage plans. Use the provided document to answer the question.' },
            { role: 'user', content: `Document: ${document.content}` },
            { role: 'user', content: `Question: ${question}` }
        ];

        console.log("Sending messages to OpenAI:", JSON.stringify(messages, null, 2));

        // Send the document content and question to OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: messages
            })
        });

        const data = await response.json();
        console.log("AI Response:", JSON.stringify(data, null, 2));

        if (!data.choices || data.choices.length === 0) {
            console.log("No choices in AI response");
            return res.json({ success: false, message: 'No answer received from AI' });
        }

        res.json({ success: true, answer: data.choices[0].message.content });
    } catch (error) {
        console.error("Error processing AI query:", error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});