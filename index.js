const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const dotenv = require('dotenv');

// Initialize environment variables
dotenv.config();

// Create the app
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection string
const mongoURI = 'mongodb+srv://austin:yt469t9RPA55JZTx@cluster1.kzl6h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';

mongoose.connect(mongoURI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define the document schema
const documentSchema = new mongoose.Schema({
  title: String,
  content: String
});

// Create the document model
const Document = mongoose.model('Document', documentSchema);

// POST API for querying AI with flexibility for all documents
app.post('/api/query', async (req, res) => {
  const { question } = req.body;
  
  try {
    // Fetch all documents from MongoDB
    const documents = await Document.find({});
    if (!documents || documents.length === 0) {
      return res.status(404).json({ success: false, message: 'No documents available in the database.' });
    }

    // Combine the content of all documents
    const combinedContent = documents.map(doc => doc.content).join('\n');

    // Prepare the request to OpenAI with context consideration
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an AI assistant that has access to Medicare Advantage plan documents. Answer confidently, but if there isn't enough information from the user's query, ask for clarification." },
          { role: "system", content: `Here is the combined content from all available plan documents: ${combinedContent}` },
          { role: "user", content: `Answer the following question: ${question}` }
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
    res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
