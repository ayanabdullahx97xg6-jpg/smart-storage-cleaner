/* =========================================================
   STORAGE CLEANER
   Smart local storage analyzer
   No file contents are uploaded.
   ========================================================= */


const state = {

  files: [],

  largeFiles: [],

  oldFiles: [],

  duplicateGroups: [],

  typeStats: [],

  folderStats: [],

  scanned: false,

  rootName: "",

  largeThreshold:
    500 * 1024 * 1024,

  oldDays: 180

};


/* =========================================================
   ELEMENTS
   ========================================================= */

const folderInput =
  document.getElementById("folderInput");

const selectFolderButton =
  document.getElementById("selectFolderButton");

const rescanButton =
  document.getElementById("rescanButton");

const scanOverlay =
  document.getElementById("scanOverlay");

const progressBar =
  document.getElementById("progressBar");

const progressText =
  document.getElementById("progressText");

const scanMessage =
  document.getElementById("scanMessage");

const scanStatus =
  document.getElementById("scanStatus");

const largeThreshold =
  document.getElementById("largeThreshold");

const oldThreshold =
  document.getElementById("oldThreshold");


/* =========================================================
   NAVIGATION
   ========================================================= */

document
  .querySelectorAll(".nav-item")
  .forEach(button => {

    button.addEventListener("click", () => {

      const page =
        button.dataset.page;

      openPage(page);

    });

  });


document
  .querySelectorAll("[data-page-link]")
  .forEach(button => {

    button.addEventListener("click", () => {

      openPage(
        button.dataset.pageLink
      );

    });

  });


function openPage(pageName) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove("active");

    });


  const target =
    document.getElementById(
      `page-${pageName}`
    );


  if (target) {
    target.classList.add("active");
  }


  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === pageName
      );

    });


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   SELECT FOLDER
   ========================================================= */

selectFolderButton.addEventListener(
  "click",
  () => folderInput.click()
);


folderInput.addEventListener(
  "change",
  async event => {

    const selectedFiles =
      Array.from(event.target.files || []);

    if (!selectedFiles.length) {
      return;
    }

    await scanFiles(selectedFiles);

  }
);


/* =========================================================
   SETTINGS
   ========================================================= */

largeThreshold.addEventListener(
  "change",
  () => {

    state.largeThreshold =
      Number(largeThreshold.value);

    if (state.scanned) {
      recalculate();
    }

  }
);


oldThreshold.addEventListener(
  "change",
  () => {

    state.oldDays =
      Number(oldThreshold.value);

    if (state.scanned) {
      recalculate();
    }

  }
);


rescanButton.addEventListener(
  "click",
  () => {

    if (folderInput.files.length) {

      scanFiles(
        Array.from(folderInput.files)
      );

    }

  }
);


/* =========================================================
   SCAN
   ========================================================= */

async function scanFiles(files) {

  state.files = [];

  state.largeFiles = [];

  state.oldFiles = [];

  state.duplicateGroups = [];

  state.typeStats = [];

  state.folderStats = [];


  showScanOverlay();

  scanStatus.textContent =
    "SCANNING";


  const total =
    files.length;


  for (
    let i = 0;
    i < total;
    i++
  ) {

    const file =
      files[i];


    const path =
      file.webkitRelativePath ||
      file.name;


    const parts =
      path.split("/");


    if (!state.rootName) {

      state.rootName =
        parts[0] || "Selected Folder";

    }


    state.files.push({

      file,

      name: file.name,

      path,

      size: Number(file.size) || 0,

      lastModified:
        Number(file.lastModified) || 0,

      type:
        file.type || "",

      extension:
        getExtension(file.name),

      folder:
        parts.length > 2
          ? parts
              .slice(1, -1)
              .join("/")
          : parts[0] || "Root"

    });


    const percent =
      Math.round(
        ((i + 1) / total) * 65
      );


    updateProgress(
      percent,
      `Reading file ${i + 1.toLocaleString()} of ${total.toLocaleString()}...`
    );


    /*
      IMPORTANT:

      We DO NOT call file.arrayBuffer()
      here.

      Therefore a 1 GB / 5 GB file
      does not get loaded into RAM.
    */

    if (i % 250 === 0) {
      await sleep(0);
    }

  }


  updateProgress(
    70,
    "Calculating storage insights..."
  );


  recalculate(false);


  updateProgress(
    82,
    "Checking potential duplicates..."
  );


  await findDuplicates();


  updateProgress(
    96,
    "Finalizing analysis..."
  );


  renderEverything();


  state.scanned = true;


  updateProgress(
    100,
    "Scan complete"
  );


  await sleep(500);


  hideScanOverlay();


  scanStatus.textContent =
    "SCANNED";


  rescanButton.style.display =
    "inline-flex";


  showToast(
    `${formatNumber(state.files.length)} files analyzed locally.`
  );

}


