const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Dynamically import node-fetch
const fetchAPI = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// **MongoDB connection logging**
console.log("Attempting to connect to MongoDB...");
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("MongoDB connection established");
})
.catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1); // Exit the app if the database connection fails
});

// Confirm which database is connected
const db = mongoose.connection;
db.once('open', function() {
    console.log('Current database:', mongoose.connection.db.databaseName);
});

// Explicitly select the Axxess_AI database
const dbName = 'Axxess_AI';
const axxessDB = mongoose.connection.useDb(dbName);

// Define the document schema and model
const documentSchema = new mongoose.Schema({
    title: String,
    content: String // Adjust this if the content is an object
});

const Document = axxessDB.model('Document', documentSchema, 'Sonder Health Plan');

// **Root Route logging**
app.get('/', (req, res) => {
    console.log("Received request to '/' route");
    res.send('Axxess AI Backend is running!');
});

// **Favicon request handling logging**
app.get('/favicon.ico', (req, res) => {
    console.log("Received request for favicon");
    res.status(204);
});

// **GET Route logging for API test**
app.get('/api/test', (req, res) => {
    console.log("Received request to '/api/test'");
    res.send('API is working!');
});

// **GET Route to list all documents in MongoDB**
app.get('/api/documents', async (req, res) => {
    try {
        console.log("Received request to fetch documents");
        const documents = await Document.find({});
        console.log("Documents retrieved:", documents);
        res.json({ success: true, documents });
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ success: false, message: 'An error occurred while fetching documents' });
    }
});

// **POST Route for AI queries**
app.post('/api/query', async (req, res) => {
    const { title, question } = req.body;

    try {
        console.log("Received AI query request");
        console.log("Query for document title:", title);
        console.log("User question:", question);

        // Fetch the document from MongoDB
        const document = await Document.findOne({ title });
        if (!document) {
            console.log("Document not found:", title);
            return res.json({ success: false, message: 'Document not found' });
        }

        console.log("Document retrieved:", document);

        // Prepare the request to OpenAI
        const messages = [
            { role: 'system', content: 'You are an AI assistant specializing in Medicare Advantage plans. Use the provided document to answer the question.' },
            { role: 'user', content: `Document: ${document.content}` },
            { role: 'user', content: `Question: ${question}` }
        ];

        console.log("Sending request to OpenAI with messages:", messages);

        // Call OpenAI API
        const response = await fetchAPI('https://api.openai.com/v1/chat/completions', {
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
        console.log("Received response from OpenAI:", data);

        if (!data.choices || data.choices.length === 0) {
            console.log("No choices in OpenAI response");
            return res.json({ success: false, message: 'No answer received from AI' });
        }

        res.json({ success: true, answer: data.choices[0].message.content });
    } catch (error) {
        console.error("Error processing AI query:", error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request' });
    }
});

// **Server startup logging**
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error('Failed to start server:', err);
});
