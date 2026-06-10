import os
import sys
import argparse
import subprocess
import glob
import fitz # PyMuPDF
import pandas as pd
import openpyxl
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement
from pptx.dml.color import RGBColor
from pdf2docx import Converter
import re

# ==========================================
# Monkey-patches to optimize pdf2docx layout
# ==========================================

# 1. Spans.restore patch to keep whitespace-only spans (prevent word-merging)
from pdf2docx.text.Spans import Spans
from pdf2docx.text.TextSpan import TextSpan
from pdf2docx.image.ImageSpan import ImageSpan

def _patched_spans_restore(self, raws: list):
    for raw_span in raws:
        if 'image' in raw_span:
            span = ImageSpan(raw_span)
        else:
            span = TextSpan(raw_span)
            if not span.text and not span.style:
                span = None
        self.append(span)
    return self

Spans.restore = _patched_spans_restore

# 2. RawPage.parse_section patch to refine multi-column detection thresholds
from pdf2docx.page.RawPage import RawPage
from pdf2docx.common.Collection import Collection

def _patched_parse_section(self, **settings):
    X0, Y0, X1, _ = self.working_bbox

    # collect all blocks (line level) and shapes
    elements = Collection()
    elements.extend(self.blocks)
    elements.extend(self.shapes.text_style_shapes)
    if not elements: return []

    # to create section with collected lines
    lines = Collection()
    sections = []
    def close_section(num_col, elements, y_ref):
        # append to last section if both single column
        if sections and sections[-1].num_cols==num_col==1:
            column = sections[-1][0]
            column.union_bbox(elements)
            column.add_elements(elements)
        # otherwise, create new section
        else:
            section = self._create_section(num_col, elements, (X0, X1), y_ref)
            if section:
                sections.append(section)

    # check section row by row
    pre_num_col = 1
    y_ref = Y0 # to calculate v-distance between sections
    for row in elements.group_by_rows():
        # check column col by col
        cols = row.group_by_columns()
        current_num_col = len(cols)

        # column check:
        # consider 2-cols only
        if current_num_col>2:
            current_num_col = 1

        # the width of two columns shouldn't have significant difference
        elif current_num_col==2:
            u0, v0, u1, v1 = cols[0].bbox
            m0, n0, m1, n1 = cols[1].bbox
            x0 = (u1+m0)/2.0
            c1, c2 = x0-X0, X1-x0 # column width
            w1, w2 = u1-u0, m1-m0 # line width
            f = 2.5 # patched from 2.0 to support short text in columns (e.g. Abstract)
            if not 1/f<=c1/c2<=f or w1/c1<0.1 or w2/c2<0.1: # patched from 0.33 to 0.1
                current_num_col = 1

        # process exceptions
        if pre_num_col==2 and current_num_col==1:
            # though current row has one single column, it might have another virtual
            # and empty column. If so, it should be counted as 2-cols
            cols = lines.group_by_columns()
            pos = cols[0].bbox[2]
            if row.bbox[2]<=pos or row.bbox[0]>pos:
                current_num_col = 2

            # pre_num_col!=current_num_col => to close section with collected lines,
            # before that, further check the height of collected lines
            else:
                x0, y0, x1, y1 = lines.bbox
                if y1-y0<settings['min_section_height']:
                    pre_num_col = 1

        elif pre_num_col==2 and current_num_col==2:
            # though both 2-cols, they don't align with each other
            combine = Collection(lines)
            combine.extend(row)
            if len(combine.group_by_columns(sorted=False))==1: current_num_col = 1

        # finalize pre-section if different from the column count of previous section
        if current_num_col!=pre_num_col:
            # process pre-section
            close_section(pre_num_col, lines, y_ref)
            if sections:
                y_ref = sections[-1][-1].bbox[3]

            # start potential new section
            lines = Collection(row)
            pre_num_col = current_num_col

        # otherwise, collect current lines for further processing
        else:
            lines.extend(row)

    # don't forget the final section
    close_section(current_num_col, lines, y_ref)

    return sections

RawPage.parse_section = _patched_parse_section