/* =========================================================
   RECALCULATE
   ========================================================= */

function recalculate(render = true) {

  state.largeFiles =
    state.files
      .filter(
        item =>
          item.size >= state.largeThreshold
      )
      .sort(
        (a, b) =>
          b.size - a.size
      );


  const oldLimit =
    Date.now() -
    (
      state.oldDays *
      24 *
      60 *
      60 *
      1000
    );


  state.oldFiles =
    state.files
      .filter(
        item =>
          item.lastModified > 0 &&
          item.lastModified <= oldLimit
      )
      .sort(
        (a, b) =>
          a.lastModified -
          b.lastModified
      );


  calculateTypes();

  calculateFolders();


  if (render) {
    renderEverything();
  }

}


/* =========================================================
   FILE TYPES
   ========================================================= */

function calculateTypes() {

  const map = new Map();


  state.files.forEach(item => {

    const category =
      getFileCategory(item.extension);


    if (!map.has(category)) {

      map.set(
        category,
        {
          name: category,
          size: 0,
          count: 0
        }
      );

    }


    const record =
      map.get(category);


    record.size += item.size;

    record.count++;

  });


  state.typeStats =
    Array.from(map.values())
      .sort(
        (a, b) =>
          b.size - a.size
      );

}


/* =========================================================
   FOLDERS
   ========================================================= */

function calculateFolders() {

  const map = new Map();


  state.files.forEach(item => {

    const path =
      item.folder ||
      "Root";


    const parts =
      path.split("/");


    let current = "";


    parts.forEach(part => {

      if (!part) {
        return;
      }


      current =
        current
          ? `${current}/${part}`
          : part;


      if (!map.has(current)) {

        map.set(
          current,
          {
            name: current,
            size: 0,
            count: 0
          }
        );

      }


      const record =
        map.get(current);


      record.size += item.size;

      record.count++;

    });

  });


  state.folderStats =
    Array.from(map.values())
      .sort(
        (a, b) =>
          b.size - a.size
      );

}


/* =========================================================
   SMART DUPLICATES
   =========================================================

   We first group by file size.

   Then we compare a small fingerprint:
   - first 128 KB
   - last 128 KB

   This avoids loading a 1 GB+ file into memory.

   These are called "duplicate candidates"
   rather than blindly claiming every match
   is mathematically identical.
   ========================================================= */

async function findDuplicates() {

  const sizeGroups =
    new Map();


  state.files.forEach(item => {

    if (item.size === 0) {
      return;
    }


    if (!sizeGroups.has(item.size)) {

      sizeGroups.set(
        item.size,
        []
      );

    }


    sizeGroups
      .get(item.size)
      .push(item);

  });


  const candidates =
    Array.from(sizeGroups.values())
      .filter(
        group =>
          group.length > 1
      );


  const groups = [];


  let processed = 0;


  for (const group of candidates) {

    const fingerprints =
      new Map();


    for (const item of group) {

      const fingerprint =
        await getSmartFingerprint(
          item.file
        );


      if (!fingerprints.has(
        fingerprint
      )) {

        fingerprints.set(
          fingerprint,
          []
        );

      }


      fingerprints
        .get(fingerprint)
        .push(item);


      processed++;


      if (
        processed % 4 === 0
      ) {

        await sleep(0);

      }

    }


    fingerprints.forEach(
      sameFiles => {

        if (
          sameFiles.length > 1
        ) {

          groups.push(
            sameFiles
          );

        }

      }
    );

  }


  state.duplicateGroups =
    groups
      .sort(
        (a, b) => {

          const aSize =
            a[0]?.size || 0;

          const bSize =
            b[0]?.size || 0;

          return (
            bSize - aSize
          );

        }
      );

}


/* =========================================================
   SMART FINGERPRINT
   ========================================================= */

