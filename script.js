
"use strict";

/* =========================================================
   PDF GENIUS — COMPLETE PDF TOOLKIT
   Features:
   1. Upload and preview PDF
   2. Merge multiple PDFs
   3. Add PDFs in separate selections
   4. Remove selected PDFs
   5. Split PDF
   6. Delete PDF pages
   7. Rotate PDF pages
   8. Visual drag-and-drop page rearrangement
   9. High-resolution thumbnails
   10. Automatic scrolling while dragging
   ========================================================= */

const PDFJS_WORKER =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PDFLIB_URL =
    "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js";

/* =========================
   GLOBAL VARIABLES
========================= */

let pdfDocument = null;
let currentPdfBytes = null;
let currentFileName = "document.pdf";
let currentPage = 1;
let pdfLibPromise = null;

let selectedMergeFiles = [];
let rearrangePageOrder = [];

let rearrangeAutoScrollFrame = null;
let rearrangePointerY = null;
let rearrangeDragActive = false;

/* =========================
   HTML ELEMENTS
========================= */

const pdfUpload = document.getElementById("pdf-upload");
const fileNameLabel = document.getElementById("file-name");
const dropZone = document.getElementById("drop-zone");
const extractedText = document.getElementById("extracted-text");

const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");

/* =========================
   STATUS MESSAGE
========================= */

function setMessage(message, isError = false) {

    const status = document.getElementById("toolkit-status");

    if (!status) return;

    status.textContent = message;

    status.style.color = isError
        ? "#ff8585"
        : "#c4b5fd";
}

/* =========================
   FILE UTILITIES
========================= */