# Find Tesseract executable path on Windows
def find_tesseract():
    # Try PATH first
    try:
        subprocess.run(["tesseract", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return "tesseract"
    except FileNotFoundError:
        pass
    
    # Check common installation locations
    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Programs\Tesseract-OCR\tesseract.exe"),
        r"D:\Program Files\Tesseract-OCR\tesseract.exe"
    ]
    for p in common_paths:
        if os.path.exists(p):
            return p
    return None

def convert_pdf_to_docx(pdf_path, docx_path):
    print(f"Converting PDF to DOCX: {pdf_path} -> {docx_path}")
    
    # Preprocess the PDF first to replace complex vector graphs/charts with clean raster images
    temp_pdf_path = f"temp_preprocessed_{os.getpid()}.pdf"
    pdf_to_convert = pdf_path
    
    try:
        doc = fitz.open(pdf_path)
        has_changes = False
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            
            # Identify drawing blocks (clustered vector drawings)
            drawings = page.get_drawings()
            drawing_rects = []
            for d in drawings:
                r = d.get("rect")
                if r and not r.is_empty:
                    # Ignore large structural lines/frames
                    if r.width > 350 or r.height > 350:
                        continue
                    drawing_rects.append(r)
                    
            # Cluster drawing rects
            clusters = []
            for r in drawing_rects:
                merged = False
                for idx, c in enumerate(clusters):
                    test_c = fitz.Rect(c.x0 - 15, c.y0 - 15, c.x1 + 15, c.y1 + 15)
                    if test_c.intersects(r):
                        clusters[idx] = c | r
                        merged = True
                        break
                if not merged:
                    clusters.append(r)
                    
            changed = True
            while changed:
                changed = False
                i = 0
                while i < len(clusters):
                    j = i + 1
                    while j < len(clusters):
                        test_c = fitz.Rect(clusters[i].x0 - 15, clusters[i].y0 - 15, clusters[i].x1 + 15, clusters[i].y1 + 15)
                        if test_c.intersects(clusters[j]):
                            clusters[i] = clusters[i] | clusters[j]
                            clusters.pop(j)
                            changed = True
                        else:
                            j += 1
                    i += 1
                    
            # Get page dimensions and words to protect layout structures
            words = page.get_text("words")
            page_height = page.rect.height

            # Detect tables on the page to avoid rasterizing them
            table_rects = []
            try:
                tables = page.find_tables()
                if tables:
                    for t in tables:
                        if hasattr(t, "bbox"):
                            table_rects.append(fitz.Rect(t.bbox))
            except Exception as table_err:
                print(f"Table detection skipped: {table_err}")

            # Filter clusters to get valid graphic blocks
            graph_rects = []
            for c in clusters:
                c = c & page.rect
                if c.width > 20 and c.height > 20:
                    # 1. Skip header and footer zones (protects headers, footers, and page numbers)
                    if c.y1 < 75 or c.y0 > (page_height - 75):
                        continue

                    # 2. Avoid rasterizing any graphics that overlap with tables
                    is_table = False
                    for t_rect in table_rects:
                        if c.intersects(t_rect):
                            is_table = True
                            break
                    if is_table:
                        continue

                    # 3. Avoid rasterizing background shapes/watermarks that overlap with body text
                    # (Graphs only have short labels; body text has many characters)
                    overlapping_words = [w for w in words if fitz.Rect(w[:4]).intersects(c)]
                    total_char_len = sum(len(w[4]) for w in overlapping_words)
                    if total_char_len > 120:
                        continue

                    paths_in_cluster = [r for r in drawing_rects if c.contains(r)]
                    if len(paths_in_cluster) >= 5:
                        graph_rects.append(c)
                        
            # Replace graphs with high-quality PNGs
            for idx, g_rect in enumerate(graph_rects):
                pix = page.get_pixmap(clip=g_rect, dpi=300)
                graph_img_path = f"temp_pre_graph_{page_num}_{idx}_{os.getpid()}.png"
                pix.save(graph_img_path)
                
                # Redact the vector drawings in this area
                page.add_redact_annot(g_rect, fill=(1, 1, 1)) # fill with white
                page.apply_redactions()
                
                # Insert the rasterized image back in
                page.insert_image(g_rect, filename=graph_img_path)
                has_changes = True
                
                try:
                    os.remove(graph_img_path)
                except Exception:
                    pass
                    
        if has_changes:
            doc.save(temp_pdf_path)
            pdf_to_convert = temp_pdf_path
        doc.close()
        
    except Exception as err:
        print(f"Failed to preprocess PDF graphs: {err}. Proceeding with original PDF.")
        pdf_to_convert = pdf_path
        
    try:
        cv = Converter(pdf_to_convert)
        # Use default settings
        cv.convert(docx_path, start=0, end=None)
        cv.close()
    finally:
        if pdf_to_convert == temp_pdf_path and os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except Exception:
                pass

def convert_pdf_to_xlsx(pdf_path, xlsx_path):
    print(f"Converting PDF to XLSX: {pdf_path} -> {xlsx_path}")
    import pdfplumber
    from openpyxl.utils import get_column_letter
    from openpyxl.styles import Alignment
    import re

    # Detect if PDF has table borders (grid lines)
    is_bordered = False
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if pdf.pages:
                # If first page has horizontal/vertical lines that form a grid, we treat it as bordered
                first_page = pdf.pages[0]
                lines_count = len(first_page.lines) + len(first_page.rects)
                if lines_count > 10:
                    is_bordered = True
    except Exception as e:
        print(f"Failed to detect table border type: {e}")

    # Try extracting tables with tabula only if PDF has borders
    dfs = []
    if is_bordered:
        try:
            import tabula
            print("Running Tabula table extraction for bordered PDF...")
            dfs = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True)
        except Exception as e:
            print(f"Tabula failed or not installed: {e}. Falling back to pdfplumber...")
            dfs = []

    with pd.ExcelWriter(xlsx_path, engine='openpyxl') as writer:
        if dfs and len(dfs) > 0:
            try:
                # Concatenate all tables into a single DataFrame to put all data on a single sheet
                combined_df = pd.concat(dfs, ignore_index=True)
                combined_df.to_excel(writer, sheet_name="Extracted Tables", index=False)
                print(f"Successfully wrote combined tables extracted via Tabula.")
            except Exception as concat_err:
                print(f"Failed to concatenate Tabula tables: {concat_err}. Writing individually...")
                for i, df in enumerate(dfs):
                    sheet_name = f"Table {i+1}"[:30]
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
        else:
            # Fallback to pdfplumber table extraction
            print("Running pdfplumber table extraction...")
            all_rows = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        if table:
                            all_rows.extend(table)
            
            if all_rows:
                df = pd.DataFrame(all_rows)
                df.to_excel(writer, sheet_name="Extracted Tables", index=False, header=False)
                tables_found = True
            else:
                tables_found = False
            
            if not tables_found:
                # Text extraction fallback
                print("No tables found. Performing text layout extraction...")
                
                def split_merged_chunk(text, x0, x1):
                    # Check if age + date is merged: e.g. "3215/10/2017" or "32 15/10/2017"
                    date_match = re.match(r"^(\d+)\s*(\d{2}/\d{2}/\d{4})$", text)
                    if date_match:
                        age_str = date_match.group(1)
                        date_str = date_match.group(2)
                        total_len = len(text)
                        char_width = (x1 - x0) / total_len
                        chunk1 = {'text': age_str, 'x0': x0, 'x1': x0 + char_width * len(age_str)}
                        chunk2 = {'text': date_str, 'x0': chunk1['x1'], 'x1': x1}
                        return [chunk1, chunk2]
                        
                    # Check if serial number + name is merged: e.g. "1Dulce" or "1 Dulce"
                    name_match = re.match(r"^(\d+)\s+([A-Z][a-zA-Z]*)$", text)
                    if not name_match:
                        name_match = re.match(r"^(\d+)([A-Z][a-zA-Z]*)$", text)
                    if name_match:
                        serial_str = name_match.group(1)
                        name_str = name_match.group(2)
                        total_len = len(text)
                        char_width = (x1 - x0) / total_len
                        # Account for space offset if space is present
                        space_offset = 0
                        if ' ' in text:
                            space_offset = char_width
                        chunk1 = {'text': serial_str, 'x0': x0, 'x1': x0 + char_width * len(serial_str)}
                        chunk2 = {'text': name_str, 'x0': chunk1['x1'] + space_offset, 'x1': x1}
                        return [chunk1, chunk2]
                        
                    return [{'text': text, 'x0': x0, 'x1': x1}]

                lines = []
                gapped_starts = []
                header_row = None
                with pdfplumber.open(pdf_path) as pdf:
                    for page in pdf.pages:
                        words = page.extract_words()
                        if not words:
                            continue
                            
                        # Group words by top coordinate with tolerance of 3 points
                        lines_grouped = {}
                        for w in words:
                            top = w['top']
                            found = False
                            for t in lines_grouped:
                                if abs(t - top) < 3.0:
                                    lines_grouped[t].append(w)
                                    found = True
                                    break
                            if not found:
                                lines_grouped[top] = [w]
                                
                        sorted_tops = sorted(lines_grouped.keys())
                        
                        # 1. Pre-merge words on each line into continuous text chunks (golden gap < 3.0 points)
                        page_lines = []
                        for top in sorted_tops:
                            line_words = sorted(lines_grouped[top], key=lambda x: x['x0'])
                            chunks = []
                            if line_words:
                                curr_text = line_words[0]['text']
                                start_x = line_words[0]['x0']
                                prev_x1 = line_words[0]['x1']
                                
                                for w in line_words[1:]:
                                    gap = w['x0'] - prev_x1
                                    if gap < 3.0:
                                        curr_text += " " + w['text']
                                    else:
                                        splits = split_merged_chunk(curr_text, start_x, prev_x1)
                                        chunks.extend(splits)
                                        curr_text = w['text']
                                        start_x = w['x0']
                                    prev_x1 = w['x1']
                                splits = split_merged_chunk(curr_text, start_x, prev_x1)
                                chunks.extend(splits)
                            
                            # Final pass to ensure all merged tokens are split
                            final_chunks = []
                            for ch in chunks:
                                splits = split_merged_chunk(ch['text'], ch['x0'], ch['x1'])
                                final_chunks.extend(splits)
                                
                            page_lines.append((top, final_chunks))
                            for ch in final_chunks:
                                gapped_starts.append(ch['x0'])
                        
                        lines.append(page_lines)
                                
                # 2. Cluster chunk starts globally to find column coordinates
                clusters = []
                for x in sorted(gapped_starts):
                    added = False
                    for c in clusters:
                        if abs(c['values'][0] - x) < 2.0:
                            c['values'].append(x)
                            c['center'] = sum(c['values']) / len(c['values'])
                            added = True
                            break
                    if not added:
                        clusters.append({'center': x, 'values': [x]})
                        
                valid_cols = sorted([c['center'] for c in clusters])
                
                if not valid_cols:
                    valid_cols = [0.0]
                    
                # Compute boundaries
                boundaries = []
                for idx in range(len(valid_cols) - 1):
                    boundaries.append((valid_cols[idx] + valid_cols[idx+1]) / 2.0)
                    
                # 3. Assign chunks to cells using boundaries and perform header deduplication
                flat_rows = []
                for page_lines in lines:
                    for top, chunks in page_lines:
                        # Skip common page/sheet titles
                        if len(chunks) == 1 and chunks[0]['text'].strip().lower() in ['sheet1', 'sheet 1']:
                            continue
                            
                        cells = [""] * len(valid_cols)
                        for ch in chunks:
                            col_idx = len(valid_cols) - 1
                            for idx, b in enumerate(boundaries):
                                if ch['x0'] < b:
                                    col_idx = idx
                                    break
                            # Append instead of overwriting to prevent data loss
                            cells[col_idx] = f"{cells[col_idx]} {ch['text']}".strip() if cells[col_idx] else ch['text']
                            
                        if not header_row and any(cells):
                            header_row = cells
                            flat_rows.append(cells)
                        elif header_row and cells == header_row:
                            continue
                        else:
                            flat_rows.append(cells)
                            
                # 4. Merge adjacent mutually exclusive columns
                num_cols = len(valid_cols)
                j = 0
                while j < num_cols - 1:
                    can_merge = True
                    for row in flat_rows:
                        if row[j] != "" and row[j+1] != "":
                            can_merge = False
                            break
                    
                    if can_merge and (valid_cols[j+1] - valid_cols[j]) < 150.0:
                        for row in flat_rows:
                            if row[j+1] != "":
                                row[j] = row[j+1]
                        for row in flat_rows:
                            row.pop(j+1)
                        valid_cols.pop(j+1)
                        num_cols -= 1
                    else:
                        j += 1
                        
                if not flat_rows:
                    flat_rows = [["No text or tables found in PDF"]]
                df = pd.DataFrame(flat_rows)
                df.to_excel(writer, sheet_name="Extracted Text", index=False, header=False)

        # Auto-adjust column widths and apply numeric right indentation with spacing
        for sheet_name in writer.sheets:
            ws = writer.sheets[sheet_name]
            for col in ws.columns:
                max_len = 0
                for cell in col:
                    if cell.value is not None:
                        max_len = max(max_len, len(str(cell.value)))
                        # Apply right-alignment with indent=1 to numbers
                        is_numeric = isinstance(cell.value, (int, float))
                        if not is_numeric and isinstance(cell.value, str):
                            cleaned = cell.value.strip().replace(',', '')
                            if re.match(r'^-?\d+(\.\d+)?$', cleaned):
                                is_numeric = True
                        
                        if is_numeric:
                            cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='right', indent=1)
                        else:
                            cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left')
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = min(max(max_len + 5, 12), 30)

