const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Serve the existing PDF Genius website
app.use(express.static(__dirname));

app.get("/api/status", (req, res) => {
    res.json({
        status: "PDF Genius backend is running!"
    });
});

app.listen(PORT, () => {
    console.log(`PDF Genius server running at http://localhost:${PORT}`);
});