import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Sparkles, Download, FileCheck, Trash, Type, 
  Image as ImageIcon, Pencil, Square, Circle, GripVertical, 
  ZoomIn, ZoomOut, Maximize2, Move, ChevronUp, ChevronDown,
  Undo, Redo, AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Columns, Highlighter, MessageSquare, HelpCircle,
  Plus, Check, Underline as UnderlineIcon, Settings, Scissors, Edit3,
  RotateCw
} from 'lucide-react';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import api from '../utils/api';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface EditPdfProps {
  mode?: 'edit' | 'forms';
  onBack: () => void;
}

interface Annotation {
  id: string;
  page: number;
  type: 'text' | 'image' | 'shape' | 'drawing' | 'highlight' | 'underline' | 'strikethrough' | 'note' | 'callout' | 'formField';
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage
  height: number; // percentage
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string; // hex
  bgColor?: string; // hex
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignment?: 'left' | 'center' | 'right';
  link?: string;
  borderWidth?: number; // thickness (1-10)
  opacity?: number; // 0-1
  shapeType?: 'rectangle' | 'circle' | 'line';
  imageBytes?: string; // base64
  imageName?: string;
  paths?: { x: number; y: number }[][];
  noteContent?: string;
  borderRadius?: number; // border radius percentage (0 - 50)
  locked?: boolean;
  maskId?: string;

  // PDF Interactive Form fields
  fieldName?: string;
  fieldType?: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'date' | 'signature';
  fieldValue?: string;
  fieldOptions?: string[];
  fieldRequired?: boolean;
  fieldGroup?: string;
  fieldOptionName?: string;
}

interface DragState {
  type: 'drag' | 'resize';
  id: string;
  handle?: string;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
}