async function getSmartFingerprint(file) {

  const SAMPLE =
    128 * 1024;


  const firstEnd =
    Math.min(
      SAMPLE,
      file.size
    );


  const first =
    await readBlob(
      file.slice(
        0,
        firstEnd
      )
    );


  let last =
    new Uint8Array();


  if (
    file.size > SAMPLE
  ) {

    last =
      await readBlob(
        file.slice(
          Math.max(
            0,
            file.size - SAMPLE
          ),
          file.size
        )
      );

  }


  const firstHash =
    await hashBytes(first);


  const lastHash =
    await hashBytes(last);


  return [
    file.size,
    firstHash,
    lastHash
  ].join(":");

}


/* =========================================================
   BROWSER CRYPTO
   ========================================================= */

async function readBlob(blob) {

  if (!blob.size) {
    return new Uint8Array();
  }


  return new Uint8Array(
    await blob.arrayBuffer()
  );

}


async function hashBytes(bytes) {

  if (!bytes.length) {
    return "empty";
  }


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );


  return Array
    .from(
      new Uint8Array(digest)
    )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");

}


/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderEverything() {

  renderDashboard();

  renderLargeFiles();

  renderOldFiles();

  renderDuplicates();

  renderTypes();

  renderFolders();

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  const totalSize =
    state.files.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  document.getElementById(
    "totalFiles"
  ).textContent =
    formatNumber(
      state.files.length
    );


  document.getElementById(
    "totalSize"
  ).textContent =
    formatBytes(totalSize);


  document.getElementById(
    "largeFiles"
  ).textContent =
    formatNumber(
      state.largeFiles.length
    );


  const duplicateCount =
    state.duplicateGroups
      .reduce(
        (sum, group) =>
          sum + group.length,
        0
      );


  document.getElementById(
    "duplicateFiles"
  ).textContent =
    formatNumber(
      duplicateCount
    );


  document.getElementById(
    "largeNavCount"
  ).textContent =
    formatNumber(
      state.largeFiles.length
    );


  document.getElementById(
    "duplicateNavCount"
  ).textContent =
    formatNumber(
      state.duplicateGroups.length
    );


  document.getElementById(
    "oldNavCount"
  ).textContent =
    formatNumber(
      state.oldFiles.length
    );


  renderInsights();

  renderStorageMix();

}


/* =========================================================
   SMART INSIGHTS
   ========================================================= */

function renderInsights() {

  const container =
    document.getElementById(
      "insightsList"
    );


  if (!state.files.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          Select a folder to generate smart insights.
        </div>
      `;

    return;

  }


  const insights = [];


  const hugeFiles =
    state.files.filter(
      item =>
        item.size >=
        1024 * 1024 * 1024
    );


  if (hugeFiles.length) {

    const hugeSize =
      hugeFiles.reduce(
        (sum, item) =>
          sum + item.size,
        0
      );


    insights.push({

      icon: "!",
      title:
        `${hugeFiles.length} huge file${hugeFiles.length === 1 ? "" : "s"} detected`,

      text:
        `${formatBytes(hugeSize)} is stored in files larger than 1 GB.`

    });

  }


  if (
    state.duplicateGroups.length
  ) {

    const duplicateSpace =
      calculateDuplicateSpace();


    insights.push({

      icon: "◈",

      title:
        `${state.duplicateGroups.length} duplicate group${state.duplicateGroups.length === 1 ? "" : "s"} found`,

      text:
        `Potentially repeated data accounts for about ${formatBytes(duplicateSpace)}.`

    });

  }


  if (state.oldFiles.length) {

    const oldSize =
      state.oldFiles.reduce(
        (sum, item) =>
          sum + item.size,
        0
      );


    insights.push({

      icon: "◷",

      title:
        `${formatNumber(state.oldFiles.length)} old files`,

      text:
        `${formatBytes(oldSize)} hasn't been modified for ${state.oldDays}+ days.`

    });

  }


  if (state.folderStats.length) {

    const biggest =
      state.folderStats[0];


    insights.push({

      icon: "▤",

      title:
        "Biggest storage area",

      text:
        `${biggest.name} contains ${formatBytes(biggest.size)} across ${formatNumber(biggest.count)} files.`

    });

  }


  if (!insights.length) {

    insights.push({

      icon: "✓",

      title:
        "Storage looks organized",

      text:
        "No major storage patterns need attention based on your current settings."

    });

  }


  container.innerHTML =
    insights
      .slice(0, 5)
      .map(
        insight =>
          `
            <div class="insight">

              <div class="insight-icon">
                ${insight.icon}
              </div>

              <div>

                <strong>
                  ${escapeHTML(
                    insight.title
                  )}
                </strong>

                <p>
                  ${escapeHTML(
                    insight.text
                  )}
                </p>

              </div>

            </div>
          `
      )
      .join("");

}


