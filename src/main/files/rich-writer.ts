import { promises as fs, existsSync } from 'fs'
import { extname, dirname } from 'path'

// Dynamic imports for library-based writers
let XLSX: any = null
let docx: any = null

async function loadXlsx() {
  if (!XLSX) {
    XLSX = (await import('xlsx')).default
  }
  return XLSX
}

async function loadDocx() {
  if (!docx) {
    docx = await import('docx')
  }
  return docx
}

export interface RichDocumentElement {
  type: 'paragraph' | 'heading1' | 'heading2' | 'list_item'
  text: string
}

/**
 * Creates or overwrites an XLSX file with a 2D array of data.
 */
export async function writeXlsx(filePath: string, data: any[][], sheetName = 'Sheet1'): Promise<void> {
  const xlsxLib = await loadXlsx()
  await fs.mkdir(dirname(filePath), { recursive: true })

  const wb = xlsxLib.utils.book_new()
  const ws = xlsxLib.utils.aoa_to_sheet(data)
  xlsxLib.utils.book_append_sheet(wb, ws, sheetName)
  xlsxLib.writeFile(wb, filePath)
}

/**
 * Appends new rows to an existing sheet inside an XLSX file.
 * Creates the file if it does not exist yet.
 */
export async function appendXlsx(filePath: string, data: any[][], sheetName = 'Sheet1'): Promise<void> {
  const xlsxLib = await loadXlsx()
  await fs.mkdir(dirname(filePath), { recursive: true })

  let wb: any
  let existingData: any[][] = []

  if (existsSync(filePath)) {
    try {
      wb = xlsxLib.readFile(filePath)
      const ws = wb.Sheets[sheetName]
      if (ws) {
        existingData = xlsxLib.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      }
    } catch (err: any) {
      console.warn(`[RichWriter] Failed to read existing XLSX, starting fresh: ${err.message}`)
      wb = xlsxLib.book_new()
    }
  } else {
    wb = xlsxLib.book_new()
  }

  // Combine existing rows with new rows
  const combinedData = [...existingData, ...data]

  // Re-create the workbook with the combined sheet
  const ws = xlsxLib.utils.aoa_to_sheet(combinedData)
  
  if (wb.SheetNames.includes(sheetName)) {
    wb.Sheets[sheetName] = ws
  } else {
    xlsxLib.utils.book_append_sheet(wb, ws, sheetName)
  }

  xlsxLib.writeFile(wb, filePath)
}

/**
 * Creates or overwrites a DOCX file with headings, paragraphs, and list items.
 */
export async function writeDocx(filePath: string, elements: RichDocumentElement[]): Promise<void> {
  const docxLib = await loadDocx()
  await fs.mkdir(dirname(filePath), { recursive: true })

  const children: any[] = []

  for (const el of elements) {
    if (el.type === 'heading1') {
      children.push(
        new docxLib.Paragraph({
          text: el.text,
          heading: docxLib.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      )
    } else if (el.type === 'heading2') {
      children.push(
        new docxLib.Paragraph({
          text: el.text,
          heading: docxLib.HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 80 },
        })
      )
    } else if (el.type === 'list_item') {
      children.push(
        new docxLib.Paragraph({
          text: el.text,
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      )
    } else {
      children.push(
        new docxLib.Paragraph({
          children: [new docxLib.TextRun(el.text)],
          spacing: { after: 120 },
        })
      )
    }
  }

  const doc = new docxLib.Document({
    sections: [{
      properties: {},
      children,
    }],
  })

  const buffer = await docxLib.Packer.toBuffer(doc)
  await fs.writeFile(filePath, buffer)
}

/**
 * Appends new elements to an existing DOCX file.
 * Automatically extracts the existing text before compiling a new combined file.
 */
export async function appendDocx(filePath: string, newElements: RichDocumentElement[]): Promise<void> {
  const elements: RichDocumentElement[] = []

  if (existsSync(filePath)) {
    try {
      const mammoth = (await import('mammoth')).default
      const result = await mammoth.extractRawText({ path: filePath })
      const lines = result.value.split(/\r?\n/)
      
      for (const line of lines) {
        if (line.trim().length > 0) {
          elements.push({ type: 'paragraph', text: line.trim() })
        }
      }
    } catch (err: any) {
      console.warn(`[RichWriter] Failed to extract existing DOCX, starting fresh: ${err.message}`)
    }
  }

  elements.push(...newElements)
  await writeDocx(filePath, elements)
}