function safeBaseName(name) {

    return name
        .replace(/\.pdf$/i, "")
        .replace(/[<>:"/\\|?*]+/g, "_");
}

function downloadPDF(bytes, filename) {

    const blob = new Blob([bytes], {
        type: "application/pdf"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 2000);
}

/* =========================
   LOAD PDF-LIB
========================= */

function loadPDFLib() {

    if (window.PDFLib) {
        return Promise.resolve(window.PDFLib);
    }

    if (pdfLibPromise) {
        return pdfLibPromise;
    }

    pdfLibPromise = new Promise((resolve, reject) => {

        const script = document.createElement("script");

        script.src = PDFLIB_URL;

        script.onload = () => {

            if (window.PDFLib) {
                resolve(window.PDFLib);
            } else {

                pdfLibPromise = null;

                reject(
                    new Error("PDF editing library did not load.")
                );
            }
        };

        script.onerror = () => {

            pdfLibPromise = null;

            reject(
                new Error(
                    "Could not load PDF editing library. Check your internet connection."
                )
            );
        };

        document.head.appendChild(script);
    });

    return pdfLibPromise;
}

/* =========================
   PAGE RANGE PARSER
========================= */

function parsePageRanges(value, pageCount) {

    const pages = new Set();

    const parts = value
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        throw new Error(
            "Enter page numbers, for example: 1-3,5."
        );
    }

    for (const part of parts) {

        if (/^\d+$/.test(part)) {

            const page = Number(part);

            if (page < 1 || page > pageCount) {
                throw new Error(
                    `Page ${page} is outside this PDF.`
                );
            }

            pages.add(page - 1);

            continue;
        }

        const match = part.match(/^(\d+)\s*-\s*(\d+)$/);

        if (!match) {
            throw new Error(`Invalid page range: ${part}`);
        }

        const start = Number(match[1]);
        const end = Number(match[2]);

        if (
            start < 1 ||
            end > pageCount ||
            start > end
        ) {
            throw new Error(
                `Invalid range: ${part}. This PDF has ${pageCount} pages.`
            );
        }

        for (let page = start; page <= end; page++) {
            pages.add(page - 1);
        }
    }

    return [...pages].sort((a, b) => a - b);
}

/* =========================
   CREATE PDF TOOLKIT
========================= */

function createToolkit() {

    if (document.getElementById("pdf-toolkit")) {
        return;
    }

    const section = document.createElement("section");

    section.id = "pdf-toolkit";

    section.innerHTML = `
        <div class="section-heading">
            <div>
                <h2>⚡ PDF Toolkit</h2>
                <p>Manage and organise your PDF documents.</p>
            </div>

            <span class="pdf-badge">PDF TOOLS</span>
        </div>

        <div class="pdf-tools-grid">

            <!-- MERGE PDF -->

            <article class="pdf-tool-card">
                <div class="pdf-tool-icon">📚</div>

                <h3>Merge PDFs</h3>

                <p>
                    Add multiple PDF files and combine them
                    into one document.
                </p>

                <label for="merge-files">
                    Select PDF files
                </label>

                <input
                    id="merge-files"
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                >

                <div id="merge-file-list"></div>

                <button id="merge-btn" type="button">
                    Merge PDFs
                </button>
            </article>

            <!-- SPLIT PDF -->

            <article class="pdf-tool-card">
                <div class="pdf-tool-icon">✂️</div>

                <h3>Split PDF</h3>

                <p>
                    Extract selected pages into a separate PDF.
                </p>

                <label for="split-range">
                    Pages to extract
                </label>

                <input
                    id="split-range"
                    type="text"
                    placeholder="Example: 1-3,5"
                >

                <button id="split-btn" type="button">
                    Extract Pages
                </button>
            </article>

            <!-- DELETE PAGES -->

            <article class="pdf-tool-card">
                <div class="pdf-tool-icon">🗑️</div>

                <h3>Delete Pages</h3>

                <p>
                    Remove unwanted pages from your current PDF.
                </p>

                <label for="delete-range">
                    Pages to delete
                </label>

                <input
                    id="delete-range"
                    type="text"
                    placeholder="Example: 2,4-6"
                >

                <button id="delete-btn" type="button">
                    Delete Pages
                </button>
            </article>

            <!-- ROTATE PAGES -->

            <article class="pdf-tool-card">
                <div class="pdf-tool-icon">🔄</div>

                <h3>Rotate Pages</h3>

                <p>
                    Rotate one or more pages by 90 degrees.
                </p>

                <label for="rotate-range">
                    Pages to rotate
                </label>

                <input
                    id="rotate-range"
                    type="text"
                    placeholder="Example: 1 or 2-4"
                >

                <select
                    id="rotate-direction"
                    aria-label="Rotation direction"
                >
                    <option value="90">Clockwise 90°</option>
                    <option value="180">180°</option>
                    <option value="270">Counter-clockwise 90°</option>
                </select>

                <button id="rotate-btn" type="button">
                    Rotate Pages
                </button>
            </article>

            <!-- REARRANGE PAGES -->

            <article class="pdf-tool-card">
                <div class="pdf-tool-icon">↕️</div>

                <h3>Rearrange Pages</h3>

                <p>
                    Drag and drop pages to change their order.
                </p>

                <div
                    id="rearrange-page-grid"
                    aria-label="PDF page arrangement"
                ></div>

                <button id="reorder-btn" type="button">
                    Save Rearranged PDF
                </button>
            </article>

        </div>

        <p id="toolkit-status" role="status" aria-live="polite">
            Upload a PDF first to use the page editing tools.
        </p>
    `;

    const viewerSection = document.getElementById("viewer");
    const summarySection = document.getElementById("summary");

    if (viewerSection) {

        viewerSection.insertAdjacentElement(
            "afterend",
            section
        );

    } else if (summarySection) {

        summarySection.insertAdjacentElement(
            "beforebegin",
            section
        );

    } else {

        document.querySelector("main")?.appendChild(section);
    }

    ["summary", "ask-pdf"].forEach(id => {

        const oldSection = document.getElementById(id);

        if (oldSection) {
            oldSection.hidden = true;
        }
    });

    document.querySelectorAll(
        '.sidebar nav a[href="#summary"], .sidebar nav a[href="#ask-pdf"]'
    ).forEach(link => {
        link.hidden = true;
    });

    connectToolkitButtons();
}

/* =========================
   MERGE FILE LIST
========================= */

function renderMergeFileList() {

    const list = document.getElementById("merge-file-list");

    if (!list) return;

    list.innerHTML = "";

    if (selectedMergeFiles.length === 0) {

        const empty = document.createElement("p");

        empty.textContent = "No PDFs selected yet.";

        empty.style.cssText = `
            color: #a5a8c2;
            font-size: 12px;
            margin: 12px 0;
        `;

        list.appendChild(empty);

        return;
    }

    selectedMergeFiles.forEach((file, index) => {

        const item = document.createElement("div");

        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 10px;
            margin: 8px 0;
            background: #202039;
            border: 1px solid #39345b;
            border-radius: 9px;
            color: #eeeaff;
            font-size: 12px;
        `;

        const name = document.createElement("span");

        name.textContent = `${index + 1}. ${file.name}`;

        name.style.cssText = `
            overflow-wrap: anywhere;
            min-width: 0;
        `;

        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.textContent = "Remove";

        removeButton.style.cssText = `
            width: auto;
            min-width: 65px;
            padding: 7px 10px;
            margin: 0;
            background: #713b55;
            flex-shrink: 0;
        `;

        removeButton.addEventListener("click", () => {

            selectedMergeFiles.splice(index, 1);

            renderMergeFileList();

            setMessage(
                `${selectedMergeFiles.length} PDF(s) selected.`
            );
        });

        item.append(name, removeButton);

        list.appendChild(item);
    });
}

/* =========================
   CONNECT TOOLKIT BUTTONS
========================= */

function connectToolkitButtons() {

    const mergeInput = document.getElementById("merge-files");

    mergeInput?.addEventListener("change", event => {

        const newFiles = Array.from(
            event.target.files || []
        );

        for (const file of newFiles) {

            const isPDF =
                file.type === "application/pdf" ||
                file.name.toLowerCase().endsWith(".pdf");

            if (!isPDF) {

                setMessage(
                    `${file.name} is not a PDF file.`,
                    true
                );

                continue;
            }

            const alreadyAdded = selectedMergeFiles.some(
                existing =>
                    existing.name === file.name &&
                    existing.size === file.size &&
                    existing.lastModified === file.lastModified
            );

            if (!alreadyAdded) {
                selectedMergeFiles.push(file);
            }
        }

        event.target.value = "";

        renderMergeFileList();

        setMessage(
            `${selectedMergeFiles.length} PDF(s) selected.`
        );
    });

    const bind = (id, handler) => {

        const button = document.getElementById(id);

        button?.addEventListener("click", async () => {

            if (button.disabled) return;

            try {

                button.disabled = true;

                await handler();

            } catch (error) {

                console.error(error);

                setMessage(
                    error.message ||
                    "Something went wrong while processing the PDF.",
                    true
                );

            } finally {

                button.disabled = false;
            }
        });
    };

    bind("merge-btn", mergePDFs);
    bind("split-btn", splitPDF);
    bind("delete-btn", deletePDFPages);
    bind("rotate-btn", rotatePDFPages);
    bind("reorder-btn", rearrangePDF);
}

/* =========================
   REQUIRE CURRENT PDF
========================= */

async function requireCurrentPDF() {

    if (!currentPdfBytes) {
        throw new Error(
            "Upload a PDF before using this tool."
        );
    }

    const { PDFDocument } = await loadPDFLib();

    const pdf = await PDFDocument.load(currentPdfBytes);

    return {
        PDFDocument,
        pdf
    };
}

/* =========================
   MERGE PDFS
========================= */

async function mergePDFs() {

    if (selectedMergeFiles.length < 2) {
        throw new Error(
            "Please select at least two PDF files to merge."
        );
    }

    setMessage("Preparing your PDFs...");

    const { PDFDocument } = await loadPDFLib();

    const merged = await PDFDocument.create();

    let totalPages = 0;

    for (
        let i = 0;
        i < selectedMergeFiles.length;
        i++
    ) {

        const file = selectedMergeFiles[i];

        setMessage(
            `Merging PDF ${i + 1} of ${selectedMergeFiles.length}: ${file.name}`
        );

        try {

            const arrayBuffer = await file.arrayBuffer();

            const source = await PDFDocument.load(
                arrayBuffer
            );

            const copiedPages = await merged.copyPages(
                source,
                source.getPageIndices()
            );

            copiedPages.forEach(page => {
                merged.addPage(page);
            });

            totalPages += copiedPages.length;

        } catch (error) {

            throw new Error(
                `Could not read ${file.name}. It may be damaged, password-protected, or unsupported.`
            );
        }
    }

    if (totalPages === 0) {
        throw new Error(
            "No pages were found in the selected PDFs."
        );
    }

    setMessage("Creating your merged PDF...");

    const bytes = await merged.save();

    downloadPDF(
        bytes,
        "PDF-Genius-Merged.pdf"
    );

    setMessage(
        `Success! ${selectedMergeFiles.length} PDFs merged into one document with ${totalPages} pages.`
    );
}

/* =========================
   SPLIT PDF
========================= */

async function splitPDF() {

    const { PDFDocument, pdf } =
        await requireCurrentPDF();

    const pageIndexes = parsePageRanges(
        document.getElementById("split-range").value,
        pdf.getPageCount()
    );

    setMessage("Extracting selected pages...");

    const output = await PDFDocument.create();

    const pages = await output.copyPages(
        pdf,
        pageIndexes
    );

    pages.forEach(page => {
        output.addPage(page);
    });

    const bytes = await output.save();

    downloadPDF(
        bytes,
        `${safeBaseName(currentFileName)}-extracted.pdf`
    );

    setMessage(
        `Done! Extracted ${pages.length} page(s).`
    );
}

/* =========================
   DELETE PDF PAGES
========================= */

async function deletePDFPages() {

    const { pdf } = await requireCurrentPDF();

    const pageIndexes = parsePageRanges(
        document.getElementById("delete-range").value,
        pdf.getPageCount()
    );

    if (pageIndexes.length >= pdf.getPageCount()) {
        throw new Error(
            "You cannot delete every page. Keep at least one page."
        );
    }

    setMessage("Removing selected pages...");

    pageIndexes
        .sort((a, b) => b - a)
        .forEach(index => {
            pdf.removePage(index);
        });

    const bytes = await pdf.save();

    downloadPDF(
        bytes,
        `${safeBaseName(currentFileName)}-edited.pdf`
    );

    setMessage(
        `Done! Deleted ${pageIndexes.length} page(s).`
    );
}

/* =========================
   ROTATE PDF PAGES
========================= */

async function rotatePDFPages() {

    const { pdf } = await requireCurrentPDF();

    const pageIndexes = parsePageRanges(
        document.getElementById("rotate-range").value,
        pdf.getPageCount()
    );

    const degrees = Number(
        document.getElementById("rotate-direction").value
    );

    setMessage("Rotating selected pages...");

    for (const index of pageIndexes) {

        const page = pdf.getPage(index);

        const currentAngle = page.getRotation().angle;

        page.setRotation(
            window.PDFLib.degrees(
                (currentAngle + degrees) % 360
            )
        );
    }

    const bytes = await pdf.save();

    downloadPDF(
        bytes,
        `${safeBaseName(currentFileName)}-rotated.pdf`
    );

    setMessage(
        `Done! Rotated ${pageIndexes.length} page(s).`
    );
}

/* =========================
   AUTO-SCROLL HELPERS
========================= */


function stopRearrangeAutoScroll() {
    if (rearrangeAutoScrollFrame !== null) {
        cancelAnimationFrame(rearrangeAutoScrollFrame);
        rearrangeAutoScrollFrame = null;
    }

    rearrangePointerY = null;
}

function startRearrangeAutoScroll() {
    if (rearrangeAutoScrollFrame !== null) return;

    let lastFrameTime = 0;

    function scrollLoop(timestamp) {
        if (!rearrangeDragActive) {
            rearrangeAutoScrollFrame = null;
            return;
        }

        if (rearrangePointerY !== null) {
            const edgeSize = 220;
            const maxSpeed = 3600; // pixels per second
            const screenHeight = window.innerHeight;

            let direction = 0;
            let distance = 0;

            if (rearrangePointerY < edgeSize) {
                direction = -1;
                distance = edgeSize - rearrangePointerY;
            } else if (rearrangePointerY > screenHeight - edgeSize) {
                direction = 1;
                distance = rearrangePointerY - (screenHeight - edgeSize);
            }

            if (direction !== 0) {
                const intensity = Math.min(1, distance / edgeSize);
                const speed = maxSpeed * intensity * intensity;

                const deltaTime = lastFrameTime
                    ? Math.min((timestamp - lastFrameTime) / 1000, 0.032)
                    : 0;

                if (deltaTime > 0) {
                    window.scrollBy({
                        top: direction * speed * deltaTime,
                        left: 0,
                        behavior: "instant"
                    });
                }
            }
        }

        lastFrameTime = timestamp;
        rearrangeAutoScrollFrame =
            requestAnimationFrame(scrollLoop);
    }

    rearrangeAutoScrollFrame =
        requestAnimationFrame(scrollLoop);
}


/* =========================
   VISUAL PAGE ORGANIZER
========================= */

async function renderRearrangePageGrid() {

    const grid = document.getElementById(
        "rearrange-page-grid"
    );

    if (!grid || !pdfDocument) return;

    if (
        rearrangePageOrder.length !==
        pdfDocument.numPages
    ) {

        rearrangePageOrder = Array.from(
            { length: pdfDocument.numPages },
            (_, index) => index
        );
    }

    grid.innerHTML = "";

    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin: 15px 0;
        width: 100%;
    `;

    const cards = [];

    // Create page cards.

    for (const originalIndex of rearrangePageOrder) {

        const card = document.createElement("div");

        card.draggable = true;

        card.style.cssText = `
            background: #202039;
            border: 1px solid #514477;
            border-radius: 10px;
            padding: 9px;
            text-align: center;
            cursor: grab;
            min-width: 0;
            transition: border-color 0.2s, opacity 0.2s;
            user-select: none;
        `;

        const canvas = document.createElement("canvas");

        canvas.style.cssText = `
            width: 100%;
            height: auto;
            display: block;
            background: white;
            border-radius: 5px;
            pointer-events: none;
        `;

        const label = document.createElement("p");

        label.textContent =
            `Page ${originalIndex + 1}`;

        label.style.cssText = `
            color: #e5ddff;
            font-size: 12px;
            margin: 8px 0 0;
        `;

        const hint = document.createElement("span");

        hint.textContent = "↕ Drag to move";

        hint.style.cssText = `
            display: block;
            color: #a5a8c2;
            font-size: 10px;
            margin-top: 4px;
        `;

        card.append(canvas, label, hint);

        // Drag starts.

        card.addEventListener("dragstart", event => {

            rearrangeDragActive = true;

            rearrangePointerY = event.clientY;

            event.dataTransfer.setData(
                "text/plain",
                String(originalIndex)
            );

            event.dataTransfer.effectAllowed = "move";

            card.style.opacity = "0.4";

            startRearrangeAutoScroll();
        });

        // Track pointer while dragging.

        card.addEventListener("drag", event => {

            if (event.clientY > 0) {
                rearrangePointerY = event.clientY;
            }
        });

        // Drag ends.

        card.addEventListener("dragend", () => {

            card.style.opacity = "1";

            card.style.borderColor = "#514477";

            rearrangeDragActive = false;

            stopRearrangeAutoScroll();
        });

        // Drag over another page.

        card.addEventListener("dragover", event => {

            event.preventDefault();

            rearrangePointerY = event.clientY;

            startRearrangeAutoScroll();

            event.dataTransfer.dropEffect = "move";

            card.style.borderColor = "#a78bfa";
        });

        card.addEventListener("dragleave", () => {

            card.style.borderColor = "#514477";
        });

        // Drop and rearrange.

        card.addEventListener("drop", async event => {

            event.preventDefault();

            rearrangeDragActive = false;

            stopRearrangeAutoScroll();

            const draggedIndex = Number(
                event.dataTransfer.getData("text/plain")
            );

            const from = rearrangePageOrder.indexOf(
                draggedIndex
            );

            const to = rearrangePageOrder.indexOf(
                originalIndex
            );

            if (
                from === -1 ||
                to === -1 ||
                from === to
            ) {
                return;
            }

            const [movedPage] =
                rearrangePageOrder.splice(from, 1);

            rearrangePageOrder.splice(
                to,
                0,
                movedPage
            );

            setMessage(
                "Page order updated. Save when you're ready."
            );

            await renderRearrangePageGrid();
        });

        grid.appendChild(card);

        cards.push({
            canvas,
            originalIndex
        });
    }

    // Render high-resolution thumbnails.

    const thumbnailScale = 0.9;

    const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2
    );

    for (const item of cards) {

        const page = await pdfDocument.getPage(
            item.originalIndex + 1
        );

        const viewport = page.getViewport({
            scale: thumbnailScale
        });

        item.canvas.width = Math.floor(
            viewport.width * pixelRatio
        );

        item.canvas.height = Math.floor(
            viewport.height * pixelRatio
        );

        item.canvas.style.width = "100%";
        item.canvas.style.height = "auto";

        const context = item.canvas.getContext("2d");

        await page.render({

            canvasContext: context,

            viewport,

            transform: pixelRatio !== 1
                ? [
                    pixelRatio,
                    0,
                    0,
                    pixelRatio,
                    0,
                    0
                ]
                : null

        }).promise;
    }
}

/* =========================
   REARRANGE PDF PAGES
========================= */

async function rearrangePDF() {

    const { PDFDocument, pdf } =
        await requireCurrentPDF();

    if (!rearrangePageOrder.length) {
        throw new Error(
            "Upload a PDF before rearranging pages."
        );
    }

    if (
        rearrangePageOrder.length !== pdf.getPageCount()
    ) {
        throw new Error(
            "The page order is incomplete."
        );
    }

    setMessage("Rearranging your PDF...");

    const output = await PDFDocument.create();

    const pages = await output.copyPages(
        pdf,
        rearrangePageOrder
    );

    pages.forEach(page => {
        output.addPage(page);
    });

    const bytes = await output.save();

    downloadPDF(
        bytes,
        `${safeBaseName(currentFileName)}-rearranged.pdf`
    );

    setMessage(
        "Success! Your rearranged PDF has been downloaded."
    );
}

/* =========================
   RENDER PDF PAGE
========================= */

async function renderCurrentPage() {

    if (!pdfDocument || !extractedText) {
        return;
    }

    const page = await pdfDocument.getPage(currentPage);

    const viewport = page.getViewport({
        scale: 1.35
    });

    let canvas = document.getElementById(
        "pdf-genius-canvas"
    );

    if (!canvas) {

        extractedText.innerHTML = "";

        canvas = document.createElement("canvas");

        canvas.id = "pdf-genius-canvas";

        extractedText.appendChild(canvas);
    }

    const context = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({
        canvasContext: context,
        viewport
    }).promise;

    if (pageInfo) {

        pageInfo.textContent =
            `Page ${currentPage} of ${pdfDocument.numPages}`;
    }

    if (prevPageBtn) {
        prevPageBtn.disabled = currentPage <= 1;
    }

    if (nextPageBtn) {

        nextPageBtn.disabled =
            currentPage >= pdfDocument.numPages;
    }
}

/* =========================
   HANDLE PDF UPLOAD
========================= */

async function handleFile(file) {

    if (!file) return;

    const isPDF =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

    if (!isPDF) {

        setMessage(
            "Please select a PDF file.",
            true
        );

        return;
    }

    try {

        setMessage("Loading your PDF...");

        if (fileNameLabel) {
            fileNameLabel.textContent = file.name;
        }

        currentFileName = file.name;

        currentPdfBytes = new Uint8Array(
            await file.arrayBuffer()
        );

        if (!window.pdfjsLib) {

            throw new Error(
                "PDF.js did not load. Refresh the page and try again."
            );
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            PDFJS_WORKER;

        pdfDocument = await window.pdfjsLib.getDocument({
            data: currentPdfBytes.slice()
        }).promise;

        currentPage = 1;

        // Reset page order for the new PDF.

        rearrangePageOrder = Array.from(
            { length: pdfDocument.numPages },
            (_, index) => index
        );

        await renderCurrentPage();

        // Generate page thumbnails.

        await renderRearrangePageGrid();

        setMessage(
            `Loaded ${file.name} — ${pdfDocument.numPages} page(s).`
        );

    } catch (error) {

        console.error(error);

        setMessage(
            error.message || "Could not open this PDF.",
            true
        );

        if (fileNameLabel) {

            fileNameLabel.textContent =
                "Unable to open PDF";
        }
    }
}

/* =========================
   CONNECT PDF UPLOAD
========================= */

function connectUpload() {

    if (pdfUpload) {

        pdfUpload.addEventListener("change", event => {

            const file = event.target.files?.[0];

            handleFile(file);

            event.target.value = "";
        });
    }

    if (dropZone) {

        dropZone.addEventListener("dragover", event => {

            event.preventDefault();

            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {

            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", event => {

            event.preventDefault();

            dropZone.classList.remove("drag-over");

            const file = [
                ...(event.dataTransfer?.files || [])
            ].find(item =>
                item.type === "application/pdf" ||
                item.name.toLowerCase().endsWith(".pdf")
            );

            if (file) {

                handleFile(file);

            } else {

                setMessage(
                    "Drop a PDF file to upload.",
                    true
                );
            }
        });
    }
}

/* =========================
   PAGE NAVIGATION
========================= */

function connectPageNavigation() {

    prevPageBtn?.addEventListener(
        "click",
        async () => {

            if (!pdfDocument || currentPage <= 1) {
                return;
            }

            currentPage--;

            try {

                await renderCurrentPage();

            } catch (error) {

                console.error(error);

                setMessage(
                    "Could not render this page.",
                    true
                );
            }
        }
    );

    nextPageBtn?.addEventListener(
        "click",
        async () => {

            if (
                !pdfDocument ||
                currentPage >= pdfDocument.numPages
            ) {
                return;
            }

            currentPage++;

            try {

                await renderCurrentPage();

            } catch (error) {

                console.error(error);

                setMessage(
                    "Could not render this page.",
                    true
                );
            }
        }
    );
}

/* =========================
   INITIALIZE PDF GENIUS
========================= */

function initializePDFGenius() {

    createToolkit();

    connectUpload();

    connectPageNavigation();

    renderMergeFileList();

    if (pageInfo) {
        pageInfo.textContent = "Page 0 of 0";
    }

    if (prevPageBtn) {
        prevPageBtn.disabled = true;
    }

    if (nextPageBtn) {
        nextPageBtn.disabled = true;
    }

    console.log("PDF Genius initialized successfully.");
}

/* =========================
   START APPLICATION
========================= */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializePDFGenius
    );

} else {

    initializePDFGenius();

}

/* =========================================================
   PDF GENIUS — PDF EDITOR
   Add this block at the VERY BOTTOM of script.js
   ========================================================= */

const editorState = {
    page: 1,
    scale: 1.35,
    tool: "select",
    items: [],
    selected: null,
    drawing: null,
    dragging: false,
    resizing: false,
    startX: 0,
    startY: 0,
    history: [],
    historyIndex: -1,
    pdf: null,
    imageData: null
};

const editorElements = {
    tool: document.getElementById("editor-tool"),
    text: document.getElementById("editor-text"),
    fontSize: document.getElementById("editor-font-size"),
    color: document.getElementById("editor-color"),
    bold: document.getElementById("editor-bold"),
    italic: document.getElementById("editor-italic"),
    imageButton: document.getElementById("editor-add-image"),
    imageInput: document.getElementById("editor-image-input"),
    undo: document.getElementById("editor-undo"),
    redo: document.getElementById("editor-redo"),
    delete: document.getElementById("editor-delete"),
    download: document.getElementById("editor-download"),
    previous: document.getElementById("editor-prev"),
    next: document.getElementById("editor-next"),
    pageLabel: document.getElementById("editor-page-label"),
    zoom: document.getElementById("editor-zoom"),
    zoomLabel: document.getElementById("editor-zoom-label"),
    empty: document.getElementById("editor-empty"),
    stage: document.getElementById("editor-stage"),
    pdfCanvas: document.getElementById("editor-pdf-canvas"),
    overlay: document.getElementById("editor-overlay"),
    status: document.getElementById("editor-status")
};

function editorMessage(message, error = false) {
    if (!editorElements.status) return;

    editorElements.status.textContent = message;
    editorElements.status.style.color = error
        ? "#ff8585"
        : "#c4b5fd";
}

function editorGetPoint(event) {
    const rect = editorElements.overlay.getBoundingClientRect();

    const scaleX =
        editorElements.overlay.width / rect.width;

    const scaleY =
        editorElements.overlay.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

function editorSnapshot() {
    return JSON.stringify(editorState.items);
}

function editorSaveHistory() {
    editorState.history =
        editorState.history.slice(
            0,
            editorState.historyIndex + 1
        );

    editorState.history.push(editorSnapshot());

    if (editorState.history.length > 50) {
        editorState.history.shift();
    }

    editorState.historyIndex =
        editorState.history.length - 1;

    editorUpdateHistoryButtons();
}

function editorUpdateHistoryButtons() {
    if (editorElements.undo) {
        editorElements.undo.disabled =
            editorState.historyIndex <= 0;
    }

    if (editorElements.redo) {
        editorElements.redo.disabled =
            editorState.historyIndex >=
            editorState.history.length - 1;
    }
}

function editorUndo() {
    if (editorState.historyIndex <= 0) return;

    editorState.historyIndex--;

    editorState.items = JSON.parse(
        editorState.history[editorState.historyIndex]
    );

    editorState.selected = null;

    editorRenderOverlay();
    editorUpdateHistoryButtons();

    editorMessage("Undo successful.");
}

function editorRedo() {
    if (
        editorState.historyIndex >=
        editorState.history.length - 1
    ) return;

    editorState.historyIndex++;

    editorState.items = JSON.parse(
        editorState.history[editorState.historyIndex]
    );

    editorState.selected = null;

    editorRenderOverlay();
    editorUpdateHistoryButtons();

    editorMessage("Redo successful.");
}

async function editorLoadDocument() {
    if (!currentPdfBytes || !window.pdfjsLib) return;

    try {
        editorState.pdf = await window.pdfjsLib.getDocument({
            data: currentPdfBytes.slice()
        }).promise;

        editorState.page = 1;
        editorState.items = [];
        editorState.selected = null;
        editorState.history = [];
        editorState.historyIndex = -1;

        editorSaveHistory();

        if (editorElements.empty) {
            editorElements.empty.hidden = true;
        }

        if (editorElements.stage) {
            editorElements.stage.hidden = false;
        }

        await editorRenderPage();

        editorMessage("PDF loaded in the editor.");
    } catch (error) {
        console.error(error);
        editorMessage("Could not load this PDF in the editor.", true);
    }
}

async function editorRenderPage() {
    if (!editorState.pdf) return;

    const page = await editorState.pdf.getPage(
        editorState.page
    );

    const viewport = page.getViewport({
        scale: editorState.scale
    });

    const canvas = editorElements.pdfCanvas;
    const overlay = editorElements.overlay;

    if (!canvas || !overlay) return;

    const ratio = Math.min(
        window.devicePixelRatio || 1,
        2
    );

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);

    overlay.width = canvas.width;
    overlay.height = canvas.height;

    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    const context = canvas.getContext("2d");

    await page.render({
        canvasContext: context,
        viewport,
        transform: ratio !== 1
            ? [ratio, 0, 0, ratio, 0, 0]
            : null
    }).promise;

    editorState.selected = null;

    editorRenderOverlay();
    editorUpdatePageControls();
}

function editorUpdatePageControls() {
    if (editorElements.pageLabel) {
        editorElements.pageLabel.textContent =
            `Page ${editorState.page} of ${editorState.pdf.numPages}`;
    }

    if (editorElements.previous) {
        editorElements.previous.disabled =
            editorState.page <= 1;
    }

    if (editorElements.next) {
        editorElements.next.disabled =
            editorState.page >= editorState.pdf.numPages;
    }

    if (editorElements.zoomLabel) {
        editorElements.zoomLabel.textContent =
            `${Math.round(editorState.scale * 100)}%`;
    }
}

function editorRenderOverlay() {
    const canvas = editorElements.overlay;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    editorState.items
        .filter(item => item.page === editorState.page)
        .forEach(item => {
            editorDrawItem(ctx, item);

            if (item === editorState.selected) {
                editorDrawSelection(ctx, item);
            }
        });

    if (editorState.drawing) {
        editorDrawItem(ctx, editorState.drawing);
    }
}

function editorDrawItem(ctx, item) {
    ctx.save();

    ctx.strokeStyle = item.color || "#111111";
    ctx.fillStyle = item.color || "#111111";
    ctx.lineWidth = item.lineWidth || 2;

    if (item.type === "text") {
        const size = item.fontSize || 22;

        ctx.font =
            `${item.italic ? "italic " : ""}` +
            `${item.bold ? "bold " : ""}${size}px Arial`;

        ctx.textBaseline = "top";

        const lines = String(item.text || "").split("\n");

        lines.forEach((line, index) => {
            ctx.fillText(
                line,
                item.x,
                item.y + index * size * 1.25
            );
        });
    }

    if (item.type === "cover") {
        ctx.fillStyle = "#ffffff";

        ctx.fillRect(
            item.x,
            item.y,
            item.w,
            item.h
        );
    }

    if (item.type === "rectangle") {
        ctx.strokeRect(
            item.x,
            item.y,
            item.w,
            item.h
        );
    }

    if (item.type === "ellipse") {
        ctx.beginPath();

        ctx.ellipse(
            item.x + item.w / 2,
            item.y + item.h / 2,
            Math.abs(item.w / 2),
            Math.abs(item.h / 2),
            0,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    if (item.type === "line") {
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.lineTo(item.x + item.w, item.y + item.h);
        ctx.stroke();
    }

    if (item.type === "image" && item.data) {
        const image = new Image();

        image.src = item.data;

        if (image.complete) {
            ctx.drawImage(
                image,
                item.x,
                item.y,
                item.w,
                item.h
            );
        } else {
            image.onload = () => editorRenderOverlay();
        }
    }

    ctx.restore();
}

function editorDrawSelection(ctx, item) {
    ctx.save();

    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    ctx.strokeRect(
        item.x - 4,
        item.y - 4,
        item.w + 8,
        item.h + 8
    );

    ctx.setLineDash([]);

    ctx.fillStyle = "#a78bfa";

    ctx.fillRect(
        item.x + item.w - 5,
        item.y + item.h - 5,
        10,
        10
    );

    ctx.restore();
}

function editorFindItem(point) {
    const items = editorState.items.filter(
        item => item.page === editorState.page
    );

    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];

        const left = Math.min(item.x, item.x + item.w);
        const right = Math.max(item.x, item.x + item.w);
        const top = Math.min(item.y, item.y + item.h);
        const bottom = Math.max(item.y, item.y + item.h);

        if (
            point.x >= left - 6 &&
            point.x <= right + 6 &&
            point.y >= top - 6 &&
            point.y <= bottom + 6
        ) {
            return item;
        }
    }

    return null;
}

function editorPointerDown(event) {
    if (!editorState.pdf || !editorElements.overlay) return;

    const point = editorGetPoint(event);

    editorState.startX = point.x;
    editorState.startY = point.y;

    if (editorState.tool === "select") {
        const item = editorFindItem(point);

        editorState.selected = item;

        if (item) {
            editorState.dragging = true;
            editorState.dragOffsetX = point.x - item.x;
            editorState.dragOffsetY = point.y - item.y;
        }

        editorRenderOverlay();
        return;
    }

    if (editorState.tool === "text") {
        const text = editorElements.text?.value.trim();

        if (!text) {
            editorMessage("Enter some text before adding it.", true);
            return;
        }

        const size = Math.max(
            6,
            Math.min(
                150,
                Number(editorElements.fontSize?.value) || 22
            )
        );

        const item = {
            type: "text",
            page: editorState.page,
            x: point.x,
            y: point.y,
            w: Math.max(60, text.length * size * 0.55),
            h: size * 1.4,
            text,
            fontSize: size,
            color: editorElements.color?.value || "#111111",
            bold: !!editorElements.bold?.checked,
            italic: !!editorElements.italic?.checked
        };

        editorState.items.push(item);
        editorState.selected = item;
        editorSaveHistory();
        editorRenderOverlay();

        editorMessage("Text added.");
        return;
    }

    if (
        ["cover", "rectangle", "ellipse", "line"].includes(
            editorState.tool
        )
    ) {
        editorState.drawing = {
            type: editorState.tool,
            page: editorState.page,
            x: point.x,
            y: point.y,
            w: 0,
            h: 0,
            color: editorElements.color?.value || "#111111",
            lineWidth: 2
        };
    }
}

function editorPointerMove(event) {
    const point = editorGetPoint(event);

    if (editorState.dragging && editorState.selected) {
        editorState.selected.x =
            point.x - editorState.dragOffsetX;

        editorState.selected.y =
            point.y - editorState.dragOffsetY;

        editorRenderOverlay();
        return;
    }

    if (editorState.drawing) {
        editorState.drawing.w =
            point.x - editorState.startX;

        editorState.drawing.h =
            point.y - editorState.startY;

        editorRenderOverlay();
    }
}

function editorPointerUp() {
    if (editorState.dragging) {
        editorState.dragging = false;
        editorSaveHistory();
        editorMessage("Object moved.");
    }

    if (editorState.drawing) {
        const item = editorState.drawing;

        if (
            Math.abs(item.w) > 3 &&
            Math.abs(item.h) > 3
        ) {
            // Normalize rectangles and ellipses.
            if (
                item.type === "rectangle" ||
                item.type === "ellipse" ||
                item.type === "cover"
            ) {
                if (item.w < 0) {
                    item.x += item.w;
                    item.w = Math.abs(item.w);
                }

                if (item.h < 0) {
                    item.y += item.h;
                    item.h = Math.abs(item.h);
                }
            }

            editorState.items.push(item);
            editorSaveHistory();

            editorMessage(
                item.type === "cover"
                    ? "Cover added."
                    : "Shape added."
            );
        }

        editorState.drawing = null;
        editorRenderOverlay();
    }
}

function editorDeleteSelected() {
    if (!editorState.selected) {
        editorMessage("Select an object first.", true);
        return;
    }

    const index = editorState.items.indexOf(
        editorState.selected
    );

    if (index !== -1) {
        editorState.items.splice(index, 1);
    }

    editorState.selected = null;

    editorSaveHistory();
    editorRenderOverlay();

    editorMessage("Selected object deleted.");
}

function editorAddImage(file) {
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
        editorMessage("Please choose a PNG or JPEG image.", true);
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        const image = new Image();

        image.onload = () => {
            const maxWidth = editorElements.overlay.width * 0.45;
            const ratio = Math.min(
                1,
                maxWidth / image.width
            );

            const item = {
                type: "image",
                page: editorState.page,
                x: 40,
                y: 40,
                w: image.width * ratio,
                h: image.height * ratio,
                data: reader.result
            };

            editorState.items.push(item);
            editorState.selected = item;

            editorSaveHistory();
            editorRenderOverlay();

            editorMessage("Image added. Drag it to reposition.");
        };
        
        image.src = reader.result;
    };

    reader.readAsDataURL(file);
}

async function editorDownload() {
    if (!currentPdfBytes || !editorState.pdf) {
        editorMessage("Upload a PDF first.", true);
        return;
    }

    try {
        editorMessage("Preparing your edited PDF...");

        const { PDFDocument, StandardFonts, rgb } =
            await loadPDFLib();

        const output = await PDFDocument.load(
            currentPdfBytes.slice()
        );

        const font = await output.embedFont(
            StandardFonts.Helvetica
        );

        const boldFont = await output.embedFont(
            StandardFonts.HelveticaBold
        );

        const italicFont = await output.embedFont(
            StandardFonts.HelveticaOblique
        );

        const boldItalicFont = await output.embedFont(
            StandardFonts.HelveticaBoldOblique
        );

        const pages = output.getPages();

        for (const item of editorState.items) {
            const page = pages[item.page - 1];

            if (!page) continue;

            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();

            const canvasWidth = editorElements.overlay.width;
            const canvasHeight = editorElements.overlay.height;

            const scaleX = pageWidth / canvasWidth;
            const scaleY = pageHeight / canvasHeight;

            const x = item.x * scaleX;
            const y = pageHeight - (item.y * scaleY);

            const width = item.w * scaleX;
            const height = item.h * scaleY;

            const colorHex = item.color || "#111111";

            const color = rgb(
                parseInt(colorHex.slice(1, 3), 16) / 255,
                parseInt(colorHex.slice(3, 5), 16) / 255,
                parseInt(colorHex.slice(5, 7), 16) / 255
            );

            if (item.type === "text") {
                const selectedFont =
                    item.bold && item.italic
                        ? boldItalicFont
                        : item.bold
                            ? boldFont
                            : item.italic
                                ? italicFont
                                : font;

                const fontSize =
                    (item.fontSize || 22) * scaleY;

                const lines = String(item.text || "").split("\n");

                lines.forEach((line, index) => {
                    page.drawText(line, {
                        x,
                        y: y - fontSize * (index + 1),
                        size: fontSize,
                        font: selectedFont,
                        color
                    });
                });
            }

            if (item.type === "cover") {
                page.drawRectangle({
                    x,
                    y: y - height,
                    width: Math.abs(width),
                    height: Math.abs(height),
                    color: rgb(1, 1, 1)
                });
            }

            if (item.type === "rectangle") {
                page.drawRectangle({
                    x,
                    y: y - height,
                    width: Math.abs(width),
                    height: Math.abs(height),
                    borderColor: color,
                    borderWidth: 1.5
                });
            }

            if (item.type === "ellipse") {
                page.drawEllipse({
                    x: x + width / 2,
                    y: y - height / 2,
                    xScale: Math.abs(width / 2),
                    yScale: Math.abs(height / 2),
                    borderColor: color,
                    borderWidth: 1.5
                });
            }

            if (item.type === "line") {
                page.drawLine({
                    start: { x, y },
                    end: {
                        x: x + width,
                        y: y - height
                    },
                    color,
                    thickness: 1.5
                });
            }

            if (item.type === "image" && item.data) {
                const base64 = item.data.split(",")[1];

                const imageBytes = Uint8Array.from(
                    atob(base64),
                    character => character.charCodeAt(0)
                );

                const embeddedImage =
                    item.data.startsWith("data:image/png")
                        ? await output.embedPng(imageBytes)
                        : await output.embedJpg(imageBytes);

                page.drawImage(embeddedImage, {
                    x,
                    y: y - height,
                    width: Math.abs(width),
                    height: Math.abs(height)
                });
            }
        }

        const bytes = await output.save();

        downloadPDF(
            bytes,
            `${safeBaseName(currentFileName)}-edited.pdf`
        );

        editorMessage("Your edited PDF has been downloaded.");
    } catch (error) {
        console.error(error);

        editorMessage(
            error.message || "Could not export the edited PDF.",
            true
        );
    }
}

async function editorChangePage(direction) {
    if (!editorState.pdf) return;

    const nextPage = editorState.page + direction;

    if (
        nextPage < 1 ||
        nextPage > editorState.pdf.numPages
    ) return;

    editorState.page = nextPage;

    await editorRenderPage();
}

async function editorChangeZoom(value) {
    const zoom = Number(value);

    if (!Number.isFinite(zoom)) return;

    editorState.scale = Math.max(
        0.5,
        Math.min(2.5, zoom / 100)
    );

    await editorRenderPage();
}

function initializePDFEditor() {
    const overlay = editorElements.overlay;

    if (!overlay) {
        console.warn("PDF Editor elements were not found.");
        return;
    }

    editorElements.tool?.addEventListener("change", event => {
        editorState.tool = event.target.value;
        editorMessage(`Selected tool: ${event.target.value}`);
    });

    overlay.addEventListener(
        "pointerdown",
        editorPointerDown
    );

    overlay.addEventListener(
        "pointermove",
        editorPointerMove
    );

    overlay.addEventListener(
        "pointerup",
        editorPointerUp
    );

    overlay.addEventListener(
        "pointercancel",
        editorPointerUp
    );

    overlay.addEventListener(
        "pointerleave",
        event => {
            if (event.buttons === 0) {
                editorPointerUp();
            }
        }
    );

    editorElements.undo?.addEventListener(
        "click",
        editorUndo
    );

    editorElements.redo?.addEventListener(
        "click",
        editorRedo
    );

    editorElements.delete?.addEventListener(
        "click",
        editorDeleteSelected
    );

    editorElements.download?.addEventListener(
        "click",
        editorDownload
    );

    editorElements.previous?.addEventListener(
        "click",
        () => editorChangePage(-1)
    );

    editorElements.next?.addEventListener(
        "click",
        () => editorChangePage(1)
    );

    editorElements.zoom?.addEventListener(
        "input",
        event => editorChangeZoom(event.target.value)
    );

    editorElements.imageButton?.addEventListener(
        "click",
        () => editorElements.imageInput?.click()
    );

    editorElements.imageInput?.addEventListener(
        "change",
        event => {
            editorAddImage(event.target.files?.[0]);
            event.target.value = "";
        }
    );

    editorUpdateHistoryButtons();

    console.log("PDF Editor initialized.");
}

/* =========================================================
   EDITOR INTEGRATION
   ========================================================= */

// Initialize the editor after the existing toolkit is created.
const originalInitializePDFGenius = initializePDFGenius;

initializePDFGenius = function () {
    originalInitializePDFGenius();
    initializePDFEditor();
};

// Load the uploaded PDF into the editor too.
const originalHandleFile = handleFile;

handleFile = async function (file) {
    await originalHandleFile(file);

    if (pdfDocument && currentPdfBytes) {
        await editorLoadDocument();
    }
};
