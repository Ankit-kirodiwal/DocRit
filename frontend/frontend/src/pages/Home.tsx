import React, { useState } from 'react';
import { 
  Merge, 
  Scissors, 
  FileArchive, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  Image as ImageIcon, 
  RotateCw, 
  Lock, 
  Unlock, 
  Stamp, 
  Search, 
  Hash, 
  Sparkles, 
  FileCode, 
  AlertCircle, 
  Eye, 
  ScissorsLineDashed, 
  Layers,
  Trash,
  Download
} from 'lucide-react';

interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: 'organize' | 'optimize' | 'convert' | 'edit' | 'security' | 'workflows';
  icon: React.ReactNode;
  iconBg: string;
  functional: boolean;
  isNew?: boolean;
}

interface HomeProps {
  onSelectTool: (toolId: string) => void;
}

const Home: React.FC<HomeProps> = ({ onSelectTool }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedDummyTool, setSelectedDummyTool] = useState<string>('');

  const tools: ToolItem[] = [
    {
      id: 'merge',
      name: 'Merge PDF',
      description: 'Combine PDFs in the order you want with the easiest PDF merger available.',
      category: 'organize',
      icon: <Merge size={24} />,
      iconBg: '#EE6C4D',
      functional: true,
    },
    {
      id: 'split',
      name: 'Split PDF',
      description: 'Separate one page or a whole set for easy conversion into independent PDF files.',
      category: 'organize',
      icon: <Scissors size={24} />,
      iconBg: '#EE6C4D',
      functional: true,
    },
    {
      id: 'compress',
      name: 'Compress PDF',
      description: 'Reduce file size while optimizing for maximal PDF quality.',
      category: 'optimize',
      icon: <FileArchive size={24} />,
      iconBg: '#8FBC5D',
      functional: true,
    },
    {
      id: 'pdf_to_word',
      name: 'PDF to Word',
      description: 'Easily convert your PDF files into easy to edit DOC and DOCX documents.',
      category: 'convert',
      icon: <FileText size={24} />,
      iconBg: '#5F83C6',
      functional: true,
    },
    {
      id: 'pdf_to_powerpoint',
      name: 'PDF to PowerPoint',
      description: 'Turn your PDF files into easy to edit PPT and PPTX slideshows.',
      category: 'convert',
      icon: <Presentation size={24} />,
      iconBg: '#FF7651',
      functional: true,
    },
    {
      id: 'pdf_to_excel',
      name: 'PDF to Excel',
      description: 'Pull data straight from PDFs into Excel spreadsheets in a few short seconds.',
      category: 'convert',
      icon: <FileSpreadsheet size={24} />,
      iconBg: '#5EA162',
      functional: true,
    },
    {
      id: 'ocr',
      name: 'OCR PDF / Image',
      description: 'Extract text from scanned PDF files and images using Tesseract OCR.',
      category: 'convert',
      icon: <Sparkles size={24} />,
      iconBg: '#5ea18b',
      functional: true,
    },
    {
      id: 'word_to_pdf',
      name: 'Word to PDF',
      description: 'Make DOC and DOCX files easy to read by converting them to PDF.',
      category: 'convert',
      icon: <FileText size={24} />,
      iconBg: '#295795',
      functional: true,
    },
    {
      id: 'powerpoint_to_pdf',
      name: 'PowerPoint to PDF',
      description: 'Make PPT and PPTX slideshows easy to view by converting them to PDF.',
      category: 'convert',
      icon: <Presentation size={24} />,
      iconBg: '#D04526',
      functional: true,
    },
    {
      id: 'excel_to_pdf',
      name: 'Excel to PDF',
      description: 'Make EXCEL spreadsheets easy to read by converting them to PDF.',
      category: 'convert',
      icon: <FileSpreadsheet size={24} />,
      iconBg: '#2E7237',
      functional: true,
    },
    {
      id: 'edit_pdf',
      name: 'Edit PDF',
      description: 'Add text, images, shapes or freehand annotations to a PDF document.',
      category: 'edit',
      icon: <Sparkles size={24} />,
      iconBg: '#ab6993',
      functional: true,
    },
    {
      id: 'pdf_to_jpg',
      name: 'PDF to JPG',
      description: 'Convert each PDF page into a JPG or extract all images contained in a PDF.',
      category: 'convert',
      icon: <ImageIcon size={24} />,
      iconBg: '#D6BF2D',
      functional: true,
    },
    {
      id: 'jpg_to_pdf',
      name: 'JPG to PDF',
      description: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.',
      category: 'convert',
      icon: <ImageIcon size={24} />,
      iconBg: '#B7A001',
      functional: true,
    },
    {
      id: 'sign_pdf',
      name: 'Sign PDF',
      description: 'Sign yourself or request electronic signatures from others.',
      category: 'security',
      icon: <Stamp size={24} />,
      iconBg: '#4A7AAB',
      functional: true,
    },
    {
      id: 'watermark',
      name: 'Watermark',
      description: 'Stamp an image or text over your PDF in seconds. Choose typography, transparency and position.',
      category: 'edit',
      icon: <Stamp size={24} />,
      iconBg: '#AB6993',
      functional: true,
    },
    {
      id: 'rotate',
      name: 'Rotate PDF',
      description: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
      category: 'edit',
      icon: <RotateCw size={24} />,
      iconBg: '#AB6993',
      functional: true,
    },
    {
      id: 'html_to_pdf',
      name: 'HTML to PDF',
      description: 'Convert webpages in HTML to PDF. Copy and paste the URL of the page you want.',
      category: 'convert',
      icon: <FileCode size={24} />,
      iconBg: '#d6bf2d',
      functional: true,
    },
    {
      id: 'unlock',
      name: 'Unlock PDF',
      description: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
      category: 'security',
      icon: <Unlock size={24} />,
      iconBg: '#4a7aab',
      functional: true,
    },
    {
      id: 'protect',
      name: 'Protect PDF',
      description: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.',
      category: 'security',
      icon: <Lock size={24} />,
      iconBg: '#4A7AAB',
      functional: true,
    },
    {
      id: 'organize',
      name: 'Organize PDF',
      description: 'Sort pages of your PDF file however you like. Delete PDF pages or add PDF pages to your document.',
      category: 'organize',
      icon: <Layers size={24} />,
      iconBg: '#ee6c4d',
      functional: true,
    },
    {
      id: 'remove_pages',
      name: 'Remove PDF Pages',
      description: 'Delete unwanted pages from your PDF file and download the remaining pages.',
      category: 'organize',
      icon: <Trash size={24} />,
      iconBg: '#ea4335',
      functional: true,
    },
    {
      id: 'extract_pages',
      name: 'Extract PDF Pages',
      description: 'Select and download only the specific pages you need from a PDF document.',
      category: 'organize',
      icon: <Download size={24} />,
      iconBg: '#ee6c4d',
      functional: true,
    },
    {
      id: 'pdf_to_pdfa',
      name: 'PDF to PDF/A',
      description: 'Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving.',
      category: 'convert',
      icon: <FileText size={24} />,
      iconBg: '#4A7AAB',
      functional: true,
    },
    {
      id: 'repair',
      name: 'Repair PDF',
      description: 'Repair a damaged PDF and recover data from corrupt PDF. Fix PDF files with our Repair tool.',
      category: 'optimize',
      icon: <AlertCircle size={24} />,
      iconBg: '#8FBC5D',
      functional: true,
    },
    {
      id: 'page_numbers',
      name: 'Page Numbers',
      description: 'Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.',
      category: 'edit',
      icon: <Hash size={24} />,
      iconBg: '#AB6993',
      functional: true,
    },
    {
      id: 'compare_pdf',
      name: 'Compare PDF',
      description: 'Show a side-by-side document comparison and easily spot changes between different file versions.',
      category: 'security',
      icon: <Eye size={24} />,
      iconBg: '#4A7AAB',
      functional: true,
    },
    {
      id: 'redact_pdf',
      name: 'Redact PDF',
      description: 'Redact text and graphics to permanently remove sensitive information from a PDF.',
      category: 'security',
      icon: <ScissorsLineDashed size={24} />,
      iconBg: '#4A7AAB',
      functional: true,
    },
    {
      id: 'crop_pdf',
      name: 'Crop PDF',
      description: 'Crop margins of PDF documents or select specific areas, then apply changes.',
      category: 'edit',
      icon: <Scissors size={24} />,
      iconBg: '#AB6993',
      functional: true,
    },
    {
      id: 'pdf_forms',
      name: 'PDF Forms',
      description: 'Detect form fields automatically, create interactive fillable PDFs, or fill PDF forms yourself.',
      category: 'edit',
      icon: <FileText size={24} />,
      iconBg: '#ab6993',
      functional: true,
      isNew: true
    }
  ];

  const handleCardClick = (tool: ToolItem) => {
    if (tool.functional) {
      onSelectTool(tool.id);
    } else {
      setSelectedDummyTool(tool.name);
      setShowModal(true);
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'organize', label: 'Organize PDF' },
    { id: 'optimize', label: 'Optimize PDF' },
    { id: 'convert', label: 'Convert PDF' },
    { id: 'edit', label: 'Edit PDF' },
    { id: 'security', label: 'PDF Security' }
  ];

  return (
    <div>
      <div className="hero-section">
        <h1 className="hero-title">Every tool you need to work with PDFs in one place</h1>
        <h2 className="hero-subtitle">
          Every tool you need to use PDFs, at your fingertips. All are 100% FREE and easy to use! Merge, split, compress, protect, watermark, and rotate PDFs with just a few clicks.
        </h2>

        {/* Search input with premium style */}
        <div style={{
          position: 'relative',
          maxWidth: '500px',
          margin: '0 auto 2.5rem',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search style={{
            position: 'absolute',
            left: '1.25rem',
            color: 'var(--text-muted)'
          }} size={20} />
          <input
            type="text"
            className="form-input"
            style={{
              paddingLeft: '3rem',
              borderRadius: '30px',
              height: '52px',
              fontSize: '1rem',
              boxShadow: 'var(--glass-shadow)',
              border: '1px solid var(--color-border)'
            }}
            placeholder="Search for tools (e.g. Merge, Protect, Watermark)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Categories filters */}
        <div className="filter-container">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`filter-tag ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of cards */}
      <div className="tools-grid">
        {filteredTools.map((tool) => (
          <div 
            key={tool.id} 
            className="tool-card"
            onClick={() => handleCardClick(tool)}
          >
            {tool.isNew && <span className="badge-new">New!</span>}
            <div>
              <div 
                className="tool-card-icon"
                style={{ backgroundColor: tool.iconBg }}
              >
                {tool.icon}
              </div>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: tool.functional ? 'var(--color-primary)' : 'var(--text-muted)'
            }}>
              <span>{tool.functional ? 'Fully Functional' : 'Coming Soon'}</span>
              <span>&rarr;</span>
            </div>
          </div>
        ))}
      </div>

      {/* Dummy Tool Under Construction Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          animation: 'fadeIn 0.3s'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '2.5rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            textAlign: 'center',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={(e) => e.stopPropagation()}>
            <Sparkles size={48} style={{ color: 'var(--color-coral)', marginBottom: '1.5rem' }} />
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{selectedDummyTool} is Coming Soon!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem' }}>
              We are working hard to build the most efficient full-stack experience for {selectedDummyTool}. 
              <br/><br/>
              In the meantime, you can explore our fully working operations like **Merge PDF, Split PDF, Compress PDF, Rotate PDF, Page Numbers, Watermark, JPG to PDF, or PDF to JPG**!
            </p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowModal(false)}
            >
              Back to Tools
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