const EditPdf: React.FC<EditPdfProps> = ({ mode = 'edit', onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Batch form filling states
  const [fillMode, setFillMode] = useState<'single' | 'batch'>('single');
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [dataHeaders, setDataHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<{ [key: string]: string }>({});

  // Layout reorganization and form flattening states
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<{ [key: number]: number }>({});
  const [flatten, setFlatten] = useState(false);

  // PDF.js State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<number>(60);
  const [isLoading, setIsLoading] = useState(false);

  // Editor Workspace Tabs & Layout
  const [activeTab, setActiveTab] = useState<'annotate' | 'edit'>('annotate');
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);

  // Editor Tools State
  const [activeTool, setActiveTool] = useState<'hand' | 'text' | 'pencil' | 'shape-rect' | 'shape-circle' | 'shape-line' | 'highlight' | 'underline' | 'strikethrough' | 'note' | 'callout' | 'editText'>('hand');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [pageTextContent, setPageTextContent] = useState<any[]>([]);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // Global Contextual State
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentThickness, setCurrentThickness] = useState(2);
  const [currentOpacity, setCurrentOpacity] = useState(1);
  const [customColors, setCustomColors] = useState<string[]>([]);

  // Canvas & Dragging/Panning Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const insertFileInputRef = useRef<HTMLInputElement | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  
  // Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Freehand Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

  const annotationsRef = useRef<Annotation[]>([]);
  const activeCoordsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Save history state
  const saveToHistory = (newAnns: Annotation[]) => {
    const nextHistory = history.slice(0, historyStep + 1);
    nextHistory.push(newAnns);
    setHistory(nextHistory);
    setHistoryStep(nextHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      setHistoryStep(prevStep);
      setAnnotations(history[prevStep]);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      setHistoryStep(nextStep);
      setAnnotations(history[nextStep]);
      setSelectedId(null);
    }
  };

  // Load PDF and generate thumbnails
  useEffect(() => {
    if (files.length === 0) {
      setPdfDoc(null);
      setPageThumbnails([]);
      setNumPages(0);
      setPageDimensions([]);
      setPageIndex(0);
      setAnnotations([]);
      setHistory([[]]);
      setHistoryStep(0);
      setSelectedId(null);
      setPageOrder([]);
      setRotations({});
      setFlatten(false);
      return;
    }

    const file = files[0];
    const fileReader = new FileReader();
    setIsLoading(true);

    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);

        const dims = [];
        const thumbs = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          dims.push({ width: viewport.width, height: viewport.height });

          // Generate Thumbnail
          const thumbViewport = page.getViewport({ scale: 0.15 });
          const canvas = document.createElement('canvas');
          canvas.width = thumbViewport.width;
          canvas.height = thumbViewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({
              canvasContext: context,
              viewport: thumbViewport
            }).promise;
            thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
          }
        }

        setPageDimensions(dims);
        setPageThumbnails(thumbs);
        setPageOrder(Array.from({ length: pdf.numPages }, (_, i) => i));
        setRotations({});

        if (mode === 'forms') {
          setTimeout(() => {
            handleAutoDetectFields();
          }, 200);
        }
      } catch (err) {
        console.error('Error parsing PDF:', err);
        alert('Failed to load PDF. Make sure it is not password protected.');
      } finally {
        setIsLoading(false);
      }
    };

    fileReader.readAsArrayBuffer(file);
  }, [files]);

  // Render current PDF page
  useEffect(() => {
    if (!pdfDoc || pageOrder.length === 0) return;

    const renderPage = async () => {
      try {
        const origIdx = pageOrder[pageIndex];
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (origIdx === -1) {
          // Render blank page
          const scale = (zoom / 100) * 1.5;
          const w = 612 * scale;
          const h = 792 * scale;
          canvas.width = w;
          canvas.height = h;
          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, w, h);
          }
          setContainerSize({ width: w, height: h });
          setPageTextContent([]);
          return;
        }

        const page = await pdfDoc.getPage(origIdx + 1);
        const scale = (zoom / 100) * 1.5;
        const customRot = rotations[origIdx] || 0;
        const viewport = page.getViewport({ scale, rotation: (page.rotate + customRot) % 360 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        if (!context) return;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        setContainerSize({ width: viewport.width, height: viewport.height });

        // Extract and map text content
        const textContent = await page.getTextContent();
        const itemsWithCoords = textContent.items.map((item: any) => {
          const tx = item.transform;
          const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);
          const scaledHeight = item.height * scale;
          const scaledWidth = item.width * scale;
          return {
            str: item.str,
            left: (vx / viewport.width) * 100,
            top: ((vy - scaledHeight) / viewport.height) * 100,
            width: (scaledWidth / viewport.width) * 100,
            height: (scaledHeight / viewport.height) * 100,
            fontSize: scaledHeight
          };
        });
        setPageTextContent(itemsWithCoords);
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };

    renderPage();
  }, [pdfDoc, pageIndex, zoom, pageOrder, rotations]);

  // Panning functionality for Hand tool
  const handleViewerMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'hand') return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewer.scrollLeft,
      scrollTop: viewer.scrollTop
    });
  };

  const handleViewerMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || activeTool !== 'hand') return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    viewer.scrollLeft = panStart.scrollLeft - dx;
    viewer.scrollTop = panStart.scrollTop - dy;
  };

  const handleViewerMouseUp = () => {
    setIsPanning(false);
  };

  // Mouse drag & resize handlers
  const handleMouseDown = (e: React.MouseEvent, ann: Annotation, handle?: string) => {
    if (ann.locked) return;
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() !== 'textarea') {
      e.preventDefault();
    }
    e.stopPropagation();
    setSelectedId(ann.id);

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    if (handle) {
      setDragState({
        type: 'resize',
        id: ann.id,
        handle,
        startX: mouseX,
        startY: mouseY,
        startLeft: ann.x,
        startTop: ann.y,
        startWidth: ann.width,
        startHeight: ann.height
      });
    } else {
      setDragState({
        type: 'drag',
        id: ann.id,
        startX: mouseX,
        startY: mouseY,
        startLeft: ann.x,
        startTop: ann.y,
        startWidth: ann.width,
        startHeight: ann.height
      });
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const rect = pageContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const deltaX = ((e.clientX - dragState.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - dragState.startY) / rect.height) * 100;

      let newX = dragState.startLeft;
      let newY = dragState.startTop;
      let newWidth = dragState.startWidth;
      let newHeight = dragState.startHeight;

      if (dragState.type === 'drag') {
        newX = Math.max(0, Math.min(100 - dragState.startWidth, dragState.startLeft + deltaX));
        newY = Math.max(0, Math.min(100 - dragState.startHeight, dragState.startTop + deltaY));
      } else if (dragState.type === 'resize') {
        const handle = dragState.handle || '';

        if (handle.includes('e')) {
          newWidth = Math.max(2, dragState.startWidth + deltaX);
        }
        if (handle.includes('s')) {
          newHeight = Math.max(2, dragState.startHeight + deltaY);
        }
        if (handle.includes('w')) {
          const potentialWidth = dragState.startWidth - deltaX;
          if (potentialWidth >= 2) {
            newX = dragState.startLeft + deltaX;
            newWidth = potentialWidth;
          }
        }
        if (handle.includes('n')) {
          const potentialHeight = dragState.startHeight - deltaY;
          if (potentialHeight >= 2) {
            newY = dragState.startTop + deltaY;
            newHeight = potentialHeight;
          }
        }

        // Bound limits
        if (newX < 0) { newWidth += newX; newX = 0; }
        if (newY < 0) { newHeight += newY; newY = 0; }
        if (newX + newWidth > 100) { newWidth = 100 - newX; }
        if (newY + newHeight > 100) { newHeight = 100 - newY; }
      }

      // Store current coords for state saving on mouseup
      activeCoordsRef.current = { x: newX, y: newY, width: newWidth, height: newHeight };

      // Direct DOM style manipulation for butter-smooth 60 FPS dragging/resizing
      const domEl = pageContainerRef.current?.querySelector(`[data-annotation-id="${dragState.id}"]`) as HTMLElement;
      if (domEl) {
        domEl.style.left = `${newX}%`;
        domEl.style.top = `${newY}%`;
        domEl.style.width = `${newWidth}%`;
        domEl.style.height = `${newHeight}%`;
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragState) {
        let finalAnnotations = annotationsRef.current;
        if (activeCoordsRef.current) {
          const coords = activeCoordsRef.current;
          finalAnnotations = annotationsRef.current.map(ann => {
            if (ann.id !== dragState.id) return ann;
            return {
              ...ann,
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height
            };
          });
          setAnnotations(finalAnnotations);
        }
        saveToHistory(finalAnnotations);
        setDragState(null);
        activeCoordsRef.current = null;
      }
    };

    if (dragState) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState]);

  // Click on background of page overlays
  const handlePageClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Do not create a new annotation if clicking inside an existing annotation or its resize handles
    if (target.closest('.annotation-item') || target.closest('.resize-handle')) {
      return;
    }

    const rect = pageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (activeTool === 'text') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'text',
        x: Math.min(x, 70),
        y: Math.min(y, 90),
        width: 30,
        height: 10,
        text: 'New Text',
        fontSize: 18,
        fontFamily: 'Arial',
        color: currentColor,
        bgColor: undefined,
        bold: false,
        italic: false,
        underline: false,
        opacity: currentOpacity,
        alignment: 'left'
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setEditingTextId(newAnn.id);
      setActiveTool('hand');
    } else if (activeTool === 'highlight') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'highlight',
        x: Math.min(x, 60),
        y: Math.min(y, 95),
        width: 35,
        height: 4,
        bgColor: '#fef08a',
        opacity: 0.35
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    } else if (activeTool === 'underline') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'underline',
        x: Math.min(x, 60),
        y: Math.min(y, 98),
        width: 35,
        height: 2,
        color: '#3b82f6',
        borderWidth: 2,
        opacity: 0.8
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    } else if (activeTool === 'strikethrough') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'strikethrough',
        x: Math.min(x, 60),
        y: Math.min(y, 95),
        width: 35,
        height: 2,
        color: '#ef4444',
        borderWidth: 2,
        opacity: 0.8
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    } else if (activeTool === 'note') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'note',
        x: Math.min(x, 95),
        y: Math.min(y, 95),
        width: 4,
        height: 4,
        color: '#ee6c4d',
        bgColor: '#fef08a',
        noteContent: 'Write your sticky note content here...',
        opacity: 1
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    } else if (activeTool === 'callout') {
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'callout',
        x: Math.min(x, 60),
        y: Math.min(y, 85),
        width: 30,
        height: 12,
        text: 'Callout text...',
        fontSize: 12,
        fontFamily: 'Arial',
        color: '#ee6c4d',
        bgColor: '#ffffff',
        borderWidth: 2,
        opacity: 1,
        alignment: 'left'
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    }
  };

  // Mouseup text selection auto-attachment
  const handlePageMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    if (!pageContainerRef.current?.contains(range.commonAncestorContainer)) return;

    const pageRect = pageContainerRef.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects());
    if (rects.length === 0) return;

    // Clear selection so it doesn't linger visually and double-fire
    selection.removeAllRanges();

    // Group client rects by their vertical position (line grouping) to prevent double layers
    const validRects = rects.filter(r => r.width > 1 && r.height > 1);
    const mergedRects: { left: number; top: number; right: number; bottom: number; width: number; height: number }[] = [];
    
    // Sort rects by top coordinate first
    const sortedRects = validRects.map(r => ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    })).sort((a, b) => a.top - b.top);

    sortedRects.forEach(rect => {
      // Find if we already have a merged rect that overlaps vertically (same line)
      const sameLineRect = mergedRects.find(m => {
        const verticalOverlap = Math.min(rect.bottom, m.bottom) - Math.max(rect.top, m.top);
        const minHeight = Math.min(rect.height, m.height);
        return verticalOverlap > minHeight * 0.5;
      });

      if (sameLineRect) {
        sameLineRect.left = Math.min(sameLineRect.left, rect.left);
        sameLineRect.right = Math.max(sameLineRect.right, rect.right);
        sameLineRect.top = Math.min(sameLineRect.top, rect.top);
        sameLineRect.bottom = Math.max(sameLineRect.bottom, rect.bottom);
        sameLineRect.width = sameLineRect.right - sameLineRect.left;
        sameLineRect.height = sameLineRect.bottom - sameLineRect.top;
      } else {
        mergedRects.push({ ...rect });
      }
    });

    const newAnns: Annotation[] = [];
    mergedRects.forEach(rect => {
      const x = ((rect.left - pageRect.left) / pageRect.width) * 100;
      const y = ((rect.top - pageRect.top) / pageRect.height) * 100;
      const w = (rect.width / pageRect.width) * 100;
      const h = (rect.height / pageRect.height) * 100;

      if (w < 0.5 || h < 0.5) return;

      const selectedTextText = range.toString().trim();

      if (activeTool === 'highlight') {
        newAnns.push({
          id: Math.random().toString(36).substring(2, 9),
          page: pageIndex,
          type: 'highlight',
          x,
          y,
          width: w,
          height: h,
          bgColor: currentColor || '#fef08a',
          opacity: 0.35
        });
      } else if (activeTool === 'underline') {
        newAnns.push({
          id: Math.random().toString(36).substring(2, 9),
          page: pageIndex,
          type: 'underline',
          x,
          y,
          width: w,
          height: h,
          color: currentColor || '#3b82f6',
          borderWidth: 2,
          opacity: 0.8
        });
      } else if (activeTool === 'strikethrough') {
        newAnns.push({
          id: Math.random().toString(36).substring(2, 9),
          page: pageIndex,
          type: 'strikethrough',
          x,
          y,
          width: w,
          height: h,
          color: currentColor || '#ef4444',
          borderWidth: 2,
          opacity: 0.8
        });
      } else if (activeTool === 'editText') {
        const maskId = Math.random().toString(36).substring(2, 9);
        const textId = Math.random().toString(36).substring(2, 9);

        newAnns.push({
          id: maskId,
          page: pageIndex,
          type: 'shape',
          shapeType: 'rectangle',
          x,
          y,
          width: w,
          height: h + 0.5,
          bgColor: '#ffffff',
          color: 'transparent',
          borderWidth: 0,
          opacity: 1,
          locked: true
        });

        newAnns.push({
          id: textId,
          page: pageIndex,
          type: 'text',
          x,
          y,
          width: w,
          height: h + 1,
          text: selectedTextText || 'Edit text',
          fontSize: Math.round(h * 6),
          fontFamily: 'Arial',
          color: currentColor || '#000000',
          bgColor: 'transparent',
          bold: false,
          italic: false,
          underline: false,
          opacity: 1,
          alignment: 'left',
          maskId: maskId
        });
      }
    });

    if (newAnns.length > 0) {
      const nextAnns = [...annotations, ...newAnns];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      
      const textAnn = newAnns.find(a => a.type === 'text');
      if (textAnn) {
        setSelectedId(textAnn.id);
        if (activeTool === 'editText') {
          setEditingTextId(textAnn.id);
        }
      } else {
        setSelectedId(newAnns[0].id);
      }
      setActiveTool('hand');
    }
  };

  const handleTextItemClick = (e: React.MouseEvent, item: any) => {
    if (activeTool !== 'editText') return;
    e.preventDefault();
    e.stopPropagation();

    const maskId = Math.random().toString(36).substring(2, 9);
    const textId = Math.random().toString(36).substring(2, 9);

    const maskAnn: Annotation = {
      id: maskId,
      page: pageIndex,
      type: 'shape',
      shapeType: 'rectangle',
      x: item.left,
      y: item.top,
      width: item.width,
      height: item.height + 0.5,
      bgColor: '#ffffff',
      color: 'transparent',
      borderWidth: 0,
      opacity: 1,
      locked: true
    };

    const textAnn: Annotation = {
      id: textId,
      page: pageIndex,
      type: 'text',
      x: item.left,
      y: item.top,
      width: item.width,
      height: item.height + 1,
      text: item.str,
      fontSize: Math.round(item.fontSize),
      fontFamily: 'Arial',
      color: currentColor || '#000000',
      bgColor: 'transparent',
      bold: false,
      italic: false,
      underline: false,
      opacity: 1,
      alignment: 'left',
      maskId: maskId
    };

    const nextAnns = [...annotations, maskAnn, textAnn];
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
    setSelectedId(textAnn.id);
    setEditingTextId(textAnn.id);
    setActiveTool('hand');
  };

  // Add Shape helper
  const addShape = (shapeType: 'rectangle' | 'circle' | 'line') => {
    const newAnn: Annotation = {
      id: Math.random().toString(36).substring(2, 9),
      page: pageIndex,
      type: 'shape',
      shapeType,
      x: 35,
      y: 35,
      width: shapeType === 'line' ? 20 : 20,
      height: shapeType === 'line' ? 10 : 15,
      color: currentColor,
      bgColor: undefined,
      borderWidth: currentThickness,
      opacity: currentOpacity
    };
    const nextAnns = [...annotations, newAnn];
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
    setSelectedId(newAnn.id);
    setActiveTool('hand');
  };

  // Image Upload helper
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newAnn: Annotation = {
        id: Math.random().toString(36).substring(2, 9),
        page: pageIndex,
        type: 'image',
        x: 30,
        y: 30,
        width: 30,
        height: 25,
        imageBytes: base64,
        imageName: file.name,
        opacity: currentOpacity,
        borderRadius: 0,
        borderWidth: 0,
        color: '#000000'
      };
      const nextAnns = [...annotations, newAnn];
      setAnnotations(nextAnns);
      saveToHistory(nextAnns);
      setSelectedId(newAnn.id);
      setActiveTool('hand');
    };
    reader.readAsDataURL(file);
  };

  // Pencil Freehand drawing events
  const handleDrawingMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setIsDrawing(true);
    currentStrokeRef.current = [{
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100
    }];
  };

  const handleDrawingMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();

    currentStrokeRef.current.push({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100
    });
  };

  const handleDrawingMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current.length < 2) return;

    const newAnn: Annotation = {
      id: Math.random().toString(36).substring(2, 9),
      page: pageIndex,
      type: 'drawing',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: currentColor,
      borderWidth: currentThickness,
      opacity: currentOpacity,
      paths: [[...currentStrokeRef.current]]
    };

    const nextAnns = [...annotations, newAnn];
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
    setSelectedId(newAnn.id);

    // Clear temp canvas
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const selectedAnn = annotations.find(a => a.id === selectedId);

  const updateSelectedAnnotation = (fields: Partial<Annotation>) => {
    if (!selectedId) return;
    const nextAnns = annotations.map(ann => ann.id === selectedId ? { ...ann, ...fields } : ann);
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
  };

  const deleteAnnotation = (id: string) => {
    const targetAnn = annotations.find(ann => ann.id === id);
    let nextAnns = annotations.filter(ann => ann.id !== id);
    if (targetAnn && targetAnn.maskId) {
      nextAnns = nextAnns.filter(ann => ann.id !== targetAnn.maskId);
    }
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
    if (selectedId === id) setSelectedId(null);
  };

  const bringToFront = (id: string) => {
    setAnnotations(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const nextAnns = [...prev];
      const temp = nextAnns[idx];
      nextAnns[idx] = nextAnns[idx + 1];
      nextAnns[idx + 1] = temp;
      saveToHistory(nextAnns);
      return nextAnns;
    });
  };

  const sendToBack = (id: string) => {
    setAnnotations(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx <= 0) return prev;
      const nextAnns = [...prev];
      const temp = nextAnns[idx];
      nextAnns[idx] = nextAnns[idx - 1];
      nextAnns[idx - 1] = temp;
      saveToHistory(nextAnns);
      return nextAnns;
    });
  };

  // Page operations
  const handleRotatePage = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const origIdx = pageOrder[listIdx];
    if (origIdx === -1) return;
    setRotations(prev => ({
      ...prev,
      [origIdx]: ((prev[origIdx] || 0) + 90) % 360
    }));
  };

  const handleMovePageUp = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (listIdx === 0) return;
    setPageOrder(prev => {
      const next = [...prev];
      const temp = next[listIdx];
      next[listIdx] = next[listIdx - 1];
      next[listIdx - 1] = temp;
      return next;
    });
    setAnnotations(prev => prev.map(ann => {
      if (ann.page === listIdx) return { ...ann, page: listIdx - 1 };
      if (ann.page === listIdx - 1) return { ...ann, page: listIdx };
      return ann;
    }));
    if (pageIndex === listIdx) {
      setPageIndex(listIdx - 1);
    } else if (pageIndex === listIdx - 1) {
      setPageIndex(listIdx);
    }
  };

  const handleMovePageDown = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (listIdx === pageOrder.length - 1) return;
    setPageOrder(prev => {
      const next = [...prev];
      const temp = next[listIdx];
      next[listIdx] = next[listIdx + 1];
      next[listIdx + 1] = temp;
      return next;
    });
    setAnnotations(prev => prev.map(ann => {
      if (ann.page === listIdx) return { ...ann, page: listIdx + 1 };
      if (ann.page === listIdx + 1) return { ...ann, page: listIdx };
      return ann;
    }));
    if (pageIndex === listIdx) {
      setPageIndex(listIdx + 1);
    } else if (pageIndex === listIdx + 1) {
      setPageIndex(listIdx);
    }
  };

  const handleDuplicatePage = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPageOrder(prev => {
      const next = [...prev];
      next.splice(listIdx + 1, 0, next[listIdx]);
      return next;
    });
    setAnnotations(prev => {
      const shifted = prev.map(ann => ann.page > listIdx ? { ...ann, page: ann.page + 1 } : ann);
      const cloned = prev
        .filter(ann => ann.page === listIdx)
        .map(ann => ({
          ...ann,
          id: Math.random().toString(36).substring(2, 9),
          page: listIdx + 1
        }));
      return [...shifted, ...cloned];
    });
  };

  const handleDeletePage = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pageOrder.length <= 1) {
      alert("A PDF must contain at least one page.");
      return;
    }
    setPageOrder(prev => prev.filter((_, idx) => idx !== listIdx));
    setAnnotations(prev => prev
      .filter(ann => ann.page !== listIdx)
      .map(ann => ann.page > listIdx ? { ...ann, page: ann.page - 1 } : ann)
    );
    if (pageIndex >= pageOrder.length - 1) {
      setPageIndex(Math.max(0, pageOrder.length - 2));
    }
  };

  const handleInsertBlankPage = (listIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPageOrder(prev => {
      const next = [...prev];
      next.splice(listIdx + 1, 0, -1);
      return next;
    });
    setAnnotations(prev => prev.map(ann => ann.page > listIdx ? { ...ann, page: ann.page + 1 } : ann));
  };

  const handleAddBlankPageAtStart = () => {
    setPageOrder(prev => [-1, ...prev]);
    setPageIndex(0);
    setAnnotations(prev => prev.map(ann => ({ ...ann, page: ann.page + 1 })));
  };

  // Form fields builder actions
  const handleAddField = (type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'date' | 'signature') => {
    const newFieldAnn: Annotation = {
      id: Math.random().toString(36).substring(2, 9),
      page: pageIndex,
      type: 'formField',
      x: 35,
      y: 40,
      width: type === 'checkbox' || type === 'radio' ? 6 : 25,
      height: type === 'checkbox' || type === 'radio' ? 4 : 5,
      fieldName: `Field_${type}_${Math.random().toString(36).substring(7)}`,
      fieldType: type,
      fieldValue: '',
      fieldOptions: type === 'dropdown' ? ['Option 1', 'Option 2'] : [],
      fieldRequired: false,
      fieldGroup: type === 'radio' ? 'RadioGroup1' : undefined,
      fieldOptionName: type === 'radio' ? 'Option1' : undefined
    };
    const nextAnns = [...annotations, newFieldAnn];
    setAnnotations(nextAnns);
    saveToHistory(nextAnns);
    setSelectedId(newFieldAnn.id);
  };

  const handleAutoDetectFields = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(30);

    const formData = new FormData();
    formData.append('file', files[0]);

    try {
      const response = await api.post('/detect-forms', formData);
      const fields = response.data.fields || [];
      
      const newAnns = fields.map((f: any) => ({
        id: f.id || Math.random().toString(36).substring(2, 9),
        page: f.page,
        type: 'formField' as any,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldName: f.name,
        fieldType: f.type,
        fieldValue: f.value,
        fieldOptions: f.options || [],
        fieldRequired: !!f.required,
        fieldGroup: f.group,
        fieldOptionName: f.optionName
      }));
      
      const mergedAnns = [...annotations.filter(ann => ann.type !== 'formField'), ...newAnns];
      setAnnotations(mergedAnns);
      saveToHistory(mergedAnns);
      alert(`Successfully scanned PDF. Detected ${newAnns.length} interactive form fields!`);
    } catch (err: any) {
      console.error(err);
      alert('Failed to detect form fields: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveForm = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);

    const formFields = annotations
      .filter(ann => ann.type === 'formField')
      .map(ann => {
        return {
          page: ann.page,
          type: ann.fieldType || 'text',
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height,
          name: ann.fieldName || `field_${ann.page}_${ann.id}`,
          value: ann.fieldValue || '',
          options: ann.fieldOptions || [],
          required: !!ann.fieldRequired,
          group: ann.fieldGroup,
          optionName: ann.fieldOptionName
        };
      });

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('fields', JSON.stringify(formFields));
    formData.append('flatten', String(flatten));
    formData.append('pageOrder', JSON.stringify(pageOrder));
    formData.append('rotations', JSON.stringify(rotations));

    try {
      setProgress(50);
      const response = await api.post('/save-forms', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(50 + percent * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error saving PDF form fields: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Convert percentages coordinates to PDF points and save PDF
  const handleSaveChanges = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(15);

    const formattedAnnotations = annotations.map(ann => {
      const origIdx = pageOrder[ann.page];
      const dims = (origIdx !== -1 && pageDimensions[origIdx]) ? pageDimensions[origIdx] : { width: 612, height: 792 };
      
      const pdfX = (ann.x / 100) * dims.width;
      const pdfY = ((100 - (ann.y + ann.height)) / 100) * dims.height;
      const pdfW = (ann.width / 100) * dims.width;
      const pdfH = (ann.height / 100) * dims.height;

      let formattedPaths = undefined;
      if (ann.paths) {
        formattedPaths = ann.paths.map(stroke => 
          stroke.map(pt => ({
            x: (pt.x / 100) * dims.width,
            y: ((100 - pt.y) / 100) * dims.height
          }))
        );
      }

      return {
        page: ann.page,
        type: ann.type,
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH,
        text: ann.text,
        fontSize: ann.fontSize,
        fontFamily: ann.fontFamily,
        color: ann.color,
        bgColor: ann.bgColor,
        bold: ann.bold,
        italic: ann.italic,
        underline: ann.underline,
        strikethrough: ann.strikethrough,
        alignment: ann.alignment,
        link: ann.link,
        borderWidth: ann.borderWidth,
        opacity: ann.opacity,
        shapeType: ann.shapeType,
        imageBytes: ann.imageBytes,
        paths: formattedPaths,
        noteContent: ann.noteContent
      };
    });

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('annotations', JSON.stringify(formattedAnnotations));
    formData.append('pageOrder', JSON.stringify(pageOrder));
    formData.append('rotations', JSON.stringify(rotations));

    try {
      setProgress(50);
      const response = await api.post('/edit', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(50 + percent * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert('Error editing PDF: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchFillForms = async () => {
    if (files.length === 0 || !dataFile) {
      alert('Please upload a CSV or Excel data file.');
      return;
    }
    setIsProcessing(true);
    setProgress(15);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('dataFile', dataFile);
    formData.append('fieldMapping', JSON.stringify(fieldMapping));
    formData.append('flatten', String(flatten));

    try {
      setProgress(50);
      const response = await api.post('/batch-fill-forms', formData, {
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(50 + percent * 0.4);
        }
      });

      setProgress(90);
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `batch_filled_${files[0].name.replace('.pdf', '')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setProgress(100);
      alert('Batch form filling completed successfully! Your ZIP archive has been downloaded.');
    } catch (err: any) {
      console.error(err);
      alert('Error in batch form filling: ' + (err.response?.data?.error || err.message));
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDataFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDataFile(file);

    if (file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const firstLine = text.split('\n')[0];
          const headers = firstLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
          setDataHeaders(headers);
          
          const initialMapping: { [key: string]: string } = {};
          const formFields = annotations.filter(ann => ann.type === 'formField');
          formFields.forEach(f => {
            const fieldName = f.fieldName || '';
            const matchingHeader = headers.find(h => h.toLowerCase() === fieldName.toLowerCase());
            if (matchingHeader) {
              initialMapping[fieldName] = matchingHeader;
            }
          });
          setFieldMapping(initialMapping);
        } catch (err) {
          console.error(err);
          alert('Failed to parse CSV headers.');
        }
      };
      reader.readAsText(file);
    } else {
      setIsProcessing(true);
      setProgress(20);
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await api.post('/parse-headers', formData);
        const headers = response.data.headers || [];
        setDataHeaders(headers);
        
        const initialMapping: { [key: string]: string } = {};
        const formFields = annotations.filter(ann => ann.type === 'formField');
        formFields.forEach(f => {
          const fieldName = f.fieldName || '';
          const matchingHeader = headers.find((h: string) => h.toLowerCase() === fieldName.toLowerCase());
          if (matchingHeader) {
            initialMapping[fieldName] = matchingHeader;
          }
        });
        setFieldMapping(initialMapping);
      } catch (err: any) {
        console.error(err);
        alert('Failed to parse file headers: ' + (err.response?.data?.error || err.message));
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    }
  };

  const handleFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
      setDownloadUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setFiles([]);
    setDownloadUrl(null);
    setPageOrder([]);
    setRotations({});
    setFlatten(false);
    setFillMode('single');
    setDataFile(null);
    setDataHeaders([]);
    setFieldMapping({});
  };

  // Color Swatches Quick Palette
  const quickColors = ['#000000', '#ffffff', '#3b82f6', '#ef4444', '#22c55e', '#facc15', '#a855f7', '#ee6c4d'];
  const allColors = [...quickColors, ...customColors];

  return (
    <div className="edit-pdf-workspace-container">
      {/* CSS Styles Injection */}
      <style>{`
        /* Butter-smooth dragging & selection styling */
        .annotation-item {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .annotation-item:hover {
          border-color: rgba(16, 185, 129, 0.6) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        
        /* Snapped selection styles */
        .active-tool-highlight ::selection {
          background-color: rgba(254, 240, 138, 0.45) !important;
        }
        .active-tool-underline ::selection {
          background-color: rgba(59, 130, 246, 0.2) !important;
          text-decoration: underline !important;
          text-decoration-color: #3b82f6 !important;
        }
        .active-tool-strikethrough ::selection {
          background-color: rgba(239, 68, 68, 0.2) !important;
          text-decoration: line-through !important;
          text-decoration-color: #ef4444 !important;
        }
        .active-tool-editText ::selection {
          background-color: rgba(79, 70, 229, 0.3) !important;
        }

        .edit-pdf-workspace-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 70px);
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: var(--bg-primary);
        }
        
        .pdf-editor-shell {
          display: flex;
          flex: 1;
          width: 100%;
          overflow: hidden;
          position: relative;
        }

        .pdf-left-sidebar {
          width: 180px;
          border-right: 1px solid var(--color-border);
          background-color: var(--bg-secondary);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 1.25rem 0.75rem;
          gap: 1.25rem;
          animation: slideInLeft 0.2s ease-out;
        }

        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }

        .pdf-thumb-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--bg-primary);
          padding: 0.6rem;
          border-radius: 10px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }

        .pdf-thumb-card:hover {
          border-color: var(--color-border);
        }

        .pdf-thumb-card.active {
          border-color: var(--color-green);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
        }

        .pdf-thumb-img {
          width: 100%;
          height: auto;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          margin-bottom: 0.5rem;
        }

        .pdf-center-workspace {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background-color: var(--bg-primary);
          position: relative;
        }

        .pdf-editor-toolbar {
          height: 64px;
          border-bottom: 1px solid var(--color-border);
          background-color: var(--bg-secondary);
          display: flex;
          align-items: center;
          padding: 0 1.25rem;
          gap: 1rem;
          z-index: 10;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }

        .tab-toggle-container {
          display: flex;
          background-color: var(--bg-tertiary);
          padding: 3px;
          border-radius: 30px;
          border: 1px solid var(--color-border);
        }

        .tab-toggle-btn {
          padding: 0.4rem 1.2rem;
          border-radius: 30px;
          border: none;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          color: var(--text-secondary);
          background: transparent;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s ease;
        }

        .tab-toggle-btn.active {
          background-color: var(--bg-secondary);
          color: var(--text-primary);
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        }

        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .section-divider {
          width: 1px;
          height: 24px;
          background-color: var(--color-border);
          margin: 0 0.5rem;
        }

        .tool-btn, .prop-btn {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tool-btn:hover, .prop-btn:hover {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .tool-btn.active, .prop-btn.active {
          background-color: var(--color-green);
          color: #ffffff;
        }

        .pdf-canvas-viewer {
          flex: 1;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          position: relative;
          outline: none;
        }

        /* Floating bottom navigation pill */
        .pdf-floating-navigator {
          position: absolute;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(30, 41, 59, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f1f5f9;
          border-radius: 50px;
          padding: 0.5rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
          border: 1px solid rgba(255, 255, 255, 0.15);
          z-index: 50;
          transition: opacity 0.3s ease;
        }

        .nav-pill-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .nav-pill-btn:hover {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.1);
        }

        .nav-pill-btn:disabled {
          color: #475569;
          cursor: not-allowed;
        }

        .nav-page-input {
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: white;
          width: 36px;
          text-align: center;
          font-size: 0.85rem;
          padding: 0.2rem 0;
          font-weight: 600;
        }

        .pdf-right-sidebar {
          width: 300px;
          border-left: 1px solid var(--color-border);
          background-color: var(--bg-secondary);
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          gap: 1.5rem;
          overflow-y: auto;
        }

        .layers-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          overflow-y: auto;
        }

        .layer-item {
          display: flex;
          align-items: center;
          background-color: var(--bg-primary);
          padding: 0.75rem;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          cursor: pointer;
          gap: 0.6rem;
          transition: all 0.2s ease;
        }

        .layer-item:hover {
          border-color: var(--text-muted);
        }

        .layer-item.active {
          border-color: var(--color-green);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .layer-title {
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .layer-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .layer-action-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-tertiary);
        }

        /* Styling Sidebar Properties Panel */
        .property-title {
          font-size: 0.875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .prop-row {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-bottom: 1.25rem;
        }

        .prop-flex-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .prop-select-full {
          width: 100%;
          background-color: var(--bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 0.5rem;
          font-size: 0.9rem;
          color: var(--text-primary);
          outline: none;
        }

        .style-btns-group {
          display: flex;
          background-color: var(--bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 2px;
          width: fit-content;
        }

        .style-toggle-btn {
          width: 34px;
          height: 34px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-weight: bold;
          font-size: 0.9rem;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .style-toggle-btn:hover {
          background-color: var(--bg-tertiary);
        }

        .style-toggle-btn.active {
          background-color: var(--color-green);
          color: #ffffff;
        }

        .swatch-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .swatch-circle:hover {
          transform: scale(1.1);
        }

        .swatch-circle.active {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }

        .custom-color-add {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px dashed var(--color-border);
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.2s ease;
        }

        .custom-color-add:hover {
          border-color: var(--text-muted);
          color: var(--text-primary);
        }

        .note-tooltip {
          position: absolute;
          bottom: 120%;
          left: 50%;
          transform: translateX(-50%);
          background: #1e293b;
          color: white;
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          font-size: 0.75rem;
          max-width: 180px;
          word-break: break-word;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          z-index: 100;
          box-shadow: 0 4px 14px rgba(0,0,0,0.15);
        }

        .note-bubble-wrapper:hover .note-tooltip {
          opacity: 1;
        }

        @media (max-width: 768px) {
          .pdf-left-sidebar {
            position: absolute;
            left: 0;
            top: 64px;
            bottom: 0;
            z-index: 100;
            width: 160px;
            box-shadow: 4px 0 15px rgba(0,0,0,0.15);
          }
          .pdf-right-sidebar {
            position: absolute;
            right: 0;
            top: 64px;
            bottom: 0;
            z-index: 100;
            width: 280px;
            box-shadow: -4px 0 15px rgba(0,0,0,0.15);
          }
          .pdf-canvas-viewer {
            padding: 1rem;
          }
          .pdf-editor-toolbar {
            overflow-x: auto;
            white-space: nowrap;
            padding: 0 0.5rem;
            gap: 0.5rem;
          }
        }
      `}</style>

      {/* Main Workspace Layout */}
      <div className="pdf-editor-shell">
        {(!files.length || downloadUrl || isLoading) && (
          <button 
            className="file-remove-btn" 
            style={{ 
              position: 'absolute', 
              top: '1rem', 
              left: '1rem', 
              width: 'auto', 
              height: 'auto', 
              borderRadius: '30px', 
              padding: '0.5rem 1rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              zIndex: 100, 
              background: 'var(--bg-secondary)', 
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--glass-shadow)',
              fontWeight: 600,
              fontSize: '0.85rem'
            }} 
            onClick={onBack}
          >
            <ArrowLeft size={16} /> Back to Tools
          </button>
        )}

        {!files.length ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Edit PDF Document</h2>
            <FileUpload
              accept="application/pdf"
              multiple={false}
              onFilesSelected={handleFilesSelected}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
            />
          </div>
        ) : downloadUrl ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#e2f0d9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#385723' }}>
              <FileCheck size={36} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>PDF Edited Successfully!</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={downloadUrl} download={`edited_${files[0]?.name}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                <Download size={18} /> Download PDF
              </a>
              <button className="btn btn-secondary" onClick={() => setDownloadUrl(null)}>
                Edit Again
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Loading document rendering framework...</p>
          </div>
        ) : (
          <>
            {/* 1. Left Sidebar page previews */}
            {showLeftSidebar && (
              <div className="pdf-left-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', overflowY: 'auto' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleAddBlankPageAtStart}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center', borderRadius: '8px' }}
                >
                  <Plus size={14} /> Add Blank Page
                </button>
                
                {pageOrder.map((origIdx, listIdx) => {
                  const isSelected = pageIndex === listIdx;
                  return (
                    <div 
                      key={listIdx} 
                      className={`pdf-thumb-card ${isSelected ? 'active' : ''}`}
                      onClick={() => setPageIndex(listIdx)}
                      style={{ 
                        position: 'relative',
                        padding: '0.4rem',
                        border: isSelected ? '1px solid var(--color-green)' : '1px solid var(--color-border)',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255,255,255,0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      {origIdx === -1 ? (
                        <div style={{ width: '80px', height: '110px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
                          Blank Page
                        </div>
                      ) : (
                        <img 
                          src={pageThumbnails[origIdx]} 
                          className="pdf-thumb-img" 
                          alt={`Page ${listIdx + 1}`} 
                          style={{ 
                            width: '80px', 
                            height: 'auto', 
                            borderRadius: '4px',
                            transform: `rotate(${rotations[origIdx] || 0}deg)`,
                            transition: 'transform 0.2s ease'
                          }}
                        />
                      )}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Page {listIdx + 1}</span>

                      {/* Operations row below thumbnail */}
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem', width: '100%' }}>
                        <button 
                          onClick={(e) => handleRotatePage(listIdx, e)}
                          disabled={origIdx === -1}
                          title="Rotate 90°"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: origIdx === -1 ? 'default' : 'pointer', color: origIdx === -1 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                        >
                          <RotateCw size={12} />
                        </button>
                        <button 
                          onClick={(e) => handleMovePageUp(listIdx, e)}
                          disabled={listIdx === 0}
                          title="Move Up"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: listIdx === 0 ? 'default' : 'pointer', color: listIdx === 0 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button 
                          onClick={(e) => handleMovePageDown(listIdx, e)}
                          disabled={listIdx === pageOrder.length - 1}
                          title="Move Down"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: listIdx === pageOrder.length - 1 ? 'default' : 'pointer', color: listIdx === pageOrder.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button 
                          onClick={(e) => handleDuplicatePage(listIdx, e)}
                          title="Duplicate Page"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          <Plus size={12} />
                        </button>
                        <button 
                          onClick={(e) => handleInsertBlankPage(listIdx, e)}
                          title="Insert Blank After"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          <FileCheck size={12} />
                        </button>
                        <button 
                          onClick={(e) => handleDeletePage(listIdx, e)}
                          disabled={pageOrder.length <= 1}
                          title="Delete Page"
                          style={{ padding: '2px', background: 'transparent', border: 'none', cursor: pageOrder.length <= 1 ? 'default' : 'pointer', color: pageOrder.length <= 1 ? 'var(--text-muted)' : '#ef4444' }}
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. Central Canvas Area */}
            <div className="pdf-center-workspace">
              <div className="pdf-editor-toolbar">
                <button 
                  className="tool-btn" 
                  onClick={onBack}
                  title="Back to Tools"
                  style={{ marginRight: '0.25rem', width: 'auto', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  <ArrowLeft size={16} /> Back
                </button>
 
                <span className="section-divider" style={{ margin: '0 0.25rem' }}></span>
 
                {/* Left: Toggle Sidebar + Tab Selection */}
                <button 
                  className={`tool-btn ${showLeftSidebar ? 'active' : ''}`} 
                  onClick={() => setShowLeftSidebar(!showLeftSidebar)} 
                  title="Toggle Thumbnails"
                  style={{ marginRight: '0.5rem' }}
                >
                  <Columns size={18} />
                </button>
 
                {mode === 'edit' ? (
                  <div className="tab-toggle-container">
                    <button 
                      className={`tab-toggle-btn ${activeTab === 'annotate' ? 'active' : ''}`} 
                      onClick={() => { setActiveTab('annotate'); setActiveTool('hand'); }}
                    >
                      <Pencil size={14} /> Annotate
                    </button>
                    <button 
                      className={`tab-toggle-btn ${activeTab === 'edit' ? 'active' : ''}`} 
                      onClick={() => { setActiveTab('edit'); setActiveTool('hand'); }}
                    >
                      <Settings size={14} /> Edit 😃
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', marginRight: '0.5rem' }}>
                    <Sparkles size={16} style={{ color: 'var(--color-green)' }} /> PDF Form Designer
                  </div>
                )}

                <span className="section-divider"></span>

                {/* Center: Contextual Tools */}
                <div className="toolbar-section">
                  {/* Common Hand tool */}
                  <button 
                    className={`tool-btn ${activeTool === 'hand' ? 'active' : ''}`} 
                    onClick={() => setActiveTool('hand')} 
                    title="Hand / Drag"
                  >
                    <Move size={18} />
                  </button>

                  {mode === 'forms' ? (
                    <>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('text')} 
                        title="Add Text Field"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <Type size={16} /> Text
                      </button>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('checkbox')} 
                        title="Add Checkbox Field"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <FileCheck size={16} /> Checkbox
                      </button>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('dropdown')} 
                        title="Add Dropdown Field"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <Columns size={16} /> Dropdown
                      </button>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('radio')} 
                        title="Add Radio Option"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <Circle size={16} /> Radio
                      </button>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('date')} 
                        title="Add Date Field"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <FileCheck size={16} /> Date
                      </button>
                      <button 
                        className="tool-btn" 
                        onClick={() => handleAddField('signature')} 
                        title="Add Signature Field"
                        style={{ fontSize: '0.8rem', padding: '0 0.5rem', width: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}
                      >
                        <Pencil size={16} /> Signature
                      </button>
                      
                      <span className="section-divider"></span>
                      
                      <button 
                        className="btn btn-secondary" 
                        onClick={handleAutoDetectFields} 
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: '6px' }}
                      >
                        <Sparkles size={14} style={{ marginRight: '0.25rem' }} /> Auto Scan Fields
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Annotate tab tools */}
                      {activeTab === 'annotate' && (
                        <>
                          <button 
                            className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('text')} 
                            title="Add Text"
                          >
                            <Type size={18} />
                          </button>
                          <button 
                            className="tool-btn" 
                            onClick={() => fileInputRef.current?.click()} 
                            title="Add Image"
                          >
                            <ImageIcon size={18} />
                            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'pencil' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('pencil')} 
                            title="Draw Freehand"
                          >
                            <Pencil size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'shape-rect' ? 'active' : ''}`} 
                            onClick={() => { setActiveTool('shape-rect'); addShape('rectangle'); }} 
                            title="Add Rectangle"
                          >
                            <Square size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'shape-circle' ? 'active' : ''}`} 
                            onClick={() => { setActiveTool('shape-circle'); addShape('circle'); }} 
                            title="Add Circle"
                          >
                            <Circle size={18} />
                          </button>
                        </>
                      )}

                      {/* Edit tab tools */}
                      {activeTab === 'edit' && (
                        <>
                          <button 
                            className={`tool-btn ${activeTool === 'editText' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('editText')} 
                            title="Edit Page Text"
                          >
                            <Edit3 size={18} />
                          </button>
                          <span className="section-divider" style={{ margin: '0 0.25rem' }}></span>

                          {/* Sub-annotations group */}
                          <button 
                            className={`tool-btn ${activeTool === 'highlight' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('highlight')} 
                            title="Highlight Text"
                          >
                            <Highlighter size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'underline' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('underline')} 
                            title="Underline Text"
                          >
                            <UnderlineIcon size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'strikethrough' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('strikethrough')} 
                            title="Through-line Text"
                          >
                            <Scissors size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'note' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('note')} 
                            title="Add Sticky Note"
                          >
                            <MessageSquare size={18} />
                          </button>
                          <button 
                            className={`tool-btn ${activeTool === 'callout' ? 'active' : ''}`} 
                            onClick={() => setActiveTool('callout')} 
                            title="Add Callout Box"
                          >
                            <HelpCircle size={18} />
                          </button>
                          
                          {/* Insert Image in edit mode */}
                          <button 
                            className="tool-btn" 
                            onClick={() => insertFileInputRef.current?.click()} 
                            title="Insert Image Overlay"
                          >
                            <Plus size={18} />
                            <input type="file" ref={insertFileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                          </button>

                          {/* Shapes */}
                          <button 
                            className="tool-btn" 
                            onClick={() => addShape('rectangle')} 
                            title="Insert Shape Rectangle"
                          >
                            <Square size={16} />
                          </button>
                          <button 
                            className="tool-btn" 
                            onClick={() => addShape('circle')} 
                            title="Insert Shape Circle"
                          >
                            <Circle size={16} />
                          </button>
                          <button 
                            className="tool-btn" 
                            onClick={() => addShape('line')} 
                            title="Insert Shape Line"
                          >
                            <GripVertical size={16} style={{ transform: 'rotate(90deg)' }} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Render Canvas & interactive overlay */}
              <div 
                ref={viewerRef}
                className={`pdf-canvas-viewer active-tool-${activeTool}`}
                onMouseDown={handleViewerMouseDown}
                onMouseMove={handleViewerMouseMove}
                onMouseUp={handleViewerMouseUp}
                onMouseLeave={handleViewerMouseUp}
                style={{ cursor: activeTool === 'hand' ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
              >
                <div 
                  ref={pageContainerRef}
                  onClick={handlePageClick}
                  onMouseUp={handlePageMouseUp}
                  style={{ 
                    position: 'relative', 
                    width: `${containerSize.width}px`, 
                    height: `${containerSize.height}px`,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

                  {/* Transparent text layer for selection */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 2,
                      pointerEvents: ['editText', 'highlight', 'underline', 'strikethrough'].includes(activeTool) ? 'auto' : 'none',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      MozUserSelect: 'text',
                      msUserSelect: 'text'
                    }}
                  >
                    {pageTextContent
                      .filter(item => {
                        // Hide if covered by a locked mask shape or edited text annotation
                        return !annotations.some(ann => {
                          if (ann.page !== pageIndex) return false;
                          if (ann.type !== 'text' && !(ann.type === 'shape' && ann.locked)) return false;
                          
                          const itemRight = item.left + item.width;
                          const itemBottom = item.top + item.height;
                          const annRight = ann.x + ann.width;
                          const annBottom = ann.y + ann.height;

                          const xOverlap = Math.max(0, Math.min(itemRight, annRight) - Math.max(item.left, ann.x));
                          const yOverlap = Math.max(0, Math.min(itemBottom, annBottom) - Math.max(item.top, ann.y));
                          const overlapArea = xOverlap * yOverlap;
                          const itemArea = item.width * item.height;

                          return (overlapArea / itemArea) > 0.3;
                        });
                      })
                      .map((item, idx) => (
                        <div
                          key={idx}
                          onClick={(e) => handleTextItemClick(e, item)}
                          style={{
                            position: 'absolute',
                            left: `${item.left}%`,
                            top: `${item.top}%`,
                            width: `${item.width}%`,
                            height: `${item.height}%`,
                            fontSize: `${item.fontSize}px`,
                            fontFamily: 'sans-serif',
                            color: 'transparent',
                            whiteSpace: 'pre',
                            pointerEvents: 'auto',
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                            transformOrigin: 'top left',
                            lineHeight: 1,
                            cursor: activeTool === 'editText' ? 'text' : 'inherit'
                          }}
                        >
                          {item.str}
                        </div>
                      ))}
                  </div>

                  {/* SVG drawing layer */}
                  <svg 
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      pointerEvents: 'none',
                      zIndex: 3
                    }}
                  >
                    {annotations
                      .filter(ann => ann.page === pageIndex && ann.type === 'drawing')
                      .map(ann => (
                        <g key={ann.id} style={{ opacity: ann.opacity }}>
                          {ann.paths?.map((stroke, sIdx) => (
                            <path
                              key={sIdx}
                              d={stroke.map((p, pIdx) => `${pIdx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                              fill="none"
                              stroke={ann.color || '#000000'}
                              strokeWidth={(ann.borderWidth || 2) * (100 / Math.max(1, containerSize.width))}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))}
                        </g>
                      ))}
                  </svg>

                  {/* Elements interactive wrapper */}
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      zIndex: 4,
                      pointerEvents: 'none'
                    }}
                  >
                    {annotations
                      .filter(ann => ann.page === pageIndex && ann.type !== 'drawing')
                      .map(ann => {
                        const isSelected = selectedId === ann.id;
                        return (
                          <div
                            key={ann.id}
                            className="annotation-item"
                            data-annotation-id={ann.id}
                            onMouseDown={(e) => handleMouseDown(e, ann)}
                            style={{
                              position: 'absolute',
                              left: `${ann.x}%`,
                              top: `${ann.y}%`,
                              width: `${ann.width}%`,
                              height: `${ann.height}%`,
                              border: isSelected ? '2px dashed var(--color-green)' : (ann.locked ? 'none' : '1px transparent solid'),
                              cursor: ann.locked ? 'default' : (activeTool === 'hand' ? 'grab' : 'move'),
                              opacity: ann.opacity !== undefined ? ann.opacity : 1,
                              boxSizing: 'border-box',
                              userSelect: 'none',
                              zIndex: isSelected ? 50 : 10,
                              pointerEvents: ann.locked ? 'none' : 'auto'
                            }}
                          >
                            {/* Render Text Element */}
                            {ann.type === 'text' && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  color: ann.color || '#000000',
                                  backgroundColor: ann.bgColor || 'transparent',
                                  fontFamily: ann.fontFamily || 'Arial',
                                  fontSize: `${ann.fontSize || 18}px`,
                                  fontWeight: ann.bold ? 'bold' : 'normal',
                                  fontStyle: ann.italic ? 'italic' : 'normal',
                                  textDecoration: `${ann.underline ? 'underline' : ''} ${ann.strikethrough ? 'line-through' : ''}`.trim() || 'none',
                                  textAlign: (ann.alignment as any) || 'left',
                                  padding: '4px',
                                  boxSizing: 'border-box',
                                  overflow: 'hidden',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTextId(ann.id);
                                }}
                              >
                                {editingTextId === ann.id ? (
                                  <textarea
                                    value={ann.text || ''}
                                    autoFocus
                                    onChange={(e) => {
                                      setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, text: e.target.value } : a));
                                    }}
                                    onBlur={() => setEditingTextId(null)}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      border: 'none',
                                      outline: 'none',
                                      background: 'transparent',
                                      color: 'inherit',
                                      fontFamily: 'inherit',
                                      fontSize: 'inherit',
                                      fontWeight: 'inherit',
                                      fontStyle: 'inherit',
                                      resize: 'none',
                                    }}
                                  />
                                ) : (
                                  ann.text || 'Double click to edit text'
                                )}
                              </div>
                            )}

                            {/* Render Shape Element */}
                            {ann.type === 'shape' && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  boxSizing: 'border-box',
                                  border: ann.shapeType === 'line' ? 'none' : (ann.color ? `${ann.borderWidth || 2}px solid ${ann.color}` : 'none'),
                                  borderRadius: ann.shapeType === 'circle' ? '50%' : '0',
                                  backgroundColor: ann.bgColor || 'transparent',
                                  position: 'relative'
                                }}
                              >
                                {ann.shapeType === 'line' && (
                                  <div 
                                    style={{
                                      width: '100%',
                                      height: `${ann.borderWidth || 2}px`,
                                      backgroundColor: ann.color || '#000000',
                                      position: 'absolute',
                                      top: '50%',
                                      left: 0,
                                      transform: 'translateY(-50%)'
                                    }}
                                  />
                                )}
                              </div>
                            )}

                            {/* Render Highlight Overlay */}
                            {ann.type === 'highlight' && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: ann.bgColor || '#fef08a',
                                  opacity: 0.35
                                }}
                              />
                            )}

                            {/* Render Stand-alone Underline / Strikethrough segment */}
                            {(ann.type === 'underline' || ann.type === 'strikethrough') && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: ann.type === 'underline' ? 'flex-end' : 'center'
                                }}
                              >
                                <div
                                  style={{
                                    width: '100%',
                                    height: `${ann.borderWidth || 2}px`,
                                    backgroundColor: ann.color || '#3b82f6'
                                  }}
                                />
                              </div>
                            )}

                            {/* Render Sticky Note */}
                            {ann.type === 'note' && (
                              <div
                                className="note-bubble-wrapper"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: ann.bgColor || '#fef08a',
                                  border: `2px solid ${ann.color || '#ee6c4d'}`,
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                                  position: 'relative'
                                }}
                              >
                                <MessageSquare size={12} style={{ color: ann.color || '#ee6c4d' }} />
                                {ann.noteContent && (
                                  <div className="note-tooltip">
                                    {ann.noteContent}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Render Callout Box */}
                            {ann.type === 'callout' && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: ann.bgColor || '#ffffff',
                                  border: `${ann.borderWidth || 2}px solid ${ann.color || '#ee6c4d'}`,
                                  borderRadius: '8px',
                                  padding: '6px',
                                  boxSizing: 'border-box',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'center',
                                  color: ann.color || '#000000',
                                  fontFamily: ann.fontFamily || 'Arial',
                                  fontSize: `${ann.fontSize || 12}px`,
                                  fontWeight: ann.bold ? 'bold' : 'normal',
                                  fontStyle: ann.italic ? 'italic' : 'normal',
                                  textDecoration: `${ann.underline ? 'underline' : ''} ${ann.strikethrough ? 'line-through' : ''}`.trim() || 'none',
                                  textAlign: (ann.alignment as any) || 'left',
                                  overflow: 'hidden',
                                  wordBreak: 'break-word'
                                }}
                              >
                                {ann.text || 'Callout Note'}
                              </div>
                            )}

                            {/* Render Image Element */}
                            {ann.type === 'image' && ann.imageBytes && (
                              <img
                                src={ann.imageBytes}
                                alt={ann.imageName || 'Overlay'}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'fill',
                                  pointerEvents: 'none',
                                  borderRadius: `${ann.borderRadius || 0}%`,
                                  border: ann.borderWidth ? `${ann.borderWidth}px solid ${ann.color || '#000000'}` : 'none'
                                }}
                              />
                            )}

                            {/* Render Interactive Form Field */}
                            {ann.type === ('formField' as any) && (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  border: `2px solid ${isSelected ? 'var(--color-green)' : '#3b82f6'}`,
                                  borderRadius: ann.fieldType === 'checkbox' ? '4px' : ann.fieldType === 'radio' ? '50%' : '6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#1e3a8a',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                  padding: '2px',
                                  boxSizing: 'border-box',
                                  overflow: 'hidden',
                                  textAlign: 'center',
                                  cursor: activeTool === 'hand' ? 'grab' : 'move'
                                }}
                              >
                                <div style={{ fontSize: '0.55rem', opacity: 0.85, textTransform: 'uppercase' }}>
                                  {ann.fieldType}
                                </div>
                                <div style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', width: '100%' }}>
                                  {ann.fieldName}
                                </div>
                              </div>
                            )}

                            {/* Corner Resizing Handles */}
                            {isSelected && (
                              <>
                                <div
                                  className="resize-handle"
                                  onMouseDown={(e) => handleMouseDown(e, ann, 'nw')}
                                  style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--color-green)', border: '1px solid white', cursor: 'nwse-resize', zIndex: 60 }}
                                />
                                <div
                                  className="resize-handle"
                                  onMouseDown={(e) => handleMouseDown(e, ann, 'ne')}
                                  style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--color-green)', border: '1px solid white', cursor: 'nesw-resize', zIndex: 60 }}
                                />
                                <div
                                  className="resize-handle"
                                  onMouseDown={(e) => handleMouseDown(e, ann, 'se')}
                                  style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--color-green)', border: '1px solid white', cursor: 'nwse-resize', zIndex: 60 }}
                                />
                                <div
                                  className="resize-handle"
                                  onMouseDown={(e) => handleMouseDown(e, ann, 'sw')}
                                  style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--color-green)', border: '1px solid white', cursor: 'nesw-resize', zIndex: 60 }}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Draw pencil overlay */}
                  {activeTool === 'pencil' && (
                    <canvas
                      ref={drawingCanvasRef}
                      onMouseDown={handleDrawingMouseDown}
                      onMouseMove={handleDrawingMouseMove}
                      onMouseUp={handleDrawingMouseUp}
                      onMouseLeave={handleDrawingMouseUp}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 20,
                        cursor: 'crosshair',
                        background: 'transparent'
                      }}
                      width={containerSize.width}
                      height={containerSize.height}
                    />
                  )}
                </div>
              </div>

              {/* Floating Bottom Navigator */}
              <div className="pdf-floating-navigator">
                <button 
                  className="nav-pill-btn" 
                  disabled={pageIndex === 0} 
                  onClick={() => setPageIndex(pageIndex - 1)}
                >
                  <ChevronUp size={18} style={{ transform: 'rotate(-90deg)' }} />
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  <input 
                    type="text" 
                    value={pageIndex + 1} 
                    readOnly 
                    className="nav-page-input"
                  /> 
                  <span style={{ color: '#64748b' }}>/</span> 
                  <span>{numPages}</span>
                </div>

                <button 
                  className="nav-pill-btn" 
                  disabled={pageIndex === numPages - 1} 
                  onClick={() => setPageIndex(pageIndex + 1)}
                >
                  <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                </button>

                <div style={{ width: '1px', height: '20px', background: '#334155' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <button className="nav-pill-btn" onClick={() => setZoom(z => Math.max(30, z - 10))}>
                    <ZoomOut size={16} />
                  </button>
                  <span style={{ fontSize: '0.8rem', width: '36px', textAlign: 'center', fontWeight: 600 }}>{zoom}%</span>
                  <button className="nav-pill-btn" onClick={() => setZoom(z => Math.min(200, z + 10))}>
                    <ZoomIn size={16} />
                  </button>
                </div>

                <button className="nav-pill-btn" onClick={() => setZoom(60)} title="Fit Page">
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>

            {/* 3. Right Sidebar Properties Panel */}
            <div className="pdf-right-sidebar">
              {selectedAnn ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <h3 className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Properties</span>
                    <button className="layer-action-btn" onClick={() => deleteAnnotation(selectedAnn.id)} style={{ color: '#ef4444' }}>
                      <Trash size={16} />
                    </button>
                  </h3>

                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {/* TEXT STYLES SIDEBAR PANEL */}
                    {(selectedAnn.type === 'text' || selectedAnn.type === 'callout') && (
                      <div>
                        <div className="property-title">Text Styles</div>
                        
                        <div className="prop-row">
                          <select 
                            value={selectedAnn.fontFamily || 'Arial'} 
                            onChange={(e) => updateSelectedAnnotation({ fontFamily: e.target.value })}
                            className="prop-select-full"
                          >
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Courier New">Courier New</option>
                          </select>
                        </div>

                        <div className="prop-row">
                          <select 
                            value={selectedAnn.fontSize || 18} 
                            onChange={(e) => updateSelectedAnnotation({ fontSize: Number(e.target.value) })}
                            className="prop-select-full"
                          >
                            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].map(sz => (
                              <option key={sz} value={sz}>{sz}px</option>
                            ))}
                          </select>
                        </div>

                        <div className="prop-row">
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <div className="style-btns-group">
                              <button 
                                className={`style-toggle-btn ${selectedAnn.bold ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ bold: !selectedAnn.bold })}
                                title="Bold"
                              >
                                B
                              </button>
                              <button 
                                className={`style-toggle-btn ${selectedAnn.italic ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ italic: !selectedAnn.italic })}
                                title="Italic"
                                style={{ fontStyle: 'italic' }}
                              >
                                I
                              </button>
                              <button 
                                className={`style-toggle-btn ${selectedAnn.underline ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ underline: !selectedAnn.underline })}
                                title="Underline"
                                style={{ textDecoration: 'underline' }}
                              >
                                U
                              </button>
                              <button 
                                className={`style-toggle-btn ${selectedAnn.strikethrough ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ strikethrough: !selectedAnn.strikethrough })}
                                title="Strikethrough"
                                style={{ textDecoration: 'line-through' }}
                              >
                                S
                              </button>
                            </div>

                            <div className="style-btns-group">
                              <button 
                                className={`style-toggle-btn ${selectedAnn.alignment === 'left' || !selectedAnn.alignment ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ alignment: 'left' })}
                                title="Align Left"
                              >
                                <AlignLeft size={16} />
                              </button>
                              <button 
                                className={`style-toggle-btn ${selectedAnn.alignment === 'center' ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ alignment: 'center' })}
                                title="Align Center"
                              >
                                <AlignCenter size={16} />
                              </button>
                              <button 
                                className={`style-toggle-btn ${selectedAnn.alignment === 'right' ? 'active' : ''}`}
                                onClick={() => updateSelectedAnnotation({ alignment: 'right' })}
                                title="Align Right"
                              >
                                <AlignRight size={16} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="prop-row">
                          <button 
                            className={`btn btn-secondary ${selectedAnn.link ? 'active' : ''}`}
                            onClick={() => {
                              const url = prompt('Enter hyperlink URL:', selectedAnn.link || '');
                              if (url !== null) {
                                updateSelectedAnnotation({ link: url || undefined });
                              }
                            }}
                            style={{ width: '100%', padding: '0.4rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                          >
                            <LinkIcon size={14} /> Link {selectedAnn.link ? 'Set' : 'Address'}
                          </button>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Current Color</div>
                          <div className="prop-flex-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                            {allColors.map(color => (
                              <div 
                                key={color}
                                className={`swatch-circle ${selectedAnn.color === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                  setCurrentColor(color);
                                  updateSelectedAnnotation({ color });
                                }}
                              >
                                {selectedAnn.color === color && <Check size={12} style={{ color: color === '#ffffff' ? '#000' : '#fff' }} />}
                              </div>
                            ))}
                            
                            <button 
                              className="custom-color-add" 
                              onClick={() => {
                                const customInput = document.createElement('input');
                                customInput.type = 'color';
                                customInput.onchange = (e: any) => {
                                  const val = e.target.value;
                                  setCustomColors(prev => [...prev, val]);
                                  setCurrentColor(val);
                                  updateSelectedAnnotation({ color: val });
                                };
                                customInput.click();
                              }}
                              title="Add Custom Color"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Background Fill</div>
                          <div className="prop-flex-row">
                            <input 
                              type="color" 
                              value={selectedAnn.bgColor || '#ffffff'} 
                              onChange={(e) => updateSelectedAnnotation({ bgColor: e.target.value })}
                              style={{ width: '36px', height: '36px', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}
                            />
                            {selectedAnn.bgColor && (
                              <button 
                                className="btn btn-secondary" 
                                onClick={() => updateSelectedAnnotation({ bgColor: undefined })}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                              >
                                Clear Fill
                              </button>
                            )}
                          </div>
                        </div>

                        {selectedAnn.type === 'callout' && (
                          <div className="prop-row">
                            <div className="property-title">Callout Text content</div>
                            <textarea
                              value={selectedAnn.text || ''}
                              onChange={(e) => updateSelectedAnnotation({ text: e.target.value })}
                              className="prop-select-full"
                              style={{ height: '60px', resize: 'vertical', fontFamily: 'sans-serif' }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* IMAGE STYLES PANEL */}
                    {selectedAnn.type === 'image' && (
                      <div>
                        <div className="property-title">Image Settings</div>

                        <div className="prop-row">
                          <div className="property-title">Opacity</div>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="1" 
                            step="0.05"
                            value={selectedAnn.opacity !== undefined ? selectedAnn.opacity : 1} 
                            onChange={(e) => {
                              setCurrentOpacity(Number(e.target.value));
                              updateSelectedAnnotation({ opacity: Number(e.target.value) });
                            }}
                            style={{ width: '100%' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{Math.round((selectedAnn.opacity || 1) * 100)}%</span>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Shape (Corner Radius)</div>
                          <input 
                            type="range" 
                            min="0" 
                            max="50" 
                            value={selectedAnn.borderRadius || 0} 
                            onChange={(e) => updateSelectedAnnotation({ borderRadius: Number(e.target.value) })}
                            style={{ width: '100%' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedAnn.borderRadius || 0}%</span>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Border Thickness</div>
                          <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            value={selectedAnn.borderWidth || 0} 
                            onChange={(e) => {
                              setCurrentThickness(Number(e.target.value));
                              updateSelectedAnnotation({ borderWidth: Number(e.target.value) });
                            }}
                            style={{ width: '100%' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedAnn.borderWidth || 0}px</span>
                        </div>

                        {Number(selectedAnn.borderWidth) > 0 && (
                          <div className="prop-row">
                            <div className="property-title">Border Color</div>
                            <div className="prop-flex-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                              {allColors.map(color => (
                                <div 
                                  key={color}
                                  className={`swatch-circle ${selectedAnn.color === color ? 'active' : ''}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateSelectedAnnotation({ color })}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SHAPES / DRAWINGS PANEL */}
                    {(selectedAnn.type === 'shape' || selectedAnn.type === 'drawing' || selectedAnn.type === 'highlight' || selectedAnn.type === 'underline' || selectedAnn.type === 'strikethrough') && (
                      <div>
                        <div className="property-title">Shape Settings</div>

                        <div className="prop-row">
                          <div className="property-title">Line Color</div>
                          <div className="prop-flex-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                            {allColors.map(color => (
                              <div 
                                key={color}
                                className={`swatch-circle ${selectedAnn.color === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => updateSelectedAnnotation({ color })}
                              />
                            ))}
                          </div>
                        </div>

                        {selectedAnn.type !== 'drawing' && selectedAnn.type !== 'underline' && selectedAnn.type !== 'strikethrough' && (
                          <div className="prop-row">
                            <div className="property-title">Fill / Background</div>
                            <input 
                              type="color" 
                              value={selectedAnn.bgColor || '#ffffff'} 
                              onChange={(e) => updateSelectedAnnotation({ bgColor: e.target.value })}
                              style={{ width: '36px', height: '36px', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}
                            />
                          </div>
                        )}

                        {selectedAnn.type !== 'highlight' && (
                          <div className="prop-row">
                            <div className="property-title">Border / Line Thickness</div>
                            <input 
                              type="range" 
                              min="1" 
                              max="10" 
                              value={selectedAnn.borderWidth || 2} 
                              onChange={(e) => updateSelectedAnnotation({ borderWidth: Number(e.target.value) })}
                              style={{ width: '100%' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedAnn.borderWidth || 2}px</span>
                          </div>
                        )}

                        <div className="prop-row">
                          <div className="property-title">Opacity</div>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="1" 
                            step="0.05"
                            value={selectedAnn.opacity !== undefined ? selectedAnn.opacity : 1} 
                            onChange={(e) => updateSelectedAnnotation({ opacity: Number(e.target.value) })}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* STICKY NOTES PANEL */}
                    {selectedAnn.type === 'note' && (
                      <div>
                        <div className="property-title">Sticky Note Settings</div>

                        <div className="prop-row">
                          <div className="property-title">Comment Note Content</div>
                          <textarea
                            value={selectedAnn.noteContent || ''}
                            onChange={(e) => updateSelectedAnnotation({ noteContent: e.target.value })}
                            className="prop-select-full"
                            style={{ height: '100px', resize: 'vertical', fontFamily: 'sans-serif' }}
                          />
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Note Icon Theme Color</div>
                          <div className="prop-flex-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                            {allColors.map(color => (
                              <div 
                                key={color}
                                className={`swatch-circle ${selectedAnn.color === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => updateSelectedAnnotation({ color })}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Note Background</div>
                          <input 
                            type="color" 
                            value={selectedAnn.bgColor || '#ffffff'} 
                            onChange={(e) => updateSelectedAnnotation({ bgColor: e.target.value })}
                            style={{ width: '36px', height: '36px', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* INTERACTIVE FORM FIELDS PANEL */}
                    {selectedAnn.type === ('formField' as any) && (
                      <div>
                        <div className="property-title" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.4rem', marginBottom: '0.75rem', color: 'var(--color-green)', fontWeight: 600 }}>Field Settings</div>

                        <div className="prop-row">
                          <div className="property-title">Field Name (Unique ID)</div>
                          <input 
                            type="text" 
                            value={selectedAnn.fieldName || ''} 
                            onChange={(e) => updateSelectedAnnotation({ fieldName: e.target.value })}
                            className="prop-select-full"
                            style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          />
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Input Type</div>
                          <select 
                            value={selectedAnn.fieldType || 'text'} 
                            onChange={(e) => updateSelectedAnnotation({ fieldType: e.target.value as any })}
                            className="prop-select-full"
                            style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          >
                            <option value="text">Text Box</option>
                            <option value="checkbox">Checkbox</option>
                            <option value="dropdown">Dropdown Options</option>
                            <option value="radio">Radio Option</option>
                            <option value="date">Date Picker</option>
                            <option value="signature">Signature Area</option>
                          </select>
                        </div>

                        <div className="prop-row">
                          <div className="property-title">Default Value</div>
                          <input 
                            type="text" 
                            value={selectedAnn.fieldValue || ''} 
                            onChange={(e) => updateSelectedAnnotation({ fieldValue: e.target.value })}
                            className="prop-select-full"
                            style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          />
                        </div>

                        {selectedAnn.fieldType === 'dropdown' && (
                          <div className="prop-row">
                            <div className="property-title">Options (Comma separated)</div>
                            <textarea
                              value={selectedAnn.fieldOptions ? selectedAnn.fieldOptions.join(', ') : ''}
                              onChange={(e) => updateSelectedAnnotation({ fieldOptions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                              className="prop-select-full"
                              style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', height: '70px', resize: 'vertical' }}
                              placeholder="Option 1, Option 2, Option 3"
                            />
                          </div>
                        )}

                        {selectedAnn.fieldType === 'radio' && (
                          <>
                            <div className="prop-row">
                              <div className="property-title">Radio Group Name</div>
                              <input 
                                type="text" 
                                value={selectedAnn.fieldGroup || ''} 
                                onChange={(e) => updateSelectedAnnotation({ fieldGroup: e.target.value })}
                                className="prop-select-full"
                                style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <div className="prop-row">
                              <div className="property-title">Radio Option Export Value</div>
                              <input 
                                type="text" 
                                value={selectedAnn.fieldOptionName || ''} 
                                onChange={(e) => updateSelectedAnnotation({ fieldOptionName: e.target.value })}
                                className="prop-select-full"
                                style={{ padding: '0.45rem', border: '1px solid var(--color-border)', borderRadius: '6px', width: '100%', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                              />
                            </div>
                          </>
                        )}

                        <div className="prop-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <input 
                            type="checkbox" 
                            id="fieldRequired"
                            checked={!!selectedAnn.fieldRequired} 
                            onChange={(e) => updateSelectedAnnotation({ fieldRequired: e.target.checked })}
                            style={{ cursor: 'pointer' }}
                          />
                          <label htmlFor="fieldRequired" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>Required Field</label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar Undo/Redo Navigation */}
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: '1rem 0 0.5rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: 'auto' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="prop-btn" 
                        disabled={historyStep <= 0} 
                        onClick={handleUndo}
                        title="Undo"
                      >
                        <Undo size={16} />
                      </button>
                      <button 
                        className="prop-btn" 
                        disabled={historyStep >= history.length - 1} 
                        onClick={handleRedo}
                        title="Redo"
                      >
                        <Redo size={16} />
                      </button>
                    </div>

                    <button className="btn btn-secondary" onClick={() => setSelectedId(null)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}>
                      Close Panel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="panel-title" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    {mode === 'forms' ? 'Form Fields Manager' : 'Layers Management'}
                  </h3>

                  {mode === 'forms' && (
                    <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', padding: '2px', backgroundColor: 'var(--bg-primary)', marginBottom: '1rem' }}>
                      <button 
                        onClick={() => setFillMode('single')}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '8px',
                          backgroundColor: fillMode === 'single' ? 'var(--color-green)' : 'transparent',
                          color: fillMode === 'single' ? '#ffffff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Interactive Fill
                      </button>
                      <button 
                        onClick={() => setFillMode('batch')}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '8px',
                          backgroundColor: fillMode === 'batch' ? 'var(--color-green)' : 'transparent',
                          color: fillMode === 'batch' ? '#ffffff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Batch Fill
                      </button>
                    </div>
                  )}
                  
                  {mode === 'forms' && fillMode === 'batch' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1, overflowY: 'auto' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.12)', borderRadius: '10px', lineHeight: 1.4 }}>
                        Upload a CSV or Excel spreadsheet to generate filled PDFs in bulk. Map form fields to column headers.
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Data File (CSV or Excel)</label>
                        <input 
                          type="file" 
                          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                          onChange={handleDataFileChange}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            fontSize: '0.8rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        />
                        {dataFile && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Selected: {dataFile.name}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.25rem' }}>Field Mapping</h4>
                        {annotations.filter(ann => ann.type === 'formField').map(field => (
                          <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {field.fieldName} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({field.fieldType})</span>
                            </div>
                            <select 
                              value={fieldMapping[field.fieldName || ''] || ''}
                              onChange={(e) => setFieldMapping(prev => ({ ...prev, [field.fieldName || '']: e.target.value }))}
                              style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--text-primary)', outline: 'none' }}
                            >
                              <option value="">-- Ignore (Don't Fill) --</option>
                              {dataHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                        {annotations.filter(ann => ann.type === 'formField').length === 0 && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>
                            No interactive form fields found. Use the top "Auto Scan" button or manually add some fields.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.12)', borderRadius: '10px', lineHeight: 1.4 }}>
                        {mode === 'forms' 
                          ? 'Configure form field properties by clicking on them. Drag to move, or resize by dragging boundaries.' 
                          : 'Reorder layers using bring forward/backward buttons. Double click a text element on the canvas to edit.'}
                      </div>

                      <div className="layers-list">
                        {annotations
                          .filter(ann => ann.page === pageIndex)
                          .map((ann) => (
                            <div 
                              key={ann.id}
                              className={`layer-item ${selectedId === ann.id ? 'active' : ''}`}
                              onClick={() => setSelectedId(ann.id)}
                            >
                              <GripVertical size={14} style={{ color: 'var(--text-muted)' }} />
                              
                              <div className="layer-title">
                                {ann.type === 'text' && `Text: "${ann.text?.slice(0, 15)}..."`}
                                {ann.type === 'shape' && `Shape (${ann.shapeType})`}
                                {ann.type === 'image' && `Image: ${ann.imageName?.slice(0, 15) || 'Overlay'}`}
                                {ann.type === 'drawing' && 'Pencil sketch'}
                                {ann.type === 'highlight' && 'Highlight area'}
                                {ann.type === 'underline' && 'Text underline'}
                                {ann.type === 'strikethrough' && 'Strikethrough line'}
                                {ann.type === 'note' && `Note: "${ann.noteContent?.slice(0, 10)}..."`}
                                {ann.type === 'callout' && `Callout: "${ann.text?.slice(0, 10)}..."`}
                                {ann.type === ('formField' as any) && `Form Field: ${ann.fieldName || 'field'}`}
                              </div>

                              <button 
                                className="layer-action-btn"
                                onClick={(e) => { e.stopPropagation(); bringToFront(ann.id); }}
                                title="Bring forward"
                              >
                                <ChevronUp size={14} />
                              </button>
                              
                              <button 
                                className="layer-action-btn"
                                onClick={(e) => { e.stopPropagation(); sendToBack(ann.id); }}
                                title="Send backward"
                              >
                                <ChevronDown size={14} />
                              </button>

                              <button 
                                className="layer-action-btn"
                                onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                                style={{ color: '#ef4444' }}
                                title="Delete layer"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          ))}

                        {annotations.filter(ann => ann.page === pageIndex).length === 0 && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
                            No layers on this page yet.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* General Undo/Redo Navigation */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem', marginTop: 'auto' }}>
                    <button 
                      className="prop-btn" 
                      style={{ flex: 1 }}
                      disabled={historyStep <= 0} 
                      onClick={handleUndo}
                      title="Undo"
                    >
                      <Undo size={16} style={{ marginRight: '0.2rem' }} /> Undo
                    </button>
                    <button 
                      className="prop-btn" 
                      style={{ flex: 1 }}
                      disabled={historyStep >= history.length - 1} 
                      onClick={handleRedo}
                      title="Redo"
                    >
                      <Redo size={16} style={{ marginRight: '0.2rem' }} /> Redo
                    </button>
                  </div>

                  {mode === 'edit' ? (
                    <button 
                      className="btn btn-primary"
                      onClick={handleSaveChanges}
                      disabled={isProcessing}
                      style={{ width: '100%', gap: '0.6rem', padding: '0.85rem', borderRadius: '30px', backgroundColor: 'var(--color-green)', marginTop: '0.5rem' }}
                    >
                      <Sparkles size={18} /> Save changes
                    </button>
                  ) : fillMode === 'batch' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <input 
                          type="checkbox" 
                          id="flattenForm" 
                          checked={flatten} 
                          onChange={(e) => setFlatten(e.target.checked)} 
                          style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="flattenForm" style={{ cursor: 'pointer', margin: 0 }}>Flatten Form Fields (burn values)</label>
                      </div>
                      <button 
                        className="btn btn-primary"
                        onClick={handleBatchFillForms}
                        disabled={isProcessing || !dataFile || annotations.filter(ann => ann.type === 'formField').length === 0}
                        style={{ width: '100%', gap: '0.6rem', padding: '0.85rem', borderRadius: '30px', backgroundColor: 'var(--color-green)' }}
                      >
                        <Sparkles size={18} /> Run Batch & Download
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <input 
                          type="checkbox" 
                          id="flattenForm" 
                          checked={flatten} 
                          onChange={(e) => setFlatten(e.target.checked)} 
                          style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="flattenForm" style={{ cursor: 'pointer', margin: 0 }}>Flatten Form Fields (burn values)</label>
                      </div>
                      <button 
                        className="btn btn-primary"
                        onClick={handleSaveForm}
                        disabled={isProcessing}
                        style={{ width: '100%', gap: '0.6rem', padding: '0.85rem', borderRadius: '30px', backgroundColor: 'var(--color-green)' }}
                      >
                        <Sparkles size={18} /> Save & Download Form
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {isProcessing && (
        <ProgressBar progress={progress} message="Generating and saving your custom PDF..." />
      )}
    </div>
  );
};

export default EditPdf;
