const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const toolNameDisp = document.getElementById('toolName');
const toolSizeDisp = document.getElementById('toolSize');
const fileInput = document.getElementById('fileInput');

// --- PLATFORM DETECTION ---
const isElectron = (typeof window !== 'undefined' && window.process && window.process.type);
let fs, path, ipcRenderer;

if (isElectron) {
    fs = require('fs');
    path = require('path');
    ipcRenderer = require('electron').ipcRenderer;
}

// --- APP STATE ---
const bufferCanvas = document.createElement('canvas');
const bctx = bufferCanvas.getContext('2d');
let isDrawing = false, currentTool = 'pencil', baseWidth = 10;
let points = [], undoStack = [], currentPencilColor = '40, 40, 40';

// --- INITIALIZATION ---
function resize() {
    canvas.width = bufferCanvas.width = window.innerWidth;
    canvas.height = bufferCanvas.height = window.innerHeight;
    clearCanvas(false);
}
window.addEventListener('resize', resize);
resize();

function clearCanvas(save = true) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bctx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    if (save) saveState();
}

function saveState() {
    if (undoStack.length >= 30) undoStack.shift();
    undoStack.push(canvas.toDataURL());
}

function undo() {
    if (undoStack.length <= 1) return;
    undoStack.pop();
    const img = new Image();
    img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = undoStack[undoStack.length - 1];
}

// --- DRAWING ENGINE ---
canvas.addEventListener('pointerdown', (e) => {
    isDrawing = true;
    points = [{ x: e.clientX, y: e.clientY, p: e.pressure || 0.5 }];
});

canvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    const p = e.pressure || 0.5;
    points.push({ x: e.clientX, y: e.clientY, p: p });
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (points.length < 3) return;
    bctx.lineCap = bctx.lineJoin = 'round';
    
    for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        const pxc = (points[i-1].x + points[i].x) / 2;
        const pyc = (points[i-1].y + points[i].y) / 2;
        
        bctx.beginPath();
        if (currentTool === 'pencil') {
            bctx.strokeStyle = `rgba(${currentPencilColor}, ${points[i].p * 0.4})`;
            bctx.lineWidth = baseWidth * points[i].p;
        } else {
            bctx.strokeStyle = 'rgb(255, 255, 255)';
            bctx.lineWidth = baseWidth * 2;
        }
        bctx.moveTo(pxc, pyc);
        bctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        bctx.stroke();
    }
    ctx.drawImage(bufferCanvas, 0, 0);
});

canvas.addEventListener('pointerup', () => {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.drawImage(bufferCanvas, 0, 0);
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
});

// --- FILE OPS (UNIVERSAL) ---
async function handleSave() {
    if (isElectron) {
        const saveDir = path.join(require('os').homedir(), 'Downloads');
        let counter = 1;
        while (fs.existsSync(path.join(saveDir, `concept sketch ${counter}.png`))) counter++;
        const filePath = path.join(saveDir, `concept sketch ${counter}.png`);
        const base64Data = canvas.toDataURL().replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');
        toolNameDisp.innerText = `Saved #${counter}`;
    } else {
        const link = document.createElement('a');
        link.download = `sketch-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }
}

async function handleOpen() {
    if (isElectron) {
        const filePath = await ipcRenderer.invoke('open-file-dialog');
        if (filePath) loadToCanvas(`file://${filePath}`);
    } else {
        fileInput.click();
    }
}

fileInput.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => loadToCanvas(ev.target.result);
    reader.readAsDataURL(e.target.files[0]);
};

function loadToCanvas(url) {
    const img = new Image();
    img.onload = () => {
        clearCanvas(false);
        const ratio = Math.min(canvas.width * 0.7 / img.width, canvas.height * 0.7 / img.height);
        const w = img.width * ratio, h = img.height * ratio;
        ctx.drawImage(img, (canvas.width-w)/2, (canvas.height-h)/2, w, h);
        saveState();
    };
    img.src = url;
}

// --- SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && key === 's') { e.preventDefault(); handleSave(); }
    if (cmd && key === 'o') { e.preventDefault(); handleOpen(); }
    if (cmd && key === 'z') { e.preventDefault(); undo(); }
    if (key === 'b') { currentTool = 'pencil'; toolNameDisp.innerText = "Pencil"; }
    if (key === 'e') { currentTool = 'eraser'; toolNameDisp.innerText = "Eraser"; }
    if (key === 'c') { if(confirm("Clear?")) clearCanvas(); }
    if (key === '1') { currentPencilColor = '40, 40, 40'; currentTool = 'pencil'; toolNameDisp.innerText = "Dark"; }
    if (key === '2') { currentPencilColor = '120,120,120'; currentTool = 'pencil'; toolNameDisp.innerText = "Medium"; }
    if (key === '3') { currentPencilColor = '200,200,200'; currentTool = 'pencil'; toolNameDisp.innerText = "Light"; }
    if (key === '[') { baseWidth = Math.max(1, baseWidth - 2); toolSizeDisp.innerText = baseWidth; }
    if (key === ']') { baseWidth = Math.min(100, baseWidth + 2); toolSizeDisp.innerText = baseWidth; }
});
