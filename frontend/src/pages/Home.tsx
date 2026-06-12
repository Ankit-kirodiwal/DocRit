import React, { useState, useEffect } from 'react';
import { 
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
  Eye, 
  Layers,
  Trash,
  Download,
  Shuffle,
  Wrench,
  Crop,
  FileImage,
  Files,
  EyeOff,
  PenTool,
  FormInput
} from 'lucide-react';

interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  iconBgDark: string;
}

interface Category {
  title: string;
  badgeClass: string;
  tools: ToolItem[];
}

interface HomeProps {
  onSelectTool: (toolId: string) => void;
}

const Home: React.FC<HomeProps> = ({ onSelectTool }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Sync with theme changes to render proper icon backgrounds
  useEffect(() => {
    const checkTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      setIsDarkMode(currentTheme === 'dark');
    };
    checkTheme();
    
    // Set up mutation observer to listen for theme changes on html element
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => observer.disconnect();
  }, []);

  const CATEGORIES: Category[] = [
    {
      title: 'Organize PDF',
      badgeClass: 'cat-organize',
      tools: [
        {
          id: 'merge',
          name: 'Merge PDF',
          description: 'Combine multiple PDFs into a single unified file in your preferred sequence.',
          icon: <Layers size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#be123c',
          iconBg: '#fff1f2',
          iconBgDark: 'rgba(225, 29, 72, 0.15)'
        },
        {
          id: 'split',
          name: 'Split PDF',
          description: 'Extract specific page ranges or save all pages as separate, individual documents.',
          icon: <Scissors size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#be123c',
          iconBg: '#fff1f2',
          iconBgDark: 'rgba(225, 29, 72, 0.15)'
        },
        {
          id: 'remove_pages',
          name: 'Remove Pages',
          description: 'Delete unnecessary pages from your PDF file with precision in seconds.',
          icon: <Trash size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#be123c',
          iconBg: '#fff1f2',
          iconBgDark: 'rgba(225, 29, 72, 0.15)'
        },
        {
          id: 'extract_pages',
          name: 'Extract Pages',
          description: 'Pull individual pages out of a PDF document to form a new standalone file.',
          icon: <Download size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#be123c',
          iconBg: '#fff1f2',
          iconBgDark: 'rgba(225, 29, 72, 0.15)'
        },
        {
          id: 'organize',
          name: 'Organize PDF',
          description: 'Reorder, delete, or rotate pages to structure your document layout perfectly.',
          icon: <Shuffle size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#be123c',
          iconBg: '#fff1f2',
          iconBgDark: 'rgba(225, 29, 72, 0.15)'
        }
      ]
    },
    {
      title: 'Optimize PDF',
      badgeClass: 'cat-optimize',
      tools: [
        {
          id: 'compress',
          name: 'Compress PDF',
          description: 'Reduce file size using streamlined stream dictionary optimization.',
          icon: <FileArchive size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#047857',
          iconBg: '#ecfdf5',
          iconBgDark: 'rgba(16, 185, 129, 0.15)'
        },
        {
          id: 'repair',
          name: 'Repair PDF',
          description: 'Fix corrupt PDF structures, fixing dictionary indices and header offsets.',
          icon: <Wrench size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#047857',
          iconBg: '#ecfdf5',
          iconBgDark: 'rgba(16, 185, 129, 0.15)'
        },
        {
          id: 'ocr',
          name: 'OCR PDF',
          description: 'Recognize scanned document text to generate searchable text overlays instantly.',
          icon: <Sparkles size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#047857',
          iconBg: '#ecfdf5',
          iconBgDark: 'rgba(16, 185, 129, 0.15)'
        }
      ]
    },
    {
      title: 'Convert to PDF',
      badgeClass: 'cat-convert-to',
      tools: [
        {
          id: 'jpg_to_pdf',
          name: 'JPG to PDF',
          description: 'Convert JPG or PNG layout templates to formatted PDFs with custom margins.',
          icon: <ImageIcon size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#1d4ed8',
          iconBg: '#eff6ff',
          iconBgDark: 'rgba(59, 130, 246, 0.15)'
        },
        {
          id: 'word_to_pdf',
          name: 'Word to PDF',
          description: 'Convert DOCX manuscripts or documentation templates into clean static PDFs.',
          icon: <FileText size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#1d4ed8',
          iconBg: '#eff6ff',
          iconBgDark: 'rgba(59, 130, 246, 0.15)'
        },
        {
          id: 'powerpoint_to_pdf',
          name: 'PowerPoint to PDF',
          description: 'Pack slides and deck templates directly into vector PDF documents ready for use.',
          icon: <Presentation size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#1d4ed8',
          iconBg: '#eff6ff',
          iconBgDark: 'rgba(59, 130, 246, 0.15)'
        },
        {
          id: 'excel_to_pdf',
          name: 'Excel to PDF',
          description: 'Transform worksheets or spreadsheets containing data sets into ready-made PDF sheets.',
          icon: <FileSpreadsheet size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#1d4ed8',
          iconBg: '#eff6ff',
          iconBgDark: 'rgba(59, 130, 246, 0.15)'
        },
        {
          id: 'html_to_pdf',
          name: 'HTML to PDF',
          description: 'Convert web page layouts or HTML code blocks directly into PDF file templates.',
          icon: <FileCode size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#1d4ed8',
          iconBg: '#eff6ff',
          iconBgDark: 'rgba(59, 130, 246, 0.15)'
        }
      ]
    },
    {
      title: 'Convert from PDF',
      badgeClass: 'cat-convert-from',
      tools: [
        {
          id: 'pdf_to_jpg',
          name: 'PDF to JPG',
          description: 'Extract pages out of a PDF document as high-resolution JPG image sequences.',
          icon: <FileImage size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#c2410c',
          iconBg: '#fff7ed',
          iconBgDark: 'rgba(249, 115, 22, 0.15)'
        },
        {
          id: 'pdf_to_word',
          name: 'PDF to Word',
          description: 'Reflow PDF document content directly back into easy-to-edit Word files.',
          icon: <FileText size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#c2410c',
          iconBg: '#fff7ed',
          iconBgDark: 'rgba(249, 115, 22, 0.15)'
        },
        {
          id: 'pdf_to_powerpoint',
          name: 'PDF to PowerPoint',
          description: 'Convert slides and charts back into fully fluid PowerPoint slide decks.',
          icon: <Presentation size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#c2410c',
          iconBg: '#fff7ed',
          iconBgDark: 'rgba(249, 115, 22, 0.15)'
        },
        {
          id: 'pdf_to_excel',
          name: 'PDF to Excel',
          description: 'Extract structured tables from document sheets directly into Excel workbook formats.',
          icon: <FileSpreadsheet size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#c2410c',
          iconBg: '#fff7ed',
          iconBgDark: 'rgba(249, 115, 22, 0.15)'
        },
        {
          id: 'pdf_to_pdfa',
          name: 'PDF to PDF/A',
          description: 'Convert your PDFs safely to standard archive-compliant ISO PDF/A formats.',
          icon: <Files size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#c2410c',
          iconBg: '#fff7ed',
          iconBgDark: 'rgba(249, 115, 22, 0.15)'
        }
      ]
    },
    {
      title: 'Edit PDF',
      badgeClass: 'cat-edit',
      tools: [
        {
          id: 'rotate',
          name: 'Rotate PDF',
          description: 'Rotate individual pages 90°, 180°, or 270° and write permanent layouts.',
          icon: <RotateCw size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        },
        {
          id: 'page_numbers',
          name: 'Page Numbers',
          description: 'Apply custom format page counts to page headers, centers, or margins.',
          icon: <Hash size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        },
        {
          id: 'watermark',
          name: 'Add Watermark',
          description: 'Stamp opacity text like "Confidential" or client codes on document pages.',
          icon: <Stamp size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        },
        {
          id: 'crop_pdf',
          name: 'Crop PDF',
          description: 'Trim canvas margins and define precise crop bounding boxes dynamically.',
          icon: <Crop size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        },
        {
          id: 'edit_pdf',
          name: 'Edit PDF',
          description: 'Overlay custom texts or shape layers on PDF documents inside the browser.',
          icon: <Sparkles size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        },
        {
          id: 'pdf_forms',
          name: 'PDF Forms',
          description: 'Interactively fill forms, checkboxes, and text form control values completely.',
          icon: <FormInput size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#6b21a8',
          iconBg: '#f5f3ff',
          iconBgDark: 'rgba(139, 92, 246, 0.15)'
        }
      ]
    },
    {
      title: 'PDF Security',
      badgeClass: 'cat-security',
      tools: [
        {
          id: 'unlock',
          name: 'Unlock PDF',
          description: 'Strip standard user password protection from document streams permanently.',
          icon: <Unlock size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#334155',
          iconBg: '#f8fafc',
          iconBgDark: 'rgba(100, 116, 139, 0.15)'
        },
        {
          id: 'protect',
          name: 'Protect PDF',
          description: 'Secure documents using AES streams or standard user owner protection passwords.',
          icon: <Lock size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#334155',
          iconBg: '#f8fafc',
          iconBgDark: 'rgba(100, 116, 139, 0.15)'
        },
        {
          id: 'sign_pdf',
          name: 'Sign PDF',
          description: 'Scribble electronic signatures using digital signature pads and overlay layouts.',
          icon: <PenTool size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#334155',
          iconBg: '#f8fafc',
          iconBgDark: 'rgba(100, 116, 139, 0.15)'
        },
        {
          id: 'redact_pdf',
          name: 'Redact PDF',
          description: 'Apply permanent black-box redactions over sensitive text keywords.',
          icon: <EyeOff size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#334155',
          iconBg: '#f8fafc',
          iconBgDark: 'rgba(100, 116, 139, 0.15)'
        },
        {
          id: 'compare_pdf',
          name: 'Compare PDF',
          description: 'Examine layout structures and metadata metrics of two documents in split views.',
          icon: <Eye size={15} style={{ strokeWidth: '2.2px' }} />,
          iconColor: '#334155',
          iconBg: '#f8fafc',
          iconBgDark: 'rgba(100, 116, 139, 0.15)'
        }
      ]
    }
  ];

  // Filter tools based on search query
  const filteredCategories = CATEGORIES.map((category) => {
    const filteredTools = category.tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...category, tools: filteredTools };
  }).filter((category) => category.tools.length > 0);

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
          width: '100%',
          maxWidth: '500px',
          margin: '0 auto 1.5rem',
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
              width: '100%',
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
      </div>

      {/* Categorized structured columns layout */}
      <div className="welcome-grid-container">
        <div className="categories-columns">
          {filteredCategories.map((category) => (
            <div key={category.title} className="category-column">
              {/* Category Header */}
              <div className="category-header">
                <span className={`category-badge ${category.badgeClass}`}>
                  {category.title}
                </span>
              </div>

              {/* Category Tool Items Stacked */}
              <div className="tools-stack">
                {category.tools.map((tool) => (
                  <div
                    key={tool.id}
                    onClick={() => onSelectTool(tool.id)}
                    id={`tool-card-${tool.id}`}
                    className="tool-list-card"
                    title={tool.description}
                  >
                    <div 
                      className="tool-list-card-icon"
                      style={{ 
                        backgroundColor: isDarkMode ? tool.iconBgDark : tool.iconBg,
                        color: tool.iconColor
                      }}
                    >
                      {tool.icon}
                    </div>
                    <div className="tool-list-card-info">
                      <h4>{tool.name}</h4>
                      <p>{tool.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Extra Secure Agency Banner */}
        <div className="agency-secure-banner">
          <div className="agency-secure-banner-content">
            <h4>Sovereign & Confidential Local Processing</h4>
            <p>
              Designed exclusively for private agencies where client briefs, patient logs, and financial records 
              must be safeguarded. Zero files are uploaded to any external server — keeping data entirely pristine, compliant, and sovereign.
            </p>
          </div>
          <div className="agency-secure-banner-badge">
            <span className="label">Processing Mode</span>
            <span className="value">
              <span className="value-dot"></span>
              100% Local Sandbox
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
