import AppKit
import Foundation
import PDFKit
import Vision

struct OCRFailure: Error, CustomStringConvertible {
  let description: String
}

func renderPage(_ page: PDFPage, scale: CGFloat = 2.0) throws -> CGImage {
  let bounds = page.bounds(for: .mediaBox)
  let width = max(1, Int(bounds.width * scale))
  let height = max(1, Int(bounds.height * scale))
  guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let context = CGContext(
          data: nil,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: colorSpace,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
    throw OCRFailure(description: "Could not create page render context.")
  }

  context.setFillColor(NSColor.white.cgColor)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  context.saveGState()
  context.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()

  guard let image = context.makeImage() else {
    throw OCRFailure(description: "Could not render PDF page to image.")
  }
  return image
}

func recognizeText(in image: CGImage) throws -> [String] {
  var lines: [String] = []
  let request = VNRecognizeTextRequest { request, error in
    if let error {
      lines.append("OCR_ERROR: \(error.localizedDescription)")
      return
    }
    let observations = request.results as? [VNRecognizedTextObservation] ?? []
    lines.append(contentsOf: observations.compactMap { observation in
      observation.topCandidates(1).first?.string
    })
  }
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  try handler.perform([request])

  if lines.first?.hasPrefix("OCR_ERROR: ") == true {
    throw OCRFailure(description: String(lines[0].dropFirst("OCR_ERROR: ".count)))
  }
  return lines
}

func main() throws {
  guard CommandLine.arguments.count == 2 else {
    throw OCRFailure(description: "Usage: vision_ocr <pdf-path>")
  }
  let pdfPath = CommandLine.arguments[1]
  let url = URL(fileURLWithPath: pdfPath)
  guard let document = PDFDocument(url: url) else {
    throw OCRFailure(description: "Could not open PDF: \(pdfPath)")
  }

  var pageTexts: [String] = []
  for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else {
      continue
    }
    let image = try renderPage(page)
    pageTexts.append(try recognizeText(in: image).joined(separator: "\n"))
  }

  let payload: [String: Any] = [
    "page_count": document.pageCount,
    "text": pageTexts.joined(separator: "\n\n")
  ]
  let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

do {
  try main()
} catch {
  let message = String(describing: error)
  FileHandle.standardError.write(Data(message.utf8))
  FileHandle.standardError.write(Data("\n".utf8))
  exit(1)
}
