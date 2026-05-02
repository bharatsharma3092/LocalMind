import { readFile } from 'fs/promises'
import { extname, basename } from 'path'
import { inflateRaw } from 'zlib'
import { promisify } from 'util'

const inflateRawAsync = promisify(inflateRaw)

export interface ExtractedContent {
  filename: string
  text: string
  mimeType?: string
  isImage: boolean
  extension: string
}

export async function extractFileContent(filePath: string): Promise<ExtractedContent> {
  const ext = extname(filePath).toLowerCase()
  const filename = basename(filePath)

  const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
  if (imageExts.includes(ext)) {
    const buffer = await readFile(filePath)
    return {
      filename,
      text: buffer.toString('base64'),
      mimeType: `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`,
      isImage: true,
      extension: ext,
    }
  }

  const textExts = ['.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.rs', '.go', '.rb', '.php', '.sh', '.bash', '.zsh', '.sql', '.r', '.toml', '.ini', '.cfg', '.conf', '.env', '.gitignore', '.dockerfile', '.makefile']
  if (textExts.includes(ext) || !ext) {
    const text = await readFile(filePath, 'utf-8')
    return { filename, text, isImage: false, extension: ext }
  }

  if (ext === '.pdf') {
    const text = await extractPdf(filePath)
    return { filename, text, isImage: false, extension: ext }
  }

  if (ext === '.docx') {
    const text = await extractDocx(filePath)
    return { filename, text, isImage: false, extension: ext }
  }

  if (ext === '.xlsx') {
    const text = await extractXlsx(filePath)
    return { filename, text, isImage: false, extension: ext }
  }

  if (ext === '.pptx') {
    const text = await extractPptx(filePath)
    return { filename, text, isImage: false, extension: ext }
  }

  const text = await readFile(filePath, 'utf-8')
  return { filename, text, isImage: false, extension: ext }
}

async function extractPptx(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath)
    const slides: string[] = []
    let offset = 0

    while (offset < buffer.length - 30) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        offset++
        continue
      }

      const compression = buffer.readUInt16LE(offset + 8)
      const compressedSize = buffer.readUInt32LE(offset + 18)
      const filenameLength = buffer.readUInt16LE(offset + 26)
      const extraLength = buffer.readUInt16LE(offset + 28)
      const nameStart = offset + 30
      const name = buffer.slice(nameStart, nameStart + filenameLength).toString('utf-8')
      const dataStart = nameStart + filenameLength + extraLength
      const dataEnd = dataStart + compressedSize

      if (compressedSize > 0 && /^ppt\/slides\/slide\d+\.xml$/.test(name)) {
        const compressed = buffer.slice(dataStart, dataEnd)
        const xml = compression === 8
          ? (await inflateRawAsync(compressed)).toString('utf-8')
          : compressed.toString('utf-8')
        const text = xmlToPlainText(xml)
        if (text.trim()) slides.push(`--- ${basename(name)} ---\n${text}`)
      }

      offset = Math.max(dataEnd, offset + 30 + filenameLength + extraLength)
    }

    return slides.length > 0 ? slides.join('\n\n') : '[No readable slide text found]'
  } catch (err: any) {
    return `[Error extracting PPTX: ${err.message}]`
  }
}

function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<a:br\s*\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function extractPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = await readFile(filePath)
    const data = await pdfParse(buffer)
    return data.text
  } catch (err: any) {
    return `[Error extracting PDF: ${err.message}]`
  }
}

async function extractDocx(filePath: string): Promise<string> {
  try {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  } catch (err: any) {
    return `[Error extracting DOCX: ${err.message}]`
  }
}

async function extractXlsx(filePath: string): Promise<string> {
  try {
    const XLSX = (await import('xlsx')).default
    const workbook = XLSX.readFile(filePath)
    const sheets: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      sheets.push(`--- ${sheetName} ---\n${csv}`)
    }
    return sheets.join('\n\n')
  } catch (err: any) {
    return `[Error extracting XLSX: ${err.message}]`
  }
}

export async function extractFolderContents(dirPath: string, extensions?: string[]): Promise<ExtractedContent[]> {
  const { readdir } = await import('fs/promises')
  const { stat } = await import('fs/promises')
  const { join } = await import('path')

  const results: ExtractedContent[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          await walk(fullPath)
        }
      } else {
        const ext = extname(entry.name).toLowerCase()
        if (extensions && extensions.length > 0 && !extensions.includes(ext)) continue
        try {
          const content = await extractFileContent(fullPath)
          results.push(content)
        } catch {}
      }
    }
  }

  await walk(dirPath)
  return results
}