FONT_MAPPING = {
    "arialmt": "Arial",
    "arial": "Arial",
    "calibri": "Calibri",
    "timesnewromanpsmt": "Times New Roman",
    "timesnewroman": "Times New Roman",
    "times new roman": "Times New Roman",
    "courier": "Courier New",
    "couriernew": "Courier New",
    "helvetica": "Arial",
    "georgia": "Georgia",
    "verdana": "Verdana",
    "cambria": "Cambria",
    "tahoma": "Tahoma",
    "trebuchet": "Trebuchet MS",
    "lucida": "Lucida Sans"
}

def map_font(font_name):
    if not font_name:
        return "Arial"
    normalized = font_name.lower().replace("-", "").replace("bold", "").replace("italic", "").strip()
    return FONT_MAPPING.get(normalized, "Arial")

def convert_pdf_to_pptx(pdf_path, pptx_path):
    print(f"Converting PDF to PPTX (ultra-high-fidelity native): {pdf_path} -> {pptx_path}")
    import math
    
    prs = Presentation()
    doc = fitz.open(pdf_path)
    
    if len(doc) > 0:
        first_page = doc.load_page(0)
        rect = first_page.rect
        prs.slide_width = Inches(rect.width / 72.0)
        prs.slide_height = Inches(rect.height / 72.0)

    # Iterate through pages, adding background image and transparent editable text boxes
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_dict = page.get_text("dict")
        
        # Identify image blocks (type 1)
        image_blocks = []
        for block in page_dict.get("blocks", []):
            if block.get("type") == 1:
                image_blocks.append(block)
                
        # Identify drawing blocks (clustered vector drawings)
        drawings = page.get_drawings()
        drawing_rects = []
        for d in drawings:
            r = d.get("rect")
            if r and not r.is_empty:
                if r.width > page.rect.width * 0.95 and r.height > page.rect.height * 0.95:
                    continue
                drawing_rects.append(r)
                
        # Cluster drawing rects
        clusters = []
        for r in drawing_rects:
            merged = False
            for idx, c in enumerate(clusters):
                test_c = fitz.Rect(c.x0 - 15, c.y0 - 15, c.x1 + 15, c.y1 + 15)
                if test_c.intersects(r):
                    clusters[idx] = c | r
                    merged = True
                    break
            if not merged:
                clusters.append(r)
                
        changed = True
        while changed:
            changed = False
            i = 0
            while i < len(clusters):
                j = i + 1
                while j < len(clusters):
                    test_c = fitz.Rect(clusters[i].x0 - 15, clusters[i].y0 - 15, clusters[i].x1 + 15, clusters[i].y1 + 15)
                    if test_c.intersects(clusters[j]):
                        clusters[i] = clusters[i] | clusters[j]
                        clusters.pop(j)
                        changed = True
                    else:
                        j += 1
                i += 1
                
        # Filter clusters to get valid graphic blocks
        graph_rects = []
        for c in clusters:
            c = c & page.rect
            if c.width > 20 and c.height > 20:
                paths_in_cluster = [r for r in drawing_rects if c.contains(r)]
                if len(paths_in_cluster) >= 5:
                    graph_rects.append(c)

        # Create a temporary copy to redact text, images, and graphs, then render background
        temp_doc = fitz.open(pdf_path)
        temp_page = temp_doc.load_page(page_num)
        
        # Redact text
        words = temp_page.get_text("words")
        for w in words:
            rect = fitz.Rect(w[:4])
            temp_page.add_redact_annot(rect, fill=None)
            
        # Redact images
        for img in image_blocks:
            rect = fitz.Rect(img["bbox"])
            temp_page.add_redact_annot(rect, fill=None)
            
        # Redact graphs
        for g_rect in graph_rects:
            temp_page.add_redact_annot(g_rect, fill=None)
            
        temp_page.apply_redactions()
        
        # Render clean background image
        pix = temp_page.get_pixmap(dpi=150)
        bg_img_path = f"temp_bg_{page_num}_{os.getpid()}.png"
        pix.save(bg_img_path)
        
        # Add a blank slide
        blank_layout = prs.slide_layouts[6]
        slide = prs.slides.add_slide(blank_layout)
        
        # Insert background image spanning the entire slide
        slide.shapes.add_picture(bg_img_path, 0, 0, width=prs.slide_width, height=prs.slide_height)
        
        try:
            os.remove(bg_img_path)
        except Exception:
            pass
        temp_doc.close()
        
        # Insert standard images as separate movable shapes
        for idx, img in enumerate(image_blocks):
            bbox = img["bbox"]
            left = Inches(bbox[0] / 72.0)
            top = Inches(bbox[1] / 72.0)
            width = Inches((bbox[2] - bbox[0]) / 72.0)
            height = Inches((bbox[3] - bbox[1]) / 72.0)
            
            img_bytes = img["image"]
            img_ext = img["ext"]
            img_path = f"temp_img_{page_num}_{idx}_{os.getpid()}.{img_ext}"
            with open(img_path, "wb") as f:
                f.write(img_bytes)
                
            try:
                slide.shapes.add_picture(img_path, left, top, width=width, height=height)
            except Exception as e:
                print(f"Failed to insert image shape: {e}")
                
            try:
                os.remove(img_path)
            except Exception:
                pass
                
        # Render and insert graph drawing blocks as separate movable shapes
        for idx, g_rect in enumerate(graph_rects):
            pix = page.get_pixmap(clip=g_rect, dpi=300)
            graph_path = f"temp_graph_{page_num}_{idx}_{os.getpid()}.png"
            pix.save(graph_path)
            
            left = Inches(g_rect.x0 / 72.0)
            top = Inches(g_rect.y0 / 72.0)
            width = Inches(g_rect.width / 72.0)
            height = Inches(g_rect.height / 72.0)
            
            try:
                slide.shapes.add_picture(graph_path, left, top, width=width, height=height)
            except Exception as e:
                print(f"Failed to insert graph shape: {e}")
                
            try:
                os.remove(graph_path)
            except Exception:
                pass

        # Place text boxes on top of the background image
        for block in page_dict.get("blocks", []):
            if block.get("type") == 0:  # Text block
                for line in block.get("lines", []):
                    l_bbox = line.get("bbox")
                    spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                    if not spans:
                        continue

                    max_font_size = max([s.get("size", 12) for s in spans])

                    # Calculate inches coordinates
                    left = Inches(l_bbox[0] / 72.0)
                    top = Inches(l_bbox[1] / 72.0)
                    width = Inches(max(l_bbox[2] - l_bbox[0], max_font_size * 2.0) / 72.0)
                    height = Inches(max(l_bbox[3] - l_bbox[1], max_font_size * 1.5) / 72.0)

                    # Add transparent text box
                    txBox = slide.shapes.add_textbox(left, top, width, height)
                    tf = txBox.text_frame
                    tf.word_wrap = False
                    tf.margin_left = Inches(0.0)
                    tf.margin_right = Inches(0.0)
                    tf.margin_top = Inches(0.0)
                    tf.margin_bottom = Inches(0.0)

                    p = tf.paragraphs[0]
                    p.alignment = PP_ALIGN.LEFT

                    # Map rotation if the text line is tilted
                    dx, dy = line.get("dir", (1.0, 0.0))
                    angle = math.degrees(math.atan2(dy, dx))
                    if angle < 0:
                        angle += 360
                    if abs(angle) > 0.01:
                        txBox.rotation = angle

                    # Add text spans with matching styles
                    for span in spans:
                        run = p.add_run()
                        run.text = span.get("text", "")
                        run.font.name = map_font(span.get("font"))
                        run.font.size = Pt(span.get("size", 12))

                        # Color
                        color_val = span.get("color", 0)
                        r = (color_val >> 16) & 255
                        g = (color_val >> 8) & 255
                        b = color_val & 255
                        run.font.color.rgb = RGBColor(r, g, b)

                        # Flags (Bold / Italic)
                        flags = span.get("flags", 0)
                        if flags & 2:
                            run.font.italic = True
                        if flags & 16:
                            run.font.bold = True

    prs.save(pptx_path)
    doc.close()
    print("PPTX conversion complete.")


