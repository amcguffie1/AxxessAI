require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');

// Set up Express
const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection URI (correct one provided)
const mongoURI = 'mongodb+srv://austin:yt469t9RPA55JZTx@cluster1.kzl6h.mongodb.net/Axxess_AI?retryWrites=true&w=majority&appName=Cluster1';
const dbName = 'Axxess_AI';
const collectionName = 'MA Plans 2024';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose schema and model for documents
const documentSchema = new mongoose.Schema({
  title: String,
  content: String
}, { collection: collectionName });

const Document = mongoose.model('Document', documentSchema);

// OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// POST /api/query
app.post('/api/query', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ success: false, message: 'No question provided.' });
  }

  console.log(`Normalized question: ${question}`);

  try {
    // Find relevant documents from MongoDB
    console.log('Querying MongoDB for documents...');
    const relevantDocs = await Document.find({
      $or: [
        { content: { $regex: question, $options: 'i' } },
        { title: { $regex: question, $options: 'i' } }
      ]
    }).limit(3);

    console.log('Documents retrieved:', relevantDocs);

    if (relevantDocs.length === 0) {
      return res.status(404).json({ success: false, message: 'No relevant documents found in the database.' });
    }

    // Combine document contents
    const combinedContent = relevantDocs.map(doc => doc.content).join('\n');

    // Send query to OpenAI
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: `${question}\n\nBased on the following document(s):\n${combinedContent}`,
      max_tokens: 200,
    });

    const answer = completion.data.choices[0].text.trim();
    return res.json({ success: true, answer });
  } catch (error) {
    console.error('Error processing query:', error);
    return res.status(500).json({ success: false, message: 'Error processing query.' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
