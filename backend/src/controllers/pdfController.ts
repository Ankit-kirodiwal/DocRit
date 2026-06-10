import { Request, Response } from 'express';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
import { decryptPDF } from '@pdfsmaller/pdf-decrypt';
import { Document as DocxDocument, Packer, Paragraph, TextRun, PageBreak } from 'docx';
import pdfParse = require('pdf-parse');
import pptxgen from 'pptxgenjs';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

// Helper to convert Office files to PDF using native Office (first) or LibreOffice Headless (as fallback)
async function convertOfficeToPdf(inputBuffer: Buffer, extension: string): Promise<Buffer> {
  // Try native MS Office via COM first (Windows only)
  try {
    console.log(`Converting ${extension} to PDF using Native Office COM worker...`);
    const pdfBytes = await runPythonWorker('office-to-pdf', inputBuffer, extension, 'pdf');
    console.log(`Native ${extension} to PDF conversion successful.`);
    return pdfBytes;
  } catch (err) {
    console.error(`Native ${extension} to PDF conversion failed:`, err, `. Falling back to LibreOffice...`);
  }

  const tempId = Math.random().toString(36).substring(7);
  const tempInputDir = path.join(os.tmpdir(), `docrit_office_in_${tempId}`);
  const tempOutputDir = path.join(os.tmpdir(), `docrit_office_out_${tempId}`);
  
  await fs.promises.mkdir(tempInputDir, { recursive: true });
  await fs.promises.mkdir(tempOutputDir, { recursive: true });
  
  let processedBuffer = inputBuffer;
  let workingExtension = extension;

  if (extension === 'xls' || extension === 'xlsx') {
    try {
      console.log('Preprocessing Excel file with Python worker to fit column width and wrap text...');
      processedBuffer = await runPythonWorker('preprocess-excel', inputBuffer, extension, 'xlsx');
      workingExtension = 'xlsx';
      console.log('Excel file preprocessed successfully.');
    } catch (err) {
      console.error('Failed to preprocess Excel file, falling back to original layout:', err);
    }
  }

  const tempInputPath = path.join(tempInputDir, `document.${workingExtension}`);
  await fs.promises.writeFile(tempInputPath, processedBuffer);
  try {
    let sofficeCmd = 'soffice';
    
    // Check if soffice is in path
    try {
      await execPromise('soffice --version');
    } catch (err) {
      // Fallback to default Windows path
      if (fs.existsSync('C:\\Program Files\\LibreOffice\\program\\soffice.exe')) {
        sofficeCmd = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
      } else {
        throw new Error('LibreOffice (soffice) not found in PATH or at C:\\Program Files\\LibreOffice\\program\\soffice.exe');
      }
    }
    
    let filter = 'writer_pdf_Export';
    if (workingExtension === 'xlsx' || workingExtension === 'xls') {
      filter = 'calc_pdf_Export';
    } else if (workingExtension === 'pptx' || workingExtension === 'ppt') {
      filter = 'impress_pdf_Export';
    }

    const args = [
      '--headless',
      '--convert-to',
      `pdf:${filter}:{"UseLosslessCompression":{"type":"boolean","value":"true"}}`,
      '--outdir',
      tempOutputDir,
      tempInputPath
    ];
    
    console.log(`Executing: ${sofficeCmd} ${args.join(' ')}`);
    await execFilePromise(sofficeCmd, args);
    
    const tempOutputPath = path.join(tempOutputDir, 'document.pdf');
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('LibreOffice conversion failed: PDF file was not generated.');
    }
    
    const pdfBuffer = await fs.promises.readFile(tempOutputPath);
    return pdfBuffer;
  } finally {
    await fs.promises.rm(tempInputDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(tempOutputDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Helper to run Python worker script
async function runPythonWorker(task: string, inputBuffer: Buffer, inputExtension: string, outputExtension: string, extraArg?: string): Promise<Buffer> {
  const tempId = Math.random().toString(36).substring(7);
  const tempDir = path.join(os.tmpdir(), `docrit_py_worker_${tempId}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  const tempInputPath = path.join(tempDir, `input.${inputExtension}`);
  const tempOutputPath = path.join(tempDir, `output.${outputExtension}`);
  
  await fs.promises.writeFile(tempInputPath, inputBuffer);
  
  try {
    let pythonCmd = 'python';
    try {
      await execPromise('python --version');
    } catch (err) {
      try {
        await execPromise('py --version');
        pythonCmd = 'py';
      } catch (e) {
        throw new Error('Python is not installed or not in PATH.');
      }
    }
    
    // Path to the python script
    const workerScriptPath = path.join(__dirname, '../workers/conversion_worker.py');
    let cmd = `${pythonCmd} "${workerScriptPath}" --task ${task} --input "${tempInputPath}" --output "${tempOutputPath}"`;
    if (extraArg) {
      if (task === 'ocr') {
        cmd += ` --ocr-type ${extraArg}`;
      } else if (task === 'pdf-to-pptx') {
        cmd += ` --pptx-mode ${extraArg}`;
      }
    }
    
    console.log(`Executing: ${cmd}`);
    await execPromise(cmd);
    
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error(`Python worker failed: Output file was not generated.`);
    }
    
    const outputBuffer = await fs.promises.readFile(tempOutputPath);
    return outputBuffer;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Helper to compress PDF using Ghostscript
async function runGhostscriptCompress(inputBuffer: Buffer): Promise<Buffer> {
  const tempId = Math.random().toString(36).substring(7);
  const tempDir = path.join(os.tmpdir(), `docrit_gs_compress_${tempId}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  const tempInputPath = path.join(tempDir, 'input.pdf');
  const tempOutputPath = path.join(tempDir, 'output.pdf');
  
  await fs.promises.writeFile(tempInputPath, inputBuffer);
  
  try {
    let gsCmd = 'gs';
    let hasGs = false;
    try {
      await execPromise('gs --version');
      hasGs = true;
    } catch (err) {
      try {
        await execPromise('gswin64c --version');
        gsCmd = 'gswin64c';
        hasGs = true;
      } catch (e) {
        try {
          await execPromise('gswin32c --version');
          gsCmd = 'gswin32c';
          hasGs = true;
        } catch (e2) {
          // gs not found
        }
      }
    }
    
    if (hasGs) {
      const cmd = `${gsCmd} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempOutputPath}" "${tempInputPath}"`;
      console.log(`Executing: ${cmd}`);
      await execPromise(cmd);
      
      if (fs.existsSync(tempOutputPath)) {
        const outputBuffer = await fs.promises.readFile(tempOutputPath);
        return outputBuffer;
      }
    }
    
    console.warn('Ghostscript not found in PATH. Falling back to pdf-lib structural optimization.');
    const pdfDoc = await PDFDocument.load(inputBuffer);
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true
    });
    return Buffer.from(compressedBytes);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}


// Helper to resolve and load font files
function getFontBytes(fontName: string): Uint8Array {
  const pathsToTry = [
    path.join(__dirname, '../assets/fonts', fontName),
    path.join(__dirname, '../../src/assets/fonts', fontName),
    path.join(process.cwd(), 'src/assets/fonts', fontName),
    path.join(process.cwd(), 'backend/src/assets/fonts', fontName)
  ];
  
  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      return new Uint8Array(fs.readFileSync(p));
    }
  }
  
  throw new Error(`Font file ${fontName} not found in any expected location.`);
}

let robotoRegularBytes: Uint8Array;
let robotoBoldBytes: Uint8Array;

try {
  robotoRegularBytes = getFontBytes('Roboto-Regular.ttf');
  robotoBoldBytes = getFontBytes('Roboto-Bold.ttf');
} catch (error) {
  console.error('Critical error loading fonts:', error);
}

// Helper to extract text page-by-page from a PDF buffer
async function extractTextPerPage(pdfBuffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  
  await (pdfParse as any)(pdfBuffer, {
    pagerender: function(pageData: any) {
      return pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false
      }).then(function(textContent: any) {
        let lastY = -1;
        let text = '';
        for (const item of textContent.items) {
          if (lastY !== item.transform[5]) {
            if (text) text += '\n';
          }
          text += item.str;
          lastY = item.transform[5];
        }
        pages.push(text);
        return text;
      });
    }
  });
  
  return pages;
}