def perform_ocr(input_path, output_path, output_type):
    tesseract_cmd = find_tesseract()
    if not tesseract_cmd:
        print("CRITICAL ERROR: Tesseract OCR executable not found on the system.", file=sys.stderr)
        print("Please install Tesseract OCR and verify it is added to your PATH environment variable.", file=sys.stderr)
        sys.exit(2)
        
    print(f"Running OCR on {input_path} using Tesseract: {tesseract_cmd}")
    
    # Mathematical character post-processing cleanup function
    def clean_ocr(text):
        # 1. Correct projection operator π (pi) misrecognized as n or m
        text = re.sub(r'\b([nm])([A-Z][a-z]+)\b', lambda m: 'π' + m.group(2), text)
        text = re.sub(r'\b([nm])([A-Z][a-z]+)\(', lambda m: 'π' + m.group(2) + '(', text)
        
        # 2. Correct >= (greater than or equal) misrecognized as Sigma or duplicated digit
        text = re.sub(r'(\b[a-zA-Z_][a-zA-Z0-9_]*\s+)[ΣΣ]\s*(\d+)', r'\1>= \2', text)
        text = re.sub(r'(\b[a-zA-Z_][a-zA-Z0-9_]*\s+)(\d+)\s+\2\b', r'\1>= \2', text)
        
        # 3. Clean up other common relational algebra math symbol misrecognitions
        text = re.sub(r'\b(Pd|bd|pa|Ρᾷ)\b', '⋈', text)
        return text

    # Set up custom local tessdata directory to support grc (Greek) for math symbols
    tessdata_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tessdata")
    
    # Programmatically copy configs folder from system tessdata to local tessdata if missing
    system_tessdata = os.path.join(os.path.dirname(tesseract_cmd), "tessdata")
    if os.path.exists(system_tessdata):
        system_configs = os.path.join(system_tessdata, "configs")
        local_configs = os.path.join(tessdata_dir, "configs")
        if os.path.exists(system_configs) and not os.path.exists(local_configs):
            import shutil
            try:
                shutil.copytree(system_configs, local_configs, dirs_exist_ok=True)
            except Exception as e:
                print(f"Warning: Failed to copy configs folder: {e}")

    langs = "eng"
    extra_args = []
    if os.path.exists(os.path.join(tessdata_dir, "grc.traineddata")):
        langs = "eng+grc"
        extra_args = ["--tessdata-dir", tessdata_dir, "-l", langs]

    # Check if input is image or PDF
    is_pdf = input_path.lower().endswith('.pdf')
    
    if is_pdf:
        doc = fitz.open(input_path)
        temp_files = []
        
        if output_type == 'text':
            full_text = []
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=200)
                img_path = f"temp_ocr_p{i}_{os.getpid()}.png"
                pix.save(img_path)
                temp_files.append(img_path)
                
                # Output text file base name
                txt_base = f"temp_ocr_out_p{i}_{os.getpid()}"
                
                # Run tesseract with extra_args positioned correctly first
                cmd = [tesseract_cmd] + extra_args + [img_path, txt_base]
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                
                txt_file = txt_base + ".txt"
                if os.path.exists(txt_file):
                    with open(txt_file, 'r', encoding='utf-8') as f:
                        full_text.append(clean_ocr(f.read()))
                    os.remove(txt_file)
            
            # Save final combined text
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("\n\n--- PAGE BREAK ---\n\n".join(full_text))
                
        elif output_type == 'pdf':
            # Create a searchable PDF by running OCR page by page and merging
            pdf_merger = fitz.open()
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=200)
                img_path = f"temp_ocr_p{i}_{os.getpid()}.png"
                pix.save(img_path)
                temp_files.append(img_path)
                
                pdf_base = f"temp_ocr_out_p{i}_{os.getpid()}"
                
                # Run tesseract config 'pdf' with options positioned correctly first
                cmd = [tesseract_cmd] + extra_args + [img_path, pdf_base, "pdf"]
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                
                page_pdf = pdf_base + ".pdf"
                if os.path.exists(page_pdf):
                    page_doc = fitz.open(page_pdf)
                    pdf_merger.insert_pdf(page_doc)
                    page_doc.close()
                    os.remove(page_pdf)
            
            pdf_merger.save(output_path)
            pdf_merger.close()
            
        doc.close()
        
        # Cleanup page images
        for temp_file in temp_files:
            try:
                os.remove(temp_file)
            except Exception:
                pass
    else:
        # Input is an image (PNG, JPG, JPEG, etc.)
        output_base = os.path.splitext(output_path)[0]
        
        if output_type == 'text':
            # Run tesseract with extra_args positioned correctly first
            cmd = [tesseract_cmd] + extra_args + [input_path, output_base]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            # Tesseract automatically appends .txt
            txt_out = output_base + ".txt"
            if os.path.exists(txt_out):
                with open(txt_out, 'r', encoding='utf-8') as f:
                    content = f.read()
                cleaned_content = clean_ocr(content)
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(cleaned_content)
                if txt_out != output_path:
                    os.remove(txt_out)
        elif output_type == 'pdf':
            # Run tesseract config 'pdf' with extra_args positioned correctly first
            cmd = [tesseract_cmd] + extra_args + [input_path, output_base, "pdf"]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            # Tesseract automatically appends .pdf
            generated_pdf = output_base + ".pdf"
            if os.path.exists(generated_pdf) and generated_pdf != output_path:
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(generated_pdf, output_path)

    print("OCR task finished successfully.")

