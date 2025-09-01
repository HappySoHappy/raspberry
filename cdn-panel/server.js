const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Mount the CDN and panel routes
const cdn = require('./routes/cdn');
app.use('/cdn', cdn);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