// Helper to parse page range selections (e.g. "1-3, 5")
function parseRanges(rangeStr: string, maxPages: number): number[] {
  const pages = new Set<number>();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const range = trimmed.split('-');
    if (range.length === 1) {
      const val = parseInt(range[0], 10);
      if (!isNaN(val) && val >= 1 && val <= maxPages) {
        pages.add(val - 1);
      }
    } else if (range.length === 2) {
      const start = parseInt(range[0], 10);
      const end = parseInt(range[1], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= maxPages) {
        for (let i = start; i <= end; i++) {
          pages.add(i - 1);
        }
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}



// 1. Merge PDFs
export const mergePDFs = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Please upload at least two PDF files to merge.' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const srcPdf = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    return res.send(Buffer.from(mergedPdfBytes));
  } catch (error: any) {
    console.error('Error merging PDFs:', error);
    return res.status(500).json({ error: error.message || 'Failed to merge PDF files.' });
  }
};

// 2. Split PDF (Extract Pages)
export const splitPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { splitMode, ranges, mergeAll, fixedPages, selectedPages, pages } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const srcPdf = await PDFDocument.load(file.buffer);
    const totalPages = srcPdf.getPageCount();

    // Fallback: If no splitMode is specified, use the legacy split behaviour (if pages string is provided)
    if (!splitMode && pages) {
      const pageIndices = parseRanges(pages, totalPages);
      if (pageIndices.length === 0) {
        return res.status(400).json({ error: 'Invalid page range specified.' });
      }

      const splitPdf = await PDFDocument.create();
      const copiedPages = await splitPdf.copyPages(srcPdf, pageIndices);
      copiedPages.forEach((page) => splitPdf.addPage(page));

      const splitPdfBytes = await splitPdf.save();
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="extracted.pdf"`);
      return res.send(Buffer.from(splitPdfBytes));
    }

    if (!splitMode) {
      return res.status(400).json({ error: 'Please specify splitMode (e.g. "custom", "fixed", "extract_all", "extract_select").' });
    }

    // 1. Custom Range mode
    if (splitMode === 'custom') {
      const parsedRanges = JSON.parse(ranges || '[]') as { start: number; end: number }[];
      if (parsedRanges.length === 0) {
        return res.status(400).json({ error: 'Please specify at least one custom range.' });
      }

      const merge = mergeAll === 'true' || mergeAll === true;

      if (merge) {
        const mergedPdf = await PDFDocument.create();
        for (const r of parsedRanges) {
          const start = Math.max(1, Math.min(totalPages, r.start));
          const end = Math.max(1, Math.min(totalPages, r.end));
          const indices: number[] = [];
          for (let i = start; i <= end; i++) {
            indices.push(i - 1);
          }
          if (indices.length > 0) {
            const copied = await mergedPdf.copyPages(srcPdf, indices);
            copied.forEach(p => mergedPdf.addPage(p));
          }
        }
        const mergedBytes = await mergedPdf.save();
        res.contentType('application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="split_merged.pdf"');
        return res.send(Buffer.from(mergedBytes));
      } else {
        const zip = new AdmZip();
        for (let i = 0; i < parsedRanges.length; i++) {
          const r = parsedRanges[i];
          const start = Math.max(1, Math.min(totalPages, r.start));
          const end = Math.max(1, Math.min(totalPages, r.end));
          const indices: number[] = [];
          for (let j = start; j <= end; j++) {
            indices.push(j - 1);
          }
          if (indices.length > 0) {
            const splitPdf = await PDFDocument.create();
            const copied = await splitPdf.copyPages(srcPdf, indices);
            copied.forEach(p => splitPdf.addPage(p));
            const bytes = await splitPdf.save();
            zip.addFile(`range_${start}-${end}.pdf`, Buffer.from(bytes));
          }
        }
        const zipBuffer = zip.toBuffer();
        res.contentType('application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="split_ranges.zip"');
        return res.send(zipBuffer);
      }
    }

    // 2. Fixed Split mode
    if (splitMode === 'fixed') {
      const chunkSize = parseInt(fixedPages || '1', 10);
      if (isNaN(chunkSize) || chunkSize < 1) {
        return res.status(400).json({ error: 'Invalid range size specified.' });
      }

      const zip = new AdmZip();
      for (let start = 1; start <= totalPages; start += chunkSize) {
        const end = Math.min(totalPages, start + chunkSize - 1);
        const indices: number[] = [];
        for (let j = start; j <= end; j++) {
          indices.push(j - 1);
        }
        const splitPdf = await PDFDocument.create();
        const copied = await splitPdf.copyPages(srcPdf, indices);
        copied.forEach(p => splitPdf.addPage(p));
        const bytes = await splitPdf.save();
        zip.addFile(`range_${start}-${end}.pdf`, Buffer.from(bytes));
      }
      const zipBuffer = zip.toBuffer();
      res.contentType('application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="split_fixed.zip"');
      return res.send(zipBuffer);
    }

    // 3. Extract All Pages
    if (splitMode === 'extract_all') {
      const zip = new AdmZip();
      for (let i = 1; i <= totalPages; i++) {
        const splitPdf = await PDFDocument.create();
        const copied = await splitPdf.copyPages(srcPdf, [i - 1]);
        copied.forEach(p => splitPdf.addPage(p));
        const bytes = await splitPdf.save();
        zip.addFile(`page_${i}.pdf`, Buffer.from(bytes));
      }
      const zipBuffer = zip.toBuffer();
      res.contentType('application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="extracted_all_pages.zip"');
      return res.send(zipBuffer);
    }

    // 4. Extract Selected Pages
    if (splitMode === 'extract_select') {
      if (!selectedPages) {
        return res.status(400).json({ error: 'No selected pages specified.' });
      }
      const pageIndices = parseRanges(selectedPages, totalPages);
      if (pageIndices.length === 0) {
        return res.status(400).json({ error: 'No valid pages selected for extraction.' });
      }

      const zip = new AdmZip();
      for (const idx of pageIndices) {
        const splitPdf = await PDFDocument.create();
        const copied = await splitPdf.copyPages(srcPdf, [idx]);
        copied.forEach(p => splitPdf.addPage(p));
        const bytes = await splitPdf.save();
        zip.addFile(`page_${idx + 1}.pdf`, Buffer.from(bytes));
      }
      const zipBuffer = zip.toBuffer();
      res.contentType('application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="extracted_selected_pages.zip"');
      return res.send(zipBuffer);
    }

    return res.status(400).json({ error: 'Invalid splitMode specified.' });
  } catch (error: any) {
    console.error('Error splitting PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to split PDF.' });
  }
};


// 3. Compress PDF
export const compressPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const compressedBytes = await runGhostscriptCompress(file.buffer);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
    return res.send(compressedBytes);
  } catch (error: any) {
    console.error('Error compressing PDF with Ghostscript:', error);
    return res.status(500).json({ error: error.message || 'Failed to compress PDF.' });
  }
};

// 4. Rotate PDF
export const rotatePDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { angle, pages } = req.body; // angle in degrees (90, 180, 270), pages range (optional)

    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    const rotateAngle = parseInt(angle, 10);
    if (isNaN(rotateAngle) || ![90, 180, 270, 360, -90, -180, -270].includes(rotateAngle)) {
      return res.status(400).json({ error: 'Invalid rotation angle. Choose 90, 180, or 270 degrees.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const totalPages = pdfDoc.getPageCount();
    
    // Default to all pages if no pages parameter is supplied
    const targetPages = pages ? parseRanges(pages, totalPages) : pdfDoc.getPageIndices();

    for (const index of targetPages) {
      const page = pdfDoc.getPage(index);
      const currentRotation = page.getRotation().angle;
      const newRotation = (currentRotation + rotateAngle) % 360;
      page.setRotation(degrees(newRotation));
    }

    const rotatedBytes = await pdfDoc.save();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="rotated.pdf"');
    return res.send(Buffer.from(rotatedBytes));
  } catch (error: any) {
    console.error('Error rotating PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to rotate PDF.' });
  }
};

// 5. Watermark PDF
export const watermarkPDF = async (req: Request, res: Response) => {
  try {
    // Multer uploads fields: 'file' (the PDF), 'image' (optional image watermark file)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const pdfFile = files?.file?.[0];
    const imageFile = files?.image?.[0];

    const { type, text, opacity, size, rotation, position } = req.body;

    if (!pdfFile) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(pdfFile.buffer);
    const pages = pdfDoc.getPages();

    const watermarkOpacity = parseFloat(opacity || '0.5');
    const watermarkSize = parseFloat(size || '50');
    const watermarkRotation = parseFloat(rotation || '45');
    const watermarkPos = position || 'center'; // 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'

    let embeddedImage: any = null;
    let textFont: any = null;

    if (type === 'image' && imageFile) {
      const mime = imageFile.mimetype;
      if (mime === 'image/png') {
        embeddedImage = await pdfDoc.embedPng(imageFile.buffer);
      } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
        embeddedImage = await pdfDoc.embedJpg(imageFile.buffer);
      } else {
        return res.status(400).json({ error: 'Only PNG or JPEG images are supported for watermarks.' });
      }
    } else {
      pdfDoc.registerFontkit(fontkit);
      textFont = await pdfDoc.embedFont(robotoBoldBytes);
    }

    for (const page of pages) {
      const { width, height } = page.getSize();
      let x = width / 2;
      let y = height / 2;

      // Handle custom sizes for layout alignment
      const contentWidth = type === 'image' && embeddedImage ? embeddedImage.width * (watermarkSize / 100) : text.length * (watermarkSize * 0.6);
      const contentHeight = type === 'image' && embeddedImage ? embeddedImage.height * (watermarkSize / 100) : watermarkSize;

      // Adjust coordinate based on position
      switch (watermarkPos) {
        case 'top-left':
          x = 50;
          y = height - 50;
          break;
        case 'top-right':
          x = width - contentWidth - 50;
          y = height - 50;
          break;
        case 'bottom-left':
          x = 50;
          y = 50;
          break;
        case 'bottom-right':
          x = width - contentWidth - 50;
          y = 50;
          break;
        case 'center':
        default:
          x = width / 2 - contentWidth / 2;
          y = height / 2 - contentHeight / 2;
          break;
      }

      // Draw watermark content
      if (type === 'image' && embeddedImage) {
        const scaledWidth = embeddedImage.width * (watermarkSize / 100);
        const scaledHeight = embeddedImage.height * (watermarkSize / 100);
        page.drawImage(embeddedImage, {
          x: watermarkPos === 'center' ? width / 2 - scaledWidth / 2 : x,
          y: watermarkPos === 'center' ? height / 2 - scaledHeight / 2 : y,
          width: scaledWidth,
          height: scaledHeight,
          opacity: watermarkOpacity,
          rotate: degrees(watermarkRotation),
        });
      } else {
        page.drawText(text || 'RITES Converter', {
          x: watermarkPos === 'center' ? width / 2 - contentWidth / 2 : x,
          y: watermarkPos === 'center' ? height / 2 - contentHeight / 2 : y,
          size: watermarkSize,
          font: textFont,
          color: rgb(0.7, 0.7, 0.7),
          opacity: watermarkOpacity,
          rotate: degrees(watermarkRotation),
        });
      }
    }

    const watermarkedBytes = await pdfDoc.save();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="watermarked.pdf"');
    return res.send(Buffer.from(watermarkedBytes));
  } catch (error: any) {
    console.error('Error watermarking PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to add watermark to PDF.' });
  }
};

// 6. Add Page Numbers
export const addPageNumbers = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { position, format, fontSize, startNumber } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    const startNum = parseInt(startNumber || '1', 10);
    const size = parseInt(fontSize || '12', 10);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < totalPages; i++) {
      const page = pages[i];
      const pageNumVal = startNum + i;
      let text = `${pageNumVal}`;
      if (format === 'page-of') {
        text = `${pageNumVal} of ${totalPages}`;
      }

      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, size);
      
      let x = width - 50;
      let y = 30;

      const pos = position || 'bottom-right';

      switch (pos) {
        case 'bottom-left':
          x = 50;
          y = 30;
          break;
        case 'bottom-center':
          x = width / 2 - textWidth / 2;
          y = 30;
          break;
        case 'bottom-right':
          x = width - textWidth - 50;
          y = 30;
          break;
        case 'top-left':
          x = 50;
          y = height - 40;
          break;
        case 'top-center':
          x = width / 2 - textWidth / 2;
          y = height - 40;
          break;
        case 'top-right':
          x = width - textWidth - 50;
          y = height - 40;
          break;
      }

      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    const numberedBytes = await pdfDoc.save();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="numbered.pdf"');
    return res.send(Buffer.from(numberedBytes));
  } catch (error: any) {
    console.error('Error adding page numbers:', error);
    return res.status(500).json({ error: error.message || 'Failed to add page numbers.' });
  }
};

// 7. Protect PDF (Password Encryption)
export const protectPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { password } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Please specify a password.' });
    }

    // Encrypt the uploaded buffer
    const encryptedPdfBytes = await encryptPDF(new Uint8Array(file.buffer), password);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="protected.pdf"');
    return res.send(Buffer.from(encryptedPdfBytes));
  } catch (error: any) {
    console.error('Error encrypting PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to protect PDF.' });
  }
};

// 8. Unlock PDF (Password Decryption)
export const unlockPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { password } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Please provide the password.' });
    }

    // Decrypt the uploaded PDF bytes
    const decryptedBytes = await decryptPDF(new Uint8Array(file.buffer), password);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="unlocked.pdf"');
    return res.send(Buffer.from(decryptedBytes));
  } catch (error: any) {
    console.error('Error decrypting PDF:', error);
    return res.status(400).json({ error: 'Incorrect password or failed to decrypt PDF.' });
  }
};

// 9. JPG to PDF
export const jpgToPDF = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one image file.' });
    }

    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      const mimeType = file.mimetype;
      let imageObj;

      if (mimeType === 'image/png') {
        imageObj = await pdfDoc.embedPng(file.buffer);
      } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        imageObj = await pdfDoc.embedJpg(file.buffer);
      } else {
        // Skip unsupported images
        continue;
      }

      // Add a page matching the image dimensions
      const page = pdfDoc.addPage([imageObj.width, imageObj.height]);
      page.drawImage(imageObj, {
        x: 0,
        y: 0,
        width: imageObj.width,
        height: imageObj.height,
      });
    }

    const pdfBytes = await pdfDoc.save();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="images_to.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error converting images to PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert images to PDF.' });
  }
};

// 1. Organize PDF
export const organizePDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const pagesOrderStr = req.body.pagesOrder;
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    if (!pagesOrderStr) {
      return res.status(400).json({ error: 'Page order selection is required.' });
    }

    const pagesOrder = JSON.parse(pagesOrderStr) as number[];
    const srcDoc = await PDFDocument.load(file.buffer);
    const destDoc = await PDFDocument.create();
    
    const copiedPages = await destDoc.copyPages(srcDoc, pagesOrder);
    copiedPages.forEach(page => destDoc.addPage(page));
    
    const pdfBytes = await destDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="organized.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error organizing PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to organize PDF.' });
  }
};

// 2. Sign PDF
export const signPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { signatureData, pageIndex, x, y, width, height } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    if (!signatureData) {
      return res.status(400).json({ error: 'Signature data is required.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const pageIdx = parseInt(pageIndex || '0', 10);
    const pages = pdfDoc.getPages();
    if (pageIdx < 0 || pageIdx >= pages.length) {
      return res.status(400).json({ error: 'Invalid page index.' });
    }

    const page = pages[pageIdx];
    
    const matches = signatureData.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid signature image format.' });
    }
    
    const imageBuffer = Buffer.from(matches[2], 'base64');
    let embeddedImg;
    if (matches[1] === 'png') {
      embeddedImg = await pdfDoc.embedPng(imageBuffer);
    } else {
      embeddedImg = await pdfDoc.embedJpg(imageBuffer);
    }

    const px = parseFloat(x || '0');
    const py = parseFloat(y || '0');
    const pw = parseFloat(width || '150');
    const ph = parseFloat(height || '75');

    page.drawImage(embeddedImg, {
      x: px,
      y: py,
      width: pw,
      height: ph
    });

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="signed.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error signing PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to sign PDF.' });
  }
};

// 3. Edit PDF
export const editPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const annotationsStr = req.body.annotations;
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
    
    const pdfDoc = await PDFDocument.load(file.buffer);
    const pages = pdfDoc.getPages();
    pdfDoc.registerFontkit(fontkit);

    const hexToRgb = (hex: string) => {
      const hexVal = hex.replace('#', '');
      const r = parseInt(hexVal.substring(0, 2), 16) / 255;
      const g = parseInt(hexVal.substring(2, 4), 16) / 255;
      const b = parseInt(hexVal.substring(4, 6), 16) / 255;
      return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
    };

    const getEmbedFont = async (doc: PDFDocument, fontFamily?: string, bold?: boolean, italic?: boolean) => {
      const family = fontFamily?.toLowerCase() || 'helvetica';
      if (family.includes('times')) {
        if (bold && italic) return await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
        if (bold) return await doc.embedFont(StandardFonts.TimesRomanBold);
        if (italic) return await doc.embedFont(StandardFonts.TimesRomanItalic);
        return await doc.embedFont(StandardFonts.TimesRoman);
      } else if (family.includes('courier')) {
        if (bold && italic) return await doc.embedFont(StandardFonts.CourierBoldOblique);
        if (bold) return await doc.embedFont(StandardFonts.CourierBold);
        if (italic) return await doc.embedFont(StandardFonts.CourierOblique);
        return await doc.embedFont(StandardFonts.Courier);
      } else {
        if (bold && italic) return await doc.embedFont(StandardFonts.HelveticaBoldOblique);
        if (bold) return await doc.embedFont(StandardFonts.HelveticaBold);
        if (italic) return await doc.embedFont(StandardFonts.HelveticaOblique);
        return await doc.embedFont(StandardFonts.Helvetica);
      }
    };

    if (annotationsStr) {
      const annotations = JSON.parse(annotationsStr);
      for (const ann of annotations) {
        const pageIdx = ann.page;
        if (pageIdx >= 0 && pageIdx < pages.length) {
          const page = pages[pageIdx];
          
          if (ann.type === 'text') {
            const font = await getEmbedFont(pdfDoc, ann.fontFamily, ann.bold, ann.italic);
            const size = ann.fontSize || 12;
            const textColor = ann.color ? hexToRgb(ann.color) : rgb(0, 0, 0);
            
            // Draw background if specified
            if (ann.bgColor) {
              page.drawRectangle({
                x: ann.x,
                y: ann.y,
                width: ann.width || 100,
                height: ann.height || 30,
                color: hexToRgb(ann.bgColor),
                opacity: ann.opacity !== undefined ? ann.opacity : 1,
              });
            }

            // Draw text lines
            const textContent = ann.text || '';
            const lines = textContent.split('\n');
            const lineHeight = size * 1.25;
            for (let i = 0; i < lines.length; i++) {
              const lineY = ann.y + (ann.height || size) - size - 4 - (i * lineHeight);
              if (lineY >= ann.y) {
                const textWidth = font.widthOfTextAtSize(lines[i], size);
                
                // Alignment offset calculations
                let lineX = ann.x + 5;
                if (ann.alignment === 'center') {
                  lineX = ann.x + ((ann.width || 100) - textWidth) / 2;
                } else if (ann.alignment === 'right') {
                  lineX = ann.x + (ann.width || 100) - textWidth - 5;
                }

                page.drawText(lines[i], {
                  x: lineX,
                  y: lineY,
                  size: size,
                  font: font,
                  color: textColor,
                  opacity: ann.opacity !== undefined ? ann.opacity : 1,
                });

                // Underline
                if (ann.underline) {
                  page.drawLine({
                    start: { x: lineX, y: lineY - 2 },
                    end: { x: lineX + textWidth, y: lineY - 2 },
                    color: textColor,
                    thickness: 1,
                    opacity: ann.opacity !== undefined ? ann.opacity : 1,
                  });
                }

                // Strikethrough
                if (ann.strikethrough) {
                  page.drawLine({
                    start: { x: lineX, y: lineY + (size / 2) - 1 },
                    end: { x: lineX + textWidth, y: lineY + (size / 2) - 1 },
                    color: textColor,
                    thickness: 1,
                    opacity: ann.opacity !== undefined ? ann.opacity : 1,
                  });
                }
              }
            }
          }
          else if (ann.type === 'shape') {
            const color = ann.bgColor ? hexToRgb(ann.bgColor) : undefined;
            const borderColor = ann.color ? hexToRgb(ann.color) : undefined;
            const borderWidth = ann.borderWidth !== undefined ? ann.borderWidth : 2;
            const opacity = ann.opacity !== undefined ? ann.opacity : 1;

            if (ann.shapeType === 'circle') {
              const rx = (ann.width || 50) / 2;
              const ry = (ann.height || 50) / 2;
              page.drawEllipse({
                x: ann.x + rx,
                y: ann.y + ry,
                xScale: rx,
                yScale: ry,
                color: color,
                borderColor: borderColor,
                borderWidth: borderWidth,
                opacity: opacity,
              });
            } else if (ann.shapeType === 'line') {
              page.drawLine({
                start: { x: ann.x, y: ann.y },
                end: { x: ann.x + (ann.width || 50), y: ann.y + (ann.height || 50) },
                color: borderColor || rgb(0, 0, 0),
                thickness: borderWidth || 2,
                opacity: opacity,
              });
            } else {
              // default to rectangle
              page.drawRectangle({
                x: ann.x,
                y: ann.y,
                width: ann.width || 50,
                height: ann.height || 50,
                color: color,
                borderColor: borderColor,
                borderWidth: borderWidth,
                opacity: opacity,
              });
            }
          }
          else if (ann.type === 'drawing') {
            const color = ann.color ? hexToRgb(ann.color) : rgb(0, 0, 0);
            const thickness = ann.borderWidth !== undefined ? ann.borderWidth : 2;
            const opacity = ann.opacity !== undefined ? ann.opacity : 1;

            if (ann.paths && Array.isArray(ann.paths)) {
              for (const stroke of ann.paths) {
                if (Array.isArray(stroke)) {
                  for (let i = 0; i < stroke.length - 1; i++) {
                    const p1 = stroke[i];
                    const p2 = stroke[i + 1];
                    page.drawLine({
                      start: { x: p1.x, y: p1.y },
                      end: { x: p2.x, y: p2.y },
                      color: color,
                      thickness: thickness,
                      opacity: opacity,
                    });
                  }
                }
              }
            }
          }
          else if (ann.type === 'image') {
            if (ann.imageBytes) {
              const matches = ann.imageBytes.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
              if (matches) {
                const imgBuffer = Buffer.from(matches[2], 'base64');
                const imgType = matches[1].toLowerCase();
                let embeddedImg;
                if (imgType === 'png') {
                  embeddedImg = await pdfDoc.embedPng(imgBuffer);
                } else {
                  embeddedImg = await pdfDoc.embedJpg(imgBuffer);
                }
                
                // Draw border if specified
                if (ann.borderWidth && ann.color) {
                  page.drawRectangle({
                    x: ann.x - ann.borderWidth / 2,
                    y: ann.y - ann.borderWidth / 2,
                    width: (ann.width || 100) + ann.borderWidth,
                    height: (ann.height || 100) + ann.borderWidth,
                    borderColor: hexToRgb(ann.color),
                    borderWidth: ann.borderWidth,
                    opacity: ann.opacity !== undefined ? ann.opacity : 1,
                  });
                }

                page.drawImage(embeddedImg, {
                  x: ann.x,
                  y: ann.y,
                  width: ann.width || 100,
                  height: ann.height || 100,
                  opacity: ann.opacity !== undefined ? ann.opacity : 1,
                });
              }
            }
          }
          else if (ann.type === 'highlight') {
            const color = ann.bgColor ? hexToRgb(ann.bgColor) : rgb(1, 0.9, 0.2); // default transparent yellow
            const opacity = ann.opacity !== undefined ? ann.opacity : 0.35;
            page.drawRectangle({
              x: ann.x,
              y: ann.y,
              width: ann.width || 50,
              height: ann.height || 15,
              color: color,
              opacity: opacity,
            });
          }
          else if (ann.type === 'underline' || ann.type === 'strikethrough') {
            const color = ann.color ? hexToRgb(ann.color) : rgb(0, 0, 1);
            const thickness = ann.borderWidth !== undefined ? ann.borderWidth : 2;
            const opacity = ann.opacity !== undefined ? ann.opacity : 0.8;
            
            const targetY = ann.type === 'underline' ? ann.y + 2 : ann.y + (ann.height || 10) / 2;

            page.drawLine({
              start: { x: ann.x, y: targetY },
              end: { x: ann.x + (ann.width || 50), y: targetY },
              color: color,
              thickness: thickness,
              opacity: opacity,
            });
          }
          else if (ann.type === 'note') {
            const color = ann.color ? hexToRgb(ann.color) : rgb(0.93, 0.42, 0.3);
            const opacity = ann.opacity !== undefined ? ann.opacity : 1;
            
            // Draw a sticky note icon
            page.drawRectangle({
              x: ann.x,
              y: ann.y,
              width: 18,
              height: 18,
              color: rgb(0.99, 0.9, 0.4), // Sticky-note yellow
              borderColor: color,
              borderWidth: 1.5,
              opacity: opacity,
            });
            // Draw lines inside note icon
            page.drawLine({
              start: { x: ann.x + 4, y: ann.y + 12 },
              end: { x: ann.x + 14, y: ann.y + 12 },
              color: color,
              thickness: 1.2,
              opacity: opacity,
            });
            page.drawLine({
              start: { x: ann.x + 4, y: ann.y + 8 },
              end: { x: ann.x + 10, y: ann.y + 8 },
              color: color,
              thickness: 1.2,
              opacity: opacity,
            });
          }
          else if (ann.type === 'callout') {
            const font = await getEmbedFont(pdfDoc, ann.fontFamily, ann.bold, ann.italic);
            const size = ann.fontSize || 10;
            const textColor = ann.color ? hexToRgb(ann.color) : rgb(0, 0, 0);
            const bgColor = ann.bgColor ? hexToRgb(ann.bgColor) : rgb(0.95, 0.95, 0.95);
            const borderColor = ann.color ? hexToRgb(ann.color) : rgb(0.93, 0.42, 0.3);
            const borderWidth = ann.borderWidth !== undefined ? ann.borderWidth : 1.5;
            const opacity = ann.opacity !== undefined ? ann.opacity : 1;

            // Draw border box
            page.drawRectangle({
              x: ann.x,
              y: ann.y,
              width: ann.width || 100,
              height: ann.height || 35,
              color: bgColor,
              borderColor: borderColor,
              borderWidth: borderWidth,
              opacity: opacity,
            });

            // Draw text
            const textContent = ann.text || '';
            const lines = textContent.split('\n');
            const lineHeight = size * 1.25;
            for (let i = 0; i < lines.length; i++) {
              const lineY = ann.y + (ann.height || size) - size - 6 - (i * lineHeight);
              if (lineY >= ann.y) {
                const textWidth = font.widthOfTextAtSize(lines[i], size);
                let lineX = ann.x + 6;
                if (ann.alignment === 'center') {
                  lineX = ann.x + ((ann.width || 100) - textWidth) / 2;
                } else if (ann.alignment === 'right') {
                  lineX = ann.x + (ann.width || 100) - textWidth - 6;
                }

                page.drawText(lines[i], {
                  x: lineX,
                  y: lineY,
                  size: size,
                  font: font,
                  color: textColor,
                  opacity: opacity,
                });

                if (ann.underline) {
                  page.drawLine({
                    start: { x: lineX, y: lineY - 2 },
                    end: { x: lineX + textWidth, y: lineY - 2 },
                    color: textColor,
                    thickness: 1,
                    opacity: opacity,
                  });
                }
                if (ann.strikethrough) {
                  page.drawLine({
                    start: { x: lineX, y: lineY + (size / 2) - 1 },
                    end: { x: lineX + textWidth, y: lineY + (size / 2) - 1 },
                    color: textColor,
                    thickness: 1,
                    opacity: opacity,
                  });
                }
              }
            }
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="edited.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error editing PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to edit PDF.' });
  }
};

// 4. Crop PDF
export const cropPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { pageIndex, x, y, width, height } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const pages = pdfDoc.getPages();
    const pageIdx = parseInt(pageIndex || '0', 10);
    
    if (pageIdx < 0 || pageIdx >= pages.length) {
      return res.status(400).json({ error: 'Invalid page index.' });
    }

    const page = pages[pageIdx];
    const px = parseFloat(x || '0');
    const py = parseFloat(y || '0');
    const pw = parseFloat(width || '400');
    const ph = parseFloat(height || '400');

    page.setCropBox(px, py, pw, ph);

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cropped.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error cropping PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to crop PDF.' });
  }
};

// 5. Redact PDF
export const redactPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const redactionsStr = req.body.redactions;
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const pages = pdfDoc.getPages();

    if (redactionsStr) {
      const redactions = JSON.parse(redactionsStr);
      for (const red of redactions) {
        const pageIdx = red.page;
        if (pageIdx >= 0 && pageIdx < pages.length) {
          const page = pages[pageIdx];
          page.drawRectangle({
            x: red.x,
            y: red.y,
            width: red.width,
            height: red.height,
            color: rgb(0, 0, 0),
          });
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="redacted.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error redacting PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to redact PDF.' });
  }
};

// 6. HTML to PDF
export const htmlToPDF = async (req: Request, res: Response) => {
  try {
    const { html, url } = req.body;
    let content = html || '';

    if (url && !html) {
      const fetchRes = await fetch(url);
      content = await fetchRes.text();
    }

    if (!content) {
      return res.status(400).json({ error: 'HTML source code or URL is required.' });
    }

    const cleanText = content.replace(/<[^>]*>/g, '\n').replace(/\n\s*\n/g, '\n').trim();

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(robotoRegularBytes);
    const lines = cleanText.split('\n').filter((l: string) => l.trim().length > 0);
    
    let page = pdfDoc.addPage([600, 800]);
    let y = 750;

    for (const line of lines) {
      if (y < 50) {
        page = pdfDoc.addPage([600, 800]);
        y = 750;
      }
      const textToDraw = line.length > 80 ? line.substring(0, 80) + '...' : line;
      page.drawText(textToDraw, {
        x: 50,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
      y -= 15;
    }

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="webpage.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error converting HTML to PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert HTML to PDF.' });
  }
};

// 7. Repair PDF
export const repairPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    const pdfBytes = await pdfDoc.save();

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="repaired.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error repairing PDF:', error);
    return res.status(500).json({ error: error.message || 'Failed to repair PDF.' });
  }
};

// 8. Compare PDF
export const comparePDF = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Please upload two PDF files to compare.' });
    }

    const doc1 = await PDFDocument.load(files[0].buffer);
    const doc2 = await PDFDocument.load(files[1].buffer);

    const comparisonDoc = await PDFDocument.create();
    
    const count1 = doc1.getPageCount();
    const count2 = doc2.getPageCount();
    const maxCount = Math.max(count1, count2);

    for (let i = 0; i < maxCount; i++) {
      const page = comparisonDoc.addPage([1200, 800]);
      
      if (i < count1) {
        const [embedded1] = await comparisonDoc.embedPdf(files[0].buffer, [i]);
        page.drawPage(embedded1, {
          x: 50,
          y: 50,
          width: 500,
          height: 700
        });
      }
      
      if (i < count2) {
        const [embedded2] = await comparisonDoc.embedPdf(files[1].buffer, [i]);
        page.drawPage(embedded2, {
          x: 650,
          y: 50,
          width: 500,
          height: 700
        });
      }
    }

    const pdfBytes = await comparisonDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="compared.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error comparing PDFs:', error);
    return res.status(500).json({ error: error.message || 'Failed to compare PDFs.' });
  }
};

// 9. PDF to PDF/A
export const pdfToPDFA = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pdfDoc = await PDFDocument.load(file.buffer);
    
    pdfDoc.setTitle('PDF/A Compliant Document');
    pdfDoc.setSubject('PDF/A-1b ISO Standard Archive');
    pdfDoc.setKeywords(['PDFA', 'Archive', 'ISO 19005']);

    const pdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="pdfa_compliant.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error converting PDF to PDF/A:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert PDF to PDF/A.' });
  }
};

// 10. Word to PDF
export const wordToPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a Word file (.docx).' });
    }

    const pdfBytes = await convertOfficeToPdf(file.buffer, 'docx');
    
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="word_converted.pdf"');
    return res.send(pdfBytes);
  } catch (error: any) {
    console.error('Error converting Word to PDF with LibreOffice:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert Word to PDF.' });
  }
};

// 11. PowerPoint to PDF
export const powerpointToPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PowerPoint file (.pptx).' });
    }

    const pdfBytes = await convertOfficeToPdf(file.buffer, 'pptx');
    
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="powerpoint_converted.pdf"');
    return res.send(pdfBytes);
  } catch (error: any) {
    console.error('Error converting PowerPoint to PDF with LibreOffice:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert PowerPoint to PDF.' });
  }
};

// 12. Excel to PDF
export const excelToPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload an Excel file (.xlsx or .xls).' });
    }

    const ext = path.extname(file.originalname).substring(1).toLowerCase() || 'xlsx';
    const pdfBytes = await convertOfficeToPdf(file.buffer, ext);
    
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="excel_converted.pdf"');
    return res.send(pdfBytes);
  } catch (error: any) {
    console.error('Error converting Excel to PDF with LibreOffice:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert Excel to PDF.' });
  }
};

// 13. PDF to Word
export const pdfToWord = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const docxBytes = await runPythonWorker('pdf-to-docx', file.buffer, 'pdf', 'docx');
    
    res.contentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="converted.docx"');
    return res.send(docxBytes);
  } catch (error: any) {
    console.error('Error converting PDF to Word with Python worker:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert PDF to Word.' });
  }
};

// 14. PDF to PowerPoint
export const pdfToPowerpoint = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const pptxBytes = await runPythonWorker('pdf-to-pptx', file.buffer, 'pdf', 'pptx');
    
    res.contentType('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="converted.pptx"');
    return res.send(pptxBytes);
  } catch (error: any) {
    console.error('Error converting PDF to PowerPoint with Python worker:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert PDF to PowerPoint.' });
  }
};

// 15. PDF to Excel
export const pdfToExcel = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    const xlsxBytes = await runPythonWorker('pdf-to-xlsx', file.buffer, 'pdf', 'xlsx');
    
    res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="converted.xlsx"');
    return res.send(xlsxBytes);
  } catch (error: any) {
    console.error('Error converting PDF to Excel with Python worker:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert PDF to Excel.' });
  }
};

// 16. OCR PDF/Images
export const ocrPDF = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { ocrType } = req.body; // 'text' or 'pdf'
    
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF or an Image file.' });
    }

    const type = ocrType === 'pdf' ? 'pdf' : 'text';
    const inputExt = file.originalname.split('.').pop() || 'pdf';
    const outputExt = type === 'pdf' ? 'pdf' : 'txt';
    const contentType = type === 'pdf' ? 'application/pdf' : 'text/plain';
    const filename = type === 'pdf' ? 'ocr_searchable.pdf' : 'extracted_text.txt';

    const outputBuffer = await runPythonWorker('ocr', file.buffer, inputExt, outputExt, type);

    res.contentType(contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(outputBuffer);
  } catch (error: any) {
    console.error('Error in OCR processing:', error);
    return res.status(500).json({ error: error.message || 'Failed to perform OCR.' });
  }
};