/* =========================================================
   STORAGE MIX
   ========================================================= */

function renderStorageMix() {

  const container =
    document.getElementById(
      "storageMix"
    );


  if (!state.typeStats.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No scan data yet.
        </div>
      `;

    return;

  }


  const top =
    state.typeStats.slice(0, 6);


  const total =
    state.typeStats.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  container.innerHTML =
    top.map(item => {

      const percentage =
        total
          ? (
              item.size /
              total
            ) * 100
          : 0;


      return `
        <div class="storage-mix-item">

          <div class="mix-head">

            <span>
              ${escapeHTML(item.name)}
            </span>

            <span>
              ${formatBytes(item.size)}
              ·
              ${percentage.toFixed(1)}%
            </span>

          </div>

          <div class="mix-bar">

            <div
              class="mix-fill"
              style="
                width:${Math.max(
                  1,
                  percentage
                )}%;
              "
            ></div>

          </div>

        </div>
      `;

    }).join("");

}


/* =========================================================
   LARGE FILES
   ========================================================= */

function renderLargeFiles() {

  const search =
    document.getElementById(
      "largeSearch"
    ).value
      .trim()
      .toLowerCase();


  const sort =
    document.getElementById(
      "largeSort"
    ).value;


  let list =
    state.largeFiles
      .filter(
        item =>
          item.name
            .toLowerCase()
            .includes(search) ||

          item.path
            .toLowerCase()
            .includes(search)
      )
      .slice();


  if (sort === "size-asc") {

    list.sort(
      (a, b) =>
        a.size - b.size
    );

  }


  if (sort === "size-desc") {

    list.sort(
      (a, b) =>
        b.size - a.size
    );

  }


  if (sort === "name") {

    list.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

  }


  if (sort === "date") {

    list.sort(
      (a, b) =>
        b.lastModified -
        a.lastModified
    );

  }


  const totalSize =
    state.largeFiles.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  const huge =
    state.largeFiles.filter(
      item =>
        item.size >=
        1024 * 1024 * 1024
    );


  document.getElementById(
    "largeCountPage"
  ).textContent =
    formatNumber(
      state.largeFiles.length
    );


  document.getElementById(
    "largeSizePage"
  ).textContent =
    formatBytes(totalSize);


  document.getElementById(
    "hugeCountPage"
  ).textContent =
    formatNumber(
      huge.length
    );


  document.getElementById(
    "largeSubtitle"
  ).textContent =
    `Files larger than ${formatBytes(state.largeThreshold)}.`;


  const container =
    document.getElementById(
      "largeList"
    );


  if (!list.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No large files found.
          <br>
          Try lowering the threshold above.
        </div>
      `;

    return;

  }


  container.innerHTML =
    list
      .map(
        item =>
          fileRow(
            item,
            item.size >=
              1024 * 1024 * 1024
          )
      )
      .join("");

}


/* =========================================================
   OLD FILES
   ========================================================= */

