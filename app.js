const config = require('./config.json');
const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
var multer = require("multer");


const basePath = config['storagePath'];
const folderName = config['exposedImageFolderName'] // Should include a forward slash in the config.json. Example: /images

app.use(express.json());
app.use(folderName, express.static(basePath));

const apiResponse =
  (res, status = 200) =>
  (data, success = true, errorMsg = null, error = null) =>
    res.status(status).json({
      data,
      success,
      errorMsg,
      error,
    });

const apiError =
  (res, status = 500) =>
  (errorMsg = null, error = null) =>
    apiResponse(res, status)(null, false, errorMsg, error);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type,path"
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

app.get("/filemanager/list", (req, res) => {
  let path = basePath;
  if (req.query.path != '/') path = `${basePath}${req.query.path}`;
  fs.readdir(path, (err, files) => {
    if (err) {
      return apiError(res)("Cannot read that folder", err);
    }

    const items = (files || [])
      .map((f) => {
        const fpath = `${path}/${f}`;
        let type = "file";
        let size = 0;
        let createdAt = null;
        let updatedAt = null;
        try {
          const stat = fs.statSync(fpath);
          type = stat.isDirectory() ? "dir" : type;
          size = stat.size || size;
          createdAt = stat.birthtimeMs;
          updatedAt = stat.mtimeMs;
        } catch (e) {
          return null;
        }
        return {
          name: f,
          path: fpath,
          type,
          size,
          createdAt,
          updatedAt,
        };
      })
      .filter(Boolean);

    return apiResponse(res)(items);
  });
});

app.post("/filemanager/dir/create", (req, res) => {
  const fullPath = `${basePath}${req.body.path}/${req.body.directory}`;

  if (fs.existsSync(fullPath)) {
    return apiError(res)("The folder already exist");
  }
  try {
    const result = fs.mkdirSync(fullPath);
    return apiResponse(res)(result);
  } catch (err) {
    return apiError(res)("Unknown error creating folder", err);
  }
});

app.get("/filemanager/file/content", (req, res) => {
  res.download(`${basePath}${req.query.path}`);
});

app.post("/filemanager/items/copy", (req, res) => {
  const { path, filenames, destination } = req.body;

  const promises = (filenames || []).map(
    (f) =>
      new Promise((resolve, reject) => {
        const oldPath = `${basePath}/${path}/${f}`;
        const newPath = `${basePath}/${destination}/${f}`;
        fs.copyFile(oldPath, newPath, (err) => {
          const response = {
            success: !err,
            error: err,
            oldPath,
            newPath,
            filename: f,
          };
          return err ? reject(response) : resolve(response);
        });
      })
  );

  Promise.all(promises)
    .then((values) => apiResponse(res)(values))
    .catch((err) => apiError(res)("An error ocurred copying files", err));
});

app.post("/filemanager/items/move", (req, res) => {
  const { path, filenames, destination } = req.body;

  const promises = (filenames || []).map(
    (f) =>
      new Promise((resolve, reject) => {
        let oldPath = `${basePath}/${path}/${f}`;
        if (path == "/") oldPath = `${basePath}/${f}`;
        const newPath = `${basePath}/${destination}/${f}`;
        fs.rename(oldPath, newPath, (err) => {
          const response = {
            success: !err,
            error: err,
            oldPath,
            newPath,
            filename: f,
          };
          return err ? reject(response) : resolve(response);
        });
      })
  );

  Promise.all(promises)
    .then((values) => apiResponse(res)(values))
    .catch((err) => apiError(res)("An error ocurred moving files", err));
});

app.post("/filemanager/item/move", (req, res) => {
  const { path, destination } = req.body;

  const promise = new Promise((resolve, reject) =>
    fs.rename(`${basePath}/${path}`, `${basePath}/${destination}`, (err) => {
      const response = {
        success: !err,
        error: err,
        path,
        destination,
      };
      return err ? reject(response) : resolve(response);
    })
  );

  promise
    .then((values) => apiResponse(res)(values))
    .catch((err) => apiError(res)("An error ocurred renaming file", err));
});

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.resolve(basePath)),
    filename: (_req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
});

app.post("/filemanager/items/upload", uploader.array("photo"), (req, res) => {
  return apiResponse(res)(true);
});

app.post("/filemanager/items/remove", (req, res) => {
  const { path, filenames } = req.body;
  const promises = (filenames || []).map((f) => {
    const fullPath = `${basePath}${path}/${f}`;
    console.log(fullPath);
    return new Promise((resolve, reject) => {
      fs.unlink(fullPath, (err) => {
        const response = {
          success: !err,
          error: err,
          path,
          filename: f,
          fullPath,
        };
        return err ? reject(response) : resolve(response);
      });
    });
  });

  Promise.all(promises)
    .then((values) => apiResponse(res)(values))
    .catch((err) => apiError(res)("An error ocurred deleting file", err));
});

app.listen(config['port'], config['host']);
