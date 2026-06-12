import { Router } from 'express';
import multer from 'multer';
import * as pdfController from '../controllers/pdfController';

const router = Router();

// Configure multer to store uploaded files in memory buffers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Endpoint routes
router.post('/merge', upload.array('files'), pdfController.mergePDFs);
router.post('/split', upload.single('file'), pdfController.splitPDF);
router.post('/compress', upload.single('file'), pdfController.compressPDF);
router.post('/rotate', upload.single('file'), pdfController.rotatePDF);
router.post('/watermark', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), pdfController.watermarkPDF);
router.post('/page-numbers', upload.single('file'), pdfController.addPageNumbers);
router.post('/protect', upload.single('file'), pdfController.protectPDF);
router.post('/unlock', upload.single('file'), pdfController.unlockPDF);
router.post('/jpg-to-pdf', upload.array('files'), pdfController.jpgToPDF);
router.post('/organize', upload.single('file'), pdfController.organizePDF);
router.post('/sign', upload.single('file'), pdfController.signPDF);
router.post('/edit', upload.single('file'), pdfController.editPDF);
router.post('/crop', upload.single('file'), pdfController.cropPDF);
router.post('/redact', upload.single('file'), pdfController.redactPDF);
router.post('/html-to-pdf', pdfController.htmlToPDF);
router.post('/repair', upload.single('file'), pdfController.repairPDF);
router.post('/compare', upload.array('files'), pdfController.comparePDF);
router.post('/pdf-to-pdfa', upload.single('file'), pdfController.pdfToPDFA);
router.post('/word-to-pdf', upload.single('file'), pdfController.wordToPDF);
router.post('/powerpoint-to-pdf', upload.single('file'), pdfController.powerpointToPDF);
router.post('/excel-to-pdf', upload.single('file'), pdfController.excelToPDF);
router.post('/pdf-to-word', upload.single('file'), pdfController.pdfToWord);
router.post('/pdf-to-powerpoint', upload.single('file'), pdfController.pdfToPowerpoint);
router.post('/pdf-to-excel', upload.single('file'), pdfController.pdfToExcel);
router.post('/ocr', upload.single('file'), pdfController.ocrPDF);
router.post('/detect-forms', upload.single('file'), pdfController.detectForms);
router.post('/save-forms', upload.single('file'), pdfController.saveForms);
router.post('/batch-fill-forms', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'dataFile', maxCount: 1 }
]), pdfController.batchFillForms);
router.post('/parse-headers', upload.single('file'), pdfController.parseHeaders);

export default router;