function renderOldFiles() {

  const search =
    document.getElementById(
      "oldSearch"
    ).value
      .trim()
      .toLowerCase();


  const sort =
    document.getElementById(
      "oldSort"
    ).value;


  let list =
    state.oldFiles
      .filter(
        item =>
          item.name
            .toLowerCase()
            .includes(search) ||

          item.path
            .toLowerCase()
            .includes(search)
      )
      .slice();


  if (sort === "oldest") {

    list.sort(
      (a, b) =>
        a.lastModified -
        b.lastModified
    );

  }


  if (sort === "largest") {

    list.sort(
      (a, b) =>
        b.size - a.size
    );

  }


  if (sort === "name") {

    list.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

  }


  const container =
    document.getElementById(
      "oldList"
    );


  if (!list.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No old files found.
        </div>
      `;

    return;

  }


  container.innerHTML =
    list
      .slice(0, 2000)
      .map(
        item =>
          fileRow(item, false)
      )
      .join("");

}


/* =========================================================
   DUPLICATES
   ========================================================= */

function renderDuplicates() {

  const container =
    document.getElementById(
      "duplicateList"
    );


  const duplicateSpace =
    calculateDuplicateSpace();


  document.getElementById(
    "duplicateGroupsPage"
  ).textContent =
    formatNumber(
      state.duplicateGroups.length
    );


  document.getElementById(
    "duplicateSpacePage"
  ).textContent =
    formatBytes(
      duplicateSpace
    );


  if (!state.duplicateGroups.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No duplicate candidates found.
        </div>
      `;

    return;

  }


  container.innerHTML =
    state.duplicateGroups
      .slice(0, 500)
      .map(
        (group, index) => {

          const size =
            group[0]?.size || 0;


          return `
            <div class="duplicate-group">

              <div class="duplicate-header">

                <strong>
                  Duplicate Group ${index + 1}
                </strong>

                <span>
                  ${group.length}
                  files
                  ·
                  ${formatBytes(
                    size * group.length
                  )}
                </span>

              </div>

              <div class="duplicate-files">

                ${group
                  .map(
                    item =>
                      fileRow(
                        item,
                        false
                      )
                  )
                  .join("")}

              </div>

            </div>
          `;

        }
      )
      .join("");

}


/* =========================================================
   TYPES
   ========================================================= */