def preprocess_excel(input_path, output_path):
    print(f"Preprocessing Excel file: {input_path} -> {output_path}")
    import pandas as pd
    import openpyxl
    from openpyxl.styles import Alignment
    from openpyxl.utils import get_column_letter
    import re

    # 1. Load the xls/xlsx file
    if input_path.lower().endswith('.xls'):
        # Load all sheets
        sheets = pd.read_excel(input_path, sheet_name=None)
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            for sheet_name, df in sheets.items():
                df.to_excel(writer, sheet_name=sheet_name, index=False)
    else:
        # Copy / load as is
        import shutil
        shutil.copyfile(input_path, output_path)

    # 2. Modify properties in openpyxl
    wb = openpyxl.load_workbook(output_path)
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        
        # Enable Fit to Page Width
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0 # let it flow vertically
        
        # Set Orientation to Landscape for wider tables
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        
        # Configure columns and cell word wrap
        for col in ws.columns:
            max_len = 0
            for cell in col:
                if cell.value is not None:
                    max_len = max(max_len, len(str(cell.value)))
                    # Format numbers right with an indent of 1 to prevent text clipping/running into next cell
                    is_numeric = isinstance(cell.value, (int, float))
                    if not is_numeric and isinstance(cell.value, str):
                        cleaned = cell.value.strip().replace(',', '')
                        if re.match(r'^-?\d+(\.\d+)?$', cleaned):
                            is_numeric = True
                            
                    if is_numeric:
                        cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='right', indent=1)
                    else:
                        cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left')
            
            col_letter = get_column_letter(col[0].column)
            # Increase column width spacing to avoid clipping
            ws.column_dimensions[col_letter].width = min(max(max_len + 5, 12), 30)

    wb.save(output_path)
    print("Preprocessed Excel file successfully.")

