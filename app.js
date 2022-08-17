const express = require('express');
const app = express();
const port = 8000;
const cors = require('cors')
app.use(cors());

app.use(express.static('src'))
// app.use('/login', express.static('src/login'));

app.listen(port, () => console.log(`Example app listening on port ${port}!`));