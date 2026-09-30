const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_KEY =
  process.env.ADMIN_KEY || "change-this-admin-key";

const UPLOAD_DIR =
  path.join(__dirname, "uploads");

const DATA_FILE =
  path.join(__dirname, "data.json");


/* =========================
   FOLDERS
========================= */

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true
});

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}


/* =========================
   MULTER
========================= */

const storage =
  multer.diskStorage({

    destination: (_, __, cb) => {
      cb(null, UPLOAD_DIR);
    },

    filename: (_, file, cb) => {

      const ext =
        path.extname(
          file.originalname
        ).toLowerCase();

      cb(
        null,
        crypto.randomUUID() + ext
      );

    }

  });


const upload =
  multer({

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

      const ext =
        path.extname(
          file.originalname
        ).toLowerCase();

      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            "This file type is not allowed."
          )
        );
      }

    }

  });


/* =========================
   MIDDLEWARE
========================= */

app.use(
  express.json()
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


/* =========================
   DATA
========================= */

function readData() {

  try {

    return JSON.parse(
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      )
    );

  } catch {

    return [];

  }

}


function writeData(items) {

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      items,
      null,
      2
    )
  );

}


/* =========================
   ADMIN SECURITY
========================= */

function admin(
  req,
  res,
  next
) {

  const key =
    req.headers["x-admin-key"] ||
    req.query.key ||
    req.body.key;

  if (key !== ADMIN_KEY) {

    return res
      .status(401)
      .json({
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

  upload.array(
    "documents",
    10
  ),

  (req, res) => {

    if (
      !req.files ||
      !req.files.length
    ) {

      return res
        .status(400)
        .json({
          error:
            "At least one document is required."
        });

    }


    const items =
      readData();


    const batchId =
      crypto.randomUUID();


    const batch = {

      id: batchId,

      createdAt:
        new Date().toISOString(),

      files:
        req.files.map(
          file => ({

            id:
              crypto.randomUUID(),

            originalName:
              file.originalname,

            storedName:
              file.filename,

            size:
              file.size

          })
        )

    };


    items.unshift(batch);

    writeData(items);


    res.json({

      ok: true,

      id: batchId,

      message:
        "Document successfully uploaded."

    });

  }
);


/* =========================
   ADMIN JOBS
========================= */

app.get(
  "/api/jobs",
  admin,
  (req, res) => {

    res.json(
      readData()
    );

  }
);


/* =========================
   FILE OPEN / PREVIEW
========================= */

app.get(
  "/api/file/:id",
  admin,
  (req, res) => {

    const jobs =
      readData();


    for (
      const job of jobs
    ) {

      const file =
        job.files.find(
          item =>
            item.id ===
            req.params.id
        );


      if (!file) {
        continue;
      }


      const filePath =
        path.join(
          UPLOAD_DIR,
          file.storedName
        );


      if (
        !fs.existsSync(
          filePath
        )
      ) {

        return res
          .status(404)
          .send(
            "File not found"
          );

      }


      const ext =
        path.extname(
          file.originalName
        ).toLowerCase();


      const mimeTypes = {

        ".pdf":
          "application/pdf",

        ".jpg":
          "image/jpeg",

        ".jpeg":
          "image/jpeg",

        ".png":
          "image/png",

        ".webp":
          "image/webp",

        ".doc":
          "application/msword",

        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

      };


      const contentType =
        mimeTypes[ext] ||
        "application/octet-stream";


      res.setHeader(
        "Content-Type",
        contentType
      );


      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(
          file.originalName
        )}"`
      );


      res.setHeader(
        "Cache-Control",
        "private, max-age=3600"
      );


      return res.sendFile(
        filePath
      );

    }


    res
      .status(404)
      .send(
        "File not found"
      );

  }
);


/* =========================
   DELETE
========================= */

app.delete(
  "/api/job/:id",
  admin,
  (req, res) => {

    const jobs =
      readData();


    const job =
      jobs.find(
        item =>
          item.id ===
          req.params.id
      );


    if (!job) {

      return res
        .status(404)
        .json({
          error: "Not found"
        });

    }


    for (
      const file of job.files
    ) {

      const filePath =
        path.join(
          UPLOAD_DIR,
          file.storedName
        );


      if (
        fs.existsSync(
          filePath
        )
      ) {

        fs.unlinkSync(
          filePath
        );

      }

    }


    writeData(
      jobs.filter(
        item =>
          item.id !==
          req.params.id
      )
    );


    res.json({
      ok: true
    });

  }
);


/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (_, res) => {

    res.json({
      ok: true
    });

  }
);


/* =========================
   ERROR
========================= */

app.use(
  (err, req, res, next) => {

    console.error(err);


    if (
      err instanceof
      multer.MulterError
    ) {

      return res
        .status(400)
        .json({
          error:
            err.message
        });

    }


    res
      .status(400)
      .json({
        error:
          err.message ||
          "Upload failed"
      });

  }
);


/* =========================
   START
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