def convert_office_to_pdf(input_path, output_path):
    import os
    import sys
    
    input_path = os.path.abspath(input_path)
    output_path = os.path.abspath(output_path)
    
    ext = os.path.splitext(input_path.lower())[1]
    print(f"Converting Office document to PDF using native COM automation: {input_path} -> {output_path}")
    
    if ext in ['.docx', '.doc']:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        word = win32com.client.DispatchEx('Word.Application')
        word.Visible = False
        word.DisplayAlerts = False
        doc = None
        try:
            doc = word.Documents.Open(input_path)
            doc.SaveAs(output_path, FileFormat=17) # wdFormatPDF
            doc.Close()
            print("Successfully converted Word document to PDF.")
        finally:
            word.Quit()
            
    elif ext in ['.pptx', '.ppt']:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        powerpoint = win32com.client.DispatchEx('PowerPoint.Application')
        pres = None
        try:
            pres = powerpoint.Presentations.Open(input_path, WithWindow=False)
            pres.SaveAs(output_path, FileFormat=32) # ppSaveAsPDF
            pres.Close()
            print("Successfully converted PowerPoint presentation to PDF.")
        finally:
            powerpoint.Quit()
            
    elif ext in ['.xlsx', '.xls']:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        excel = win32com.client.DispatchEx('Excel.Application')
        excel.Visible = False
        excel.DisplayAlerts = False
        wb = None
        try:
            wb = excel.Workbooks.Open(input_path)
            wb.ExportAsFixedFormat(0, output_path) # xlTypePDF
            wb.Close(SaveChanges=False)
            print("Successfully converted Excel sheet to PDF.")
        finally:
            excel.Quit()
            
    else:
        raise ValueError(f"Unsupported office file extension: {ext}")