function renderTypes() {

  const container =
    document.getElementById(
      "typeList"
    );


  if (!state.typeStats.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No scan data yet.
        </div>
      `;

    return;

  }


  const total =
    state.typeStats.reduce(
      (sum, item) =>
        sum + item.size,
      0
    );


  container.innerHTML =
    state.typeStats
      .map(item => {

        const percentage =
          total
            ? (
                item.size /
                total
              ) * 100
            : 0;


        return `
          <div class="type-row">

            <div class="type-top">

              <span>
                <strong>
                  ${escapeHTML(
                    item.name
                  )}
                </strong>

                ·

                ${formatNumber(
                  item.count
                )}
                files
              </span>

              <span>
                ${formatBytes(
                  item.size
                )}

                ·

                ${percentage.toFixed(1)}%
              </span>

            </div>

            <div class="type-bar">

              <div
                class="type-fill"
                style="
                  width:${Math.max(
                    1,
                    percentage
                  )}%;
                "
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* =========================================================
   FOLDERS
   ========================================================= */

function renderFolders() {

  const container =
    document.getElementById(
      "folderList"
    );


  if (!state.folderStats.length) {

    container.innerHTML =
      `
        <div class="empty-state">
          No scan data yet.
        </div>
      `;

    return;

  }


  const maxSize =
    state.folderStats[0].size;


  container.innerHTML =
    state.folderStats
      .slice(0, 1500)
      .map(item => {

        const percentage =
          maxSize
            ? (
                item.size /
                maxSize
              ) * 100
            : 0;


        return `
          <div class="folder-row">

            <div class="folder-top">

              <span>
                📁
                ${escapeHTML(
                  item.name
                )}
              </span>

              <span>
                ${formatBytes(
                  item.size
                )}
              </span>

            </div>

            <div class="folder-count">

              ${formatNumber(
                item.count
              )}
              files

            </div>

            <div class="folder-bar">

              <div
                class="folder-fill"
                style="
                  width:${Math.max(
                    1,
                    percentage
                  )}%;
                "
              ></div>

            </div>

          </div>
        `;

      })
      .join("");

}


/* =========================================================
   FILE ROW
   ========================================================= */

function fileRow(
  item,
  huge = false
) {

  return `
    <div class="file-row">

      <div class="file-icon">
        ${getFileIcon(
          item.extension
        )}
      </div>

      <div class="file-main">

        <div class="file-name">

          ${escapeHTML(
            item.name
          )}

          ${
            huge
              ? `<span class="huge-badge">
                   HUGE
                 </span>`
              : ""
          }

        </div>

        <div class="file-path">
          ${escapeHTML(
            item.path
          )}
        </div>

      </div>

      <div class="file-meta">

        <div class="file-size">
          ${formatBytes(
            item.size
          )}
        </div>

        <div class="file-date">
          ${formatDate(
            item.lastModified
          )}
        </div>

      </div>

    </div>
  `;

}


/* =========================================================
   DUPLICATE SPACE
   ========================================================= */

function calculateDuplicateSpace() {

  return state.duplicateGroups
    .reduce(
      (total, group) => {

        if (group.length <= 1) {
          return total;
        }


        /*
          Keep one copy.

          Therefore potential extra space
          = total group size - one copy.
        */

        const size =
          group[0]?.size || 0;


        return (
          total +
          (
            size *
            (group.length - 1)
          )
        );

      },
      0
    );

}


/* =========================================================
   FILE CATEGORIES
   ========================================================= */

function getFileCategory(
  extension
) {

  const ext =
    extension.toLowerCase();


  const categories = {

    Images: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "svg",
      "ico",
      "tiff"
    ],

    Videos: [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "webm",
      "wmv",
      "flv"
    ],

    Audio: [
      "mp3",
      "wav",
      "flac",
      "aac",
      "ogg",
      "m4a"
    ],

    Documents: [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "rtf"
    ],

    Archives: [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
      "iso"
    ],

    Code: [
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "json",
      "py",
      "java",
      "c",
      "cpp",
      "cs",
      "php",
      "go",
      "rs"
    ],

    Executables: [
      "exe",
      "msi",
      "dll",
      "app",
      "bin"
    ]

  };


  for (
    const [category, extensions]
    of Object.entries(categories)
  ) {

    if (
      extensions.includes(ext)
    ) {

      return category;

    }

  }


  return "Other";

}


/* =========================================================
   ICONS
   ========================================================= */

function getFileIcon(extension) {

  const ext =
    extension.toLowerCase();


  if (
    [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "svg"
    ].includes(ext)
  ) {

    return "▧";

  }


  if (
    [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "webm"
    ].includes(ext)
  ) {

    return "▶";

  }


  if (
    [
      "mp3",
      "wav",
      "flac",
      "aac"
    ].includes(ext)
  ) {

    return "♫";

  }


  if (
    [
      "zip",
      "rar",
      "7z",
      "iso"
    ].includes(ext)
  ) {

    return "▱";

  }


  if (
    [
      "exe",
      "msi",
      "dll"
    ].includes(ext)
  ) {

    return "⚙";

  }


  return "□";

}


/* =========================================================
   EXTENSION
   ========================================================= */

function getExtension(name) {

  const index =
    name.lastIndexOf(".");


  if (
    index <= 0 ||
    index === name.length - 1
  ) {

    return "";

  }


  return name
    .slice(index + 1)
    .toLowerCase();

}


/* =========================================================
   FORMATTING
   ========================================================= */

function formatBytes(bytes) {

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {

    return "0 B";

  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];


  const index =
    Math.floor(
      Math.log(bytes) /
      Math.log(1024)
    );


  const safeIndex =
    Math.min(
      index,
      units.length - 1
    );


  const value =
    bytes /
    Math.pow(
      1024,
      safeIndex
    );


  const decimals =
    safeIndex === 0
      ? 0
      : value >= 100
        ? 1
        : 2;


  return (
    value.toFixed(decimals) +
    " " +
    units[safeIndex]
  );

}


function formatNumber(number) {

  return Number(
    number || 0
  ).toLocaleString();

}


function formatDate(timestamp) {

  if (!timestamp) {
    return "Unknown date";
  }


  return new Date(
    timestamp
  ).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


/* =========================================================
   PROGRESS
   ========================================================= */

function showScanOverlay() {

  scanOverlay.style.display =
    "flex";

  progressBar.style.width =
    "0%";

  progressText.textContent =
    "0%";

}


function hideScanOverlay() {

  scanOverlay.style.display =
    "none";

}


function updateProgress(
  percent,
  message
) {

  progressBar.style.width =
    `${percent}%`;

  progressText.textContent =
    `${percent}%`;

  scanMessage.textContent =
    message;

}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer;


function showToast(message) {

  const toast =
    document.getElementById(
      "toast"
    );


  toast.textContent =
    message;


  toast.classList.add(
    "show"
  );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3500
    );

}


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHTML(value) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* =========================================================
   SEARCH / SORT EVENTS
   ========================================================= */

document
  .getElementById("largeSearch")
  .addEventListener(
    "input",
    renderLargeFiles
  );


document
  .getElementById("largeSort")
  .addEventListener(
    "change",
    renderLargeFiles
  );


document
  .getElementById("oldSearch")
  .addEventListener(
    "input",
    renderOldFiles
  );


document
  .getElementById("oldSort")
  .addEventListener(
    "change",
    renderOldFiles
  );


/* =========================================================
   INITIAL STATE
   ========================================================= */

renderEverything();
