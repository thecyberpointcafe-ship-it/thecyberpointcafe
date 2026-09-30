const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10
  },

  fileFilter: (_, file, cb) => {
    const allowed = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".doc",
      ".docx"
    ];

    const ext = path.extname(file.originalname).toLowerCase();

    cb(null, allowed.includes(ext));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeData(items) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(items, null, 2)
  );
}

function admin(req, res, next) {
  const key =
    req.headers["x-admin-key"] ||
    req.query.key ||
    req.body.key;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}


/* =========================
   CUSTOMER UPLOAD
========================= */

app.post(
  "/api/upload",
  upload.array("documents", 10),
  (req, res) => {

    if (!req.files?.length) {

      for (const f of (req.files || [])) {
        if (fs.existsSync(f.path)) {
          fs.unlinkSync(f.path);
        }
      }

      return res.status(400).json({
        error: "At least one document is required."
      });
    }

    const items = readData();

    const batchId = crypto.randomUUID();

    const batch = {
      id: batchId,

      createdAt: new Date().toISOString(),

      files: req.files.map(f => ({
        id: crypto.randomUUID(),

        originalName: f.originalname,

        storedName: f.filename,

        size: f.size
      }))
    };

    items.unshift(batch);

    writeData(items);

    res.json({
      ok: true,

      id: batchId,

      message: "Document successfully uploaded."
    });
  }
);


/* =========================
   ADMIN JOBS
========================= */

app.get("/api/jobs", admin, (req, res) => {

  res.json(readData());

});


/* =========================
   OPEN / PREVIEW FILE
========================= */

app.get("/api/file/:id", admin, (req, res) => {

  const jobs = readData();

  for (const job of jobs) {

    const file = job.files.find(
      x => x.id === req.params.id
    );

    if (file) {

      const p = path.join(
        UPLOAD_DIR,
        file.storedName
      );

      if (!fs.existsSync(p)) {
        return res
          .status(404)
          .send("File not found");
      }

      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(file.originalName)}"`
      );

      return res.sendFile(p);
    }
  }

  res.status(404).send("File not found");
});


/* =========================
   DELETE JOB
========================= */

app.delete("/api/job/:id", admin, (req, res) => {

  const jobs = readData();

  const job = jobs.find(
    x => x.id === req.params.id
  );

  if (!job) {
    return res.status(404).json({
      error: "Not found"
    });
  }

  for (const f of job.files) {

    const p = path.join(
      UPLOAD_DIR,
      f.storedName
    );

    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  writeData(
    jobs.filter(x => x.id !== req.params.id)
  );

  res.json({
    ok: true
  });
});


/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (_, res) => {

  res.json({
    ok: true
  });

});


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Cafe upload system running on http://localhost:${PORT}`
    );
  }
);