def main():
    parser = argparse.ArgumentParser(description="DocRIt Python Conversion Worker")
    parser.add_argument("--task", required=True, choices=["pdf-to-docx", "pdf-to-xlsx", "pdf-to-pptx", "ocr", "preprocess-excel", "office-to-pdf"])
    parser.add_argument("--input", required=True, help="Path to input document")
    parser.add_argument("--output", required=True, help="Path to write converted output document")
    parser.add_argument("--ocr-type", default="text", choices=["text", "pdf"], help="For OCR task: text (txt file) or pdf (searchable PDF)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file {args.input} does not exist.", file=sys.stderr)
        sys.exit(1)
        
    try:
        if args.task == "pdf-to-docx":
            convert_pdf_to_docx(args.input, args.output)
        elif args.task == "pdf-to-xlsx":
            convert_pdf_to_xlsx(args.input, args.output)
        elif args.task == "pdf-to-pptx":
            convert_pdf_to_pptx(args.input, args.output)
        elif args.task == "ocr":
            perform_ocr(args.input, args.output, args.ocr_type)
        elif args.task == "preprocess-excel":
            preprocess_excel(args.input, args.output)
        elif args.task == "office-to-pdf":
            convert_office_to_pdf(args.input, args.output)
        sys.exit(0)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Worker Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
