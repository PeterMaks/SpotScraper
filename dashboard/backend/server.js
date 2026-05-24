const express = require('express');
const cors = require('cors');
const { aggregateStats } = require('./parser');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await aggregateStats();
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to aggregate stats' });
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
